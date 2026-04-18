/**
 * PlaywrightFetcher (T1) — CRAWLING_STRATEGY §4.2, §9.2, §15.2.
 *
 * 대상: PokopiaGuide (중간 anti-bot, ko-KR 한국어).
 *
 * 설계 원칙 (§9.2):
 *   - `channel: 'chrome'` **강제** — 시스템 Chrome 바이너리 사용해서
 *     `Sec-Ch-Ua` 자동 동기화. Chromium 기본 바이너리는 식별자가 달라 탐지 신호.
 *   - `headless: false` 기본 — headless 모드는 탐지된다. 명시적으로 `SCRAPER_HEADED=1`
 *     일 때만 true 가 `!HEADED` 통해 false 로 반전 (기본 headful 유지).
 *   - `userAgent` / `extraHTTPHeaders` **override 금지**. Chromium 엔진이 자동 발행.
 *   - `locale` / `timezoneId` 는 페르소나 값.
 *   - `fingerprint-injector` 는 attach 지점만 제공 (Phase 5 에서 실제 로직).
 *   - `addInitScript` 로 `navigator.userAgentData` 갱신 (§9.2 원문).
 *
 * Persona 주입:
 *   - `options.persona` 가 필수. 누락 시 `PersonaRequiredError`.
 *   - `storageStatePath` 는 launchPersistentContext 의 profile dir 로 쓰일 예정
 *     (Phase 5 연결). Phase 4 에선 `storageState` 만 참조.
 *
 * 리소스 관리:
 *   - `close()` 를 반드시 호출 — launch 된 context/browser 를 finally 에서 정리.
 *   - 여러 URL 을 같은 Fetcher 인스턴스로 fetch 하면 context 가 재사용된다.
 */

import { createHash } from 'node:crypto';

import type { SourceSite } from '@pokopia-wiki/shared';
import { chromium, type BrowserContext, type Page } from 'playwright';

import { detectChromeVersion, getSystemChromeUserAgent } from '../browser/chrome-version.js';
import type { BrowserPersona } from '../persona/types.js';
import { PersonaRequiredError, SkippedByRobotsError } from './errors.js';
import type { FetchOptions, FetchResult, Fetcher, FetcherHtmlCache, FetcherRobotsChecker } from './types.js';

/** 기본 타임아웃 — SPA 로딩(networkidle)까지 30초 내 완료 전제. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** 기본 뷰포트 — §9.1 일반적 데스크톱 사이즈. */
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

/**
 * headless 여부 — 기본 headful. `SCRAPER_HEADED=0` 일 때만 headless.
 *
 * headful 을 기본으로 두는 이유(§9.1): headless 모드는 자체가 탐지 신호.
 * CI/테스트 환경에선 env 로 headless 를 강제할 수 있다.
 */
function isHeadless(): boolean {
  return process.env['SCRAPER_HEADED'] === '0';
}

/**
 * Phase 5 fingerprint-injector 연결점 (attach 지점만).
 *
 * 실제 `newInjectedContext` 호출/FingerprintGenerator 통합은 Phase 5 에서 완성.
 * 지금은 signature 만 존재시켜 PlaywrightFetcher 가 미래 주입 경로를 예약한다.
 * async 를 유지해 Phase 5 에서 실제 await 가 들어갈 때 시그니처 변경이 없도록
 * 한다 (호출부는 여전히 `await` 로 사용). 현재 본문은 의도적 no-op.
 *
 * TKTK Phase 5 구현 항목:
 *  - FingerprintGenerator 로 페르소나 seed 기반 핑거프린트 생성
 *  - newInjectedContext 로 context 를 재생성하거나 addInitScript 로 주입
 *  - canvas/audio/fonts 일관성 유지 (§9.1.1)
 *
 * @see CRAWLING_STRATEGY §9.1.1 (T1 fingerprint-injector 적용)
 */
// eslint-disable-next-line @typescript-eslint/require-await, require-await
async function attachFingerprint(_context: BrowserContext, _persona: BrowserPersona): Promise<void> {
  // Phase 5 구현 전까지 의도적 no-op.
}

/**
 * 브라우저 컨텍스트에서 실행될 initScript 본문 — 세션 시작 시 1회.
 *
 * 파일 상단에서 변수로 묶어 두는 이유: addInitScript 에 넘길 함수가
 * Playwright 의 마샬링 대상이 되어 **클로저 캡처가 허용되지 않는다**. 실행
 * 컨텍스트는 페이지 렌더러 프로세스이므로 외부 스코프 의존은 불가. 그래서
 * `arg` 객체(`major`, `full`)로 필요한 값을 명시적으로 넘긴다.
 *
 * max-lines-per-function 룰 회피를 위해 script 본문을 const 로 추출했다.
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
 * `navigator.userAgentData` 고엔트로피 값 주입 (§9.2 B5).
 *
 * Playwright 가 자동 발행하는 userAgentData 는 brands/fullVersionList 에 build/patch
 * 정보가 누락될 수 있다. 세션 시작 시 1회 init script 로 보강. defineProperty
 * 서술자에 configurable/enumerable 명시 → 네이티브 속성과 diff 최소화.
 */
