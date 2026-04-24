/**
 * ConcurrencyGuard 프로세스 싱글톤 (X-509 #6 — Phase 5 ARCH-502).
 *
 * 여러 SessionManager 인스턴스가 각자 ConcurrencyGuard 를 만들면 같은 state 파일
 * 에 lock 경합이 발생해 의도치 않은 순서로 acquire/release 가 일어난다. 프로세스
 * 안에서는 단 하나의 Guard 만 존재하도록 강제한다.
 *
 * ## 사용 패턴
 *
 *   - **entry point** (예: `src/index.ts` / scripts) 에서 `initGuard(options)` 1 회 호출.
 *   - 그 이후 모든 모듈은 `getGuard()` 로 같은 인스턴스 획득.
 *   - 테스트는 `__resetGuardForTest()` 로 격리.
 *
 * ## 왜 별도 모듈인가
 *
 *   `concurrency-guard.ts` 자체가 module-level state 를 가지면 테스트 격리가
 *   어려워진다. 싱글톤은 별도 모듈에 두고, 명시적 init/reset API 로 라이프사이클
 *   투명성을 확보.
 */

import { ConcurrencyGuard, type ConcurrencyGuardOptions } from './concurrency-guard.js';

let instance: ConcurrencyGuard | null = null;

/**
 * 프로세스 ConcurrencyGuard 1 회 초기화.
 *
 * 두 번째 호출 시 throw — 의도치 않은 재초기화 (예: 두 entry script 가 같이 import)
 * 를 명시적 오류로 노출.
 */
export function initGuard(options?: ConcurrencyGuardOptions): ConcurrencyGuard {
  if (instance !== null) {
    throw new Error('ConcurrencyGuard already initialized — call __resetGuardForTest() first if testing');
  }
  instance = new ConcurrencyGuard(options);
  return instance;
}

/**
 * 초기화된 인스턴스 반환. 미초기화 시 throw — entry 가 init 을 잊은 사고를
 * 일찍 드러낸다.
 */
export function getGuard(): ConcurrencyGuard {
  if (instance === null) {
    throw new Error('ConcurrencyGuard not initialized — call initGuard() in your entry point');
  }
  return instance;
}

/** 싱글톤 존재 여부 — SessionManager 가 fallback 로직 분기에 사용. */
export function hasGuard(): boolean {
  return instance !== null;
}

/**
 * 테스트 격리 — beforeEach 에서 호출. underscore prefix 로 prod 코드에서 호출
 * 하면 안 된다는 신호.
 */
export function __resetGuardForTest(): void {
  instance = null;
}
