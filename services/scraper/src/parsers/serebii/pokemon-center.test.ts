/**
 * PokemonCenterParser 회귀 테스트 (Phase 8 단계 17 — TDD).
 *
 * fixture: `__fixtures__/pokemon-center.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 42KB)
 *
 * fixture 기준 4 pokemon_center (Withered Wastelands / Bleak Beach / Rocky Ridges
 * / Sparkling Skylands). Palette Town · Cloud Island 는 Pokémon Center 가 없거나
 * 별도 단계.
 *
 * 페이지 산문 "Environment Level 3" 에서 requiredEnvLevel=3 추출 (모든 area 동일).
 * Pokémon Required = 8 (모든 area 동일).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PokemonCenterParser } from './pokemon-center.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/pokemon-center.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/pokemoncenter.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new PokemonCenterParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('PokemonCenterParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('pokemon-center');
  });

  it('fixture 기준 정확 4 pokemon_center', () => {
    expect(entities.length).toBe(4);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('PokemonCenterParser — 대표 엔티티', () => {
  it('Withered Wastelands — 4 materials (Lumber/Stones/Leaves/Vines)', () => {
    const e = entities.find((x) => x.locationSlug === 'witheredwastelands');
    expect(e?.slug).toBe('pokemon-center-witheredwastelands');
    expect(e?.locationNameEn).toBe('Withered Wastelands');
    expect(e?.requiredEnvLevel).toBe(3);
    expect(e?.requiredPokemonCount).toBe(8);
    expect(e?.materials).toEqual([
      { itemNameEn: 'Lumber', quantity: 10 },
      { itemNameEn: 'Stones', quantity: 20 },
      { itemNameEn: 'Leaves', quantity: 10 },
      { itemNameEn: 'Vines', quantity: 10 },
    ]);
  });

  it('Bleak Beach — 4 materials (Twine/Bricks/Sea Glass/Iron Ore)', () => {
    const e = entities.find((x) => x.locationSlug === 'bleakbeach');
    expect(e?.locationNameEn).toBe('Bleak Beach');
    expect(e?.materials).toEqual([
      { itemNameEn: 'Twine', quantity: 10 },
      { itemNameEn: 'Bricks', quantity: 30 },
      { itemNameEn: 'Sea Glass', quantity: 10 },
      { itemNameEn: 'Iron Ore', quantity: 5 },
    ]);
  });

  it('Rocky Ridges — Crystal Fragments 5 포함', () => {
    const e = entities.find((x) => x.locationSlug === 'rockyridges');
    expect(e?.locationNameEn).toBe('Rocky Ridges');
    expect(e?.materials).toContainEqual({ itemNameEn: 'Crystal Fragments', quantity: 5 });
  });

  it('Sparkling Skylands — 4 materials 모두 25', () => {
    const e = entities.find((x) => x.locationSlug === 'sparklingskylands');
    expect(e?.locationNameEn).toBe('Sparkling Skylands');
    expect(e?.materials.every((m) => m.quantity === 25)).toBe(true);
    expect(e?.materials.length).toBe(4);
  });
});

describe('PokemonCenterParser — 구조 불변식', () => {
  it('모든 slug 이 pokemon-center- 접두사 + locationSlug 형식', () => {
    expect(
      entities.every((e) => e.slug === `pokemon-center-${e.locationSlug}`),
    ).toBe(true);
  });

  it('slug 4 개 모두 unique', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 requiredEnvLevel = 3 (페이지 prose 동일)', () => {
    expect(entities.every((e) => e.requiredEnvLevel === 3)).toBe(true);
  });

  it('모든 requiredPokemonCount = 8', () => {
    expect(entities.every((e) => e.requiredPokemonCount === 8)).toBe(true);
  });

  it('모든 center 가 4 개 material 보유', () => {
    expect(entities.every((e) => e.materials.length === 4)).toBe(true);
  });
});

describe('PokemonCenterParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('PokemonCenterParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
