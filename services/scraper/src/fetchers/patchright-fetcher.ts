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

import type { SourceSite } from '@pokopia-wiki/shared';
import { chromium, type BrowserContext, type Page } from 'patchright';

import { getSystemChromeUserAgent } from '../browser/chrome-version.js';
import { injectUserAgentData } from '../browser/ua-init-script.js';
import { maybeReinforceWebgl } from '../fingerprint/patchright-webgl.js';
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
