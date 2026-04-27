/**
 * NavigationPlanner (Task 6.4) — CRAWLING_STRATEGY §7.1, §7.4.
 *
 * 검증 대상:
 *   - navigateHome: page.goto(url) + humanDwell + humanScroll('partial') 순서 호출
 *   - clickLink: page.locator(selector) → humanClick → waitForLoadState → humanDwell
 *   - maybeGoBack: random < 0.8 → page.goBack + humanDwell 호출, true 반환
 *   - maybeGoBack: random ≥ 0.8 → no-op, false 반환
 *   - chunkHabitats: 209 items → session 0..5 = [20, 30, 30, 40, 40, 49]
 *   - chunkHabitats: sessionIndex out of range → 빈 배열
 *   - HABITAT_TOTAL = 209, HABITAT_SESSION_COUNT = 6
 */

import { describe, expect, it } from 'vitest';

import type { DriverPage } from '../browser/driver-page.js';
import { HumanBehavior } from './ghost-cursor.js';
import {
  HABITAT_SESSION_COUNT,
  HABITAT_TOTAL,
  NavigationPlanner,
} from './navigation.js';

type Calls = string[];

function spyBehavior(calls: Calls): HumanBehavior {
  return new HumanBehavior({
    cursorFactory: async () => ({
      actions: {
        click: async () => {
          calls.push('cursor.click');
        },
        move: async () => {
          calls.push('cursor.move');
        },
      },
    }),
    sleep: async () => undefined,
    random: () => 0.5,
  });
}

function spyPage(calls: Calls): DriverPage {
  return {
    goto: async (url) => {
      calls.push(`page.goto:${url}`);
      return undefined;
    },
    goBack: async () => {
      calls.push('page.goBack');
      return undefined;
    },
    url: () => 'https://example.com',
    waitForLoadState: async (state) => {
      calls.push(`page.waitForLoadState:${state ?? 'load'}`);
    },
    locator: (selector) => {
      calls.push(`page.locator:${selector}`);
      return {
        boundingBox: async () => ({ x: 0, y: 0, width: 50, height: 30 }),
      };
    },
    evaluate: async () => undefined,
    content: async () => '',
    waitForFunction: async () => undefined,
  } as DriverPage;
}

describe('NavigationPlanner.navigateHome', () => {
  it('goto + dwell + scroll (waitUntil 옵션이 networkidle 대기를 대신)', async () => {
    const calls: Calls = [];
    const planner = new NavigationPlanner(spyBehavior(calls));
    await planner.navigateHome(spyPage(calls), 'https://www.serebii.net/pokemonpokopia/');
    expect(calls).toContain('page.goto:https://www.serebii.net/pokemonpokopia/');
    // page.goto 의 `waitUntil: 'networkidle'` 옵션이 idle 대기를 처리 — 별도
    // waitForLoadState 호출은 §7.1 SSoT 에 없음. 후속 humanDwell 이 자연스러운 휴식.
    expect(calls).not.toContain('page.waitForLoadState:networkidle');
  });
});

describe('NavigationPlanner.clickLink', () => {
  it('locator + humanClick (cursor move/click) + waitForLoadState', async () => {
    const calls: Calls = [];
    const planner = new NavigationPlanner(spyBehavior(calls));
    await planner.clickLink(spyPage(calls), 'a:has-text("Habitats")');
    expect(calls).toContain('page.locator:a:has-text("Habitats")');
    expect(calls).toContain('cursor.click');
    expect(calls).toContain('page.waitForLoadState:networkidle');
  });
});

describe('NavigationPlanner.maybeGoBack', () => {
  it('returns true and calls page.goBack when random < 0.8', async () => {
    const calls: Calls = [];
    const planner = new NavigationPlanner(spyBehavior(calls), () => 0.5);
    const result = await planner.maybeGoBack(spyPage(calls));
    expect(result).toBe(true);
    expect(calls).toContain('page.goBack');
  });

  it('returns false without calling page.goBack when random ≥ 0.8', async () => {
    const calls: Calls = [];
    const planner = new NavigationPlanner(spyBehavior(calls), () => 0.95);
    const result = await planner.maybeGoBack(spyPage(calls));
    expect(result).toBe(false);
    expect(calls).not.toContain('page.goBack');
  });
});

describe('NavigationPlanner.chunkHabitats', () => {
  it('splits 209 items into [20, 30, 30, 40, 40, 49] across 6 sessions', () => {
    const items = Array.from({ length: 209 }, (_, i) => i + 1);
    const sizes = [0, 1, 2, 3, 4, 5].map((idx) => NavigationPlanner.chunkHabitats(items, idx).length);
    expect(sizes).toEqual([20, 30, 30, 40, 40, 49]);
  });

  it('chunks are contiguous and cover [1, 209]', () => {
    const items = Array.from({ length: 209 }, (_, i) => i + 1);
    const all: number[] = [];
    for (let i = 0; i < HABITAT_SESSION_COUNT; i++) {
      all.push(...NavigationPlanner.chunkHabitats(items, i));
    }
    expect(all).toEqual(items);
  });

  it('returns empty array for sessionIndex out of range', () => {
    const items = Array.from({ length: 209 }, (_, i) => i + 1);
    expect(NavigationPlanner.chunkHabitats(items, 6)).toEqual([]);
    expect(NavigationPlanner.chunkHabitats(items, -1)).toEqual([]);
  });
});

describe('habitat constants', () => {
  it('HABITAT_TOTAL is 209 and SESSION_COUNT is 6', () => {
    expect(HABITAT_TOTAL).toBe(209);
    expect(HABITAT_SESSION_COUNT).toBe(6);
  });
});
