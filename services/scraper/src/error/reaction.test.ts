/**
 * ErrorReactionSimulator (Task 6.6) — CRAWLING_STRATEGY §11.1 / §11.2.
 *
 * 검증 대상:
 *   - ErrorType → EventType 정확 매칭 (§11.1 A1: block.403/429, cloudflare.challenge_timeout
 *     등 SEVERITY_MAP 키와 완전 일치)
 *   - BLOCK_403/429 → notify + setCooldown(지수 증가) + abort-session directive
 *   - TIMEOUT → attempt 1: retry-after-ms / attempt ≥ 2: abort-session
 *   - CLOUDFLARE_CHALLENGE → wait-cf 60s (호출자 wait 실패 시 onTimeout='abort-session')
 *   - CAPTCHA → notify('captcha.detected') + wait-captcha 5min
 *   - SOFT_THROTTLE → notify + setCooldown(1~3h) + abort-session
 *   - reset() → in-memory attempt 카운터 초기화
 *
 * Mock: NotifierLike 의 호출 기록을 스파이로 검증.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EventType } from '../notifier/events.js';
import { CrawlState } from '../state/crawl-state.js';
import { ErrorReaction, ErrorType, type NotifierLike } from './reaction.js';

type SpyCall = readonly [EventType, Record<string, unknown>];

function spyNotifier(): NotifierLike & { calls: SpyCall[] } {
  const calls: SpyCall[] = [];
  return {
    calls,
    notify: async (event, meta = {}) => {
      calls.push([event, meta]);
    },
  };
}

type Fixture = {
  dir: string;
  now?: Date;
  random?: () => number;
};

function setup(f: Fixture): {
  reaction: ErrorReaction;
  notifier: ReturnType<typeof spyNotifier>;
  crawlState: CrawlState;
} {
  const notifier = spyNotifier();
  const crawlState = new CrawlState({
    statePath: path.join(f.dir, 'crawl.json'),
    nowISO: () => (f.now ?? new Date()).toISOString(),
  });
  const reaction = new ErrorReaction({
    notifier,
    crawlState,
    now: () => f.now ?? new Date(),
    random: f.random ?? (() => 0),
  });
  return { reaction, notifier, crawlState };
}

describe('ErrorReaction BLOCK_403 / 429', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-react-block-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('BLOCK_403 → notify(block.403) + setCooldown(240m base) + abort-session', async () => {
    const now = new Date('2026-04-24T09:00:00Z');
    const { reaction, notifier, crawlState } = setup({ dir, now });

    const directive = await reaction.react(ErrorType.BLOCK_403, {
      source: 'serebii',
      url: 'https://serebii.net/x',
      attempt: 1,
    });

    expect(directive).toEqual({ kind: 'abort-session', reason: 'BLOCK_403' });
    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]?.[0]).toBe('block.403');
    expect(notifier.calls[0]?.[1]).toMatchObject({ source: 'serebii', url: 'https://serebii.net/x' });

    const data = await crawlState.read();
    const expectedUntil = new Date(now.getTime() + 240 * 60 * 1000).toISOString();
    expect(data.cooldowns['serebii']).toBe(expectedUntil);
  });

  it('RATE_LIMIT_429 → notify(block.429) + abort-session', async () => {
    const { reaction, notifier } = setup({ dir });
    const directive = await reaction.react(ErrorType.RATE_LIMIT_429, {
      source: 'pokopiaGuide',
      url: 'https://x',
      attempt: 1,
    });
    expect(directive.kind).toBe('abort-session');
    expect(notifier.calls[0]?.[0]).toBe('block.429');
  });

  it('exponential cooldown growth on repeated BLOCK_403 (240m → 480m → 960m)', async () => {
    const now = new Date('2026-04-24T09:00:00Z');
    const { reaction, crawlState } = setup({ dir, now });

    await reaction.react(ErrorType.BLOCK_403, { source: 'serebii', url: 'a', attempt: 1 });
    const first = (await crawlState.read()).cooldowns['serebii']!;
    await reaction.react(ErrorType.BLOCK_403, { source: 'serebii', url: 'b', attempt: 1 });
    const second = (await crawlState.read()).cooldowns['serebii']!;
    await reaction.react(ErrorType.BLOCK_403, { source: 'serebii', url: 'c', attempt: 1 });
    const third = (await crawlState.read()).cooldowns['serebii']!;

    const firstDelta = Date.parse(first) - now.getTime();
    const secondDelta = Date.parse(second) - now.getTime();
    const thirdDelta = Date.parse(third) - now.getTime();

    expect(firstDelta).toBe(240 * 60 * 1000);
    expect(secondDelta).toBe(480 * 60 * 1000);
    expect(thirdDelta).toBe(960 * 60 * 1000);
  });

  it('reset() resets per-source attempt counter', async () => {
    const now = new Date('2026-04-24T09:00:00Z');
    const { reaction, crawlState } = setup({ dir, now });

    await reaction.react(ErrorType.BLOCK_403, { source: 'serebii', url: 'a', attempt: 1 });
    await reaction.react(ErrorType.BLOCK_403, { source: 'serebii', url: 'b', attempt: 1 });
    reaction.reset('serebii');

    await reaction.react(ErrorType.BLOCK_403, { source: 'serebii', url: 'c', attempt: 1 });
    const after = (await crawlState.read()).cooldowns['serebii']!;
    expect(Date.parse(after) - now.getTime()).toBe(240 * 60 * 1000);
  });
});

describe('ErrorReaction TIMEOUT', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-react-timeout-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('attempt=1 → retry-after-ms within 5~10s', async () => {
    const { reaction } = setup({ dir, random: () => 0 });
    const directive = await reaction.react(ErrorType.TIMEOUT, {
      source: 'pokopiaGuide',
      url: 'https://x',
      attempt: 1,
    });
    expect(directive.kind).toBe('retry-after-ms');
    if (directive.kind !== 'retry-after-ms') return;
    expect(directive.ms).toBeGreaterThanOrEqual(5000);
    expect(directive.ms).toBeLessThanOrEqual(10_000);
  });

  it('attempt=2 → abort-session', async () => {
    const { reaction } = setup({ dir });
    const directive = await reaction.react(ErrorType.TIMEOUT, {
      source: 'pokopiaGuide',
      url: 'https://x',
      attempt: 2,
    });
    expect(directive).toEqual({ kind: 'abort-session', reason: 'TIMEOUT' });
  });
});

describe('ErrorReaction CLOUDFLARE_CHALLENGE', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-react-cf-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('directive=wait-cf 60s with onTimeout=abort-session, no notify yet', async () => {
    const { reaction, notifier } = setup({ dir });
    const directive = await reaction.react(ErrorType.CLOUDFLARE_CHALLENGE, {
      source: 'namuwiki',
      url: 'https://namu.wiki/w/x',
      attempt: 1,
    });
    expect(directive).toEqual({ kind: 'wait-cf', timeoutMs: 60_000, onTimeout: 'abort-session' });
    // 알림은 호출자가 wait 결과(timeout 발생) 후 직접 보냄. 여기선 발행 X.
    expect(notifier.calls).toHaveLength(0);
  });
});

describe('ErrorReaction CAPTCHA', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-react-captcha-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('notifies captcha.detected and returns wait-captcha 5min', async () => {
    const { reaction, notifier } = setup({ dir });
    const directive = await reaction.react(ErrorType.CAPTCHA, {
      source: 'pokopoko',
      url: 'https://pokopoko.kr/x',
      attempt: 1,
    });
    expect(directive).toEqual({ kind: 'wait-captcha', timeoutMs: 300_000, onTimeout: 'abort-session' });
    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]?.[0]).toBe('captcha.detected');
  });
});

describe('ErrorReaction SOFT_THROTTLE', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-react-soft-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('notifies soft_throttle.detected + cooldown 60~180m + abort-session', async () => {
    const now = new Date('2026-04-24T09:00:00Z');
    const { reaction, notifier, crawlState } = setup({ dir, now, random: () => 0 });
    const directive = await reaction.react(ErrorType.SOFT_THROTTLE, {
      source: 'pokopiaGuide',
      url: 'https://x',
      attempt: 1,
    });
    expect(directive.kind).toBe('abort-session');
    if (directive.kind !== 'abort-session') return;
    expect(directive.reason).toBe('SOFT_THROTTLE');

    expect(notifier.calls[0]?.[0]).toBe('soft_throttle.detected');
    const data = await crawlState.read();
    const until = data.cooldowns['pokopiaGuide']!;
    const deltaMin = (Date.parse(until) - now.getTime()) / 60_000;
    expect(deltaMin).toBeGreaterThanOrEqual(60);
    expect(deltaMin).toBeLessThanOrEqual(180);
  });
});

describe('ErrorReaction UNKNOWN', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-react-unknown-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns abort-session without notify or cooldown', async () => {
    const { reaction, notifier, crawlState } = setup({ dir });
    const directive = await reaction.react(ErrorType.UNKNOWN, {
      source: 'serebii',
      url: 'https://x',
      attempt: 1,
    });
    expect(directive).toEqual({ kind: 'abort-session', reason: 'UNKNOWN' });
    expect(notifier.calls).toHaveLength(0);
    const data = await crawlState.read();
    expect(data.cooldowns['serebii']).toBeUndefined();
  });
});
