/**
 * CookingParser 회귀 테스트 (Phase 8 단계 9 — TDD).
 *
 * fixture: `__fixtures__/cooking.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25T status 200, 55KB)
 *
 * fixture 기준 24 recipe (Salad/Soup/Bread/Steak 각 6 개). 6 개 specialty 보너스 보유.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CookingParser } from './cooking.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/cooking.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/cooking.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new CookingParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('CookingParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('cooking');
  });

  it('fixture 기준 정확 24 recipe (4 카테고리 × 6)', () => {
    expect(entities.length).toBe(24);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('CookingParser — 카테고리 분포', () => {
  it.each([
    ['Salad', 6],
    ['Soup', 6],
    ['Bread', 6],
    ['Steak', 6],
  ] as const)('카테고리 %s 는 정확 %d 개', (category, count) => {
    expect(entities.filter((e) => e.mealCategory === category).length).toBe(count);
  });
});

describe('CookingParser — 대표 엔티티 필드', () => {
  it('Simple salad — Salad 카테고리, main=Leaf, secondary 없음, specialty 없음', () => {
    const salad = entities.find((e) => e.resultItemSlug === 'simplesalad');
    expect(salad?.resultItemNameEn).toBe('Simple salad');
    expect(salad?.mealCategory).toBe('Salad');
    expect(salad?.ingredients).toEqual([
      { itemSlug: 'leaf', itemNameEn: 'Leaf', quantity: 1, role: 'main' },
    ]);
    expect(salad?.bonusSpecialtyNameEn).toBeUndefined();
  });

  it('Leppa salad — main=Leaf + secondary=Leppa Berry, specialty 없음', () => {
    const leppa = entities.find((e) => e.resultItemSlug === 'leppasalad');
    expect(leppa?.mealCategory).toBe('Salad');
    const slugs = leppa?.ingredients.map((i) => i.itemSlug);
    expect(slugs).toEqual(['leaf', 'leppaberry']);
    const roles = leppa?.ingredients.map((i) => i.role);
    expect(roles).toEqual(['main', 'sub']);
  });

  it('Shredded salad — specialty 보너스 Chop', () => {
    const shredded = entities.find((e) => e.resultItemSlug === 'shreddedsalad');
    expect(shredded?.bonusSpecialtyNameEn).toBe('Chop');
  });

  it('Crushed-berry salad — specialty 보너스 Crush + secondary=Chesto Berry', () => {
    const crushed = entities.find((e) => e.resultItemSlug === 'crushed-berrysalad');
    expect(crushed?.bonusSpecialtyNameEn).toBe('Crush');
    expect(crushed?.ingredients.find((i) => i.itemSlug === 'chestoberry')?.role).toBe('sub');
  });
});

describe('CookingParser — 재료 구조 불변식', () => {
  it('모든 레시피에 main ingredient 1 개 (정확히 1)', () => {
    expect(
      entities.every((e) => e.ingredients.filter((i) => i.role === 'main').length === 1),
    ).toBe(true);
  });

  it('secondary ingredients 는 0~2 개 범위', () => {
    expect(
      entities.every((e) => {
        const subs = e.ingredients.filter((i) => i.role === 'sub').length;
        return subs >= 0 && subs <= 2;
      }),
    ).toBe(true);
  });

  it('모든 ingredient 의 itemSlug 이 소문자 영숫자/하이픈', () => {
    const flat = entities.flatMap((e) => e.ingredients);
    expect(flat.every((i) => /^[a-z0-9-]+$/.test(i.itemSlug))).toBe(true);
  });
});

describe('CookingParser — specialty 보너스', () => {
  it('specialty 보너스가 있는 레시피는 정확 6 개 (실측)', () => {
    expect(entities.filter((e) => e.bonusSpecialtyNameEn).length).toBe(6);
  });

  it('specialty 이름이 모두 비어있지 않음', () => {
    const withSpec = entities.filter((e) => e.bonusSpecialtyNameEn);
    expect(withSpec.every((e) => (e.bonusSpecialtyNameEn ?? '').length > 0)).toBe(true);
  });
});

describe('CookingParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
    expect(entities.every((e) => e.attribution.includes('Serebii.net'))).toBe(true);
  });
});

describe('CookingParser — 엣지', () => {
  it('빈 HTML — missing-section 이슈 + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.kind).toBe('missing-section');
  });
});
