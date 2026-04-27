/**
 * DriverPage / DriverContext — playwright/patchright 구조적 통합 (X-509 #7).
 *
 * Phase 5 ARCH-503 + ARCH-508 해소. Phase 5 STYLE-502 의 `ua-init-script.ts`
 * `AddInitScriptCapable` 패턴을 일반화해 행동 시뮬레이터(behavior/), 탐지
 * (detection/), 네비게이션(navigation) 모듈이 두 드라이버를 동일 시그니처로
 * 받도록 만든다.
 *
 * ## 왜 구조적 타입인가
 *
 *   - playwright 와 patchright 의 `Page`/`BrowserContext` 는 런타임 형상이 동일
 *     하지만, generic 매개변수(예: `addInitScript<Arg>`)의 `Unboxed<Arg>` 변환이
 *     서로 달라 TypeScript 가 union 통합을 거부한다.
 *   - `(page as PlaywrightPage)` 직접 캐스트를 호출부마다 흩뿌리면 의도가 묻히고
 *     린트로 잡기 어렵다 → `asDriverPage(page)` 단일 진입점으로 캐스트를 모은다.
 *   - 모듈별로 사용하는 메서드만 capability 인터페이스로 분해해 "필요한 만큼만"
 *     의존하도록 한다 (인터페이스 분리 원칙). 신규 메서드를 쓸 때만 인터페이스
 *     확장 → 변경 영향 좁힘.
 *
 * ## source → driver 매핑 (ARCH-508)
 *
 *   `resolveDriverKind` 가 `FetcherFactory.resolveTier` 와 1:1 대응되는 단일
 *   SSoT 매핑을 제공한다. 행동 모듈은 "이 소스가 브라우저를 쓰는가" 를 사전에
 *   알아야 — T0(serebii) 는 `'none'` 을 받아 ghost-cursor 호출 자체를 스킵.
 */

import type { SourceSite } from '@pokopia-wiki/shared';
import type { Page as PlaywrightPage } from 'playwright';

/**
 * 드라이버 식별자.
 *
 * - `'none'`: ky 직접 HTTP. 브라우저 없음 → behavior/visibility/navigation 호출 금지.
 * - `'playwright'`: T1 (PokopiaGuide) — 표준 playwright stable.
 * - `'patchright'`: T2/T3 (pokopoko, namuwiki) — patchright fork (anti-detection).
 */
export type DriverKind = 'none' | 'playwright' | 'patchright';

/**
 * SourceSite → DriverKind 단일 SSoT (Phase 5 ARCH-508).
 *
 * `FetcherFactory.resolveTier` 의 티어 매핑과 1:1. 두 함수가 어긋나면 fetcher
 * 는 ky 인데 행동 모듈은 playwright 를 가정하는 사고가 발생하므로, 신규 소스
 * 추가 시 양쪽을 동시에 갱신해야 한다 (린트/타입으로 강제).
 *
 * exhaustive switch + `never` fallback — 신규 SourceSite 가 추가되면 컴파일
 * 타임에 오류로 드러난다.
 */
export function resolveDriverKind(source: SourceSite): DriverKind {
  switch (source) {
    case 'serebii':
      return 'none';
    case 'pokopiaGuide':
      return 'playwright';
    case 'pokopoko':
      return 'patchright';
    case 'namuwiki':
      return 'patchright';
    default: {
      const never: never = source;
      throw new Error(`resolveDriverKind: unknown source=${String(never)}`);
    }
  }
}

// ── Capability 인터페이스 ─────────────────────────────────────────────────────

/**
 * `addInitScript` 호출 capability — Phase 5 STYLE-502 ua-init-script.ts 와 동일
 * 패턴. driver-page.ts 가 SSoT 가 되어 다른 모듈도 import 한다.
 *
 * playwright/patchright 가 `addInitScript<Arg>(fn, arg)` 를 동일 형태로 노출하나
 * generic `Unboxed<Arg>` 변환이 달라 union 불가 — 구조적 capability 로 우회.
 */
export type AddInitScriptCapable<Arg> = {
  addInitScript(script: (arg: Arg) => void, arg: Arg): Promise<void>;
};

/**
 * `Page.evaluate` capability — visibility 위조, 컨텐츠 sniff 에 사용.
 *
 * 두 오버로드만 노출 (인자 없음 / 인자 1 개). 더 복잡한 시그니처(다중 인자)는
 * 사용처에서 캐스트하거나 capability 를 추가한다.
 */
export type EvaluateCapable = {
  evaluate<R>(fn: () => R | Promise<R>): Promise<R>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
};

