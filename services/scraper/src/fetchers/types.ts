/**
 * Fetcher 공용 타입 (CRAWLING_STRATEGY §23.1, §4.2).
 *
 * 4 개 티어(T0 ky / T1 playwright / T2·T3 patchright) 의 fetcher 가 모두
 * `Fetcher` 인터페이스를 구현하게 한다. `FetcherFactory` 는 `SourceSite` 로
 * 구현체를 골라 반환하므로, 호출부는 인터페이스만 알면 된다(dependency inversion).
 *
 * 왜 별도 파일인가:
 *  - Fetcher 구현체 4 개가 각자 import 하면 타입 중복 정의가 발생한다.
 *  - test 파일도 동일 타입을 재사용해야 하므로 진입점을 단일화.
 */

import type { SourceSite } from '@pokopia-wiki/shared';

import type { BrowserPersona } from '../persona/types.js';

/**
 * 티어 번호(0~3). CRAWLING_STRATEGY §1.3 매핑 표와 1:1 대응.
 *
 * Union 대신 숫자 리터럴을 쓰는 이유: Rate limit 스케일/쿨다운 로직이
 * 티어 번호로 `switch` 분기를 선호하고, 로그 기록 시 `tier: 0|1|2|3` 형태로
 * 직렬화되기 때문. string enum (`'T0'`) 으로 바꾸고 싶어지면 §14, §23 전체 참고.
 */
export type Tier = 0 | 1 | 2 | 3;

/**
 * 단일 fetch 요청의 결과 — 캐시 메타와 동일한 구조.
 *
 * - `url`: **리다이렉트 후 최종 URL** (Location 헤더 추적 결과). 캐시 키 산출에
 *   **사용하지 않는다** — 원래 요청한 URL 을 키로 쓰고, 최종 URL 은 메타로 기록.
 * - `headers`: 민감 헤더(`set-cookie`, `authorization`) 는 캐시/로그 저장 전
 *   `filterSensitiveHeaders()` 로 제거된 상태. 즉 여기 담긴 값은 이미 안전.
 * - `fetchedAt`: ISO 8601 UTC. 캐시 TTL 판정에 사용 (§16.1).
 * - `contentHash`: **전체 HTML의 sha256 hex** (64 chars). loader 가 upsert 시
 *   기존 값과 동일하면 update 를 스킵한다 (멱등성, §7.3).
 */
export type FetchResult = {
  html: string;
  status: number;
  url: string;
  headers: Record<string, string>;
  fetchedAt: string;
  fromCache: boolean;
  contentHash: string;
};

/**
 * 호출 측이 fetch 동작을 조정하는 옵션.
 *
 * - `forceFetch`: 캐시 무효화. `--force-fetch` CLI 플래그와 연동. 의도적으로
 *   비싼 요청을 유도하므로 RateLimiter 는 그대로 적용된다.
 * - `persona`: T1~T3 에서 **필수**. T0 에서는 무시 (ky 는 persona 개념 없음).
 *   Factory 가 타입/런타임 양쪽에서 누락을 검증한다.
 * - `timeoutMs`: 기본 30,000. CF challenge 대기가 필요한 T3 는 내부적으로
 *   60,000 이상을 사용하므로 외부 주입값이 작아도 하한이 보장된다.
 */
export type FetchOptions = {
  forceFetch?: boolean;
  persona?: BrowserPersona;
  timeoutMs?: number;
};

/**
 * Fetcher 공용 인터페이스 — 4 개 구현체가 모두 따른다.
 *
 * `close()` 는 optional — ky (T0) 는 브라우저를 열지 않으므로 불필요.
 * playwright/patchright 는 반드시 `close()` 를 구현해 finally 에서 리소스 정리.
 */
export type Fetcher = {
  fetch(url: string, options?: FetchOptions): Promise<FetchResult>;
  close?(): Promise<void>;
};

/**
 * Factory 호출 시 주입되는 의존성 묶음.
 *
 * 4 개 Fetcher 가 모두 robots/cache 에 의존하므로 **한 번에 묶어 전달** 해
 * `createFetcher(source, { robots, cache, persona })` 호출을 간결하게 유지.
 */
export type FetcherDeps = {
  robots: FetcherRobotsChecker;
  cache: FetcherHtmlCache;
  persona?: BrowserPersona;
};

/**
 * RobotsChecker 의 최소 공개 API — 순환 import 방지용 구조적 타입.
 *
 * 실제 구현은 `../robots/checker.ts` 의 `RobotsChecker`. Fetcher 레이어는
 * 이 타입만 알면 충분하다.
 */
export type FetcherRobotsChecker = {
  isAllowed(source: SourceSite, url: string, userAgent: string): boolean;
};

/**
 * HtmlCache 의 최소 공개 API — 동일 이유로 구조적 타입.
 *
 * `get` 은 캐시 미스 시 `null` 반환. `set` 은 저장 실패 시 에러 throw
 * (캐시 일관성 깨짐 → 즉시 드러내는 정책).
 */
export type FetcherHtmlCache = {
  get(source: SourceSite, url: string): Promise<FetchResult | null>;
  set(source: SourceSite, url: string, result: FetchResult): Promise<void>;
  isExpired(result: FetchResult, ttlDays: number): boolean;
};
