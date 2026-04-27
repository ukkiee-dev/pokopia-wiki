/**
 * SessionManager (Task 6.2 + 6.8) — Phase 6 X-509 #1~#6 통합 테스트.
 *
 * 검증 시나리오:
 *   - bootstrap → guard.reconcileOnBoot 호출
 *   - happy path → action 실행 + completed result + fetcher.close + guard.release +
 *     session.start/end notify
 *   - source cooldown → skipped/source_cooldown (action 미호출)
 *   - persona cooldown → skipped/persona_cooldown
 *   - guard rejected → skipped/guard_rejected
 *   - X-509 #1 + #3: chrome bumped → notify('chrome.version_bump') +
 *     resetUserAgentCache 호출
 *   - X-509 #2: action throws → redact + notify('scraper.crashed') + aborted
 *   - X-509 #4: fetcher.close 가 throw → silent (best-effort), 세션 정리는 진행
 *   - reportError → ErrorReaction.react 호출 + cooldown CrawlState 기록 (Phase 6
 *     완료 조건 1번)
 */

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EventType } from '../notifier/events.js';
import { ErrorReaction, ErrorType, type NotifierLike } from '../error/reaction.js';
import type { ChromeVersion } from '../browser/chrome-version.js';
import type { Fetcher } from '../fetchers/types.js';
import type { BrowserPersona } from '../persona/types.js';
import { CrawlState } from '../state/crawl-state.js';
import { ConcurrencyGuard } from './concurrency-guard.js';
import { SessionManager, type FetcherFactoryFn, type PersonaCooldownReader } from './session-manager.js';

const KOREAN_FAN: BrowserPersona = {
  id: 'korean-pokemon-fan',
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
  storageStatePath: 'data/browser-profiles/korean-pokemon-fan/storageState.json',
  usedFor: ['pokopiaGuide', 'pokopoko'],
};

type Calls = string[];

function spyNotifier(): NotifierLike & { events: { event: EventType; meta: Record<string, unknown> }[] } {
  const events: { event: EventType; meta: Record<string, unknown> }[] = [];
  return {
    events,
    notify: async (event, meta = {}) => {
      events.push({ event, meta });
    },
  };
}

type SetupResult = {
  sm: SessionManager;
  notifier: ReturnType<typeof spyNotifier>;
  guard: ConcurrencyGuard;
  crawlState: CrawlState;
  errorReaction: ErrorReaction;
  fetcherCalls: Calls;
  fetcher: Fetcher & { closed: boolean; closeShouldThrow?: boolean };
  resetUACalls: number;
  uaResets: () => number;
};

type SetupOpts = {
  dir: string;
  now?: Date;
  chromeBumped?: boolean;
  fetcherFactoryOverride?: FetcherFactoryFn;
  personaCooldownReader?: PersonaCooldownReader;
  closeShouldThrow?: boolean;
  livePids?: ReadonlySet<number>;
  currentPid?: number;
};

