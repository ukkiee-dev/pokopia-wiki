/**
 * LocationsIndexParser 회귀 테스트 (Phase 8 단계 3a — TDD).
 *
 * fixture: `__fixtures__/locations-index.html`
 *   (scripts/capture-fixture.ts 로 2026-04-24T22:13Z status 200 수집)
 *
 * fixture 기준 6 개 location 관측 (Main 5 + Cloud Island 1). Dream Island 는
 * 본 페이지에 나오지 않으며 별도 `/dreamislands.shtml` 파서에서 등록 예정.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LocationsIndexParser } from './locations-index.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/locations-index.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/locations.shtml';
const FIXED_SCRAPED_AT = '2026-04-24T22:13:00.000Z';

const parser = new LocationsIndexParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('LocationsIndexParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('locations-index');
  });

  it('fixture 기준 정확 6 개 엔티티 추출 (Main 5 + Cloud Island 1)', () => {
    expect(entities.length).toBe(6);
  });

  it('구조적 파싱 이슈 0 건 (깨끗한 파싱)', () => {
    expect(issues).toEqual([]);
  });
});

describe('LocationsIndexParser — 대표 엔티티 필드', () => {
  it('Withered Wastelands — 첫 Main 지역', () => {
    const first = entities[0];
    expect(first?.slug).toBe('witheredwastelands');
    expect(first?.nameEn).toBe('Withered Wastelands');
    expect(first?.type).toBe('Main');
    expect(first?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/locations/witheredwastelandsth.jpg',
    );
    expect(first?.descriptionEn).toBeUndefined();
    expect(first?.parentSlug).toBeUndefined();
  });

  it('Cloud Island — Main 이 아닌 Cloud Island 타입', () => {
    const cloud = entities.find((e) => e.slug === 'cloudisland');
    expect(cloud?.nameEn).toBe('Cloud Island');
    expect(cloud?.type).toBe('Cloud Island');
    expect(cloud?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/locations/cloudislandth.jpg',
    );
  });

  it('Palette Town — 마지막 Main 지역, 복합 단어 nameEn', () => {
    const palette = entities.find((e) => e.slug === 'palettetown');
    expect(palette?.nameEn).toBe('Palette Town');
    expect(palette?.type).toBe('Main');
  });
});

describe('LocationsIndexParser — 타입 분포 / 불변식', () => {
  it('정확히 5 개 Main + 1 개 Cloud Island', () => {
    const byType = entities.reduce<Record<string, number>>((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1;
      return acc;
    }, {});
    expect(byType['Main']).toBe(5);
    expect(byType['Cloud Island']).toBe(1);
    expect(byType['Sub']).toBeUndefined();
    expect(byType['Dream Island']).toBeUndefined();
  });

  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
    expect(entities.every((e) => e.attribution.includes('Serebii.net'))).toBe(true);
  });

  it('모든 slug 고유 + 소문자 + 공백 없음', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((s) => s === s.toLowerCase())).toBe(true);
    expect(slugs.every((s) => !s.includes(' '))).toBe(true);
  });

  it('모든 imageUrl 이 Serebii 절대 URL + th.jpg 썸네일', () => {
    expect(entities.every((e) => (e.imageUrl ?? '').startsWith('https://www.serebii.net/'))).toBe(
      true,
    );
    expect(entities.every((e) => (e.imageUrl ?? '').endsWith('th.jpg'))).toBe(true);
  });

  it('모든 엔티티에 descriptionEn 없음 (루트 페이지는 설명 컬럼이 없음)', () => {
    expect(entities.every((e) => e.descriptionEn === undefined)).toBe(true);
  });

  it('모든 엔티티에 parentSlug 없음 (루트 페이지는 최상위 지역만)', () => {
    expect(entities.every((e) => e.parentSlug === undefined)).toBe(true);
  });
});

describe('LocationsIndexParser — 엣지', () => {
  it('빈 HTML — missing-section 이슈 1 건 + entities 0', () => {
    const result = parser.parse('<!doctype html><html><body></body></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.kind).toBe('missing-section');
  });

  it('scrapedAt 미지정 시 호출 시점 UTC ISO 문자열 생성', () => {
    const minimalHtml = `
      <table class="dextable">
        <tr>
          <td class="fooevo">Picture</td>
          <td class="fooevo">Name</td>
        </tr>
        <tr>
          <td class="cen"><a href="locations/bleakbeach.shtml"><img src="locations/bleakbeachth.jpg" alt="Bleak Beach" /></a></td>
          <td class="fooinfo"><a><u>Bleak Beach</u></a></td>
        </tr>
      </table>
    `;
    const before = Date.now();
    const result = parser.parse(minimalHtml, { sourceUrl: FIXTURE_URL });
    const after = Date.now();

    expect(result.entities.length).toBe(1);
    const first = result.entities[0];
    if (!first) return;
    const scrapedMs = new Date(first.scrapedAt).getTime();
    expect(scrapedMs).toBeGreaterThanOrEqual(before);
    expect(scrapedMs).toBeLessThanOrEqual(after);
  });
});
