/**
 * SoftThrottleDetector — CRAWLING_STRATEGY §12.2.
 *
 * 응답 시간이 점진적으로 늘어나는 패턴(서버가 봇을 명시적으로 차단하지 않고
 * 점점 느리게 응답하는 전술) 을 sliding window 로 감지한다.
 *
 * ## 알고리즘
 *
 *   - 최근 20 건 응답 시간을 ring buffer 로 보유
 *   - 10 건 미만이면 판정 보류 (false)
 *   - 최근 5 건 평균 > 직전 5 건 평균 × 2 면 throttling (true)
 *
 * ## 왜 평균 비교인가
 *
 *   단일 outlier 는 네트워크 지터일 수 있어 무시. 5 건 윈도우는 짧은 추세 변화를
 *   1 분 안에 잡아내면서 false positive 를 억제하는 적당한 크기 (§12.2 SSoT).
 */

const WINDOW_SIZE = 20;
const COMPARE_HALF = 5;
const THROTTLE_RATIO = 2;

export class SoftThrottleDetector {
  private readonly times: number[] = [];

  /** 응답 시간 (ms) 한 건 기록. 윈도우 초과 시 가장 오래된 것 drop. */
  record(ms: number): void {
    this.times.push(ms);
    if (this.times.length > WINDOW_SIZE) {
      this.times.shift();
    }
  }

  /** 현재 윈도우가 throttling 패턴인지. 표본 부족 시 항상 false. */
  isThrottling(): boolean {
    if (this.times.length < COMPARE_HALF * 2) return false;
    const recent = this.times.slice(-COMPARE_HALF);
    const previous = this.times.slice(-COMPARE_HALF * 2, -COMPARE_HALF);
    const recentAvg = average(recent);
    const previousAvg = average(previous);
    if (previousAvg === 0) return false;
    return recentAvg > previousAvg * THROTTLE_RATIO;
  }

  /** 디버깅·모니터링용 — 현재 윈도우 평균. */
  windowAverageMs(): number | null {
    if (this.times.length === 0) return null;
    return average(this.times);
  }
}

function average(arr: readonly number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}
