/**
 * PatchrightCfFetcher (T3) — CRAWLING_STRATEGY §4.2, §11.1, §15.4.
 *
 * 대상: namu.wiki (Cloudflare Turnstile 방어).
 *
 * T2(PatchrightFetcher) + Cloudflare challenge 대기 로직:
 *   1. 일반 navigation 후 `#challenge-running` 요소 소멸 대기 (최대 60초).
 *   2. 타임아웃 시 `SessionAbortError('cf_challenge_timeout')` throw.
 *   3. cf_clearance 쿠키는 `storageState` 경로로 자연 영속 (launchPersistentContext
 *      이후 Phase 5 에서 전환 예정 — Phase 4 는 newContext + storageState).
 *
 * 실패 반응 (§11.1):
 *   - Cloudflare challenge 타임아웃은 `high` 알림 대상이지만, Notifier 호출은
 *     상위 SessionManager 가 에러 종류 분기로 수행. 본 fetcher 는 에러 throw 만.
 *   - 24시간 cooldown 진입은 상위 결정. 본 fetcher 는 상태를 유지하지 않는다.
 *
 * robots.txt (§26):
 *   - namu.wiki 는 robots.txt 에서 상당 부분을 disallow 함. 위반 시
 *     `SkippedByRobotsError` 로 즉시 중단 — 정책 우선.
 */

import { createHash } from 'node:crypto';

import type { SourceSite } from '@pokopia-wiki/shared';
import { chromium, type BrowserContext, type Page } from 'patchright';

import { getSystemChromeUserAgent, detectChromeVersion } from '../browser/chrome-version.js';
import { maybeReinforceWebgl } from '../fingerprint/patchright-webgl.js';
import type { BrowserPersona } from '../persona/types.js';
import { PersonaRequiredError, SessionAbortError, SkippedByRobotsError } from './errors.js';
import type { FetchOptions, FetchResult, Fetcher, FetcherHtmlCache, FetcherRobotsChecker } from './types.js';

/** T3 는 CF challenge 때문에 기본 타임아웃을 크게 잡는다 (60초 대기 + 여유). */
const DEFAULT_TIMEOUT_MS = 90_000;

/** CF challenge 대기 상한. §15.4: "60초 대기, 실패 시 즉시 포기". */
const CF_CHALLENGE_TIMEOUT_MS = 60_000;

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

/**
 * headless 여부 — 기본 headful. `SCRAPER_HEADED=0` 일 때만 headless.
 * CF challenge 해결이 필요해 T3 는 특히 headful 유지 권장.
 */
function isHeadless(): boolean {
  return process.env['SCRAPER_HEADED'] === '0';
}

/**
 * addInitScript 본문 — T1/T2 와 동일. Phase 5 공용화 과제.
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
 * `navigator.userAgentData` 보강 — T2 와 동일 (중복 최소화를 Phase 5 과제로 남김).
 */
async function injectUserAgentData(context: BrowserContext): Promise<void> {
  const version = await detectChromeVersion();
  await context.addInitScript(userAgentDataInitScript, { major: version.major, full: version.full });
}

/**
 * Cloudflare challenge 종료 대기.
 *
 * `#challenge-running` 요소 또는 `.cf-challenge-container` 가 존재하는 동안
 * 봇이 아님을 증명하고 있는 상태(§11.1 `CLOUDFLARE_CHALLENGE`). 사라지면
 * challenge 통과. `waitForFunction` 을 60초 제한으로 호출하고 타임아웃 시
 * `SessionAbortError` throw.
 *
 * `waitForFunction` 이 challenge 가 "존재한 적 없음" 도 true 로 돌려주므로
 * 원문 selector 는 항상 첫 evaluate 에서 true 면 즉시 반환 — 이는 의도된 동작.
 */
async function waitForCloudflareClear(page: Page, url: string): Promise<void> {
  try {
    await page.waitForFunction(() => !document.querySelector('#challenge-running, .cf-challenge-container'), {
      timeout: CF_CHALLENGE_TIMEOUT_MS,
    });
  } catch {
    throw new SessionAbortError('cf_challenge_timeout', url);
  }
}

/**
 * PatchrightCfFetcher — T3 (namu.wiki) 전용.
 *
 * T2 와 차이점만 구현체에 유지 — 재사용 가능한 부분이 많지만 Phase 4 에선
 * 인터페이스 명확성을 위해 별도 클래스 (비슷한 패턴이라도 "CF 대기" 가
 * 1급 책임임을 코드 구조로 드러낸다).
 */
export class PatchrightCfFetcher implements Fetcher {
  private context: BrowserContext | null = null;

  constructor(
    private readonly source: SourceSite,
    private readonly robots: FetcherRobotsChecker,
    private readonly cache: FetcherHtmlCache,
    private readonly persona: BrowserPersona,
  ) {}

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    if (!this.persona.usedFor.includes(this.source)) {
      throw new PersonaRequiredError(this.source, 3);
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

  /** T2 와 동일하되 goto 직후 CF challenge 대기가 추가된다. */
  private async loadAndCapture(page: Page, url: string, timeoutMs?: number): Promise<FetchResult> {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    // CF challenge 대기 — 실패 시 SessionAbortError throw
    await waitForCloudflareClear(page, url);

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

    // WebGL 조건부 보강 — probe.overridesWebgl 이 true 면 no-op (§9.1.2).
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