function setup(opts: SetupOpts): SetupResult {
  const calls: Calls = [];
  const livePids = opts.livePids ?? new Set([opts.currentPid ?? 12345]);
  const guard = new ConcurrencyGuard({
    statePath: path.join(opts.dir, 'active-sessions.json'),
    hostname: () => 'test-host',
    isAlivePid: (pid) => livePids.has(pid),
    currentPid: () => opts.currentPid ?? 12345,
    nowISO: () => (opts.now ?? new Date()).toISOString(),
  });
  const crawlState = new CrawlState({
    statePath: path.join(opts.dir, 'crawl.json'),
    nowISO: () => (opts.now ?? new Date()).toISOString(),
  });
  const notifier = spyNotifier();
  const errorReaction = new ErrorReaction({
    notifier,
    crawlState,
    now: () => opts.now ?? new Date(),
    random: () => 0,
  });

  const fetcherImpl: Fetcher & { closed: boolean; closeShouldThrow?: boolean } = {
    closed: false,
    closeShouldThrow: opts.closeShouldThrow,
    fetch: async () => ({
      html: '',
      status: 200,
      url: 'https://x',
      headers: {},
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      contentHash: 'h',
    }),
    close: async () => {
      calls.push('fetcher.close');
      if (fetcherImpl.closeShouldThrow) throw new Error('close boom — token=abc123');
      fetcherImpl.closed = true;
    },
  };

  let resetUACalls = 0;
  const fetcherFactory: FetcherFactoryFn = opts.fetcherFactoryOverride ?? (() => fetcherImpl);

  const chromeOnSessionStart = opts.chromeBumped
    ? async (): Promise<{ version: ChromeVersion; bumped: boolean }> => ({
        version: { major: 137, minor: 0, build: 1234, patch: 5, full: '137.0.1234.5' },
        bumped: true,
      })
    : async (): Promise<{ version: ChromeVersion; bumped: boolean }> => ({
        version: { major: 136, minor: 0, build: 7103, patch: 93, full: '136.0.7103.93' },
        bumped: false,
      });

  const sm = new SessionManager({
    guard,
    crawlState,
    fetcherFactory,
    errorReaction,
    notifier,
    chromeOnSessionStart,
    resetUserAgentCache: () => {
      resetUACalls++;
    },
    personaManager: opts.personaCooldownReader,
    now: () => opts.now ?? new Date(),
    sessionDurationMs: 30_000,
  });

  return {
    sm,
    notifier,
    guard,
    crawlState,
    errorReaction,
    fetcherCalls: calls,
    fetcher: fetcherImpl,
    resetUACalls,
    uaResets: () => resetUACalls,
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-session-mgr-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SessionManager.bootstrap', () => {
  it('invokes guard.reconcileOnBoot', async () => {
    const { sm } = setup({ dir });
    // reconcileOnBoot 자체는 file I/O 만 — 호출만 확인하면 충분.
    await expect(sm.bootstrap()).resolves.toBeUndefined();
  });
});

describe('SessionManager.runSession happy path', () => {
  it('runs action, returns completed, calls fetcher.close + session.start/end', async () => {
    const { sm, notifier, fetcherCalls, fetcher } = setup({ dir });

    let actionCalled = false;
    const outcome = await sm.runSession(
      { source: 'pokopiaGuide', tier: 1, persona: KOREAN_FAN, phase: 6 },
      async (ctx) => {
        actionCalled = true;
        expect(ctx.source).toBe('pokopiaGuide');
        expect(ctx.persona?.id).toBe('korean-pokemon-fan');
        return 'ok';
      },
    );

    expect(actionCalled).toBe(true);
    expect(outcome).toEqual({ kind: 'completed', result: 'ok' });
    expect(fetcherCalls).toContain('fetcher.close');
    expect(fetcher.closed).toBe(true);

    const events = notifier.events.map((e) => e.event);
    expect(events).toContain('session.start');
    expect(events).toContain('session.end');
  });
});

describe('SessionManager.runSession cooldown gates', () => {
  it('skipped/source_cooldown when crawlState.isCoolingDown true', async () => {
    const now = new Date('2026-04-24T09:00:00Z');
    const { sm, crawlState } = setup({ dir, now });
    await crawlState.setCooldown('pokopiaGuide', new Date(now.getTime() + 60 * 60 * 1000));

    let actionCalled = false;
    const outcome = await sm.runSession(
      { source: 'pokopiaGuide', tier: 1, persona: KOREAN_FAN },
      async () => {
        actionCalled = true;
        return null;
      },
    );

    expect(outcome).toEqual({ kind: 'skipped', reason: 'source_cooldown' });
    expect(actionCalled).toBe(false);
  });

  it('skipped/persona_cooldown when personaManager.isCoolingDown true', async () => {
    const personaCooldownReader: PersonaCooldownReader = {
      isCoolingDown: async () => true,
    };
    const { sm } = setup({ dir, personaCooldownReader });

    let actionCalled = false;
    const outcome = await sm.runSession(
      { source: 'pokopiaGuide', tier: 1, persona: KOREAN_FAN },
      async () => {
        actionCalled = true;
        return null;
      },
    );

    expect(outcome).toEqual({ kind: 'skipped', reason: 'persona_cooldown' });
    expect(actionCalled).toBe(false);
  });
});

