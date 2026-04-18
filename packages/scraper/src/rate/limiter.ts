/**
 * RateLimiter (CRAWLING_STRATEGY §14.3, §6.4.1).
 *
 * 책임:
 *   - navigation / resource / direct 3종 카운터 분리 누적.
 *   - 일별(UTC+9 자정 기준) 자동 리셋.
 *   - `data/state/rate/<source>/<kind>.json` 영속.
 *   - proper-lockfile 로 쓰기 보호 (재시작/멀티 프로세스 대비).
 *   - 80% 도달 시 `rate_limit.approaching` 알림 (Notifier 주입 시).
 *   - T1+ 활성 시 T0 50% 감속 (§6.4.1) — 현재는 ConcurrencyGuard 미구현이므로
 *     `isHigherTierActive` 스텁이 항상 false 반환. Phase 5 에서 연결.
 *
 * acquire 흐름:
 *   1. 오늘 날짜와 저장된 date 비교 → 다르면 0 으로 리셋.
 *   2. `count + 1 > maxPerDay` 면 `RateLimitExceededError`.
 *   3. 80% 임계 교차 감지 시 Notifier 알림 (best-effort, 실패는 무시).
 *   4. count 를 +1 해 영속화 (lock 으로 보호).
 *
 * ★ 주의:
 *   - `acquire()` 는 **즉시 반환**. 요청 간 sleep 은 Phase 5 BehaviorSimulator
 *     가 가우시안 샘플로 별도 처리. 본 Limiter 는 한도 관리만 책임.
 *   - `resource` 카운터는 §14.1 정의대로 "카운트하지 않음" 이 원칙이지만, 미래
 *     모니터링용으로 타입만 받도록 API 를 열어 둔다 (no-op 로 처리).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { SourceSite } from '@pokopia-wiki/shared';
import lockfile from 'proper-lockfile';

import { RateLimitExceededError } from '../fetchers/errors.js';
import type { Notifier } from '../notifier/index.js';
import { repoPath } from '../paths.js';
import { RATE_LIMITS, type RateBudget, type RateCounterKind } from './config.js';

/** 저장 파일의 구조 — 카운터별 별도 파일. */
type RateStateRecord = {
  /** YYYY-MM-DD (Asia/Seoul 기준). */
  date: string;
  /** 오늘 누적 카운트. */
  count: number;
  /** 80% 임계 알림을 이미 보냈는지 — 중복 알림 방지. */
  approachingAlertSent: boolean;
};