async function injectUserAgentData(context: BrowserContext): Promise<void> {
  const version = await detectChromeVersion();
  await context.addInitScript(userAgentDataInitScript, { major: version.major, full: version.full });
}

/**
 * PlaywrightFetcher — T1 (PokopiaGuide) 전용.
 *
 * 재사용 패턴: 한 세션에서 여러 URL 을 가져올 때 같은 인스턴스로 fetch 를
 * 반복 호출 → 내부 context 가 재사용되어 쿠키/스토리지 유지.
 */
export class PlaywrightFetcher implements Fetcher {
  private context: BrowserContext | null = null;

  constructor(
    private readonly source: SourceSite,
    private readonly robots: FetcherRobotsChecker,
    private readonly cache: FetcherHtmlCache,
    private readonly persona: BrowserPersona,
  ) {}

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    // Persona 의 usedFor 에 현재 소스가 포함됐는지 검증 — 잘못된 조합 즉시 실패.
    if (!this.persona.usedFor.includes(this.source)) {
      throw new PersonaRequiredError(this.source, 1);
    }

    // robots.txt 검증: Playwright UA 가 자동 생성되므로 기본 Chrome UA 로 조회.
    const ua = await getSystemChromeUserAgent();
    if (!this.robots.isAllowed(this.source, url, ua)) {
      throw new SkippedByRobotsError(url, this.source);
    }

    if (!options.forceFetch) {
      const cached = await this.tryGetCached(url);
      if (cached) return cached;
    }

    const ctx = await this.ensureContext();
    const page = await ctx.newPage();
    try {
      return await this.loadAndCapture(page, url, options.timeoutMs);
    } finally {
      await page.close().catch(() => {
        /* best-effort */
      });
    }
  }

  /** 캐시 히트 + 유효면 fromCache=true 결과 반환, 아니면 null. */
  private async tryGetCached(url: string): Promise<FetchResult | null> {
    const cached = await this.cache.get(this.source, url).catch(() => null);
    if (cached && !this.cache.isExpired(cached, 3)) {
      return { ...cached, fromCache: true };
    }
    return null;
  }

  /**
   * goto + content + 헤더/해시 수집 → 2xx 면 캐시 저장.
   *
   * SPA 로딩 완료를 위해 `waitUntil: 'networkidle'` 적용. PokopiaGuide 의
   * React 앱이 마지막 fetch 까지 끝나기 전에 content() 를 부르면 빈 껍데기가
   * 잡힌다.
   */
  private async loadAndCapture(page: Page, url: string, timeoutMs?: number): Promise<FetchResult> {
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    const status = response?.status() ?? 0;
    const html = await page.content();
    const contentHash = createHash('sha256').update(html).digest('hex');

    const headers: Record<string, string> = {};
    const hdrs = await response?.allHeaders();
    if (hdrs) {
      for (const [k, v] of Object.entries(hdrs)) {
        headers[k] = v;
      }
    }

    const result: FetchResult = {
      html,
      status,
      url: page.url(),
      headers,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      contentHash,
    };

    if (status >= 200 && status < 300) {
      await this.cache.set(this.source, url, result);
    }
    return result;
  }

  /**
   * 브라우저 컨텍스트 lazy 초기화.
   *
   * - `channel: 'chrome'` 강제: system Chrome 사용 (§9.2).
   * - headful 기본: headless 는 탐지 신호.
   * - locale/timezone 은 페르소나 값 주입.
   * - userAgent / extraHTTPHeaders 수동 설정 **금지** — Chromium 엔진이 자동 발행.
   * - 첫 생성 시 fingerprint attach + userAgentData 주입.
   */
  private async ensureContext(): Promise<BrowserContext> {
    if (this.context !== null) return this.context;

    const browser = await chromium.launch({
      channel: 'chrome',
      headless: isHeadless(),
    });
    const context = await browser.newContext({
      locale: this.persona.locale,
      timezoneId: this.persona.timezone,
      viewport: DEFAULT_VIEWPORT,
      storageState: this.persona.storageStatePath,
      // ❌ userAgent override 금지
      // ❌ extraHTTPHeaders 금지
    });

    await attachFingerprint(context, this.persona);
    await injectUserAgentData(context);

    this.context = context;
    return context;
  }

  /** 컨텍스트와 브라우저 종료 — finally 블록에서 호출 필수. */
  async close(): Promise<void> {
    if (this.context === null) return;
    const browser = this.context.browser();
    await this.context.close().catch(() => {
      /* best-effort */
    });
    await browser?.close().catch(() => {
      /* best-effort */
    });
    this.context = null;
  }
}
