/**
 * `navigator.userAgentData` 보강 init script — Phase 5 STYLE-502 공용화.
 *
 * 이전: `playwright-fetcher.ts` / `patchright-fetcher.ts` / `patchright-cf-fetcher.ts`
 * 3 파일에 동일 본문이 복제돼 있었다 (Phase 4 TKTK #6). 각 파일의 `BrowserContext`
 * 타입이 playwright / patchright 로 나뉘어 import 가 달라서 한 모듈로 묶기 어려웠다.
 *
 * 해결: `InitScriptContext` 구조적 타입으로 드라이버 결합을 끊고 한 곳에서 주입.
 *
 * ## 왜 보강이 필요한가 (§9.2 B5)
 *
 *   - Playwright 가 자동 발행하는 `navigator.userAgentData` 는 brands /
 *     `fullVersionList` 에 build / patch 정보가 누락될 수 있다.
 *   - 실유저 Chrome 은 이 필드가 채워져 있으므로 누락은 봇 시그널.
 *   - 세션 시작 시 1회 init script 로 보강. 내부 함수는 페이지 컨텍스트에서 실행
 *     되므로 외부 스코프 캡처 불가 — `arg` 객체로 값 전달.
 *
 * ## 호출 시점
 *
 *   `BrowserContext` 생성 직후, 페이지를 열기 전에 1회 호출. 이후 열리는 모든
 *   페이지에 init script 가 자동 적용.
 */

import { detectChromeVersion } from './chrome-version.js';

/**
 * `addInitScript` 호출부에 필요한 최소 시그니처.
 *
 * playwright / patchright 의 공식 `BrowserContext.addInitScript<Arg>` 는 서로 다른
 * `Unboxed<Arg>` generic 변환을 거쳐 구조적으로 통합 불가능. 런타임 시점엔 두
 * 드라이버 모두 같은 형상으로 동작하므로 **내부 캐스트** 로 단일 구현 유지.
 */
type AddInitScriptCapable = {
  addInitScript(
    script: (arg: { major: number; full: string }) => void,
    arg: { major: number; full: string },
  ): Promise<void>;
};

/**
 * 페이지 컨텍스트에서 실행될 init script 본문 — 세션 시작 시 1회.
 *
 * Why 파일 상단 상수로 추출: addInitScript 에 넘길 함수가 Playwright 의 마샬링
 * 대상이 되어 **클로저 캡처가 허용되지 않는다**. 실행 컨텍스트는 페이지 렌더러
 * 프로세스이므로 외부 스코프 의존은 불가 — `arg` 객체(`major`, `full`) 로 값을
 * 명시적으로 넘긴다.
 *
 * oxlint `max-lines-per-function` 회피를 위해 const 로 추출.
 */
const userAgentDataInitScript = (v: { major: number; full: string }): void => {
  if (!('userAgentData' in navigator)) return;

  const native = Function.prototype.toString.call(isNaN);
  const makeNative = <F extends (...args: never[]) => unknown>(fn: F, name: string): F => {
    Object.defineProperty(fn, 'name', { value: name, configurable: true });
    const str = native.replace('isNaN', name);
    Object.defineProperty(fn, 'toString', {
      configurable: true,
      writable: true,
      value: () => str,
    });
    return fn;
  };

  const brands = [
    { brand: 'Chromium', version: String(v.major) },
    { brand: 'Google Chrome', version: String(v.major) },
    { brand: 'Not/A)Brand', version: '99' },
  ];
  const fullVersionList = brands.map((b) => ({ brand: b.brand, version: v.full }));
  const uaData = (navigator as unknown as { userAgentData?: Record<string, unknown> }).userAgentData;
  if (!uaData) return;

  Object.defineProperty(uaData, 'brands', {
    configurable: true,
    enumerable: true,
    get: makeNative(function brandsGetter() {
      return brands;
    }, 'get brands'),
  });

  const origGet = (uaData['getHighEntropyValues'] as (hints: string[]) => Promise<Record<string, unknown>>).bind(
    uaData,
  );
  const wrapped = async function getHighEntropyValues(hints: string[]): Promise<Record<string, unknown>> {
    const base = await origGet(hints);
    return { ...base, fullVersionList, uaFullVersion: v.full };
  };
  uaData['getHighEntropyValues'] = makeNative(wrapped, 'getHighEntropyValues');
};

/**
 * 주어진 `BrowserContext` 에 UA data 보강 init script 를 1회 주입.
 *
 * `detectChromeVersion()` 호출은 매 세션 시작 시 재평가 (§9.2 "버전 특성" 런타임
 * 재계산 원칙). 세션 내에서는 재검출하지 않으므로 실유저 행동 (브라우저 재시작
 * 없이 탐색) 과 일치.
 *
 * context 를 `unknown` 으로 받는 이유: playwright / patchright 의 `addInitScript<Arg>`
 * generic (Unboxed<Arg>) 를 구조적으로 통합할 수 없어, 내부 캐스트로 단일 구현
 * 을 유지한다. 호출부에서 평이하게 `injectUserAgentData(context)` 로 쓸 수 있다.
 */
export async function injectUserAgentData(context: unknown): Promise<void> {
  const version = await detectChromeVersion();
  await (context as AddInitScriptCapable).addInitScript(userAgentDataInitScript, {
    major: version.major,
    full: version.full,
  });
}
