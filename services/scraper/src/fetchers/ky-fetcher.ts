/**
 * KyFetcher (T0) — CRAWLING_STRATEGY §4.2, §9.2, §15.1.
 *
 * 대상: Serebii (팬사이트, 정적 HTML, 스텔스 불필요).
 *
 * 설계 원칙:
 *   - **최소 헤더**: User-Agent + Accept-Language 만 수동. 나머지는 ky/undici 기본.
 *   - **User-Agent에 연락처 포함**: `.env SCRAPER_USER_AGENT` 미설정 시
 *     시스템 Chrome 버전 기반으로 동적 생성. CLAUDE 정책상 `(+ukyi.js@gmail.com)`
 *     같은 연락처를 포함한 봇 UA 는 Serebii 에 선의로 식별 가능한 값.
 *   - **robots.txt 선검증**: `isAllowed()` false/undefined → `SkippedByRobotsError`.
 *   - **캐시 우선**: HtmlCache 경유. TTL 3 일.
 *   - **retry**: 429/503 만 대상. 1→2→4s 지수 백오프 (ky 내장).
 *
 * 비의도:
 *   - ky 는 브라우저가 아니므로 `close()` 불필요 (인터페이스상 optional).
 *   - Persona 주입 무시 — T0 는 개념 자체가 없음.
 */

import { createHash } from 'node:crypto';

import { redact } from '@pokopia-wiki/shared';
import type { SourceSite } from '@pokopia-wiki/shared';
import ky from 'ky';

import { getSystemChromeUserAgent } from '../browser/chrome-version.js';
import { SkippedByRobotsError } from './errors.js';
import type { FetchOptions, FetchResult, Fetcher, FetcherHtmlCache, FetcherRobotsChecker } from './types.js';

/**
 * 연락처를 포함하는 기본 UA — Serebii 식별 가능성 확보 (§15.1 주의사항).
 *
 * `.env SCRAPER_USER_AGENT` 가 있으면 이 값이 override 된다. 환경변수 우선은
 * 운영자가 임시로 UA 를 바꾸고 싶을 때(예: 버전 테스트) 코드 변경 없이 가능하게.
 */
const DEFAULT_USER_AGENT = 'PokopiaScraperBot/1.0 (+ukyi.js@gmail.com)';

/** T0 기본 타임아웃 — Serebii 는 정적 HTML 이라 20초 이상 걸릴 이유 없음. */
const DEFAULT_TIMEOUT_MS = 20_000;

/** TTL — 캐시 기본과 동일. 오버라이드가 필요하면 HtmlCache 쪽 상수 사용. */
const TTL_DAYS = 3;

/**
 * 세션 당 UA 를 한 번 계산하도록 내부적으로 캐시.
 *
 * `detectChromeVersion()` 이 macOS 에서 execFile 을 호출하는데, 같은 세션에서
 * 수백 번 재호출하면 불필요한 프로세스 포크가 발생. 첫 호출에서 결정한 값을
 * 세션 종료까지 재사용한다. 실유저도 런타임 중 Chrome 을 바꾸지 않는다는
 * §9.2 전제와 일치.
 */
let cachedUserAgent: string | null = null;

async function resolveUserAgent(): Promise<string> {
  if (cachedUserAgent !== null) return cachedUserAgent;
  const envUA = process.env['SCRAPER_USER_AGENT']?.trim();
  if (envUA && envUA.length > 0) {
    cachedUserAgent = envUA;
    return cachedUserAgent;
  }
  // Chrome 기반 UA 는 연락처가 없으므로, 기본 UA 에 Chrome full 버전만 주입.
  // 단, §9.2 는 T0 를 "시스템 Chrome 버전 동적 추출" 로 지정 — 연락처 포함
  // 버전이 정책상 우선이라 env 미설정 시는 `DEFAULT_USER_AGENT` 사용.
  try {
    // 미사용이지만 onSessionStart 가 아직 호출되지 않았을 때 버전 추출을
    // 트리거해 둔다(캐싱/bump 판정 가능성). 실패는 무해.
    await getSystemChromeUserAgent();
  } catch {
    /* no-op */
  }
  cachedUserAgent = DEFAULT_USER_AGENT;
  return cachedUserAgent;
}