/** Asia/Seoul 기준 오늘 날짜 문자열. */
function todayInSeoul(): string {
  // Intl.DateTimeFormat 'Asia/Seoul' 로 YYYY-MM-DD 포맷 생성.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

/**
 * RateLimiter.
 *
 * Notifier 는 선택적 — 테스트/CLI 에선 주입하지 않으면 알림 skip.
 *
 * Phase 5 연결점:
 *   - `isHigherTierActive()` 가 ConcurrencyGuard 와 연동 (현재는 false 고정).
 *   - T1+ 활성 시 T0 navigation 의 effective 한도를 50% 로 감속.
 */
export class RateLimiter {
  constructor(private readonly notifier?: Notifier) {}

  /**
   * 카운터 획득 — 한도 내면 증가, 초과면 throw.
   *
   * @param source 대상 소스
   * @param kind navigation | resource | direct
   * @throws RateLimitExceededError 일 한도 초과
   */
  async acquire(source: SourceSite, kind: RateCounterKind): Promise<void> {
    // resource 는 §14.1 정의상 카운트 미적용 — no-op.
    if (kind === 'resource') return;

    const budget = this.resolveBudget(source, kind);
    if (!budget) {
      throw new RateLimitExceededError(source, kind, 0, 0);
    }

    const statePath = this.statePath(source, kind);
    await mkdir(path.dirname(statePath), { recursive: true });
    await this.ensureFile(statePath);

    const release = await lockfile.lock(statePath, {
      stale: 10_000,
      retries: { retries: 5, minTimeout: 50, maxTimeout: 500 },
    });
    try {
      await this.bumpUnderLock(source, kind, statePath, budget.maxPerDay);
    } finally {
      await release();
    }
  }

  /** source+kind 조합으로 RateBudget 결정 — 미지원이면 undefined. */
  private resolveBudget(source: SourceSite, kind: 'navigation' | 'direct'): RateBudget | undefined {
    const config = RATE_LIMITS[source];
    return kind === 'navigation' ? config.navigation : config.directFetch;
  }

  /** 락 보호된 영역의 핵심: 오늘 카운트 +1, 80% 교차 시 알림. */
  private async bumpUnderLock(
    source: SourceSite,
    kind: 'navigation' | 'direct',
    statePath: string,
    baseDailyLimit: number,
  ): Promise<void> {
    const today = todayInSeoul();
    const record = await this.readRecord(statePath);
    const current: RateStateRecord =
      record.date === today ? record : { date: today, count: 0, approachingAlertSent: false };

    // T1+ 활성 시 T0 50% 감속 — effective 한도를 절반으로 (§6.4.1).
    const effectiveDailyLimit =
      source === 'serebii' && this.isHigherTierActive() ? Math.floor(baseDailyLimit / 2) : baseDailyLimit;

    if (current.count + 1 > effectiveDailyLimit) {
      throw new RateLimitExceededError(source, kind, effectiveDailyLimit, current.count);
    }

    const nextCount = current.count + 1;
    const threshold = Math.floor(effectiveDailyLimit * 0.8);
    const crossedApproaching = nextCount >= threshold && !current.approachingAlertSent;

    const next: RateStateRecord = {
      date: today,
      count: nextCount,
      approachingAlertSent: current.approachingAlertSent || crossedApproaching,
    };
    await writeFile(statePath, JSON.stringify(next, null, 2), 'utf8');

    if (crossedApproaching && this.notifier) {
      await this.notifier
        .notify('rate_limit.approaching', {
          source,
          kind,
          count: nextCount,
          dailyLimit: effectiveDailyLimit,
          percent: Math.round((nextCount / effectiveDailyLimit) * 100),
        })
        .catch(() => {
          /* best-effort — events.jsonl 측에 기록 */
        });
    }
  }

  /**
   * 현재 오늘 카운트를 조회 (디버깅/대시보드 용도).
   *
   * 락 없이 읽으므로 "정확도 불필요, 관찰만" 인 지점에서만 사용.
   */
  async currentCount(source: SourceSite, kind: RateCounterKind): Promise<number> {
    if (kind === 'resource') return 0;
    const statePath = this.statePath(source, kind);
    const record = await this.readRecord(statePath);
    return record.date === todayInSeoul() ? record.count : 0;
  }

  /**
   * T1+ 활성 여부 — ConcurrencyGuard 연결 전까지 false 고정 (Phase 5 확장 예정).
   *
   * TKTK Phase 5 연결점:
   *   - `ConcurrencyGuard.listActive()` 결과에서 tier ≥ 1 세션이 있는지 확인.
   *   - 결과를 캐시해 acquire 마다 파일 I/O 가 터지는 걸 막는다 (ttl ~30s 권장).
   */
  private isHigherTierActive(): boolean {
    return false;
  }

  /** `<repoRoot>/data/state/rate/<source>/<kind>.json`. */
  private statePath(source: SourceSite, kind: RateCounterKind): string {
    const filename = kind === 'direct' ? 'direct.json' : 'navigation.json';
    return repoPath('data', 'state', 'rate', source, filename);
  }

  /** 파일이 없으면 빈 레코드로 생성 (lockfile 대상 존재 전제). */
  private async ensureFile(statePath: string): Promise<void> {
    try {
      await readFile(statePath, 'utf8');
    } catch {
      const initial: RateStateRecord = {
        date: todayInSeoul(),
        count: 0,
        approachingAlertSent: false,
      };
      await writeFile(statePath, JSON.stringify(initial, null, 2), 'utf8');
    }
  }

  /** 손상된 JSON 은 "오늘 0 카운트" 로 fallback. 다음 쓰기에서 자동 치유. */
  private async readRecord(statePath: string): Promise<RateStateRecord> {
    try {
      const raw = await readFile(statePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<RateStateRecord>;
      if (typeof parsed.date !== 'string' || typeof parsed.count !== 'number') {
        return { date: todayInSeoul(), count: 0, approachingAlertSent: false };
      }
      return {
        date: parsed.date,
        count: parsed.count,
        approachingAlertSent: parsed.approachingAlertSent === true,
      };
    } catch {
      return { date: todayInSeoul(), count: 0, approachingAlertSent: false };
    }
  }
}
