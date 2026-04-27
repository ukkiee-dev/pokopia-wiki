/**
 * HumanBehavior (Task 6.3) — CRAWLING_STRATEGY §7.2, §8.1~§8.3.
 *
 * 검증 대상:
 *   - gaussianRandom: Box-Muller 변환의 deterministic 결과 (random 주입)
 *   - humanDwell: sleep 호출 인자 = minMs + random*(maxMs-minMs)
 *   - humanClick: boundingBox 있는 경우 cursor.move + click 호출, 좌표는 box 내부로 clamp
 *   - humanClick: boundingBox null → cursor 호출 자체 skip
 *   - humanScroll: page.evaluate 가 style 인자로 호출
 */

import { describe, expect, it } from 'vitest';

import {
  type BehaviorLocator,
  type CursorLike,
  HumanBehavior,
  type ScrollStyle,
} from './ghost-cursor.js';
import type { DriverPage } from '../browser/driver-page.js';

const fakePage = (overrides: Partial<DriverPage> = {}): DriverPage =>
  ({
    evaluate: async () => undefined,
    locator: () => ({}),
    goto: async () => undefined,
    goBack: async () => undefined,
    url: () => 'https://example.com',
    waitForLoadState: async () => undefined,
    content: async () => '',
    waitForFunction: async () => undefined,
    ...overrides,
  }) as DriverPage;

describe('HumanBehavior.gaussianRandom', () => {
  it('produces Box-Muller deterministic output for fixed random', () => {
    // u1=u2=0.5 → z = sqrt(-2*log(0.5)) * cos(pi) = sqrt(2*ln 2) * -1 ≈ -1.1774
    const r = HumanBehavior.gaussianRandom(10, 2, () => 0.5);
    const expected = 10 + Math.sqrt(-2 * Math.log(0.5)) * Math.cos(2 * Math.PI * 0.5) * 2;
    expect(r).toBeCloseTo(expected, 6);
  });

  it('returns mean when stddev is 0', () => {
    expect(HumanBehavior.gaussianRandom(7, 0, () => 0.3)).toBeCloseTo(7, 6);
  });
});

describe('HumanBehavior.humanDwell', () => {
  it('sleeps for min + random*(max-min)', async () => {
    const sleeps: number[] = [];
    const behavior = new HumanBehavior({
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0.5,
    });
    await behavior.humanDwell(1000, 3000);
    expect(sleeps).toEqual([2000]);
  });
});

type SpyCursor = CursorLike & {
  moves: { x: number; y: number }[];
  clicks: { x: number; y: number }[];
};

function spyCursor(): SpyCursor {
  const moves: { x: number; y: number }[] = [];
  const clicks: { x: number; y: number }[] = [];
  return {
    moves,
    clicks,
    actions: {
      move: async (target) => {
        moves.push(target);
      },
      click: async (opts) => {
        if (opts?.target) clicks.push(opts.target);
      },
    },
  };
}

describe('HumanBehavior.humanClick', () => {

  it('moves and clicks at a gaussian point inside the bounding box', async () => {
    const cursor = spyCursor();
    const behavior = new HumanBehavior({
      cursorFactory: async () => cursor,
      sleep: async () => undefined,
      random: () => 0.5,
    });
    const locator: BehaviorLocator = {
      boundingBox: async () => ({ x: 100, y: 200, width: 50, height: 30 }),
    };
    await behavior.humanClick(fakePage(), locator);

    expect(cursor.moves).toHaveLength(1);
    expect(cursor.clicks).toHaveLength(1);
    const m = cursor.moves[0]!;
    // x = 100 + clamp(...) inside [100+5, 100+45] = [105, 145]
    expect(m.x).toBeGreaterThanOrEqual(105);
    expect(m.x).toBeLessThanOrEqual(145);
    expect(m.y).toBeGreaterThanOrEqual(205);
    expect(m.y).toBeLessThanOrEqual(225);
  });

  it('does nothing when boundingBox is null', async () => {
    const cursor = spyCursor();
    const behavior = new HumanBehavior({
      cursorFactory: async () => cursor,
      sleep: async () => undefined,
    });
    const locator: BehaviorLocator = { boundingBox: async () => null };
    await behavior.humanClick(fakePage(), locator);
    expect(cursor.moves).toHaveLength(0);
    expect(cursor.clicks).toHaveLength(0);
  });

  it('calls scrollIntoViewIfNeeded when present', async () => {
    const cursor = spyCursor();
    let scrolled = false;
    const behavior = new HumanBehavior({
      cursorFactory: async () => cursor,
      sleep: async () => undefined,
      random: () => 0.5,
    });
    const locator: BehaviorLocator = {
      boundingBox: async () => ({ x: 0, y: 0, width: 20, height: 20 }),
      scrollIntoViewIfNeeded: async () => {
        scrolled = true;
      },
    };
    await behavior.humanClick(fakePage(), locator);
    expect(scrolled).toBe(true);
  });
});

describe('HumanBehavior.humanScroll', () => {
  it('passes the chosen style to page.evaluate', async () => {
    const calls: { style: ScrollStyle }[] = [];
    const page = fakePage({
      evaluate: async (_fn: unknown, arg: unknown) => {
        calls.push(arg as { style: ScrollStyle });
        return undefined;
      },
    } as Partial<DriverPage>);
    const behavior = new HumanBehavior({ sleep: async () => undefined });
    await behavior.humanScroll(page, 'read-through');
    expect(calls).toEqual([{ style: 'read-through' }]);
  });
});
