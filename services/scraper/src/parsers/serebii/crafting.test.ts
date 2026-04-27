/**
 * CraftingParser 회귀 테스트 (Phase 8 단계 8 — TDD).
 *
 * fixture: `__fixtures__/crafting.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25T status 200, 506KB)
 *
 * fixture 기준 515 crafting recipe + 총 822 ingredient (평균 1.6/레시피).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CraftingParser } from './crafting.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/crafting.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/crafting.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T02:50:00.000Z';

const parser = new CraftingParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('CraftingParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('crafting');
  });

  it('fixture 기준 정확 515 개 crafting recipe', () => {
    expect(entities.length).toBe(515);
  });

  it('총 재료 개수 822 (평균 ~1.6/레시피)', () => {
    const total = entities.reduce((a, e) => a + e.ingredients.length, 0);
    expect(total).toBe(822);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });

  it('모든 레시피에 최소 1 개 이상 재료 (0 재료 레시피 없음)', () => {
    expect(entities.every((e) => e.ingredients.length >= 1)).toBe(true);
  });
});

describe('CraftingParser — 대표 엔티티 필드', () => {
  it('Storage Box — 첫 Furniture 레시피, Register 6 Pokémon unlock', () => {
    const box = entities.find((e) => e.resultItemSlug === 'storagebox');
    expect(box?.resultItemNameEn).toBe('Storage Box');
    expect(box?.unlockMethod).toContain('Register 6');
    expect(box?.ingredients).toEqual([
      { itemSlug: 'lumber', itemNameEn: 'Lumber', quantity: 1 },
    ]);
  });

  it('Plain chest — 2 재료 조합', () => {
    const chest = entities.find((e) => e.resultItemSlug === 'plainchest');
    expect(chest?.ingredients.length).toBe(2);
    expect(chest?.ingredients.map((i) => i.itemSlug).toSorted()).toEqual(['lumber', 'twine']);
  });

  it('Gaming fridge — 3 재료 조합 (pokemetal + goldingot + glass)', () => {
    const fridge = entities.find((e) => e.resultItemSlug === 'gamingfridge');
    expect(fridge?.ingredients.length).toBe(3);
    const slugs = fridge?.ingredients.map((i) => i.itemSlug).toSorted();
    expect(slugs).toEqual(['glass', 'goldingot', 'pokemetal']);
  });
});

describe('CraftingParser — 구조 검증', () => {
  it('모든 ingredient 의 quantity >= 1', () => {
    const flatIngredients = entities.flatMap((e) => e.ingredients);
    expect(flatIngredients.every((i) => i.quantity >= 1)).toBe(true);
  });

  it('모든 resultItemSlug 이 소문자 영숫자', () => {
    expect(entities.every((e) => /^[a-z0-9]+$/.test(e.resultItemSlug))).toBe(true);
  });

  it('모든 ingredient.itemSlug 이 소문자 영숫자', () => {
    const flatIngredients = entities.flatMap((e) => e.ingredients);
    expect(flatIngredients.every((i) => /^[a-z0-9]+$/.test(i.itemSlug))).toBe(true);
  });

  it('resultItemSlug 고유성 — 일부 중복 가능 (같은 아이템 다중 unlock 경로)', () => {
    // 고유성 강제는 아니지만 중복이 있는지 기록용
    const slugs = entities.map((e) => e.resultItemSlug);
    const unique = new Set(slugs);
    // 중복이 있으면 unique < total. 기록만 — 실제 값은 실측 의존
    expect(unique.size).toBeLessThanOrEqual(slugs.length);
  });

  it('unlockMethod 비어있지 않음', () => {
    expect(entities.every((e) => e.unlockMethod.length > 0)).toBe(true);
  });
});

describe('CraftingParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
    expect(entities.every((e) => e.attribution.includes('Serebii.net'))).toBe(true);
  });
});

describe('CraftingParser — 엣지', () => {
  it('빈 HTML — missing-section 이슈 + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.kind).toBe('missing-section');
  });

  it('scrapedAt 미지정 시 호출 시점 UTC ISO 문자열 생성', () => {
    const minimalHtml = `
      <h2><a name="furniture"></a>List of Furniture</h2>
      <table class="dextable">
        <tr>
          <td class="fooevo">Picture</td><td class="fooevo">Name</td>
          <td class="fooevo">Locations</td><td class="fooevo">Requirements</td>
        </tr>
        <tr>
          <td class="cen"><a href="items/test.shtml"><img alt="Test"/></a></td>
          <td class="cen"><a href="items/test.shtml">Test</a></td>
          <td class="fooinfo">Default</td>
          <td class="fooinfo"><table><tr>
            <td><a href="items/wood.shtml"><img alt="Wood"/></a></td>
            <td><a href="items/wood.shtml"><u>Wood</u></a> * 2</td>
          </tr></table></td>
        </tr>
      </table>
    `;
    const before = Date.now();
    const result = parser.parse(minimalHtml, { sourceUrl: FIXTURE_URL });
    const after = Date.now();

    expect(result.entities.length).toBe(1);
    const entity = result.entities[0];
    if (!entity) return;
    expect(entity.ingredients[0]?.quantity).toBe(2);
    const scrapedMs = new Date(entity.scrapedAt).getTime();
    expect(scrapedMs).toBeGreaterThanOrEqual(before);
    expect(scrapedMs).toBeLessThanOrEqual(after);
  });
});
