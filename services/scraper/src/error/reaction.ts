/**
 * ErrorReactionSimulator — CRAWLING_STRATEGY §11.1 / §11.2.
 *
 * 책임:
 *   - 관찰된 ErrorType 을 적절한 directive 로 변환 (호출자 SessionManager 가 분기 실행).
 *   - 차단/한도 초과 시 cooldown 을 CrawlState 에 기록 (지수 증가).
 *   - 알림(`notify`) 발행 — `EventType` 은 §13.3.2 SEVERITY_MAP 키와 완전 일치.
 *   - 같은 페이지의 TIMEOUT 은 1 회만 재시도 — `attempt` 인자로 호출자가 추적.
 *
 * ## 정책 vs 실행 분리
 *
 *   `react()` 는 page/browser 에 직접 손대지 않는다. 대신 `ReactionDirective` 로
 *   "다음에 무엇을 할지" 만 반환 — SessionManager 가 page.reload, page.waitForFunction,
 *   session.end 등 page-level 동작을 수행. 정책의 단위 테스트 가능성을 위해.
 *
 * ## 지수 cooldown
 *
 *   같은 source 에서 BLOCK_403/429/SOFT_THROTTLE 가 N 번째 발생 시:
 *     cooldownMs = baseMs * factor^(N-1)
 *
 *   - BLOCK_403/429: base 240 min, factor 2 → 240 / 480 / 960 / ... (4시간 → 8 → 16)
 *   - SOFT_THROTTLE: base 60~180 min (random), factor 1 (단발) — §11.1
 *
 *   카운터는 in-memory (process scope) — 다음 부팅 시 리셋. 4 차 실패까지 영속이
 *   필요해지면 CrawlState 확장 (Phase 7+).
 *
 * ## DI
 *
 *   - `notifier`: optional. 미주입 시 알림 skip (테스트나 dry-run 모드 대비).
 *   - `crawlState`: 필수. cooldown 영속 + 추후 attempt 영속 가능성.
 *   - `now`: deterministic 시간 — cooldownUntil 계산 격리.
 *   - `random`: TIMEOUT retry 지연·SOFT_THROTTLE cooldown 분포 격리.
 *   - `config`: cooldown 기본값 override.
 */

import type { SourceSite } from '@pokopia-wiki/shared';

import type { EventType } from '../notifier/events.js';
import type { CrawlState } from '../state/crawl-state.js';

/**
 * 관찰 가능한 에러 분류 (§11.1).
 *
 * 7 종 — fetcher 계층 커스텀 에러(`SessionAbortError` 등)의 메시지나 status 를
 * 보고 호출자가 분류. CAPTCHA_UNRESOLVED 같은 "wait timeout" 은 이 enum 에
 * 포함하지 않는다 — directive `onTimeout` 으로 호출자가 후속 처리.
 */
export enum ErrorType {
  BLOCK_403 = 'BLOCK_403',
  RATE_LIMIT_429 = 'RATE_LIMIT_429',
  TIMEOUT = 'TIMEOUT',
  CLOUDFLARE_CHALLENGE = 'CLOUDFLARE_CHALLENGE',
  CAPTCHA = 'CAPTCHA',
  SOFT_THROTTLE = 'SOFT_THROTTLE',
  UNKNOWN = 'UNKNOWN',
}

/**
 * 호출자가 페이지 단위로 추적하는 컨텍스트.
 *
 * `attempt` 는 같은 페이지에 대한 시도 번호 (1-based). TIMEOUT 정책은 attempt
 * 1 에서 1 회 재시도, 2 부터 abort.
 */
export type ReactionContext = {
  source: SourceSite;
  url: string;
  attempt: number;
};

/**
 * SessionManager 가 받아서 page-level 동작으로 풀어내는 정책 결정.
 *
 * `wait-cf` / `wait-captcha` 는 호출자가 `page.waitForFunction(...)` 을 직접 실행.
 * `onTimeout` 은 wait 가 실패했을 때 호출자가 무엇을 할지 미리 명시 — 현재는
 * 'abort-session' 만 (CF/CAPTCHA 모두 SSoT 가 timeout → 세션 종료).
 */
export type ReactionDirective =
  | { kind: 'retry-after-ms'; ms: number }
  | { kind: 'abort-session'; reason: string }
  | { kind: 'wait-cf'; timeoutMs: number; onTimeout: 'abort-session' }
  | { kind: 'wait-captcha'; timeoutMs: number; onTimeout: 'abort-session' };

/**
 * Notifier 의 좁은 의존성 — 테스트 mock 단순화.
 */
export type NotifierLike = {
  notify(event: EventType, meta?: Record<string, unknown>): Promise<void>;
};

