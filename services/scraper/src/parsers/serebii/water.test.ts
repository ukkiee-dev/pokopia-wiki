/**
 * WaterParser 회귀 테스트 (Phase 8 단계 15 — TDD).
 *
 * fixture: `__fixtures__/water.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 50KB)
 *
 * fixture 기준 5 water_type:
 *   - Water (hydrates=true, source=Fresh Water)
 *   - Ocean Water (hydrates=true, source=Soda Pop)
 *   - Muddy Water (hydrates=false, source=Moomoo Milk Coffee)
 *   - Hot Spring Water (hydrates=true, source=Roserade Tea)
 *   - Lava (hydrates=false, source=Chili Sauce)
 *
 * SCHEMA non-null 필드 spreadRadius/trenchDistance 는 페이지 산문에만 명시되어
 * 본 파서 출력에 미포함 (loader 보강 영역).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WaterParser } from './water.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/water.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/water.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new WaterParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('WaterParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('water');
  });

  it('fixture 기준 정확 5 water_type', () => {
    expect(entities.length).toBe(5);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('WaterParser — 대표 엔티티', () => {
  it('Water — slug=water, hydrates=true, source=Fresh Water', () => {
    const e = entities.find((x) => x.slug === 'water');
    expect(e?.nameEn).toBe('Water');
    expect(e?.descriptionEn).toContain('Standard water');
    expect(e?.hydrates).toBe(true);
    expect(e?.sourceItemSlug).toBe('freshwater');
    expect(e?.sourceItemNameEn).toBe('Fresh Water');
    expect(e?.imageUrl).toBe('https://www.serebii.net/pokemonpokopia/items/water.png');
  });

  it('Ocean Water — slug=ocean-water, hydrates=true (명시 없음 = true)', () => {
    const e = entities.find((x) => x.slug === 'ocean-water');
    expect(e?.nameEn).toBe('Ocean Water');
    expect(e?.hydrates).toBe(true);
    expect(e?.sourceItemSlug).toBe('sodapop');
  });

  it('Muddy Water — descriptionEn "Does not hydrate" → hydrates=false', () => {
    const e = entities.find((x) => x.slug === 'muddy-water');
    expect(e?.nameEn).toBe('Muddy Water');
    expect(e?.descriptionEn).toContain('Does not hydrate');
    expect(e?.hydrates).toBe(false);
  });

  it('Hot Spring Water — hydrates=true, slug 다중 공백 처리', () => {
    const e = entities.find((x) => x.slug === 'hot-spring-water');
    expect(e?.nameEn).toBe('Hot Spring Water');
    expect(e?.hydrates).toBe(true);
  });

  it('Lava — slug=lava, hydrates=false', () => {
    const e = entities.find((x) => x.slug === 'lava');
    expect(e?.nameEn).toBe('Lava');
    expect(e?.descriptionEn).toContain('Does not hydrate');
    expect(e?.hydrates).toBe(false);
    expect(e?.sourceItemSlug).toBe('chilisauce');
  });
});

describe('WaterParser — 구조 불변식', () => {
  it('모든 slug 이 소문자 영숫자/하이픈', () => {
    expect(entities.every((e) => /^[a-z0-9-]+$/.test(e.slug))).toBe(true);
  });

  it('slug 5 개 모두 unique', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('spreadRadius/trenchDistance 는 row-level 추출 불가 → 모두 undefined', () => {
    expect(entities.every((e) => e.spreadRadius === undefined)).toBe(true);
    expect(entities.every((e) => e.trenchDistance === undefined)).toBe(true);
  });

  it('모든 imageUrl 이 items/ 절대 URL', () => {
    expect(
      entities.every(
        (e) =>
          e.imageUrl !== undefined &&
          e.imageUrl.startsWith('https://www.serebii.net/pokemonpokopia/items/'),
      ),
    ).toBe(true);
  });
});

describe('WaterParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('WaterParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
