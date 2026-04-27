/**
 * CircadianScheduler — CRAWLING_STRATEGY §6.1 / §6.4 (KST 활성 시간대).
 *
 * 책임:
 *   - 세션 길이 (15~45 min) 와 세션 간 간격 (1~4 h) 의 deterministic 샘플링.
 *   - 페르소나 activeHours 포함 검사 (KST = UTC+9, DST 없음).
 *   - 다음 세션 시작 시각 계산: `lastEndAt + gap` 이 페르소나 activeHours 밖이면
 *     가장 가까운 activeHours.start (KST) 시각으로 점프.
 *
 * ## 왜 KST 직접 +9h 인가
 *
 *   - Asia/Seoul 은 DST 가 없어 UTC 와의 오프셋이 항상 +9. `Intl.DateTimeFormat`
 *     보다 가볍고 테스트 deterministic.
 *   - PersonaManager 는 Intl 패턴을 쓴다 — 두 구현이 KST 라는 사실에 동일하게
 *     수렴하도록, 본 모듈도 동일 결과를 내야 한다 (§ overlap assertion 일관성).
 *
 * ## DI
 *
 *   - `now`: 현재 시각 함수. 테스트는 deterministic 시간 주입.
 *   - `random`: [0,1) 난수. 테스트는 0 / 0.5 / 0.999 같은 boundary 값 주입.
 *   - `config`: CIRCADIAN 상수. 정상 사용 시 기본값, 테스트는 짧은 간격 주입 가능.
 */

import { DAY_MS, HOUR_MS, KST_OFFSET_MS } from '@pokopia-wiki/shared';

import type { BrowserPersona } from '../persona/types.js';

/**
 * §6.1 SSoT — `peakHours` / `weekendBoost` / `requestsPerSession` 은 v3.2 에서
 * 제거됨 (§14.3 RateLimitConfig 가 navigation/resource 한도 단일 SSoT).
 */
export const CIRCADIAN = {
  activeHours: { start: 8, end: 23 },
  sessions: {
    minPerDay: 2,
    maxPerDay: 5,
    durationMinMs: 15 * 60 * 1000,
    durationMaxMs: 45 * 60 * 1000,
    interSessionMinMs: 60 * 60 * 1000,
    interSessionMaxMs: 4 * 60 * 60 * 1000,
  },
} as const;

/**
 * UTC Date → KST hour (0~23). PersonaManager.hourInSeoul 과 동일 의미.
 *
 * 직접 +9h 방식 — Asia/Seoul DST 미존재로 안전. Intl 호출 비용 회피.
 * KST_OFFSET_MS / DAY_MS / HOUR_MS 는 shared/time/constants.ts SSoT (Phase 7 STYLE-701).
 */
export function hourInSeoul(at: Date): number {
  const kstMs = at.getTime() + KST_OFFSET_MS;
  return Math.floor(kstMs / HOUR_MS) % 24;
}

export type CircadianConfig = typeof CIRCADIAN;

export type CircadianSchedulerOptions = {
  /** 기본: `() => new Date()`. */
  now?: () => Date;
  /** [0,1) — 기본 `Math.random`. 테스트에서 deterministic 주입. */
  random?: () => number;
  /** §6.1 상수 override (테스트에서 짧은 gap 주입 가능). */
  config?: CircadianConfig;
};

export class CircadianScheduler {
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly config: CircadianConfig;

  constructor(options: CircadianSchedulerOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.config = options.config ?? CIRCADIAN;
  }

  /** 세션 1 회 길이를 [durationMinMs, durationMaxMs) 균등 샘플링. */
  pickSessionDurationMs(): number {
    const { durationMinMs, durationMaxMs } = this.config.sessions;
    return durationMinMs + this.random() * (durationMaxMs - durationMinMs);
  }

  /** 세션 간 휴식을 [interSessionMinMs, interSessionMaxMs) 균등 샘플링. */
  pickInterSessionGapMs(): number {
    const { interSessionMinMs, interSessionMaxMs } = this.config.sessions;
    return interSessionMinMs + this.random() * (interSessionMaxMs - interSessionMinMs);
  }

  /** KST hour 가 페르소나 activeHours 안인지. activeHours 미정의면 false. */
  isInActiveHours(persona: BrowserPersona, at: Date): boolean {
    if (persona.activeHours === undefined) return false;
    const hour = hourInSeoul(at);
    return hour >= persona.activeHours.start && hour < persona.activeHours.end;
  }

  /** CIRCADIAN.activeHours 글로벌 윈도우 검사 (페르소나 무관). */
  isWithinGlobalActiveHours(at: Date): boolean {
    const hour = hourInSeoul(at);
    return hour >= this.config.activeHours.start && hour < this.config.activeHours.end;
  }

  /**
   * 다음 세션 시작 시각.
   *
   * 흐름:
   *   1. base = lastEndAt ?? now()
   *   2. candidate = base + gap (random)
   *   3. if candidate ∈ persona.activeHours → return candidate
   *   4. else → 다음 KST `persona.activeHours.start` 시각으로 점프
   *
   * `nextKstHourTimestamp` 가 "after 이후 가장 가까운 KST hour H" 를 반환하므로,
   * candidate 가 같은 날 activeHours 시작 전이면 같은 날, 이미 지나갔으면 다음 날.
   */
  nextSessionStart(persona: BrowserPersona, lastEndAt?: Date): Date {
    if (persona.activeHours === undefined) {
      throw new Error(`CircadianScheduler.nextSessionStart: persona "${persona.id}" has no activeHours`);
    }
    const base = lastEndAt ?? this.now();
    const gap = this.pickInterSessionGapMs();
    const candidate = new Date(base.getTime() + gap);
    if (this.isInActiveHours(persona, candidate)) return candidate;
    return nextKstHourTimestamp(candidate, persona.activeHours.start);
  }
}

/**
 * `after` 이후 가장 가까운 (≥) "KST hour H 의 정각" UTC 시각.
 *
 * `after === KST hour H 정각` 인 경계 케이스는 다음 날로 밀어 단조 증가 보장.
 */
function nextKstHourTimestamp(after: Date, hourKst: number): Date {
  const afterKstMs = after.getTime() + KST_OFFSET_MS;
  const kstDayStartMs = Math.floor(afterKstMs / DAY_MS) * DAY_MS;
  let candidateKstMs = kstDayStartMs + hourKst * HOUR_MS;
  while (candidateKstMs <= afterKstMs) {
    candidateKstMs += DAY_MS;
  }
  return new Date(candidateKstMs - KST_OFFSET_MS);
}
