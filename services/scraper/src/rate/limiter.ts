/**
 * RateLimiter (CRAWLING_STRATEGY §14.3, §6.4.1).
 *
 * 책임:
 *   - navigation / resource / direct 3종 카운터 분리 누적.
 *   - 일별(UTC+9 자정 기준) 자동 리셋.
 *   - `data/state/rate/<source>/<kind>.json` 영속 (atomic write).
 *   - proper-lockfile 로 쓰기 보호 (재시작/멀티 프로세스 대비).
 *   - 80% 도달 시 `rate_limit.approaching` 알림 (Notifier 주입 시) — 락 해제 후 호출.
 *   - T1+ 활성 시 T0 50% 감속 (§6.4.1) — 현재는 ConcurrencyGuard 미구현이므로
 *     `isHigherTierActive` 스텁이 항상 false 반환. Phase 5 에서 연결.
 *
 * acquire 흐름:
 *   1. 오늘 날짜와 저장된 date 비교 → 다르면 0 으로 리셋.
 *   2. `count + 1 > maxPerDay` 면 `RateLimitExceededError`.
 *   3. 80% 임계 교차 감지 시 payload 준비 (실제 호출은 락 해제 후).
 *   4. count 를 +1 해 영속화 (lock + atomic write 로 보호).
 *   5. 락 해제 후 notifier 호출 (10s blocking 이 락 보유 시간을 늘리지 않도록).
 *
 * ★ 주의:
 *   - `acquire()` 는 **즉시 반환**. 요청 간 sleep 은 Phase 5 BehaviorSimulator
 *     가 가우시안 샘플로 별도 처리. 본 Limiter 는 한도 관리만 책임.
 *   - `resource` 카운터는 §14.1 정의대로 "카운트하지 않음" 이 원칙이지만, 미래
 *     모니터링용으로 타입만 받도록 API 를 열어 둔다 (no-op 로 처리).
 *   - state 파일 쓰기는 `atomicWriteJson` (tmp write + rename) — Phase 4 audit OPS-403.
 *     크래시 중 count=0 재초기화 리스크 제거.
 *   - Notifier 호출은 락 외부에서 수행 — Phase 4 audit PERF-405.
 */

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { SourceSite } from '@pokopia-wiki/shared';
import lockfile from 'proper-lockfile';

import { RateLimitExceededError } from '../fetchers/errors.js';
import type { Notifier } from '../notifier/index.js';
import { repoPath } from '../paths.js';
import type { ConcurrencyGuard } from '../scheduler/concurrency-guard.js';
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

/**
 * 80% 임계 교차 시 호출자가 Notifier 로 발행할 페이로드.
 *
 * `bumpUnderLock` 은 락 보유 시간 단축을 위해 직접 notify 하지 않고 이 객체만 반환 —
 * `acquire()` 가 락 해제 **후** 실제 notify 를 호출한다 (Phase 4 audit PERF-405).
 */
type ApproachingAlertPayload = {
  source: SourceSite;
  kind: 'navigation' | 'direct';
  count: number;
  dailyLimit: number;
  percent: number;
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
 * tmp 파일에 먼저 쓰고 rename 으로 타겟을 atomic 하게 교체.
 *
 * POSIX 보장: 같은 파일시스템 내 rename 은 원자적. 크래시가 writeFile 도중 끊어져도
 * 기존 파일은 손상되지 않는다 (Phase 4 audit OPS-403 근거).
 */
async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const serialized = JSON.stringify(data, null, 2);
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    await writeFile(tmpPath, serialized, 'utf8');
    await rename(tmpPath, filePath);
  } catch (err) {
    await unlink(tmpPath).catch(() => {
      /* best-effort — tmp 가 없을 수 있음 */
    });
    throw err;
  }
}

/** `isHigherTierActive` 결과 캐시 ttl — acquire 마다 파일 I/O 방지 (§6.4.1). */
const HIGHER_TIER_CACHE_MS = 30_000;

