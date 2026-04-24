/**
 * HumanBehavior — CRAWLING_STRATEGY §7.2 / §8.1~§8.3.
 *
 * 사람다운 마우스 이동(Bezier 곡선·overshoot)·스크롤·체류 시간을 시뮬레이션.
 * 페이지 직접 의존성을 줄이기 위해:
 *   - cursor 는 `CursorFactory` 로 추상화 — 기본 구현은 `ghost-cursor-playwright`,
 *     테스트에서는 mock cursor 주입.
 *   - sleep / random 도 DI — deterministic 단위 테스트.
 *   - 페이지 타입은 `DriverPage` 구조적 타입 (X-509 #7) 으로 두 드라이버 통합.
 *
 * ## 왜 단일 클래스인가
 *
 *   §7.2 / §8.1~§8.3 은 "한 사람의 행동" 으로 묶이는 동작들이라 random/sleep
 *   주입을 한 곳에서 일관되게 받는 편이 유지보수에 유리. dwell/scroll/click 이
 *   서로 다른 random seed 를 쓰지 않도록 단일 인스턴스로 강제.
 *
 * ## ghost-cursor-playwright 통합
 *
 *   라이브러리 자체가 `playwright-core.Page` 를 정확 요구. patchright Page 도
 *   런타임 형상은 동일하므로 `as unknown as` 단일 캐스트로 wrap. driver-page.ts
 *   의 단일 SSoT 캐스트 정책과 일치.
 */

import { createCursor } from 'ghost-cursor-playwright';

import { asGhostCursorPage, type DriverPage } from '../browser/driver-page.js';

/**
 * 행동 모듈이 사용하는 최소 Locator API.
 *
 * boundingBox 는 가우시안 위치 산정에 필수. scrollIntoViewIfNeeded 는 큰
 * 페이지에서 viewport 밖 요소 클릭 직전 보장.
 */
export type BehaviorLocator = {
  boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  scrollIntoViewIfNeeded?(): Promise<void>;
};

/**
 * ghost-cursor 의 좁은 의존 표면. 실제 Cursor 객체보다 작은 인터페이스로 좁혀
 * 테스트 mock 단순화.
 */
export type CursorLike = {
  actions: {
    click(opts?: { target?: { x: number; y: number } }): Promise<void>;
    move(target: { x: number; y: number }): Promise<void>;
  };
};

export type CursorFactory = (page: DriverPage) => Promise<CursorLike>;

export type ScrollStyle = 'partial' | 'read-through' | 'skim';

