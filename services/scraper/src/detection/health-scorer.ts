/**
 * HealthScorer — CRAWLING_STRATEGY §12.3.
 *
 * DetectionMonitor 가 모은 신호 묶음을 받아 페르소나 healthScore 를 차감하고,
 * 임계값에 따라 cooldown / retire 액션을 자동 실행한다.
 *
 * ## 정책 (§12.3 SSoT)
 *
 *   - severity → delta: critical -50 / high -20 / medium -10 / low -5
 *   - score < 50 → 2 주 cooldown (PersonaManager.cooldown), notify('health.score_dropped')
 *   - score < 20 → retire (PersonaManager.retire), notify('persona.retired')
 *   - delta = 0 → 변경 없음, no-op
 *
 * ## DI
 *
 *   - `personaManager`: 구조적 타입 `PersonaManagerLike` — 테스트 spy 단순화.
 *   - `notifier` / `crawlState`: optional. 미주입 시 알림·CrawlState 동기화 skip.
 *   - `now`: cooldown 만료 시각 deterministic.
 *   - `config`: 임계값·delta 매핑 override.
 */

import type { PersonaRuntimeState } from '../persona/types.js';
import type { CrawlState } from '../state/crawl-state.js';
import type { NotifierLike } from '../error/reaction.js';
import type { DetectionSignal } from './monitor.js';

/**
 * PersonaManager 의 좁은 의존성 — health 적용에 필요한 메서드만.
 */
export type PersonaManagerLike = {
  getState(id: string): Promise<PersonaRuntimeState>;
  penalize(id: string, delta: number): Promise<PersonaRuntimeState>;
  retire(id: string, reason: string): Promise<PersonaRuntimeState>;
  cooldown(id: string, until: Date): Promise<PersonaRuntimeState>;
};

export type HealthAction = 'continue' | 'cooldown_2w' | 'retire';

export type HealthOutcome = {
  delta: number;
  before: number;
  after: number;
  action: HealthAction;
};

export type HealthScorerConfig = {
  cooldownThreshold: number; // 기본 50
  retireThreshold: number; // 기본 20
  cooldownDurationMs: number; // 기본 14 일
  severityDelta: Record<DetectionSignal['severity'], number>;
};

const DEFAULT_CONFIG: HealthScorerConfig = {
  cooldownThreshold: 50,
  retireThreshold: 20,
  cooldownDurationMs: 14 * 24 * 60 * 60 * 1000,
  severityDelta: { critical: 50, high: 20, medium: 10, low: 5 },
};

export type HealthScorerOptions = {
  personaManager: PersonaManagerLike;
  notifier?: NotifierLike;
  crawlState?: CrawlState;
  now?: () => Date;
  config?: Partial<HealthScorerConfig>;
};

export class HealthScorer {
  private readonly personaManager: PersonaManagerLike;
  private readonly notifier: NotifierLike | undefined;
  private readonly crawlState: CrawlState | undefined;
  private readonly now: () => Date;
  private readonly config: HealthScorerConfig;

  constructor(options: HealthScorerOptions) {
    this.personaManager = options.personaManager;
    this.notifier = options.notifier;
    this.crawlState = options.crawlState;
    this.now = options.now ?? (() => new Date());
    this.config = {
      ...DEFAULT_CONFIG,
      ...options.config,
      severityDelta: { ...DEFAULT_CONFIG.severityDelta, ...options.config?.severityDelta },
    };
  }

  /** signals 의 누적 delta. 정책 분리(테스트·외부 활용) 위해 static. */
  static deltaForSignals(signals: readonly DetectionSignal[], severityDelta: Record<DetectionSignal['severity'], number> = DEFAULT_CONFIG.severityDelta): number {
    let total = 0;
    for (const s of signals) total += severityDelta[s.severity];
    return total;
  }

  async applyForPersona(personaId: string, signals: readonly DetectionSignal[]): Promise<HealthOutcome> {
    const delta = HealthScorer.deltaForSignals(signals, this.config.severityDelta);
    if (delta === 0) {
      const state = await this.personaManager.getState(personaId);
      return { delta: 0, before: state.healthScore, after: state.healthScore, action: 'continue' };
    }

    const before = (await this.personaManager.getState(personaId)).healthScore;
    const next = await this.personaManager.penalize(personaId, delta);
    const after = next.healthScore;
    await this.crawlState?.setHealthScore(personaId, after);

    if (after < this.config.retireThreshold) {
      await this.personaManager.retire(personaId, 'health_score_below_retire_threshold');
      await this.notifier?.notify('persona.retired', { personaId, healthScore: after });
      return { delta, before, after, action: 'retire' };
    }

    if (after < this.config.cooldownThreshold) {
      const until = new Date(this.now().getTime() + this.config.cooldownDurationMs);
      await this.personaManager.cooldown(personaId, until);
      await this.notifier?.notify('health.score_dropped', { personaId, healthScore: after, cooldownUntil: until.toISOString() });
      return { delta, before, after, action: 'cooldown_2w' };
    }

    return { delta, before, after, action: 'continue' };
  }
}