/**
 * 캐시된 User-Agent 를 파기 (X-509 #3 — Phase 6 SessionManager).
 *
 * Chrome 메이저 버전 bump 가 감지되면(`chrome-version.onSessionStart()` 가
 * `bumped: true` 반환), 다음 요청에서 새 버전 UA 를 다시 샘플링하기 위해 호출한다.
 *
 * SCRAPER_USER_AGENT env override 도 함께 무효화 — 운영자가 env 를 갱신했을 수
 * 있으므로 다음 호출 시 환경변수 재평가.
 */
export function resetCachedUserAgent(): void {
  cachedUserAgent = null;
}

/**
 * KyFetcher — Serebii 전용 T0 구현.
 *
 * 생성자 의존성:
 *   - `robots`: 요청 직전 isAllowed 호출
 *   - `cache`: HtmlCache 경유 저장/조회
 *
 * `fetch(url, opts)` 는 `Fetcher` 인터페이스 구현. `forceFetch` 로 캐시 무시.
 */
export class KyFetcher implements Fetcher {
  private readonly source: SourceSite = 'serebii';

  constructor(
    private readonly robots: FetcherRobotsChecker,
    private readonly cache: FetcherHtmlCache,
  ) {}

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    const userAgent = await resolveUserAgent();

    // robots.txt 선검증. §26.1 D4: undefined → false 취급.
    if (!this.robots.isAllowed(this.source, url, userAgent)) {
      throw new SkippedByRobotsError(url, this.source);
    }

    if (!options.forceFetch) {
      const cached = await this.tryGetCached(url);
      if (cached) return cached;
    }

    const response = await this.performRequest(url, userAgent, options.timeoutMs);
    const result = await this.buildResult(response);
    await this.persistOrLog(url, result, response.status);
    return result;
  }

  /** 캐시 히트 + 유효면 fromCache=true 결과 반환, 아니면 null. */
  private async tryGetCached(url: string): Promise<FetchResult | null> {
    const cached = await this.cache.get(this.source, url).catch(() => null);
    if (cached && !this.cache.isExpired(cached, TTL_DAYS)) {
      return { ...cached, fromCache: true };
    }
    return null;
  }

  /**
   * ky.get 실제 호출. retry: 429/503 3 회 지수 백오프 (§11.1).
   * throwHttpErrors=false 로 4xx/5xx 를 예외 아닌 "응답" 으로 처리 → 상위가 결정.
   */
  private performRequest(url: string, userAgent: string, timeoutMs?: number): Promise<Response> {
    return ky.get(url, {
      timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retry: { limit: 3, statusCodes: [429, 503], backoffLimit: 5000 },
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      throwHttpErrors: false,
    });
  }

  /** Response → FetchResult 변환. HTML 본문 읽기 + sha256. */
  private async buildResult(response: Response): Promise<FetchResult> {
    const html = await response.text();
    const contentHash = createHash('sha256').update(html).digest('hex');
    return {
      html,
      status: response.status,
      url: response.url,
      headers: this.serializeHeaders(response.headers),
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      contentHash,
    };
  }

  /**
   * 2xx → cache 저장, 그 외 → warn 로그만.
   *
   * 비정상 응답 본문을 저장하면 다음 세션이 "정상 캐시" 로 간주해 오류를
   * 고착화시키므로 쓰지 않는다.
   */
  private async persistOrLog(url: string, result: FetchResult, status: number): Promise<void> {
    if (status >= 200 && status < 300) {
      await this.cache.set(this.source, url, result);
      return;
    }
    // eslint-disable-next-line no-console
    console.warn(`[ky-fetcher] non-2xx status=${String(status)} url=${redact(url)}`);
  }

  /**
   * Headers 를 Record 로 직렬화. 중복 키(set-cookie 등) 는 ky/undici가 합쳐서
   * 넘기므로 단일 값 가정이 안전하다. 민감 필터는 cache 저장 단계에서 한 번 더.
   */
  private serializeHeaders(headers: Headers): Record<string, string> {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
}
