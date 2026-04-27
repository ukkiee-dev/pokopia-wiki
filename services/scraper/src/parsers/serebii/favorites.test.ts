/**
 * FavoritesParser 회귀 테스트 (Phase 8 단계 7 — TDD).
 *
 * fixture: `__fixtures__/favorites.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25T status 200, 46KB 수집)
 *
 * fixture 기준 43 favorite category. `Quantity of Items` 컬럼은 모두 "TBD" 라
 * 본 파서가 무시(카테고리 이름만 추출).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FavoritesParser } from './favorites.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/favorites.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/favorites.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T02:40:00.000Z';

const parser = new FavoritesParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('FavoritesParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('favorites');
  });

  it('fixture 기준 정확 43 개 favorite category', () => {
    expect(entities.length).toBe(43);
  });

  it('구조적 파싱 이슈 0 건 (빈 slug 행은 regex로 자동 스킵)', () => {
    expect(issues).toEqual([]);
  });
});

describe('FavoritesParser — 대표 엔티티 필드', () => {
  it('Blocky stuff — 첫 카테고리', () => {
    const first = entities[0];
    expect(first?.slug).toBe('blockystuff');
    expect(first?.nameEn).toBe('Blocky stuff');
  });

  it('Wooden stuff — 마지막 실제 데이터 카테고리 (빈 slug 행 앞)', () => {
    const last = entities.at(-1);
    expect(last?.slug).toBe('woodenstuff');
    expect(last?.nameEn).toBe('Wooden stuff');
  });

  it('중간 샘플 — Cleanliness / Electronics / Pretty flowers', () => {
    const cleanliness = entities.find((e) => e.slug === 'cleanliness');
    expect(cleanliness?.nameEn).toBe('Cleanliness');
    const electronics = entities.find((e) => e.slug === 'electronics');
    expect(electronics?.nameEn).toBe('Electronics');
    const pretty = entities.find((e) => e.slug === 'prettyflowers');
    expect(pretty?.nameEn).toBe('Pretty flowers');
  });
});

describe('FavoritesParser — SourceMetadata / 불변식', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
    expect(entities.every((e) => e.attribution.includes('Serebii.net'))).toBe(true);
  });

  it('모든 slug 고유 + 소문자', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((s) => s === s.toLowerCase())).toBe(true);
  });

  it('모든 descriptionEn 은 undefined (루트 페이지에 설명 없음)', () => {
    expect(entities.every((e) => e.descriptionEn === undefined)).toBe(true);
  });
});

describe('FavoritesParser — 엣지', () => {
  it('빈 HTML — missing-section 이슈 1 건 + entities 0', () => {
    const result = parser.parse('<!doctype html><html><body></body></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.kind).toBe('missing-section');
  });

  it('빈 slug href (/favorites/.shtml) 는 이슈 없이 스킵', () => {
    const minimalHtml = `
      <table class="dextable">
        <tr><td class="fooevo">Favorites</td><td class="fooevo">Quantity of Items</td></tr>
        <tr><td class="fooinfo"><a href="/pokemonpokopia/favorites/.shtml"><u></u></a></td><td class="cen">TBD</td></tr>
      </table>
    `;
    const result = parser.parse(minimalHtml, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    // 빈 slug 는 스킵되어 엔티티 0, 그 결과 missing-section 1 건만
    expect(result.entities).toEqual([]);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.kind).toBe('missing-section');
  });

  it('scrapedAt 미지정 시 호출 시점 UTC ISO 문자열 생성', () => {
    const minimalHtml = `
      <table class="dextable">
        <tr><td class="fooevo">Favorites</td><td class="fooevo">Quantity</td></tr>
        <tr><td class="fooinfo"><a href="/pokemonpokopia/favorites/blockystuff.shtml"><u>Blocky stuff</u></a></td><td class="cen">TBD</td></tr>
      </table>
    `;
    const before = Date.now();
    const result = parser.parse(minimalHtml, { sourceUrl: FIXTURE_URL });
    const after = Date.now();

    expect(result.entities.length).toBe(1);
    const entity = result.entities[0];
    if (!entity) return;
    const scrapedMs = new Date(entity.scrapedAt).getTime();
    expect(scrapedMs).toBeGreaterThanOrEqual(before);
    expect(scrapedMs).toBeLessThanOrEqual(after);
  });
});
