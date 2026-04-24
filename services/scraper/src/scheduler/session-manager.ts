/**
 * SessionManager (Task 6.2) — Phase 6 X-509 #1~#6 통합 지점.
 *
 * 한 번의 스크래핑 세션 라이프사이클을 관리한다. 호출자(스크립트/CLI)는
 * `runSession(args, fn)` 으로 frame 을 받고, fn 안에서 페이지 네비게이션·파싱을
 * 수행. SessionManager 는 그 frame 을 X-509 안전망으로 감싼다.
 *
 * ## X-509 통합 매트릭스
 *
 *   1. **Chrome bump notify** — `chromeOnSessionStart` hook 이 `bumped=true` 면
 *      `notifier.notify('chrome.version_bump')` 발행 + `resetUserAgentCache()`
 *      호출 (X-509 #1 + #3 동반).
 *   2. **catch redact 강제** — fn 내부에서 throw 된 모든 에러는 `redact()` 통과
 *      후 알림·로그.
 *   4. **fetcher.close() 강제** — finally 에서 best-effort 호출.
 *   5. **reconcileOnBoot()** — `bootstrap()` 메서드. entry 가 `runSession` 직전에
 *      1 회 호출.
 *   6. **getGuard 싱글톤** — `guard` 는 외부 주입 (entry 에서 `initGuard` /
 *      `getGuard` 로 단일 인스턴스 보장).
 *
 *   #7 (DriverPage) 는 행동 모듈 의존성이라 SessionManager 자체에는 직접 표면
 *   없음 — fn 안에서 사용.
 *
 * ## DI
 *
 *   다수의 의존성 — 각각 좁은 capability 인터페이스로 받아 테스트 mock 부담 최소화.
 *
 * ## 알림 정책
 *
 *   - `session.start` / `session.end` 는 항상 발행 (severity: info).
 *   - `chrome.version_bump` 은 bump 가 실제로 일어났을 때만.
 *   - 예외 catch 시 `scraper.crashed` (severity: critical) — 메시지는 redact.
 */

import type { SourceSite } from '@pokopia-wiki/shared';
import { redact } from '@pokopia-wiki/shared';

import type { ErrorReaction, ErrorType, NotifierLike, ReactionDirective } from '../error/reaction.js';
import type { DetectionSignal } from '../detection/monitor.js';
import type { HealthOutcome, HealthScorer } from '../detection/health-scorer.js';
import type { Fetcher } from '../fetchers/types.js';
import type { BrowserPersona } from '../persona/types.js';
import type { CrawlState } from '../state/crawl-state.js';
import type { ChromeVersion } from '../browser/chrome-version.js';
import type { ConcurrencyGuard, SessionTier } from './concurrency-guard.js';

/**
 * 세션 매니저가 PersonaManager 에서 실제로 사용하는 메서드만 — 테스트 mock 단순화.
 */
export type PersonaCooldownReader = {
  isCoolingDown(id: string, now: Date): Promise<boolean>;
};

/**
 * Fetcher 생성 함수. T0 는 persona 없이, T1+ 는 persona 필수 — 호출자가 정의한 factory
 * 에서 fetcher/factory 의 PersonaRequiredError 검증을 그대로 사용.
 */
export type FetcherFactoryFn = (source: SourceSite, persona?: BrowserPersona) => Fetcher;

/**
 * Chrome 버전 bump 검사 hook. `bumped=true` 면 SessionManager 가 자동으로 알림 +
 * UA 캐시 파기. 미주입 시 X-509 #1 + #3 비활성 (테스트 격리).
 */
export type ChromeSessionHook = () => Promise<{ version: ChromeVersion; bumped: boolean }>;

/**
 * fn 안에서 사용 가능한 컨텍스트.
 *
 * - `fetcher`: 이미 생성된 Fetcher 인스턴스 (close 는 SessionManager 가 finally 에서).
 * - `reportSignals`: DetectionMonitor 결과를 HealthScorer 로 흘려보내는 wrap.
 * - `reportError`: ErrorReaction.react 에 source/url/attempt 컨텍스트 자동 주입.
 */
