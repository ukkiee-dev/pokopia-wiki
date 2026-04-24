/**
 * LocationDetailParser 회귀 테스트 (Phase 8 단계 3b — TDD).
 *
 * fixture: `__fixtures__/location-<slug>.html` × 5
 *   (scripts/capture-fixture.ts 로 2026-04-25T수집, status 200 × 5)
 *
 * 본 파서의 범위 — 상세 페이지에서 **descriptionEn 만** 추출해 기존 Location
 * 엔티티를 보강. 재료/아이템/포켓몬 목록은 단계 4 이후(ItemLocation 관계)에서
 * 별도 파서가 처리한다.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LocationDetailParser } from './location-detail.js';

const FIXTURE_DIR = path.resolve(import.meta.dirname, '__fixtures__');
const FIXED_SCRAPED_AT = '2026-04-25T00:00:00.000Z';
const BASE_URL = 'https://www.serebii.net/pokemonpokopia/locations';

type FixtureDef = {
  slug: string;
  nameEn: string;
  url: string;
  /** descriptionEn 에 반드시 포함되어야 하는 특징적 단어(공백·대소문자 무시 X). */
  descriptionMarkers: string[];
};

const FIXTURES: readonly FixtureDef[] = [
  {
    slug: 'witheredwastelands',
    nameEn: 'Withered Wastelands',
    url: `${BASE_URL}/witheredwastelands.shtml`,
    descriptionMarkers: ['Fuchsia City', 'rain'],
  },
  {
    slug: 'bleakbeach',
    nameEn: 'Bleak Beach',
    url: `${BASE_URL}/bleakbeach.shtml`,
    descriptionMarkers: ['Vermilion City', 'darkness'],
  },
  {
    slug: 'rockyridges',
    nameEn: 'Rocky Ridges',
    url: `${BASE_URL}/rockyridges.shtml`,
    descriptionMarkers: ['Pewter City', 'ore'],
  },
  {
    slug: 'sparklingskylands',
    nameEn: 'Sparkling Skylands',
    url: `${BASE_URL}/sparklingskylands.shtml`,
    descriptionMarkers: ['Celadon', 'Silph'],
  },
  {
    slug: 'palettetown',
    nameEn: 'Palette Town',
    url: `${BASE_URL}/palettetown.shtml`,
    descriptionMarkers: ['Palette Town', 'multiplayer'],
  },
];

const parser = new LocationDetailParser();

const parsed = FIXTURES.map((f) => {
  const html = readFileSync(path.resolve(FIXTURE_DIR, `location-${f.slug}.html`), 'utf8');
  const result = parser.parse(html, { sourceUrl: f.url, scrapedAt: FIXED_SCRAPED_AT });
  return { fixture: f, result };
});

describe('LocationDetailParser — 메타', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('location-detail');
  });
});

describe('LocationDetailParser — 5 개 fixture 모두 정상 추출', () => {
  it('각 fixture 가 정확히 1 개 엔티티 + 이슈 0', () => {
    for (const { fixture, result } of parsed) {
      expect(result.entities.length, `${fixture.slug} entities`).toBe(1);
      expect(result.issues, `${fixture.slug} issues`).toEqual([]);
    }
  });

  it('각 엔티티의 slug / nameEn / type 이 fixture 기대값과 일치', () => {
    for (const { fixture, result } of parsed) {
      const entity = result.entities[0];
      expect(entity?.slug).toBe(fixture.slug);
      expect(entity?.nameEn).toBe(fixture.nameEn);
      expect(entity?.type).toBe('Main');
    }
  });

  it('각 엔티티에 descriptionEn 이 비어있지 않게 주입', () => {
    for (const { fixture, result } of parsed) {
      const entity = result.entities[0];
      expect(entity?.descriptionEn, `${fixture.slug} description`).toBeDefined();
      expect((entity?.descriptionEn ?? '').length, `${fixture.slug} description len`).toBeGreaterThan(30);
    }
  });

  it('descriptionEn 이 각 fixture 고유 키워드를 포함', () => {
    for (const { fixture, result } of parsed) {
      const desc = result.entities[0]?.descriptionEn ?? '';
      for (const marker of fixture.descriptionMarkers) {
        expect(desc, `${fixture.slug} missing marker ${marker}`).toContain(marker);
      }
    }
  });
});

describe('LocationDetailParser — SourceMetadata / 불변식', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    for (const { fixture, result } of parsed) {
      const entity = result.entities[0];
      expect(entity?.sourceSite).toBe('serebii');
      expect(entity?.sourceUrl).toBe(fixture.url);
      expect(entity?.scrapedAt).toBe(FIXED_SCRAPED_AT);
      expect(entity?.attribution).toContain('Serebii.net');
    }
  });

  it('상세 파서는 imageUrl 을 주입하지 않음 (루트 파서 책임)', () => {
    for (const { result } of parsed) {
      expect(result.entities[0]?.imageUrl).toBeUndefined();
    }
  });

  it('상세 파서는 parentSlug 를 주입하지 않음 (Main 지역은 부모 없음)', () => {
    for (const { result } of parsed) {
      expect(result.entities[0]?.parentSlug).toBeUndefined();
    }
  });
});

describe('LocationDetailParser — 엣지', () => {
  it('잘못된 URL (locations 경로 아님) — unexpected-structure 이슈', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: 'https://example.com/foo/bar.shtml',
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
    expect(result.issues[0]?.kind).toBe('unexpected-structure');
  });

  it('h1 없는 HTML — missing-section 이슈', () => {
    const result = parser.parse('<html><body><p>no header</p></body></html>', {
      sourceUrl: `${BASE_URL}/witheredwastelands.shtml`,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.kind).toBe('missing-section');
  });

  it('scrapedAt 미지정 시 호출 시점 UTC ISO 문자열 생성', () => {
    const minimalHtml = `
      <div>
        <h1>Test Area</h1>
        <p>A short area description.</p>
        <h2>Section</h2>
      </div>
    `;
    const before = Date.now();
    const result = parser.parse(minimalHtml, { sourceUrl: `${BASE_URL}/bleakbeach.shtml` });
    const after = Date.now();

    expect(result.entities.length).toBe(1);
    const entity = result.entities[0];
    if (!entity) return;
    const scrapedMs = new Date(entity.scrapedAt).getTime();
    expect(scrapedMs).toBeGreaterThanOrEqual(before);
    expect(scrapedMs).toBeLessThanOrEqual(after);
  });
});