export type ErrorReactionConfig = {
  /** BLOCK_403 / 429 cooldown 기본 (분). 기본 240 (=4h). */
  blockCooldownBaseMinutes: number;
  /** BLOCK_403 / 429 cooldown 지수 인자. 기본 2. */
  blockCooldownFactor: number;
  /** TIMEOUT retry 지연 최소 (ms). 기본 5000. */
  timeoutRetryMinMs: number;
  /** TIMEOUT retry 지연 최대 (ms). 기본 10000. */
  timeoutRetryMaxMs: number;
  /** CF challenge wait timeout (ms). 기본 60000. */
  cfWaitTimeoutMs: number;
  /** CAPTCHA wait timeout (ms). 기본 300000 (5 min). */
  captchaWaitTimeoutMs: number;
  /** SOFT_THROTTLE cooldown 최소 (분). 기본 60. */
  softThrottleMinMinutes: number;
  /** SOFT_THROTTLE cooldown 최대 (분). 기본 180. */
  softThrottleMaxMinutes: number;
};

const DEFAULT_CONFIG: ErrorReactionConfig = {
  blockCooldownBaseMinutes: 240,
  blockCooldownFactor: 2,
  timeoutRetryMinMs: 5000,
  timeoutRetryMaxMs: 10_000,
  cfWaitTimeoutMs: 60_000,
  captchaWaitTimeoutMs: 300_000,
  softThrottleMinMinutes: 60,
  softThrottleMaxMinutes: 180,
};

export type ErrorReactionOptions = {
  notifier?: NotifierLike;
  crawlState: CrawlState;
  now?: () => Date;
  random?: () => number;
  config?: Partial<ErrorReactionConfig>;
};

export class ErrorReaction {
  private readonly notifier: NotifierLike | undefined;
  private readonly crawlState: CrawlState;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly config: ErrorReactionConfig;
  /** source 별 BLOCK 누적 횟수 (지수 cooldown 계산용). */
  private readonly blockAttempts = new Map<SourceSite, number>();

  constructor(options: ErrorReactionOptions) {
    this.notifier = options.notifier;
    this.crawlState = options.crawlState;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
  }

  /** source 의 BLOCK 누적 카운터 리셋 — 세션 정상 종료/소스 cooldown 만료 시. */
  reset(source: SourceSite): void {
    this.blockAttempts.delete(source);
  }

  async react(error: ErrorType, ctx: ReactionContext): Promise<ReactionDirective> {
    switch (error) {
      case ErrorType.BLOCK_403:
        return this.handleBlock(ctx, 'block.403', 'BLOCK_403');
      case ErrorType.RATE_LIMIT_429:
        return this.handleBlock(ctx, 'block.429', 'RATE_LIMIT_429');
      case ErrorType.TIMEOUT:
        return this.handleTimeout(ctx);
      case ErrorType.CLOUDFLARE_CHALLENGE:
        return { kind: 'wait-cf', timeoutMs: this.config.cfWaitTimeoutMs, onTimeout: 'abort-session' };
      case ErrorType.CAPTCHA:
        return this.handleCaptcha(ctx);
      case ErrorType.SOFT_THROTTLE:
        return this.handleSoftThrottle(ctx);
      case ErrorType.UNKNOWN:
        return { kind: 'abort-session', reason: 'UNKNOWN' };
      default: {
        const never: never = error;
        throw new Error(`ErrorReaction.react: unknown error=${String(never)}`);
      }
    }
  }

  // ── 내부 핸들러 ──────────────────────────────────────────────────────────

  private async handleBlock(
    ctx: ReactionContext,
    eventType: 'block.403' | 'block.429',
    reason: string,
  ): Promise<ReactionDirective> {
    const attempt = (this.blockAttempts.get(ctx.source) ?? 0) + 1;
    this.blockAttempts.set(ctx.source, attempt);

    const cooldownMinutes = this.config.blockCooldownBaseMinutes * Math.pow(this.config.blockCooldownFactor, attempt - 1);
    const until = new Date(this.now().getTime() + cooldownMinutes * 60_000);
    await this.crawlState.setCooldown(ctx.source, until);
    await this.notifier?.notify(eventType, { source: ctx.source, url: ctx.url });

    return { kind: 'abort-session', reason };
  }

  private handleTimeout(ctx: ReactionContext): ReactionDirective {
    if (ctx.attempt >= 2) {
      return { kind: 'abort-session', reason: 'TIMEOUT' };
    }
    const { timeoutRetryMinMs, timeoutRetryMaxMs } = this.config;
    const ms = timeoutRetryMinMs + this.random() * (timeoutRetryMaxMs - timeoutRetryMinMs);
    return { kind: 'retry-after-ms', ms };
  }

  private async handleCaptcha(ctx: ReactionContext): Promise<ReactionDirective> {
    await this.notifier?.notify('captcha.detected', { source: ctx.source, url: ctx.url });
    return {
      kind: 'wait-captcha',
      timeoutMs: this.config.captchaWaitTimeoutMs,
      onTimeout: 'abort-session',
    };
  }

  private async handleSoftThrottle(ctx: ReactionContext): Promise<ReactionDirective> {
    const { softThrottleMinMinutes, softThrottleMaxMinutes } = this.config;
    const minutes = softThrottleMinMinutes + this.random() * (softThrottleMaxMinutes - softThrottleMinMinutes);
    const until = new Date(this.now().getTime() + minutes * 60_000);
    await this.crawlState.setCooldown(ctx.source, until);
    await this.notifier?.notify('soft_throttle.detected', { source: ctx.source });
    return { kind: 'abort-session', reason: 'SOFT_THROTTLE' };
  }
}
