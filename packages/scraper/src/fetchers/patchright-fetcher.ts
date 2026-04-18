/**
 * PatchrightFetcher (T2) — CRAWLING_STRATEGY §4.2, §9.1.2, §15.3.
 *
 * 대상: pokopoko (403 돌파 필요).
 *
 * T1(PlaywrightFetcher) 과의 차이:
 *   - `import { chromium } from 'patchright'` (playwright 대신 patchright 포트 사용)
 *   - **fingerprint-injector 미적용** (§9.1.2 이중 패치 방지).
 *     patchright 가 canvas/audio/fonts 를 내장으로 처리하므로 추가 주입은
 *     오히려 탐지 벡터.
 *   - `maybeReinforceWebgl(context)` 호출 — `data/preflight/patchright-webgl.json`
 *     의 `overridesWebgl` 값에 따라 조건부 보강.
 *   - CF challenge 대기 로직 없음 (T3 전용).
 *
 * 공통:
 *   - `channel: 'chrome'`, headful, locale/timezone 페르소나 값.
 *   - userAgent/extraHTTPHeaders override 금지.
 *   - HtmlCache + robots.txt 검증 동일.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { SourceSite } from '@pokopia-wiki/shared';
import { chromium, type BrowserContext, type Page } from 'patchright';

import { detectChromeVersion, getSystemChromeUserAgent } from '../browser/chrome-version.js';
import { repoPath } from '../paths.js';
import type { BrowserPersona } from '../persona/types.js';
import { PersonaRequiredError, SkippedByRobotsError } from './errors.js';
import type { FetchOptions, FetchResult, Fetcher, FetcherHtmlCache, FetcherRobotsChecker } from './types.js';

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

/**
 * headless 여부 — 기본 headful. `SCRAPER_HEADED=0` 일 때만 headless.
 * headful 기본 정책은 T1 과 동일 (§9.1).
 */
function isHeadless(): boolean {
  return process.env['SCRAPER_HEADED'] === '0';
}

/**
 * `data/preflight/patchright-webgl.json` 프로브 결과.
 *
 * 파일이 없으면 보수적으로 `overridesWebgl: true` 로 간주 → 이중 패치 방지를
 * 위해 본 fetcher 는 WebGL 보강을 건너뛴다. Phase -1 `check:patchright` 가
 * 이 파일을 생성한다.
 */
type PatchrightWebGLProbe = { overridesWebgl: boolean };

async function readPatchrightProbe(): Promise<PatchrightWebGLProbe> {
  try {
    const raw = await readFile(repoPath('data', 'preflight', 'patchright-webgl.json'), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PatchrightWebGLProbe>;
    return { overridesWebgl: parsed.overridesWebgl !== false };
  } catch {
    // 파일 없음/손상 → 보수적으로 override 가정. WebGL 보강 건너뜀.
    return { overridesWebgl: true };
  }
}

/**
 * WebGL 보강 (§9.1.2 B1) — 조건부 no-op.
 *
 * Phase 5 에서 페르소나의 `fingerprint.webgl` 값으로 실제 패치 적용 예정.
 * Phase 4 에선:
 *   - probe 가 `overridesWebgl: true` 면 아무 것도 하지 않음 (이중 패치 방지)
 *   - `overridesWebgl: false` 여도 Phase 4 범위에선 페르소나 WebGL 값이
 *     아직 정의되지 않았으므로 주석만 남기고 no-op.
 *
 * TKTK Phase 5 구현 항목:
 *  - persona.fingerprint.webgl.{vendor,renderer} 로 addInitScript 주입
 *  - WebGLRenderingContext + WebGL2RenderingContext 두 prototype 에
 *    getParameter 를 wrap 해 파라미터 37445/37446 응답 고정
 *  - §9.1.2 원문 블록 그대로 이식
 */
async function maybeReinforceWebgl(_context: BrowserContext, _persona: BrowserPersona): Promise<void> {
  // probe 결과에 따라 이중 패치 방지 또는 Phase 5 보강 분기.
  // Phase 4 본 구현에서는 어느 경로든 no-op 으로 귀결되지만, probe 를 실제로
  // 읽어 Phase 5 전환 시 코드 변경이 addInitScript 주입 한 줄로 국한되도록
  // 구조만 잡아 둔다.
  const probe = await readPatchrightProbe();
  if (!probe.overridesWebgl) {
    // Phase 5: persona.fingerprint.webgl 주입 호출 위치.
  }
}

/**
 * addInitScript 본문 — T1 과 동일하지만 patchright context 에 주입한다.
 *
 * 동일 스크립트를 T1/T3 와 중복해서 보존하는 이유는 각 fetcher 별 BrowserContext
 * 타입이 패키지 단위로 분리돼 있기 때문이다 (playwright vs patchright).
 * Phase 5 에서 behavior/ 모듈로 공용화하면 한 곳으로 모을 수 있다.
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
 * `navigator.userAgentData` 보강 — T1 과 동일 로직을 patchright 에 주입.
 */
async function injectUserAgentData(context: BrowserContext): Promise<void> {
  const version = await detectChromeVersion();
  await context.addInitScript(userAgentDataInitScript, { major: version.major, full: version.full });
}

/**
 * PatchrightFetcher — T2 (pokopoko) 전용.
 *
 * 동작 흐름:
 *   1. robots.txt 검증
 *   2. 캐시 조회
 *   3. (첫 호출 시) patchright chromium launch + context 생성
 *   4. `maybeReinforceWebgl` 조건부 실행
 *   5. page.goto(url, waitUntil: 'domcontentloaded')
 *   6. 결과 캐시 저장 (2xx 만)
 */
export class PatchrightFetcher implements Fetcher {
  private context: BrowserContext | null = null;

  constructor(
    private readonly source: SourceSite,
    private readonly robots: FetcherRobotsChecker,
    private readonly cache: FetcherHtmlCache,
    private readonly persona: BrowserPersona,
  ) {}

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    if (!this.persona.usedFor.includes(this.source)) {
      throw new PersonaRequiredError(this.source, 2);
    }

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

  private async tryGetCached(url: string): Promise<FetchResult | null> {
    const cached = await this.cache.get(this.source, url).catch(() => null);
    if (cached && !this.cache.isExpired(cached, 3)) {
      return { ...cached, fromCache: true };
    }
    return null;
  }

  /** goto(domcontentloaded) + content 수집 → 2xx 만 cache 저장. */
  private async loadAndCapture(page: Page, url: string, timeoutMs?: number): Promise<FetchResult> {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
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
   * patchright context lazy 초기화.
   *
   * ⚠️ fingerprint-injector **적용 금지** — patchright 가 canvas/audio/fonts 를
   * 내장으로 패치하므로 이중 패치 방지 (§9.1.2).
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
    });

    // WebGL 조건부 보강 — overridesWebgl=true 면 no-op.
    await maybeReinforceWebgl(context, this.persona);
    await injectUserAgentData(context);

    this.context = context;
    return context;
  }

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
