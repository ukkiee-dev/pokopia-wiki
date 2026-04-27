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

import { getSystemChromeUserAgent } from '../browser/chrome-version.js';
import { injectUserAgentData } from '../browser/ua-init-script.js';
import { attachFingerprint } from '../fingerprint/inject.js';
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