/**
 * `Page.locator` capability — 네비게이션·클릭 요소 선택.
 *
 * 반환형 `unknown` 으로 두는 이유: playwright `Locator` 와 patchright `Locator`
 * 가 generic 차이로 union 불가. 호출부에서 필요 메서드(`click`/`scrollIntoViewIfNeeded`/
 * `boundingBox`/`first`)만 별도 capability 로 캐스트하면 된다.
 */
export type LocatorCapable = {
  locator(selector: string): unknown;
};

/**
 * `Page.goto` / `goBack` / `url` / `waitForLoadState` — Navigation Planner.
 *
 * `goto` 옵션에서 `waitUntil` 은 SSoT §7.1 자연 네비게이션이 `networkidle` 을
 * 기본으로 사용하므로 명시.
 */
export type NavigationCapable = {
  goto(
    url: string,
    options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' },
  ): Promise<unknown>;
  goBack(options?: { timeout?: number }): Promise<unknown>;
  url(): string;
  waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle', options?: { timeout?: number }): Promise<void>;
};

/**
 * `Page.content` / `waitForFunction` — DetectionMonitor.
 *
 * `content()` 는 전체 HTML 문자열 반환. `waitForFunction` 은 page 컨텍스트 표현식
 * 평가 (CF challenge 종료 감시 등). 두 메서드 모두 두 드라이버 동일 시그니처.
 */
export type ContentCapable = {
  content(): Promise<string>;
  waitForFunction(fn: () => boolean, options?: { timeout?: number }): Promise<unknown>;
};

/**
 * 행동 시뮬레이터·탐지 모니터·네비게이션이 사용하는 최소 Page API.
 *
 * playwright.Page 와 patchright.Page 모두 이 인터페이스를 만족한다 — 두
 * 라이브러리가 같은 형상이라는 사실에 의존. 신규 메서드 사용 시 위 capability
 * 인터페이스에 추가하여 `DriverPage` 가 자동 확장.
 */
export type DriverPage = EvaluateCapable & LocatorCapable & NavigationCapable & ContentCapable;

/**
 * BrowserContext 통합 타입 — SessionManager 가 페이지 생성·init script 주입·종료
 * 시 사용. `Arg` 는 `addInitScript` payload 타입.
 *
 * `pages()` 는 generic 차이로 readonly unknown[] 로 좁힘 — 실사용은 길이/index
 * 정도만. 페이지 객체가 필요하면 `asDriverPage` 로 명시 캐스트.
 */
export type DriverContext<Arg = unknown> = AddInitScriptCapable<Arg> & {
  pages(): readonly unknown[];
  newPage(): Promise<DriverPage>;
  close(): Promise<void>;
};

// ── 캐스트 헬퍼 ──────────────────────────────────────────────────────────────

/**
 * 호출부의 `as` 사용을 한 곳에 모으는 단일 캐스트 진입점.
 *
 * 사용처:
 *   - SessionManager 가 fetcher 의 내부 page 객체를 받아 행동 모듈에 넘길 때.
 *   - 테스트가 mock page 객체를 DriverPage 로 주입할 때.
 *
 * 런타임 검증 없음 — 두 드라이버가 구조적으로 동일하다는 가정에 기반. 검증은
 * type-check 와 통합 테스트에서.
 */
export function asDriverPage(page: unknown): DriverPage {
  return page as DriverPage;
}

/**
 * 동일 사유로 BrowserContext 캐스트도 단일 진입점화.
 */
export function asDriverContext<Arg = unknown>(context: unknown): DriverContext<Arg> {
  return context as DriverContext<Arg>;
}

/**
 * `ghost-cursor-playwright.createCursor` 가 요구하는 `playwright.Page` 타입으로
 * DriverPage 캐스트. 외부 경계 캐스트 단일 진입점 (ARCH-602 + STYLE-603).
 *
 * 구현 메모:
 *   - scraper 가 이미 `playwright` 를 dep 로 보유. type-only import 라 런타임 번들
 *     영향 없음.
 *   - 캐스트 한 곳으로 모아 각 호출부에서 `as never` 가 흩뿌려지는 것을 막음.
 */
export function asGhostCursorPage(page: DriverPage): PlaywrightPage {
  return page as unknown as PlaywrightPage;
}

/**
 * 구조적 Locator capability 로 캐스트. navigation / ghost-cursor 가 모두 호출.
 *
 * 제네릭 매개변수로 호출부 원하는 세부 Locator 타입(BehaviorLocator 등) 을 지정.
 * 사용처: `asBehaviorLocator<BehaviorLocator>(page.locator(selector))`.
 */
export function asBehaviorLocator<L>(locator: unknown): L {
  return locator as L;
}
