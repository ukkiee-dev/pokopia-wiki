/**
 * HTML 캐시 (CRAWLING_STRATEGY §16.1) — TTL 3일 기본.
 *
 * 역할:
 *   - 모든 Fetcher 는 요청 전 캐시를 먼저 조회 (§16.1 "HTML 캐시").
 *   - 미스/만료/`--force-fetch` 시에만 실제 네트워크 호출.
 *   - 메타데이터(url/fetchedAt/status/contentHash/headers) 를 나란히 저장.
 *
 * 파일 구조:
 *   ```
 *   data/cache/
 *     serebii/
 *       <sha16>.html         # 원본 HTML
 *       <sha16>.meta.json    # 메타데이터
 *   ```
 *
 * `<sha16>` 해시 산출:
 *   1. `encodeURIComponent(url)` — URL unsafe 문자 제거로 1차 정규화
 *   2. `sha256` 적용 후 앞 16자만 사용 (충돌 확률 16진 64비트 → 크롤링 범위에서 안전)
 *
 * 왜 해시인가 (§10.3 path traversal 방어):
 *   - URL path 를 파일명에 그대로 쓰면 `../../etc/passwd` 류 공격 가능
 *   - 해시는 고정 16자 hex 로 baseDir 내부를 벗어날 수 없음
 *   - 디버깅 편의는 `meta.json.url` 필드로 복원 가능
 *
 * 민감 헤더 필터링:
 *   `set-cookie`, `cookie`, `authorization`, `proxy-authorization` 은 메타 저장
 *   전에 제거한다. 캐시 파일이 실수로 git 추적되거나 외장 SSD 백업에 포함돼도
 *   토큰 유출을 막는 1차 방어선 (`redactObject` 도 사용하지만 키 이름 기반
 *   필터는 더 빠르고 확실한 가드).
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { SourceSite } from '@pokopia-wiki/shared';

import { CachePathTraversalError } from '../fetchers/errors.js';
import type { FetchResult } from '../fetchers/types.js';
import { repoPath } from '../paths.js';

/** 기본 TTL — §16.1 "TTL 3일". 호출자가 `getOrFetch` 호출 시 override 가능. */
export const DEFAULT_TTL_DAYS = 3;

/**
 * 민감 헤더 이름 (lowercase). 캐시/로그 저장 전 제거.
 *
 * 추가 후보:
 *  - `x-auth-token`, `x-api-key` 등 커스텀 인증 헤더는 `redactObject` 의 값 패턴
 *    에 잡힌다(§22.3). 여기선 **키 이름 기반** 필터만 다룬다.
 */
const SENSITIVE_HEADER_NAMES = new Set(['set-cookie', 'cookie', 'authorization', 'proxy-authorization']);

/**
 * URL 을 고정 길이 hex 키로 변환 (16자 = 64bit).
 *
 * `encodeURIComponent` 를 먼저 거치는 이유: 같은 URL 이 query param 순서/인코딩
 * 차이로 다르게 표현되는 것을 줄이기 위해서다. 단, **완벽한 정규화는 아니다** —
 * `?a=1&b=2` vs `?b=2&a=1` 은 다른 키로 잡힌다. 이는 Phase 4 범위에서 의도적
 * (Phase 6+ 에서 URL normalizer 필요 시 도입).
 */
function urlToKey(url: string): string {
  return createHash('sha256').update(encodeURIComponent(url)).digest('hex').slice(0, 16);
}

/** 민감 헤더 제거 — 결과는 새 객체 (원본 보존). */
function filterSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_NAMES.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

/**
 * 디스크에 저장되는 메타 스키마.
 *
 * `html` 필드는 별도 `.html` 파일에 저장하므로 여기엔 포함하지 않는다 —
 * JSON 직렬화 시 HTML 큰 문자열의 이스케이프 비용을 피한다.
 */
type CacheMeta = {
  url: string;
  fetchedAt: string;
  status: number;
  contentHash: string;
  headers: Record<string, string>;
};

/**
 * `HtmlCache` — 디스크 기반 TTL 캐시.
 *
 * 생성자 파라미터 `baseDir` 는 테스트에서 tmpdir 를 주입해 격리한다.
 * 프로덕션 용도로는 인자 없이 생성 → `data/cache/` 가 자동 적용.
 */
