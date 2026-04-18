/**
 * HtmlCache TDD 테스트 (Task 4.1).
 *
 * 실제 레포 `data/cache/` 디렉토리를 오염시키지 않도록 **os tmpdir** 하위
 * 난수 디렉토리를 기본 디렉토리로 사용한다. `HtmlCache` 가 생성자에서
 * `baseDir` 를 받을 수 있도록 설계한 이유가 이 테스트 격리 때문.
 *
 * 네트워크 호출 금지 — fetchFn 은 stub 이 직접 반환값을 결정한다.
 *
 * `fetchFn` 들은 Promise 반환형이 의무이므로 async 없이 즉시 해소된 Promise 를
 * 돌려주는 형태로 작성해 oxlint `require-await` 규칙 충족.
 */

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FetchResult } from '../fetchers/types.js';
import { HtmlCache } from './html-cache.js';

/**
 * 테스트 격리: 각 it 에서 고유 tmpdir 를 만들고 afterEach 에서 제거.
 * 실수로 저장 디렉토리가 겹치면 한 테스트 쓰기가 다른 테스트 상태를 오염시킨다.
 */
let tempBase: string;

beforeEach(async () => {
  tempBase = await mkdtemp(path.join(tmpdir(), 'html-cache-test-'));
});

afterEach(async () => {
  await rm(tempBase, { recursive: true, force: true });
});

/** 고정 HTML 샘플 — 파서가 중요한 게 아니라 저장·복원·hash 일관성을 본다. */
const SAMPLE_HTML = '<!doctype html><html><body>hello pokopia</body></html>';
const SAMPLE_HASH = createHash('sha256').update(SAMPLE_HTML).digest('hex');

/** fetchFn 이 반환하는 표준 FetchResult (cache 가 fromCache=false 로 저장). */
function makeFetched(url: string): FetchResult {
  return {
    html: SAMPLE_HTML,
    status: 200,
    url,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    contentHash: SAMPLE_HASH,
  };
}

/** 카운터 증가 + resolve 가 필요할 때 사용하는 helper — async 키워드 회피용. */
function countingFetcher(url: string, counter: { called: number }): () => Promise<FetchResult> {
  return () => {
    counter.called += 1;
    return Promise.resolve(makeFetched(url));
  };
}

/** 16자 hash (URL encoded + sha256) — 테스트 파일명 예측용 고정 로직. */
function keyFor(url: string): string {
  return createHash('sha256').update(encodeURIComponent(url)).digest('hex').slice(0, 16);
}

describe('HtmlCache.getOrFetch() — miss/hit', () => {
  it('cache miss → invokes fetchFn → stores html + meta on disk', async () => {
    const cache = new HtmlCache(tempBase);
    const url = 'https://www.serebii.net/pokemonpokopia/availablepokemon.shtml';
    const counter = { called: 0 };

    const result = await cache.getOrFetch('serebii', url, countingFetcher(url, counter));

    expect(counter.called).toBe(1);
    expect(result.fromCache).toBe(false);
    expect(result.html).toBe(SAMPLE_HTML);
    expect(result.contentHash).toBe(SAMPLE_HASH);

    const entries = await stat(path.join(tempBase, 'serebii')).catch(() => null);
    expect(entries?.isDirectory()).toBe(true);
  });

  it('cache hit within TTL → skips fetchFn and returns fromCache=true', async () => {
    const cache = new HtmlCache(tempBase);
    const url = 'https://www.serebii.net/pokemonpokopia/items/01.shtml';
    const counter = { called: 0 };
    const fetchFn = countingFetcher(url, counter);

    await cache.getOrFetch('serebii', url, fetchFn);
    const second = await cache.getOrFetch('serebii', url, fetchFn);

    expect(counter.called).toBe(1);
    expect(second.fromCache).toBe(true);
    expect(second.html).toBe(SAMPLE_HTML);
  });
});