export type SessionContext = {
  source: SourceSite;
  persona: BrowserPersona | undefined;
  fetcher: Fetcher;
  reportSignals(signals: readonly DetectionSignal[]): Promise<HealthOutcome | null>;
  reportError(error: ErrorType, args: { url: string; attempt: number }): Promise<ReactionDirective>;
};

export type SessionAction<T> = (ctx: SessionContext) => Promise<T>;

export type SessionArgs = {
  source: SourceSite;
  tier: SessionTier;
  phase?: number;
  /** T0 면 undefined. T1+ 는 호출자가 PersonaManager.forSource 로 미리 결정 후 주입. */
  persona?: BrowserPersona;
};

export type SessionOutcome<T> =
  | { kind: 'completed'; result: T }
  | { kind: 'skipped'; reason: SessionSkipReason; details?: string }
  | { kind: 'aborted'; reason: string };

export type SessionSkipReason = 'source_cooldown' | 'persona_cooldown' | 'guard_rejected';

export type SessionManagerOptions = {
  guard: ConcurrencyGuard;
  crawlState: CrawlState;
  fetcherFactory: FetcherFactoryFn;
  errorReaction: ErrorReaction;
  personaManager?: PersonaCooldownReader;
  healthScorer?: HealthScorer;
  notifier?: NotifierLike;
  chromeOnSessionStart?: ChromeSessionHook;
  /** X-509 #3 — UA cache flush. 보통 ky-fetcher 의 resetCachedUserAgent. */
  resetUserAgentCache?: () => void;
  /** 기본 세션 길이 — CrawlState.startSession.plannedDurationMs. */
  sessionDurationMs?: number;
  now?: () => Date;
};

const DEFAULT_SESSION_DURATION_MS = 30 * 60 * 1000;

export class SessionManager {
  private readonly guard: ConcurrencyGuard;
  private readonly crawlState: CrawlState;
  private readonly fetcherFactory: FetcherFactoryFn;
  private readonly errorReaction: ErrorReaction;
  private readonly personaManager: PersonaCooldownReader | undefined;
  private readonly healthScorer: HealthScorer | undefined;
  private readonly notifier: NotifierLike | undefined;
  private readonly chromeOnSessionStart: ChromeSessionHook | undefined;
  private readonly resetUserAgentCache: (() => void) | undefined;
  private readonly sessionDurationMs: number;
  private readonly now: () => Date;

