/**
 * SoftThrottleDetector (Task 6.5) — CRAWLING_STRATEGY §12.2.
 *
 * 검증 대상:
 *   - 응답 시간 10건 미만 → 항상 false
 *   - 최근 5건 평균이 그 이전 5건 평균의 2배 초과 → true
 *   - 최근 5건 평균이 2배 이하 → false
 *   - 20건 초과 시 가장 오래된 것부터 drop (sliding window)
 */

import { describe, expect, it } from 'vitest';

import { SoftThrottleDetector } from './soft-throttle.js';

function recordMany(detector: SoftThrottleDetector, samples: number[]): void {
  for (const s of samples) detector.record(s);
}

describe('SoftThrottleDetector', () => {
  it('returns false until 10 samples accumulated', () => {
    const detector = new SoftThrottleDetector();
    for (let i = 0; i < 9; i++) {
      detector.record(100);
      expect(detector.isThrottling()).toBe(false);
    }
  });

  it('returns true when recent5 avg > 2× previous5 avg', () => {
    const detector = new SoftThrottleDetector();
    // first 5: 100ms each (avg 100), last 5: 300ms each (avg 300, 3× → true)
    recordMany(detector, [100, 100, 100, 100, 100, 300, 300, 300, 300, 300]);
    expect(detector.isThrottling()).toBe(true);
  });

  it('returns false when recent5 avg ≤ 2× previous5 avg', () => {
    const detector = new SoftThrottleDetector();
    recordMany(detector, [100, 100, 100, 100, 100, 150, 150, 150, 150, 150]);
    expect(detector.isThrottling()).toBe(false);
  });

  it('keeps the most recent 20 samples (sliding window)', () => {
    const detector = new SoftThrottleDetector();
    // 초반 20 건 100ms → 이후 5 건 1000ms 추가
    for (let i = 0; i < 20; i++) detector.record(100);
    recordMany(detector, [1000, 1000, 1000, 1000, 1000]);
    // 마지막 5 (1000) vs 그 직전 5 (100) → 10× → true
    expect(detector.isThrottling()).toBe(true);
  });
});
