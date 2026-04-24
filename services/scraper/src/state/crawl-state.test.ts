/**
 * CrawlState (Task 6.7) — CRAWLING_STRATEGY §20.1 / §20.2.
 *
 * 책임:
 *   - data/state/crawl.json 영속 (`shared/atomicWriteJson` 으로 atomic write).
 *   - 완료 페이지 멱등 스킵 (Phase 6 재개 시 중복 요청 차단).
 *   - 소스별 cooldown 준수 (`isCoolingDown` 으로 현재 시각 비교).
 *   - 페르소나 healthScore 기록 (DetectionMonitor 가 update).
 *   - 실패 페이지 누적 (재시도 카운트 + cooldownUntil).
 *
 * DI: `statePath` / `nowISO` 주입으로 fs / 시간 격리.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CrawlState, type CrawlStateData } from './crawl-state.js';

type Fixture = { dir: string; now?: Date };

function createState(f: Fixture): CrawlState {
  return new CrawlState({
    statePath: path.join(f.dir, 'crawl.json'),
    nowISO: () => (f.now ?? new Date()).toISOString(),
  });
}

describe('CrawlState.read', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-crawl-state-read-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty defaults when file does not exist', async () => {
    const state = createState({ dir });
    const data = await state.read();
    expect(data).toEqual<CrawlStateData>({
      phase: null,
      persona: null,
      session: null,
      completedPages: [],
      failedPages: [],
      cooldowns: {},
      healthScores: {},
    });
  });

  it('returns parsed contents when file exists', async () => {
    writeFileSync(
      path.join(dir, 'crawl.json'),
      JSON.stringify({
        phase: 6,
        persona: 'korean-pokemon-fan',
        session: null,
        completedPages: ['https://serebii.net/a'],
        failedPages: [],
        cooldowns: {},
        healthScores: { 'korean-pokemon-fan': 88 },
      }),
      'utf8',
    );
    const state = createState({ dir });
    const data = await state.read();
    expect(data.phase).toBe(6);
    expect(data.completedPages).toEqual(['https://serebii.net/a']);
    expect(data.healthScores['korean-pokemon-fan']).toBe(88);
  });

  it('falls back to defaults if JSON is corrupted', async () => {
    writeFileSync(path.join(dir, 'crawl.json'), '{not-json', 'utf8');
    const state = createState({ dir });
    const data = await state.read();
    expect(data.completedPages).toEqual([]);
  });
});

describe('CrawlState.markCompleted / isCompleted', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-crawl-state-completed-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('records and reads back a completed url', async () => {
    const state = createState({ dir });
    await state.markCompleted('https://serebii.net/a');
    expect(await state.isCompleted('https://serebii.net/a')).toBe(true);
    expect(await state.isCompleted('https://serebii.net/b')).toBe(false);
  });

  it('is idempotent (no duplicates on repeated call)', async () => {
    const state = createState({ dir });
    await state.markCompleted('https://serebii.net/a');
    await state.markCompleted('https://serebii.net/a');
    const data = await state.read();
    expect(data.completedPages).toHaveLength(1);
  });
});

describe('CrawlState cooldowns', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-crawl-state-cooldown-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('setCooldown stores ISO timestamp; isCoolingDown true while now < until', async () => {
    const now = new Date('2026-04-24T09:00:00Z');
    const state = createState({ dir, now });
    const until = new Date('2026-04-24T13:00:00Z'); // +4h
    await state.setCooldown('serebii', until);

    expect(await state.isCoolingDown('serebii')).toBe(true);
    const data = await state.read();
    expect(data.cooldowns['serebii']).toBe(until.toISOString());
  });

  it('isCoolingDown false once now >= until', async () => {
    const start = new Date('2026-04-24T09:00:00Z');
    const setter = createState({ dir, now: start });
    await setter.setCooldown('serebii', new Date('2026-04-24T10:00:00Z'));

    const checker = createState({ dir, now: new Date('2026-04-24T10:00:01Z') });
    expect(await checker.isCoolingDown('serebii')).toBe(false);
  });

  it('isCoolingDown false for source without recorded cooldown', async () => {
    const state = createState({ dir });
    expect(await state.isCoolingDown('namuwiki')).toBe(false);
  });
});

describe('CrawlState.recordFailure', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-crawl-state-fail-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('records first failure with retries=1', async () => {
    const state = createState({ dir });
    await state.recordFailure('https://serebii.net/x', '403');
    const data = await state.read();
    expect(data.failedPages).toHaveLength(1);
    expect(data.failedPages[0]).toMatchObject({
      url: 'https://serebii.net/x',
      error: '403',
      retries: 1,
    });
  });

  it('bumps retries on subsequent failure for the same url', async () => {
    const state = createState({ dir });
    await state.recordFailure('https://serebii.net/x', '403');
    await state.recordFailure('https://serebii.net/x', '403');
    const data = await state.read();
    expect(data.failedPages).toHaveLength(1);
    expect(data.failedPages[0]?.retries).toBe(2);
  });

  it('persists cooldownUntil when supplied', async () => {
    const state = createState({ dir });
    const until = new Date('2026-04-24T15:00:00Z');
    await state.recordFailure('https://serebii.net/x', '429', { cooldownUntil: until });
    const data = await state.read();
    expect(data.failedPages[0]?.cooldownUntil).toBe(until.toISOString());
  });
});

describe('CrawlState.setHealthScore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-crawl-state-health-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('records and overwrites per-persona health', async () => {
    const state = createState({ dir });
    await state.setHealthScore('korean-pokemon-fan', 95);
    await state.setHealthScore('korean-pokemon-fan', 80);
    const data = await state.read();
    expect(data.healthScores['korean-pokemon-fan']).toBe(80);
  });
});

describe('CrawlState session lifecycle', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-crawl-state-session-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('startSession sets phase/persona/session, endSession clears session', async () => {
    const start = new Date('2026-04-24T09:00:00Z');
    const state = createState({ dir, now: start });
    await state.startSession({ phase: 6, persona: 'korean-pokemon-fan', plannedDurationMs: 30 * 60 * 1000 });

    const opened = await state.read();
    expect(opened.phase).toBe(6);
    expect(opened.persona).toBe('korean-pokemon-fan');
    expect(opened.session).toMatchObject({ requestCount: 0, plannedDuration: 30 * 60 * 1000 });
    expect(opened.session?.startedAt).toBe(start.toISOString());

    await state.endSession();
    const closed = await state.read();
    expect(closed.session).toBeNull();
    // phase/persona 는 다음 세션에서 재사용되므로 보존.
    expect(closed.phase).toBe(6);
  });

  it('incrementRequestCount increments inside an open session', async () => {
    const state = createState({ dir });
    await state.startSession({ phase: 6, persona: 'korean-pokemon-fan', plannedDurationMs: 1000 });
    await state.incrementRequestCount();
    await state.incrementRequestCount();
    const data = await state.read();
    expect(data.session?.requestCount).toBe(2);
  });

  it('incrementRequestCount is no-op when no session is open', async () => {
    const state = createState({ dir });
    await state.incrementRequestCount();
    const data = await state.read();
    expect(data.session).toBeNull();
  });
});