export type HumanBehaviorOptions = {
  cursorFactory?: CursorFactory;
  /** 기본 setTimeout 기반. 테스트는 즉시 resolve 하는 stub 주입. */
  sleep?: (ms: number) => Promise<void>;
  /** [0,1) — 기본 Math.random. */
  random?: () => number;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * 기본 cursor factory — `ghost-cursor-playwright` 의 createCursor wrap.
 *
 * playwright/patchright `Page` 가 구조적으로 호환된다는 가정에 기반한 단일 캐스트.
 * 캐스트 위치를 한 곳에 모음으로써 행동 모듈 호출부에서는 `as` 사용을 피한다.
 */
const defaultCursorFactory: CursorFactory = async (page) => {
  // 외부 경계 캐스트는 `asGhostCursorPage` 에 위임 (ARCH-602 단일 진입점).
  const cursor = (await createCursor(asGhostCursorPage(page))) as unknown as CursorLike;
  return cursor;
};

export class HumanBehavior {
  private readonly cursorFactory: CursorFactory;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  /**
   * 페이지당 Cursor 인스턴스 재사용 캐시 (PERF-603).
   *
   * WeakMap 선택 이유: 페이지가 닫혀 참조가 사라지면 cursor 도 자동 GC.
   * 명시적 invalidate 호출 없이 메모리 누수 방지.
   *
   * 부수 효과: 마우스 연속성 유지 → 탐지 품질 ↑ (매 클릭마다 새 cursor 이면
   * 초기 좌표가 튐).
   */
  private readonly cursorCache = new WeakMap<object, CursorLike>();

  constructor(options: HumanBehaviorOptions = {}) {
    this.cursorFactory = options.cursorFactory ?? defaultCursorFactory;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  /** 페이지 cursor 를 캐시에서 얻거나 factory 로 생성 후 캐싱. */
  private async getCursor(page: DriverPage): Promise<CursorLike> {
    const key = page as unknown as object;
    const cached = this.cursorCache.get(key);
    if (cached) return cached;
    const cursor = await this.cursorFactory(page);
    this.cursorCache.set(key, cursor);
    return cursor;
  }

  /**
   * Box-Muller 변환 기반 가우시안 난수 (§7.2 보조).
   *
   * static 인 이유: stateless 한 순수 함수라 클래스 인스턴스 없이도 호출 가능 →
   * 테스트·외부 모듈에서 직접 사용 (HumanBehavior import 비용 없이).
   *
   * `random()` 결과가 0 일 가능성을 막기 위해 `Math.max(MIN_VALUE, random())` —
   * `Math.log(0) = -Infinity` 회피.
   */
  static gaussianRandom(mean: number, stddev: number, random: () => number = Math.random): number {
    const u1 = Math.max(Number.MIN_VALUE, random());
    const u2 = random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stddev;
  }

  /** [minMs, maxMs) 균등 분포 sleep — §8.2 dwellByContent 의 한 단위. */
  async humanDwell(minMs: number, maxMs: number): Promise<void> {
    const ms = minMs + this.random() * (maxMs - minMs);
    await this.sleep(ms);
  }

  /**
   * 가우시안 분포 위치(중심 편향)에 cursor 이동 + 호버 지연 + 클릭.
   *
   * boundingBox 가 null 이면 silently no-op — 요소가 없거나 화면 밖이라 의미 없음.
   * scrollIntoViewIfNeeded 가 있으면 클릭 전 호출해 viewport 보장.
   */
  async humanClick(page: DriverPage, locator: BehaviorLocator): Promise<void> {
    if (locator.scrollIntoViewIfNeeded) {
      await locator.scrollIntoViewIfNeeded();
    }
    const box = await locator.boundingBox();
    if (!box) return;

    const cursor = await this.getCursor(page);
    const offsetX = HumanBehavior.gaussianRandom(box.width / 2, box.width / 6, this.random);
    const offsetY = HumanBehavior.gaussianRandom(box.height / 2, box.height / 6, this.random);
    const x = box.x + clamp(offsetX, 5, Math.max(5, box.width - 5));
    const y = box.y + clamp(offsetY, 5, Math.max(5, box.height - 5));

    await cursor.actions.move({ x, y });
    await this.sleep(50 + this.random() * 200);
    await cursor.actions.click({ target: { x, y } });
  }

  /**
   * §8.1 비선형 스크롤. 실제 동작은 page 컨텍스트의 evaluate 본문에서 수행 —
   * Math.random / setTimeout 모두 페이지 측 실행이라 호스트 random/sleep DI 와
   * 분리. 호스트 측 컨트롤은 "어떤 style 을 고를지" 선택에 한정.
   */
  async humanScroll(page: DriverPage, style: ScrollStyle): Promise<void> {
    await page.evaluate(scrollImpl, { style });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 페이지 컨텍스트에서 실행되는 스크롤 본문 — §8.1 SSoT 그대로.
 *
 * 파일 상단 const 로 분리한 이유: page.evaluate 에 넘기는 함수는 페이지 측
 * 마샬링 대상이라 외부 스코프 캡처가 허용되지 않는다. 문법적으로도 별도 함수가
 * 명확하고, oxlint max-lines-per-function 회피.
 */
/**
 * Why disable:
 *   - `unicorn/consistent-function-scoping`: `pageWait` 는 외부 스코프 캡처가 없지만,
 *     scrollImpl 자체가 page 측에서 실행되는 마샬링 대상이라 모듈 스코프로 빼면
 *     페이지 컨텍스트에서 참조 불가. 함수 내부 정의가 정답.
 *   - `no-await-in-loop`: 사람의 점진적 스크롤 시뮬레이션은 **순차** 가 본질 —
 *     Promise.all 로 병렬화하면 한 번에 여러 번 스크롤되어 봇 시그니처가 됨.
 */
// eslint-disable-next-line unicorn/consistent-function-scoping
const scrollImpl = async (arg: { style: ScrollStyle }): Promise<void> => {
  // setTimeout 의 implicit return 회피 — 명시 block 으로 감싸 void return 보장.
  // page 컨텍스트 안에서 실행되는 코드라 모듈 스코프로 빼면 마샬링되지 않음 — 함수
  // 내부 정의가 정답. consistent-function-scoping 은 본 모듈에선 의도적 위반.
  // eslint-disable-next-line unicorn/consistent-function-scoping
  const pageWait = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  if (arg.style === 'skim') {
    for (let i = 0; i < 3; i++) {
      window.scrollBy({ top: 400 + Math.random() * 300, behavior: 'smooth' });
      // eslint-disable-next-line no-await-in-loop
      await pageWait(300 + Math.random() * 500);
    }
    return;
  }
  if (arg.style === 'read-through') {
    for (let i = 0; i < 5; i++) {
      window.scrollBy({ top: 100 + Math.random() * 100, behavior: 'smooth' });
      // eslint-disable-next-line no-await-in-loop
      await pageWait(2000 + Math.random() * 3000);
    }
    if (Math.random() < 0.3) {
      window.scrollBy({ top: -200 - Math.random() * 300, behavior: 'smooth' });
      await pageWait(1500 + Math.random() * 2000);
    }
    return;
  }
  window.scrollBy({ top: 200 + Math.random() * 200, behavior: 'smooth' });
  await pageWait(800 + Math.random() * 1200);
};