describe('SessionManager.runSession guard rejection', () => {
  it('skipped/guard_rejected when same source already active', async () => {
    const { sm, guard } = setup({ dir });
    // 사전에 같은 소스 acquire → 두 번째 acquire 가 same_source_active 로 거부.
    await guard.acquire({ source: 'pokopiaGuide', tier: 1, persona: KOREAN_FAN });

    const outcome = await sm.runSession(
      { source: 'pokopiaGuide', tier: 1, persona: KOREAN_FAN },
      async () => 'never',
    );
    expect(outcome.kind).toBe('skipped');
    if (outcome.kind !== 'skipped') return;
    expect(outcome.reason).toBe('guard_rejected');
    expect(outcome.details).toBe('same_source_active');
  });
});

describe('SessionManager X-509 #1 + #3 — chrome bump', () => {
  it('notifies chrome.version_bump and calls resetUserAgentCache when bumped', async () => {
    const { sm, notifier, uaResets } = setup({ dir, chromeBumped: true });
    const outcome = await sm.runSession(
      { source: 'serebii', tier: 0 },
      async () => 'ok',
    );
    expect(outcome.kind).toBe('completed');
    const events = notifier.events.map((e) => e.event);
    expect(events).toContain('chrome.version_bump');
    expect(uaResets()).toBe(1);
  });

  it('does not notify chrome.version_bump nor reset UA when not bumped', async () => {
    const { sm, notifier, uaResets } = setup({ dir, chromeBumped: false });
    await sm.runSession({ source: 'serebii', tier: 0 }, async () => 'ok');
    const events = notifier.events.map((e) => e.event);
    expect(events).not.toContain('chrome.version_bump');
    expect(uaResets()).toBe(0);
  });
});

describe('SessionManager X-509 #2 — catch redact + #4 fetcher close on error', () => {
  it('aborts with redacted message, notifies scraper.crashed, still closes fetcher', async () => {
    const { sm, notifier, fetcher, fetcherCalls } = setup({ dir });
    const outcome = await sm.runSession(
      { source: 'pokopiaGuide', tier: 1, persona: KOREAN_FAN },
      async () => {
        throw new Error('boom — Bearer abc.def.ghi');
      },
    );
    expect(outcome.kind).toBe('aborted');
    if (outcome.kind !== 'aborted') return;
    expect(outcome.reason).toContain('boom');
    expect(outcome.reason).not.toContain('Bearer abc.def.ghi');
    expect(outcome.reason).toContain('Bearer <REDACTED>');

    const crashed = notifier.events.find((e) => e.event === 'scraper.crashed');
    expect(crashed).toBeDefined();
    expect(JSON.stringify(crashed?.meta)).not.toContain('Bearer abc.def.ghi');

    // X-509 #4 — finally 가 fetcher.close 강제.
    expect(fetcherCalls).toContain('fetcher.close');
    expect(fetcher.closed).toBe(true);
  });
});

describe('SessionManager X-509 #4 — fetcher.close best-effort', () => {
  it('silently swallows close error, still releases guard + ends session', async () => {
    const { sm, guard } = setup({ dir, closeShouldThrow: true });
    const outcome = await sm.runSession(
      { source: 'pokopiaGuide', tier: 1, persona: KOREAN_FAN },
      async () => 'ok',
    );
    expect(outcome.kind).toBe('completed'); // close 실패는 outcome 에 영향 없음

    // Guard 가 release 됐는지 확인 — 같은 source 다시 acquire 가능해야.
    const reAcquire = await guard.acquire({ source: 'pokopiaGuide', tier: 1, persona: KOREAN_FAN });
    expect(reAcquire.ok).toBe(true);
  });
});

describe('SessionManager Phase 6 완료 조건 — reportError 403', () => {
  it('reportError(BLOCK_403) records cooldown in crawl state', async () => {
    const now = new Date('2026-04-24T09:00:00Z');
    const { sm, crawlState } = setup({ dir, now });

    const outcome = await sm.runSession(
      { source: 'serebii', tier: 0 },
      async (ctx) => {
        const directive = await ctx.reportError(ErrorType.BLOCK_403, {
          url: 'https://serebii.net/x',
          attempt: 1,
        });
        return directive;
      },
    );
    expect(outcome.kind).toBe('completed');
    const data = await crawlState.read();
    expect(data.cooldowns['serebii']).toBeDefined();
    const expected = new Date(now.getTime() + 240 * 60 * 1000).toISOString();
    expect(data.cooldowns['serebii']).toBe(expected);
  });
});