export class HtmlCache {
  /** 해석된 절대 경로. path traversal 검증의 기준점. */
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(baseDir ?? repoPath('data', 'cache'));
  }

  /**
   * 캐시 조회 → 미스/만료/force 시 fetchFn 호출 → 결과 저장.
   *
   * 흐름:
   *   1. `forceFetch` 면 즉시 fetch → set → 반환 (캐시 완전 무시)
   *   2. 아니면 get() — null 이면 fetch → set
   *   3. 캐시 값이 있더라도 `isExpired(ttlDays)` 면 fetch → set
   *   4. 유효한 캐시면 `fromCache=true` 로 필드 업데이트 후 반환
   *
   * 에러 처리:
   *   - `set` 에서 throw 발생 시 그대로 전파 — 캐시 일관성 문제를 숨기지 않음.
   *   - `get` 에서 throw 발생 시(메타 깨짐 등) 조용히 miss 로 간주 — 복구성 우선.
   */
  async getOrFetch(
    source: SourceSite,
    url: string,
    fetchFn: () => Promise<FetchResult>,
    ttlDays: number = DEFAULT_TTL_DAYS,
    options: { forceFetch?: boolean } = {},
  ): Promise<FetchResult> {
    if (options.forceFetch) {
      const fresh = await fetchFn();
      await this.set(source, url, fresh);
      return fresh;
    }

    const cached = await this.get(source, url).catch(() => null);
    if (cached && !this.isExpired(cached, ttlDays)) {
      return { ...cached, fromCache: true };
    }

    const fresh = await fetchFn();
    await this.set(source, url, fresh);
    return fresh;
  }

  /**
   * 캐시 조회 — 미스 또는 손상 시 `null`.
   *
   * 손상 감지: HTML 파일 또는 메타 파일 중 하나라도 read 실패 / JSON.parse
   * 실패 / `contentHash` 누락이면 miss 로 간주. 상위에서 재수집하도록 유도.
   */
  async get(source: SourceSite, url: string): Promise<FetchResult | null> {
    const { htmlPath, metaPath } = this.pathsFor(source, url);

    let html: string;
    let meta: CacheMeta;
    try {
      [html, meta] = await Promise.all([
        readFile(htmlPath, 'utf8'),
        readFile(metaPath, 'utf8').then((s) => JSON.parse(s) as CacheMeta),
      ]);
    } catch {
      return null;
    }

    if (typeof meta.contentHash !== 'string' || typeof meta.fetchedAt !== 'string') {
      return null;
    }

    return {
      html,
      status: meta.status,
      url: meta.url,
      headers: meta.headers,
      fetchedAt: meta.fetchedAt,
      fromCache: true,
      contentHash: meta.contentHash,
    };
  }

  /**
   * 캐시 저장 — html + meta 파일 쌍으로 기록.
   *
   * 저장 순서: meta 를 먼저 쓰면 중간 크래시 시 html 없이 meta 만 남는다.
   * 반대로 html 을 먼저 쓰면 같은 상황에서 "아직 저장 완료 안 된 캐시" 가
   * meta 없이 남는다. 양쪽 어느 경우든 `get()` 이 `null` 을 돌려주므로
   * 안전하다. 성능상 `Promise.all` 로 병렬 쓰기.
   */
  async set(source: SourceSite, url: string, result: FetchResult): Promise<void> {
    const { dir, htmlPath, metaPath } = this.pathsFor(source, url);
    await mkdir(dir, { recursive: true });

    const meta: CacheMeta = {
      url: result.url,
      fetchedAt: result.fetchedAt,
      status: result.status,
      contentHash: result.contentHash,
      headers: filterSensitiveHeaders(result.headers),
    };

    await Promise.all([
      writeFile(htmlPath, result.html, 'utf8'),
      writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8'),
    ]);
  }

  /** TTL 판정 — `fetchedAt` 이후 ttlDays 일이 경과했으면 true. */
  isExpired(result: FetchResult, ttlDays: number = DEFAULT_TTL_DAYS): boolean {
    const fetchedAtMs = new Date(result.fetchedAt).getTime();
    // 파싱 실패는 expired 취급 — 손상된 meta 를 즉시 복구 시그널로 변환.
    if (Number.isNaN(fetchedAtMs)) return true;
    const ageMs = Date.now() - fetchedAtMs;
    return ageMs > ttlDays * 24 * 60 * 60 * 1000;
  }

  /**
   * path traversal 방어 (§10.3 D1).
   *
   * 해시 기반 키라 이론상 안전하지만, 코드가 변경돼 파일명에 원문 URL 이 섞일
   * 경우를 대비해 resolve 결과가 반드시 `baseDir/<source>/` 하위에 있는지
   * assert. 벗어나면 `CachePathTraversalError` throw — 조용한 취소가 아니라
   * 즉시 오류.
   */
  private pathsFor(
    source: SourceSite,
    url: string,
  ): {
    dir: string;
    htmlPath: string;
    metaPath: string;
  } {
    const key = urlToKey(url);
    const dir = path.resolve(this.baseDir, source);
    const htmlPath = path.resolve(dir, `${key}.html`);
    const metaPath = path.resolve(dir, `${key}.meta.json`);

    const baseWithSep = this.baseDir.endsWith(path.sep) ? this.baseDir : this.baseDir + path.sep;
    if (!htmlPath.startsWith(baseWithSep) || !metaPath.startsWith(baseWithSep)) {
      throw new CachePathTraversalError(source, htmlPath, this.baseDir);
    }
    return { dir, htmlPath, metaPath };
  }
}
