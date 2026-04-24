/**
 * ConcurrencyGuard TDD (Task 5.6) — CRAWLING_STRATEGY §6.4.3 A4.
 *
 * 커버리지:
 *   - Rule 1 (same_source_active) — 같은 소스 2번 acquire
 *   - Rule 2 (same_persona_active) — 같은 페르소나, 다른 소스
 *   - Rule 3 (persona_conflict) — 서로 다른 페르소나 동시 요청 (스케줄러 버그)
 *   - Rule 4 (t0_t1_stagger) — T0 활성 중 T1 요청 5분 이내 / 5분 경과
 *   - reconcileOnBoot — 죽은 pid reap + 살아있는 pid 보존 + 다른 호스트 보존
 *   - release — 세션 제거 후 listActive 비움
 *   - touchLastRequest — lastRequestAt 갱신 → 스태거 계산 기준 변경
 *
 * DI: statePath / hostname / isAlivePid / currentPid / nowISO 주입으로 격리.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BrowserPersona } from '../persona/types.js';
import { ConcurrencyGuard, type ActiveSession } from './concurrency-guard.js';

type GuardFixture = {
  dir: string;
  livePids?: ReadonlySet<number>;
  currentPid?: number;
  now?: Date;
};

function createGuard(f: GuardFixture): ConcurrencyGuard {
  const livePids = f.livePids ?? new Set([f.currentPid ?? 12345]);
  return new ConcurrencyGuard({
    statePath: path.join(f.dir, 'active-sessions.json'),
    hostname: () => 'test-host',
    isAlivePid: (pid) => livePids.has(pid),
    currentPid: () => f.currentPid ?? 12345,
    nowISO: () => (f.now ?? new Date()).toISOString(),
  });
}

const KOREAN_FAN: BrowserPersona = {
  id: 'korean-pokemon-fan',
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
  storageStatePath: 'data/browser-profiles/korean-pokemon-fan/storageState.json',
  usedFor: ['pokopiaGuide', 'pokopoko'],
};

const NAMU_RESEARCHER: BrowserPersona = {
  id: 'namuwiki-researcher',
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
  storageStatePath: 'data/browser-profiles/namuwiki-researcher/storageState.json',
  usedFor: ['namuwiki'],
};

describe('ConcurrencyGuard.acquire Rule 1 (same_source_active)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-guard-r1-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects the second acquire of the same source', async () => {
    const guard = createGuard({ dir });
    const first = await guard.acquire({ source: 'serebii', tier: 0 });
    expect(first.ok).toBe(true);

    const second = await guard.acquire({ source: 'serebii', tier: 0 });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('same_source_active');
  });

  it('allows acquire after release of the same source', async () => {
    const guard = createGuard({ dir });
    await guard.acquire({ source: 'serebii', tier: 0 });
    await guard.release('serebii');

    const third = await guard.acquire({ source: 'serebii', tier: 0 });
    expect(third.ok).toBe(true);
  });
});

describe('ConcurrencyGuard.acquire Rule 2 (same_persona_active)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-guard-r2-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects the same persona requesting a second source', async () => {
    const guard = createGuard({ dir });
    const first = await guard.acquire({ source: 'pokopiaGuide', tier: 1, persona: KOREAN_FAN });
    expect(first.ok).toBe(true);

    const second = await guard.acquire({ source: 'pokopoko', tier: 2, persona: KOREAN_FAN });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('same_persona_active');
  });
});

describe('ConcurrencyGuard.acquire Rule 3 (persona_conflict)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-guard-r3-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects acquire when a different persona is already active', async () => {
    const guard = createGuard({ dir });
    const first = await guard.acquire({ source: 'pokopiaGuide', tier: 1, persona: KOREAN_FAN });
    expect(first.ok).toBe(true);

    const second = await guard.acquire({ source: 'namuwiki', tier: 3, persona: NAMU_RESEARCHER });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('persona_conflict');
  });
});

describe('ConcurrencyGuard.acquire Rule 4 (t0_t1_stagger)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-guard-r4-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects T1 acquire within 5 min of T0 lastRequest', async () => {
    const t0Time = new Date('2026-04-24T09:00:00Z');
    const guardT0 = createGuard({ dir, now: t0Time });
    const first = await guardT0.acquire({ source: 'serebii', tier: 0 });
    expect(first.ok).toBe(true);

    const t1Time = new Date('2026-04-24T09:02:00Z'); // +2 min
    const guardT1 = createGuard({ dir, now: t1Time });
    const second = await guardT1.acquire({
      source: 'pokopiaGuide',
      tier: 1,
      persona: KOREAN_FAN,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('t0_t1_stagger');
    expect(second.retryAfterMs).toBeGreaterThan(0);
    expect(second.retryAfterMs).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it('accepts T1 acquire after 5+ min of T0 lastRequest idle', async () => {
    const t0Time = new Date('2026-04-24T09:00:00Z');
    const guardT0 = createGuard({ dir, now: t0Time });
    await guardT0.acquire({ source: 'serebii', tier: 0 });

    const t1Time = new Date('2026-04-24T09:06:00Z'); // +6 min, past stagger window
    const guardT1 = createGuard({ dir, now: t1Time });
    const result = await guardT1.acquire({
      source: 'pokopiaGuide',
      tier: 1,
      persona: KOREAN_FAN,
    });
    expect(result.ok).toBe(true);
  });

  it('touchLastRequest extends stagger window', async () => {
    const t0Time = new Date('2026-04-24T09:00:00Z');
    const guardT0 = createGuard({ dir, now: t0Time });
    await guardT0.acquire({ source: 'serebii', tier: 0 });

    // 5min 지났지만 T0 가 touchLastRequest 로 "방금 요청" 을 기록
    const touchTime = new Date('2026-04-24T09:05:30Z');
    const guardTouch = createGuard({ dir, now: touchTime });
    await guardTouch.touchLastRequest('serebii');

    // T1 이 6분 지나 시도하지만 "방금 T0 요청" 이 있어서 다시 stagger
    const t1Time = new Date('2026-04-24T09:06:00Z');
    const guardT1 = createGuard({ dir, now: t1Time });
    const result = await guardT1.acquire({
      source: 'pokopiaGuide',
      tier: 1,
      persona: KOREAN_FAN,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('t0_t1_stagger');
  });
});

describe('ConcurrencyGuard.reconcileOnBoot', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-guard-reconcile-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function seedState(baseDir: string, sessions: ActiveSession[]): void {
    writeFileSync(path.join(baseDir, 'active-sessions.json'), JSON.stringify(sessions, null, 2), 'utf8');
  }

  const DEAD_PID = 999_999;
  const LIVE_PID = 42_042;

  it('reaps dead entries while preserving live ones on same host', async () => {
    seedState(dir, [
      {
        source: 'serebii',
        tier: 0,
        pid: DEAD_PID,
        hostname: 'test-host',
        startedAt: '2026-04-24T09:00:00Z',
        lastRequestAt: '2026-04-24T09:00:00Z',
      },
      {
        source: 'pokopiaGuide',
        tier: 1,
        personaId: 'korean-pokemon-fan',
        pid: LIVE_PID,
        hostname: 'test-host',
        startedAt: '2026-04-24T09:30:00Z',
        lastRequestAt: '2026-04-24T09:30:00Z',
      },
    ]);

    const guard = createGuard({
      dir,
      livePids: new Set([LIVE_PID]),
      currentPid: LIVE_PID,
    });
    await guard.reconcileOnBoot();
    const active = await guard.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]?.source).toBe('pokopiaGuide');
  });

  it('preserves entries from other hosts regardless of local pid check', async () => {
    seedState(dir, [
      {
        source: 'namuwiki',
        tier: 3,
        personaId: 'namuwiki-researcher',
        pid: DEAD_PID,
        hostname: 'remote-host',
        startedAt: '2026-04-24T20:00:00Z',
        lastRequestAt: '2026-04-24T20:00:00Z',
      },
    ]);

    const guard = createGuard({
      dir,
      livePids: new Set(), // pid 없음 (죽음) — 하지만 remote-host 라 보존
      currentPid: LIVE_PID,
    });
    await guard.reconcileOnBoot();
    const active = await guard.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]?.hostname).toBe('remote-host');
  });
});

describe('ConcurrencyGuard.release / listActive', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-guard-rel-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('release removes the session from listActive', async () => {
    const guard = createGuard({ dir });
    const acquired = await guard.acquire({ source: 'serebii', tier: 0 });
    expect(acquired.ok).toBe(true);

    const before = await guard.listActive();
    expect(before).toHaveLength(1);

    await guard.release('serebii');
    const after = await guard.listActive();
    expect(after).toHaveLength(0);
  });

  it('release is idempotent — releasing a missing source is a no-op', async () => {
    const guard = createGuard({ dir });
    await expect(guard.release('serebii')).resolves.toBeUndefined();
    const active = await guard.listActive();
    expect(active).toHaveLength(0);
  });
});
