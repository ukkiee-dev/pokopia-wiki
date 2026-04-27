/**
 * maybeFakeVisibility (Task 6.3) — CRAWLING_STRATEGY §7.3.
 *
 * 검증 대상:
 *   - random < 0.1 → page.evaluate 2회 (hide → show) + sleep 1회 호출, 반환 true
 *   - random ≥ 0.1 → no-op, 반환 false
 *   - sleep 인자가 5000~35000 ms 범위 (5s + random*30s)
 */

import { describe, expect, it } from 'vitest';

import { maybeFakeVisibility, type VisibilityCapable } from './visibility.js';

describe('maybeFakeVisibility', () => {
  it('returns false and skips evaluate when random ≥ 0.1', async () => {
    const evaluateCalls: number[] = [];
    const page: VisibilityCapable = {
      evaluate: async () => {
        evaluateCalls.push(1);
      },
    };
    const sleeps: number[] = [];
    const result = await maybeFakeVisibility(page, {
      random: () => 0.5,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(result).toBe(false);
    expect(evaluateCalls).toHaveLength(0);
    expect(sleeps).toHaveLength(0);
  });

  it('returns true and calls evaluate twice with sleep in between when random < 0.1', async () => {
    const evaluateCalls: number[] = [];
    const sleeps: number[] = [];
    const page: VisibilityCapable = {
      evaluate: async () => {
        evaluateCalls.push(1);
      },
    };
    // 첫 random call: 0.05 (< 0.1) → fire
    // 두 번째 random call: 0.5 (sleep duration)
    const seq = [0.05, 0.5];
    let idx = 0;
    const random = (): number => seq[idx++ % seq.length] ?? 0.5;

    const result = await maybeFakeVisibility(page, {
      random,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(result).toBe(true);
    expect(evaluateCalls).toHaveLength(2);
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBe(5000 + 0.5 * 30_000);
  });
});