  constructor(options: SessionManagerOptions) {
    this.guard = options.guard;
    this.crawlState = options.crawlState;
    this.fetcherFactory = options.fetcherFactory;
    this.errorReaction = options.errorReaction;
    this.personaManager = options.personaManager;
    this.healthScorer = options.healthScorer;
    this.notifier = options.notifier;
    this.chromeOnSessionStart = options.chromeOnSessionStart;
    this.resetUserAgentCache = options.resetUserAgentCache;
    this.sessionDurationMs = options.sessionDurationMs ?? DEFAULT_SESSION_DURATION_MS;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * X-509 #5 — 부팅 시 1 회 호출. 죽은 세션 reap + scraper.crashed 알림.
   *
   * entry script 는 `await sm.bootstrap()` → 반복 `runSession(...)` 패턴.
   */
  async bootstrap(): Promise<void> {
    await this.guard.reconcileOnBoot();
  }

  async runSession<T>(args: SessionArgs, fn: SessionAction<T>): Promise<SessionOutcome<T>> {
    // 1. Cooldown 게이트 — 가장 빠르게 거부.
    if (await this.crawlState.isCoolingDown(args.source)) {
      return { kind: 'skipped', reason: 'source_cooldown' };
    }
    if (args.persona !== undefined && this.personaManager !== undefined) {
      const cooling = await this.personaManager.isCoolingDown(args.persona.id, this.now());
      if (cooling) {
        return { kind: 'skipped', reason: 'persona_cooldown' };
      }
    }

    // 2. Guard acquire (X-509 #6 — 외부 주입 싱글톤).
    const acquired = await this.guard.acquire({ source: args.source, tier: args.tier, persona: args.persona });
    if (!acquired.ok) {
      return { kind: 'skipped', reason: 'guard_rejected', details: acquired.reason };
    }

    let fetcher: Fetcher | undefined;
    try {
      // 3. X-509 #1 + #3 — Chrome bump notify + UA cache flush.
      await this.handleChromeBump(args.source);

      // 4. CrawlState 세션 오픈.
      await this.crawlState.startSession({
        phase: args.phase ?? 0,
        persona: args.persona?.id ?? null,
        plannedDurationMs: this.sessionDurationMs,
      });

      // 5. Fetcher 생성 + session.start 알림.
      fetcher = this.fetcherFactory(args.source, args.persona);
      await this.safeNotify('session.start', { source: args.source, persona: args.persona?.id ?? null });

      // 6. action 실행 — fn 안에서 navigation/parsing.
      const ctx = this.createContext(args, fetcher);
      const result = await fn(ctx);
      return { kind: 'completed', result };
    } catch (err) {
      // X-509 #2 — 모든 catch 가 redact 경유. err.message 안의 토큰/시크릿 마스킹.
      const reason = err instanceof Error ? err.message : String(err);
      const safe = redact(reason);
      await this.safeNotify('scraper.crashed', { source: args.source, reason: safe });
      return { kind: 'aborted', reason: safe };
    } finally {
      // PERF-602: 정리 4 단계 병렬화 — 상호 순서 의존 없음.
      // X-509 #4 (fetcher.close) + Guard release + CrawlState 종료(+flush) + session.end notify.
      await Promise.allSettled([
        this.safeCloseFetcher(fetcher),
        this.safeReleaseGuard(args.source),
        this.safeEndSession(),
        this.safeNotify('session.end', { source: args.source }),
      ]);
    }
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────────────────

  private async handleChromeBump(source: SourceSite): Promise<void> {
    if (this.chromeOnSessionStart === undefined) return;
    const result = await this.chromeOnSessionStart();
    if (!result.bumped) return;
    this.resetUserAgentCache?.();
    await this.safeNotify('chrome.version_bump', { source, version: result.version.full });
  }

  private createContext(args: SessionArgs, fetcher: Fetcher): SessionContext {
    return {
      source: args.source,
      persona: args.persona,
      fetcher,
      reportSignals: async (signals) => {
        if (signals.length === 0) return null;
        if (this.healthScorer === undefined || args.persona === undefined) return null;
        return this.healthScorer.applyForPersona(args.persona.id, signals);
      },
      reportError: async (error, errArgs) =>
        this.errorReaction.react(error, {
          source: args.source,
          url: errArgs.url,
          attempt: errArgs.attempt,
        }),
    };
  }

  private async safeCloseFetcher(fetcher: Fetcher | undefined): Promise<void> {
    if (fetcher?.close === undefined) return;
    try {
      await fetcher.close();
    } catch (closeErr) {
      const reason = closeErr instanceof Error ? closeErr.message : String(closeErr);
      // X-509 #2 적용 — best-effort 라도 redact.
      // eslint-disable-next-line no-console
      console.error(`[session-manager] fetcher.close failed: ${redact(reason)}`);
    }
  }

  private async safeReleaseGuard(source: SourceSite): Promise<void> {
    try {
      await this.guard.release(source);
    } catch (releaseErr) {
      const reason = releaseErr instanceof Error ? releaseErr.message : String(releaseErr);
      // eslint-disable-next-line no-console
      console.error(`[session-manager] guard.release failed: ${redact(reason)}`);
    }
  }

  /**
   * 세션 마킹 해제 + debounce 모드 pending write flush (PERF-601 보완).
   *
   * CrawlState 가 `debounceMs>0` 으로 초기화됐을 때 `endSession` 의 update 는
   * 메모리 캐시만 바꾸고 write 는 지연된다. finally 가 끝나면 세션 루프 자체가
   * 해제되므로 여기서 flush 를 강제해 pending write 유실을 막는다.
   */
  private async safeEndSession(): Promise<void> {
    try {
      await this.crawlState.endSession();
      await this.crawlState.flush();
    } catch {
      /* best-effort */
    }
  }

  private async safeNotify(event: Parameters<NotifierLike['notify']>[0], meta: Record<string, unknown> = {}): Promise<void> {
    if (this.notifier === undefined) return;
    await this.notifier.notify(event, meta).catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`[session-manager] notifier failed: ${redact(reason)}`);
    });
  }
}