/**
 * RateLimiter.
 *
 * Notifier / ConcurrencyGuard 모두 선택적 — 테스트/CLI 에선 주입하지 않으면
 * 각각 알림 skip / 감속 비활성.
 *
 * Phase 5 연결 (TKTK #4 해소): `isHigherTierActive()` 가 `ConcurrencyGuard.
 * listActive()` 결과로 T1+ 세션 존재 여부를 판단. 30s cache 로 acquire 빈도
 * 대비 I/O 비용을 제한.
 */
export class RateLimiter {
  private cachedHigherTier: { at: number; value: boolean } | null = null;

  constructor(
    private readonly notifier?: Notifier,
    private readonly guard?: ConcurrencyGuard,
  ) {}

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

    let alertPayload: ApproachingAlertPayload | undefined;
    const release = await lockfile.lock(statePath, {
      stale: 10_000,
      retries: { retries: 5, minTimeout: 50, maxTimeout: 500 },
    });
    try {
      alertPayload = await this.bumpUnderLock(source, kind, statePath, budget.maxPerDay);
    } finally {
      await release();
    }

    // 락 해제 후 Notifier 호출 — Telegram 10s timeout 이 다른 acquire 를 차단하지
    // 않도록 (Phase 4 audit PERF-405).
    if (alertPayload && this.notifier) {
      await this.notifier.notify('rate_limit.approaching', alertPayload).catch(() => {
        /* best-effort — events.jsonl 측에 기록 */
      });
    }
  }

  /** source+kind 조합으로 RateBudget 결정 — 미지원이면 undefined. */
  private resolveBudget(source: SourceSite, kind: 'navigation' | 'direct'): RateBudget | undefined {
    const config = RATE_LIMITS[source];
    return kind === 'navigation' ? config.navigation : config.directFetch;
  }

  /**
   * 락 보호된 영역: 오늘 카운트 +1, 필요 시 임계 교차 payload 반환.
   *
   * notify 는 호출하지 않는다 (acquire 가 락 해제 후 수행).
   */
  private async bumpUnderLock(
    source: SourceSite,
    kind: 'navigation' | 'direct',
    statePath: string,
    baseDailyLimit: number,
  ): Promise<ApproachingAlertPayload | undefined> {
    const today = todayInSeoul();
    const record = await this.readRecord(statePath);
    const current: RateStateRecord =
      record.date === today ? record : { date: today, count: 0, approachingAlertSent: false };

    // T1+ 활성 시 T0 50% 감속 — effective 한도를 절반으로 (§6.4.1).
    const higherTier = source === 'serebii' ? await this.isHigherTierActive() : false;
    const effectiveDailyLimit = higherTier ? Math.floor(baseDailyLimit / 2) : baseDailyLimit;

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
    await atomicWriteJson(statePath, next);

    return crossedApproaching
      ? {
          source,
          kind,
          count: nextCount,
          dailyLimit: effectiveDailyLimit,
          percent: Math.round((nextCount / effectiveDailyLimit) * 100),
        }
      : undefined;
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
   * T1+ 활성 여부 — `ConcurrencyGuard.listActive()` 결과에서 tier ≥ 1 존재 확인.
   *
   * 30s cache: acquire 당 파일 I/O + proper-lockfile lock 획득 비용이 누적되면
   * 실시간 요청 처리 지연이 눈에 띄게 증가. T1+ 세션이 생기거나 종료되는 주기는
   * 분 단위라 30s 해상도로 충분 (§6.4.1 stagger 5min 보다 훨씬 짧음).
   *
   * guard 미주입 시 false — RateLimiter 단독 사용(preflight·테스트) 경로 호환.
   */
  private async isHigherTierActive(): Promise<boolean> {
    if (!this.guard) return false;
    const now = Date.now();
    if (this.cachedHigherTier && now - this.cachedHigherTier.at < HIGHER_TIER_CACHE_MS) {
      return this.cachedHigherTier.value;
    }
    try {
      const active = await this.guard.listActive();
      const value = active.some((s) => s.tier >= 1);
      this.cachedHigherTier = { at: now, value };
      return value;
    } catch {
      return false;
    }
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
      await atomicWriteJson(statePath, initial);
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