describe('HtmlCache.getOrFetch() — TTL expiry and forceFetch', () => {
  it('cache hit past TTL → re-invokes fetchFn', async () => {
    const cache = new HtmlCache(tempBase);
    const url = 'https://www.serebii.net/pokemonpokopia/specialty/01.shtml';
    const fourDaysAgoMs = Date.now() - 4 * 24 * 60 * 60 * 1000;

    const stale = { ...makeFetched(url), fetchedAt: new Date(fourDaysAgoMs).toISOString() };
    await cache.set('serebii', url, stale);

    const counter = { called: 0 };
    const result = await cache.getOrFetch('serebii', url, countingFetcher(url, counter), 3);

    expect(counter.called).toBe(1);
    expect(result.fromCache).toBe(false);
  });

  it('forceFetch bypass → re-invokes fetchFn even on fresh cache', async () => {
    const cache = new HtmlCache(tempBase);
    const url = 'https://www.serebii.net/pokemonpokopia/habitats.shtml';
    const counter = { called: 0 };

    await cache.getOrFetch('serebii', url, countingFetcher(url, counter));
    await cache.getOrFetch('serebii', url, countingFetcher(url, counter), 3, { forceFetch: true });

    expect(counter.called).toBe(2);
  });
});

describe('HtmlCache.getOrFetch() — resilience', () => {
  it('corrupt meta.json → treats as miss and re-fetches (stale recovery)', async () => {
    const cache = new HtmlCache(tempBase);
    const url = 'https://www.serebii.net/pokemonpokopia/quests.shtml';

    await cache.getOrFetch('serebii', url, countingFetcher(url, { called: 0 }));

    const metaPath = path.join(tempBase, 'serebii', `${keyFor(url)}.meta.json`);
    await writeFile(metaPath, '{not valid json', 'utf8');

    const counter = { called: 0 };
    const result = await cache.getOrFetch('serebii', url, countingFetcher(url, counter), 3);

    expect(counter.called).toBe(1);
    expect(result.fromCache).toBe(false);
  });

  it('URL 에 ../ 가 있어도 hash 기반 파일이 baseDir 하위에 안전하게 저장된다', async () => {
    const cache = new HtmlCache(tempBase);
    // 해시 기반 키이므로 본 URL 도 <hash>.html 한 파일로만 귀결된다.
    const url = 'https://www.serebii.net/pokemonpokopia/recipes/../../etc/passwd';
    const result = await cache.getOrFetch('serebii', url, countingFetcher(url, { called: 0 }));
    expect(result.fromCache).toBe(false);

    const storedMeta = await readFile(path.join(tempBase, 'serebii', `${keyFor(url)}.meta.json`), 'utf8');
    const parsed: unknown = JSON.parse(storedMeta);
    expect(typeof parsed).toBe('object');
  });
});

describe('HtmlCache.getOrFetch() — sensitive header filtering', () => {
  /** 민감 헤더가 섞인 응답을 한 번에 구성해서 넘기기 위한 helper. */
  function makeFetchedWithSensitiveHeaders(url: string): FetchResult {
    return {
      html: SAMPLE_HTML,
      status: 200,
      url,
      headers: {
        'content-type': 'text/html',
        'set-cookie': 'session=abc',
        cookie: 'foo=bar',
        authorization: 'Bearer secret',
      },
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      contentHash: SAMPLE_HASH,
    };
  }

  it('strips cookie/set-cookie/authorization from meta', async () => {
    const cache = new HtmlCache(tempBase);
    const url = 'https://www.serebii.net/pokemonpokopia/legendary.shtml';

    await cache.getOrFetch('serebii', url, () => Promise.resolve(makeFetchedWithSensitiveHeaders(url)));

    const metaPath = path.join(tempBase, 'serebii', `${keyFor(url)}.meta.json`);
    const meta = JSON.parse(await readFile(metaPath, 'utf8')) as { headers: Record<string, string> };

    expect(meta.headers['content-type']).toBe('text/html');
    expect(meta.headers['set-cookie']).toBeUndefined();
    expect(meta.headers['cookie']).toBeUndefined();
    expect(meta.headers['authorization']).toBeUndefined();
  });
});

describe('HtmlCache.isExpired()', () => {
  it('returns true when age exceeds ttlDays', () => {
    const cache = new HtmlCache(tempBase);
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const result: FetchResult = {
      ...makeFetched('https://example.com/a'),
      fetchedAt: fourDaysAgo,
    };
    expect(cache.isExpired(result, 3)).toBe(true);
  });

  it('returns false when within ttlDays', () => {
    const cache = new HtmlCache(tempBase);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result: FetchResult = {
      ...makeFetched('https://example.com/b'),
      fetchedAt: oneHourAgo,
    };
    expect(cache.isExpired(result, 3)).toBe(false);
  });
});
