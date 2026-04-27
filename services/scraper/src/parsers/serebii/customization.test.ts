/**
 * CustomizationParser 회귀 테스트 (Phase 8 단계 30 — TDD).
 *
 * fixture: `__fixtures__/customisation.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 128KB)
 *
 * fixture 기준 177 customization_item:
 *   - Outfit 22 / Hair 15 / Top 36 / Pants 36 / Hat 22 / Bag 18 / Shoes 28
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CustomizationParser } from './customization.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/customisation.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/customisation.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new CustomizationParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('CustomizationParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('customisation');
  });

  it('정확 177 customization_item', () => {
    expect(entities.length).toBe(177);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });

  it('카테고리별 분포: Outfit 22 / Hair 15 / Top 36 / Pants 36 / Hat 22 / Bag 18 / Shoes 28', () => {
    expect(entities.filter((e) => e.category === 'Outfit').length).toBe(22);
    expect(entities.filter((e) => e.category === 'Hair').length).toBe(15);
    expect(entities.filter((e) => e.category === 'Top').length).toBe(36);
    expect(entities.filter((e) => e.category === 'Pants').length).toBe(36);
    expect(entities.filter((e) => e.category === 'Hat').length).toBe(22);
    expect(entities.filter((e) => e.category === 'Bag').length).toBe(18);
    expect(entities.filter((e) => e.category === 'Shoes').length).toBe(28);
  });
});

describe('CustomizationParser — 대표 엔티티', () => {
  it('Familiar Outfit 1 — Outfit, slug=customization-outfit-1, Beginning', () => {
    const e = entities.find((x) => x.slug === 'customization-outfit-1');
    expect(e?.category).toBe('Outfit');
    expect(e?.nameEn).toBe('Familiar Outfit 1');
    expect(e?.unlockMethodEn).toBe('Beginning');
    expect(e?.unlockLocationSlug).toBeUndefined(); // "Beginning" 은 location 키워드 아님
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/custom/th/1.jpg',
    );
  });

  it('Team Rocket Outfit — Outfit 3, Sparkling Skylands 매칭', () => {
    const e = entities.find((x) => x.slug === 'customization-outfit-3');
    expect(e?.nameEn).toBe('Team Rocket Outfit');
    expect(e?.unlockMethodEn).toBe('Sparkling Skylands - Northwest Island');
    expect(e?.unlockLocationSlug).toBe('sparklingskylands');
  });
});

describe('CustomizationParser — 구조 불변식', () => {
  it('모든 slug 이 customization- 접두사', () => {
    expect(entities.every((e) => e.slug.startsWith('customization-'))).toBe(true);
  });

  it('slug 177 개 모두 unique (category + imageId 조합)', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 category 가 SCHEMA ENUM 7 종 중 하나', () => {
    const validCategories = new Set([
      'Hair',
      'Outfit',
      'Top',
      'Pants',
      'Hat',
      'Bag',
      'Shoes',
    ]);
    expect(entities.every((e) => validCategories.has(e.category))).toBe(true);
  });

  it('모든 nameEn / unlockMethodEn 비어있지 않음', () => {
    expect(entities.every((e) => e.nameEn.length > 0)).toBe(true);
    expect(entities.every((e) => e.unlockMethodEn.length > 0)).toBe(true);
  });

  it('모든 imageUrl 이 custom/th/ 절대 URL', () => {
    expect(
      entities.every(
        (e) =>
          e.imageUrl !== undefined &&
          e.imageUrl.startsWith('https://www.serebii.net/pokemonpokopia/custom/th/'),
      ),
    ).toBe(true);
  });
});

describe('CustomizationParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('CustomizationParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
