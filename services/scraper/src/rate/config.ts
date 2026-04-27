/**
 * RateLimitConfig (CRAWLING_STRATEGY §14.3 원문 SSoT).
 *
 * 본 파일은 §14.3 표를 **그대로** 코드로 옮긴 것이다. 값을 수정하면 반드시
 * 문서 측도 함께 업데이트해야 한다 (doc-strategist 위임).
 *
 * 카운터 정의 (§14.1):
 *   - `navigation`: 사람이 페이지를 본 횟수 (page.goto + 링크 클릭).
 *   - `resource`: 페이지 로드에 편승하는 자동 요청 — **여기선 카운트하지 않음**
 *     (브라우저가 알아서), 모니터링 용도로만 기록할 수 있게 구조만 유지.
 *   - `direct` (directFetch): 스크래퍼가 직접 발생시키는 보조 요청 (T0 이미지).
 *
 * v3.1 개정 포인트:
 *   - 카운트 단위를 "request" → navigation/resource/direct 로 분리.
 *   - 일별 누적은 카운터 단위 영속 (§14.3 "하루 누적 카운트 영속화").
 */

import type { SourceSite } from '@pokopia-wiki/shared';

/**
 * 개별 카운터의 버짓. §14.3 `RateBudget` 원문.
 *
 * - `maxPerSession`: 한 세션 내 허용 누적.
 * - `maxPerDay`: UTC+9 자정 리셋 기준 일일 한도.
 * - `meanDelayMs` / `stddevDelayMs`: 가우시안 샘플로 요청 간 간격 생성 (§7.2).
 */
export type RateBudget = {
  maxPerSession: number;
  maxPerDay: number;
  meanDelayMs: number;
  stddevDelayMs: number;
};

/**
 * 소스별 Rate 설정 — §14.3 원문 그대로.
 *
 * - `directFetch`: 주로 T0 Serebii 이미지용. T1~T3 는 페이지 로드에 편승하므로 생략.
 * - `sessionDurationMs`, `interSessionMs`: Phase 5 SessionManager 가 참조.
 * - `maxRetries`, `retryBaseDelayMs`: 실패 시 재시도 정책.
 * - `stateDir`: 일별 카운터 영속 디렉토리 (저장 파일: navigation.json / direct.json).
 */
export type RateLimitConfig = {
  navigation: RateBudget;
  directFetch?: RateBudget;
  sessionDurationMs: { min: number; max: number };
  interSessionMs: { min: number; max: number };
  maxRetries: number;
  retryBaseDelayMs: number;
  stateDir: string;
};

/**
 * 4 개 소스 전체 RateLimitConfig.
 *
 * §14.3 표 값 1:1 이식. 수치 수정은 반드시 문서와 동시 변경.
 */
export const RATE_LIMITS: Record<SourceSite, RateLimitConfig> = {
  serebii: {
    navigation: {
      maxPerSession: 100,
      maxPerDay: 300,
      meanDelayMs: 4_000,
      stddevDelayMs: 1_500,
    },
    directFetch: {
      maxPerSession: 500,
      maxPerDay: 1_500,
      meanDelayMs: 1_000,
      stddevDelayMs: 400,
    },
    sessionDurationMs: { min: 5 * 60 * 1000, max: 30 * 60 * 1000 },
    interSessionMs: { min: 30 * 60 * 1000, max: 2 * 60 * 60 * 1000 },
    maxRetries: 2,
    retryBaseDelayMs: 10 * 60 * 1000,
    stateDir: 'data/state/rate/serebii/',
  },
  pokopiaGuide: {
    navigation: {
      maxPerSession: 40,
      maxPerDay: 120,
      meanDelayMs: 25_000,
      stddevDelayMs: 10_000,
    },
    sessionDurationMs: { min: 20 * 60 * 1000, max: 60 * 60 * 1000 },
    interSessionMs: { min: 60 * 60 * 1000, max: 4 * 60 * 60 * 1000 },
    maxRetries: 2,
    retryBaseDelayMs: 15 * 60 * 1000,
    stateDir: 'data/state/rate/pokopiaGuide/',
  },
  pokopoko: {
    navigation: {
      maxPerSession: 20,
      maxPerDay: 40,
      meanDelayMs: 50_000,
      stddevDelayMs: 20_000,
    },
    sessionDurationMs: { min: 20 * 60 * 1000, max: 45 * 60 * 1000 },
    interSessionMs: { min: 2 * 60 * 60 * 1000, max: 6 * 60 * 60 * 1000 },
    maxRetries: 1,
    retryBaseDelayMs: 30 * 60 * 1000,
    stateDir: 'data/state/rate/pokopoko/',
  },
  namuwiki: {
    navigation: {
      maxPerSession: 7,
      maxPerDay: 15,
      meanDelayMs: 100_000,
      stddevDelayMs: 40_000,
    },
    sessionDurationMs: { min: 20 * 60 * 1000, max: 30 * 60 * 1000 },
    interSessionMs: { min: 4 * 60 * 60 * 1000, max: 8 * 60 * 60 * 1000 },
    maxRetries: 1,
    retryBaseDelayMs: 60 * 60 * 1000,
    stateDir: 'data/state/rate/namuwiki/',
  },
};

/** RateLimiter.acquire 에 넘기는 카운터 종류. */
export type RateCounterKind = 'navigation' | 'resource' | 'direct';
