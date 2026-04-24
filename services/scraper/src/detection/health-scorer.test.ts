/**
 * HealthScorer (Task 6.5) — CRAWLING_STRATEGY §12.3.
 *
 * 검증 대상:
 *   - deltaForSignals: critical=50 / high=20 / medium=10 / low=5 누적
 *   - applyForPersona: penalize 호출 + 임계값 분기 (continue / cooldown_2w / retire)
 *   - cooldown_2w → notify('health.score_dropped') + PersonaManager.cooldown
 *   - retire → notify('persona.retired') + PersonaManager.retire
 *   - delta=0 (signals 비어 있음) → 변경 없음, action='continue'
 *   - crawlState.setHealthScore 자동 동기화
 */

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EventType } from '../notifier/events.js';
import type { PersonaRuntimeState } from '../persona/types.js';
import { CrawlState } from '../state/crawl-state.js';
import { HealthScorer, type PersonaManagerLike } from './health-scorer.js';
import type { DetectionSignal } from './monitor.js';
import type { NotifierLike } from '../error/reaction.js';

type SpyPersonaMgr = PersonaManagerLike & {
  calls: { method: string; args: unknown[] }[];
  state: PersonaRuntimeState;
};

function spyPersonaMgr(initialScore: number): SpyPersonaMgr {
  const calls: { method: string; args: unknown[] }[] = [];
  let state: PersonaRuntimeState = {
    id: 'korean-pokemon-fan',
    healthScore: initialScore,
    warmedUp: true,
    createdAt: '2026-01-01T00:00:00Z',
    lastUsed: null,
    retired: null,
    cooldownUntil: null,
  };
  const mgr: SpyPersonaMgr = {
    calls,
    get state() {
      return state;
    },
    set state(s: PersonaRuntimeState) {
      state = s;
    },
    getState: async (id) => {
      calls.push({ method: 'getState', args: [id] });
      return state;
    },
    penalize: async (id, delta) => {
      calls.push({ method: 'penalize', args: [id, delta] });
      state = { ...state, healthScore: Math.max(0, state.healthScore - delta) };
      return state;
    },
    retire: async (id, reason) => {
      calls.push({ method: 'retire', args: [id, reason] });
      state = { ...state, healthScore: 0, retired: { at: '2026-04-24T09:00:00Z', reason } };
      return state;
    },
    cooldown: async (id, until) => {
      calls.push({ method: 'cooldown', args: [id, until] });
      state = { ...state, cooldownUntil: until.toISOString() };
      return state;
    },
  };
  return mgr;
}

function spyNotifier(): NotifierLike & { calls: { event: EventType; meta: Record<string, unknown> }[] } {
  const calls: { event: EventType; meta: Record<string, unknown> }[] = [];
  return {
    calls,
    notify: async (event, meta = {}) => {
      calls.push({ event, meta });
    },
  };
}

const sig = (severity: DetectionSignal['severity'], type: DetectionSignal['type'] = 'block'): DetectionSignal => ({
  type,
  severity,
});

describe('HealthScorer.deltaForSignals', () => {
  it('maps each severity to documented delta', () => {
    expect(HealthScorer.deltaForSignals([sig('critical')])).toBe(50);
    expect(HealthScorer.deltaForSignals([sig('high')])).toBe(20);
    expect(HealthScorer.deltaForSignals([sig('medium')])).toBe(10);
    expect(HealthScorer.deltaForSignals([sig('low')])).toBe(5);
  });

  it('sums multiple signals', () => {
    expect(HealthScorer.deltaForSignals([sig('high'), sig('medium'), sig('low')])).toBe(35);
  });

  it('returns 0 for empty array', () => {
    expect(HealthScorer.deltaForSignals([])).toBe(0);
  });
});

describe('HealthScorer.applyForPersona', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-health-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('continue when score ≥ 50 after penalize', async () => {
    const mgr = spyPersonaMgr(100);
    const notifier = spyNotifier();
    const crawlState = new CrawlState({ statePath: path.join(dir, 'crawl.json') });
    const scorer = new HealthScorer({ personaManager: mgr, notifier, crawlState, now: () => new Date('2026-04-24T09:00:00Z') });

    const outcome = await scorer.applyForPersona('korean-pokemon-fan', [sig('high')]);
    expect(outcome).toEqual({ delta: 20, before: 100, after: 80, action: 'continue' });
    expect(mgr.calls.some((c) => c.method === 'penalize')).toBe(true);
    expect(mgr.calls.some((c) => c.method === 'cooldown')).toBe(false);
    expect(mgr.calls.some((c) => c.method === 'retire')).toBe(false);
    expect(notifier.calls).toHaveLength(0);

    const data = await crawlState.read();
    expect(data.healthScores['korean-pokemon-fan']).toBe(80);
  });

  it('cooldown_2w when 20 ≤ score < 50', async () => {
    const mgr = spyPersonaMgr(60);
    const notifier = spyNotifier();
    const now = new Date('2026-04-24T09:00:00Z');
    const scorer = new HealthScorer({ personaManager: mgr, notifier, now: () => now });

    const outcome = await scorer.applyForPersona('korean-pokemon-fan', [sig('high')]);
    expect(outcome.action).toBe('cooldown_2w');
    expect(outcome.after).toBe(40);

    const cooldownCall = mgr.calls.find((c) => c.method === 'cooldown');
    expect(cooldownCall).toBeDefined();
    const cooldownUntil = cooldownCall?.args[1] as Date;
    expect(cooldownUntil.getTime() - now.getTime()).toBe(14 * 24 * 60 * 60 * 1000);

    expect(notifier.calls.map((c) => c.event)).toContain('health.score_dropped');
  });

  it('retire when score < 20', async () => {
    const mgr = spyPersonaMgr(30);
    const notifier = spyNotifier();
    const scorer = new HealthScorer({ personaManager: mgr, notifier });

    const outcome = await scorer.applyForPersona('korean-pokemon-fan', [sig('high')]);
    expect(outcome.action).toBe('retire');
    expect(outcome.after).toBe(10);

    expect(mgr.calls.some((c) => c.method === 'retire')).toBe(true);
    expect(notifier.calls.map((c) => c.event)).toContain('persona.retired');
  });

  it('no-op when delta=0 (signals empty)', async () => {
    const mgr = spyPersonaMgr(80);
    const notifier = spyNotifier();
    const scorer = new HealthScorer({ personaManager: mgr, notifier });

    const outcome = await scorer.applyForPersona('korean-pokemon-fan', []);
    expect(outcome).toEqual({ delta: 0, before: 80, after: 80, action: 'continue' });
    expect(mgr.calls.some((c) => c.method === 'penalize')).toBe(false);
    expect(notifier.calls).toHaveLength(0);
  });
});
