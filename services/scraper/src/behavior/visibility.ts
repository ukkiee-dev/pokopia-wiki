/**
 * Visibility 위조 — CRAWLING_STRATEGY §7.3.
 *
 * 사용자가 다른 탭으로 잠시 전환한 척 (visibilitychange + blur/focus 이벤트 발행)
 * 함으로써 자연스러운 idle 패턴을 만든다. 호출자는 네비게이션 사이에 10% 확률로
 * 이 함수를 부르면 됨.
 *
 * ## §7.3 B2 주석 반영
 *
 *   - `value: ...` 대신 `get: ...` getter 형태로 정의. 일부 탐지기가 getter 존재
 *     여부로 위조를 가린다.
 *   - `document.hidden` / `document.hasFocus()` 도 함께 덮어씀 (state 일관성).
 *   - getter 의 `.toString()` 결과가 `function get() { [native code] }` 가 아닌
 *     점이 남은 탐지 벡터 — 운영 중 이 벡터로 잡히면 `Function.prototype.toString`
 *     프록시 보강 필요. T0 는 브라우저 없음, T1 은 fingerprint-injector 가 다른
 *     getter 들도 native-like 로 처리, T2/T3 는 patchright 위임 → 우선순위 낮음.
 *
 * ## DI
 *
 *   - random / sleep 주입으로 deterministic 테스트 가능.
 *   - 페이지 의존성은 `VisibilityCapable` 구조적 타입으로 좁힘 (evaluate 만).
 */

const FAKE_PROBABILITY = 0.1;
const HIDDEN_MIN_MS = 5_000;
const HIDDEN_RANGE_MS = 30_000;

/**
 * 좁은 evaluate 시그니처 — 본 모듈의 init script 는 항상 `() => void` 형태라
 * generic 매개변수 없이 단일 시그니처로 충분. DriverPage.EvaluateCapable 의 generic
 * 시그니처와 의도적으로 분리해 mock 작성 비용을 낮춘다.
 */
export type VisibilityCapable = {
  evaluate(fn: () => void): Promise<unknown>;
};

export type MaybeFakeVisibilityOptions = {
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * 10% 확률로 visibility hidden → 잠시 sleep → visible 복원. 발동 여부를 boolean
 * 으로 반환해 호출자가 로깅·통계 처리 가능.
 */
export async function maybeFakeVisibility(
  page: VisibilityCapable,
  options: MaybeFakeVisibilityOptions = {},
): Promise<boolean> {
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  if (random() >= FAKE_PROBABILITY) return false;

  await page.evaluate(hiddenScript);
  await sleep(HIDDEN_MIN_MS + random() * HIDDEN_RANGE_MS);
  await page.evaluate(visibleScript);
  return true;
}

/**
 * 페이지 컨텍스트에서 실행 — visibility hidden 위조.
 *
 * 별도 const 분리 이유: page.evaluate 함수는 페이지 측 마샬링 대상이라 외부
 * 스코프 캡처가 허용되지 않는다. 함수 본문을 인라인하면 스코프 의존성이 새어
 * 들어가기 쉽다.
 */
const hiddenScript = (): void => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => true,
  });
  const anyDoc = document as unknown as { __origHasFocus?: () => boolean };
  if (anyDoc.__origHasFocus === undefined) {
    anyDoc.__origHasFocus = document.hasFocus.bind(document);
  }
  document.hasFocus = () => false;
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('blur'));
};

const visibleScript = (): void => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => false,
  });
  const anyDoc = document as unknown as { __origHasFocus?: () => boolean };
  document.hasFocus = anyDoc.__origHasFocus ?? (() => true);
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));
};
