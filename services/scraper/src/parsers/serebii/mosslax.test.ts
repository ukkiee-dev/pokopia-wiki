/**
 * MosslaxParser 회귀 테스트 (Phase 8 단계 19 — TDD).
 *
 * fixture: `__fixtures__/mosslaxboosts.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 41KB)
 *
 * fixture 기준 5 flavor × 3 level = 15 mosslax_boost (Cartesian 합성):
 *   - flavor: Bitter / Dry / Sour / Spicy / Sweet (Generic Flavor Meals 는 ENUM 에 없어 배제)
 *   - level: 1 (Weakest) / 2 (Standard) / 3 (Strongest)
 *   - effectEn: flavor 별 동일 (level 과 무관)
 *   - foodGroupEn: level 별 음식 그룹 ` / ` join
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MosslaxParser } from './mosslax.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/mosslaxboosts.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/mosslaxboosts.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new MosslaxParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('MosslaxParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('mosslaxboosts');
  });

  it('Cartesian 5 flavor × 3 level = 정확 15 mosslax_boost', () => {
    expect(entities.length).toBe(15);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });

  it('5 flavor 모두 등장 + Generic Flavor Meals 배제', () => {
    const flavors = new Set(entities.map((e) => e.flavor));
    expect(flavors).toEqual(new Set(['Bitter', 'Dry', 'Sour', 'Spicy', 'Sweet']));
  });

  it('3 level 모두 등장 (각 5 행씩)', () => {
    for (const level of [1, 2, 3]) {
      expect(entities.filter((e) => e.level === level).length).toBe(5);
    }
  });
});

describe('MosslaxParser — 대표 엔티티', () => {
  it('Bitter Lv.1 — Weakest, foodGroup 베리/드링크/베지터블', () => {
    const e = entities.find((x) => x.slug === 'mosslax-bitter-lv1');
    expect(e?.flavor).toBe('Bitter');
    expect(e?.level).toBe(1);
    expect(e?.effectEn).toBe('Increased chance of finding rare items');
    expect(e?.foodGroupEn).toBe('Berries / Drinks / Vegetables');
  });

  it('Bitter Lv.3 — Strongest, 다른 foodGroup, 같은 effect', () => {
    const e = entities.find((x) => x.slug === 'mosslax-bitter-lv3');
    expect(e?.level).toBe(3);
    expect(e?.effectEn).toBe('Increased chance of finding rare items');
    expect(e?.foodGroupEn).toContain('Vibrant hamburger steak');
  });

  it('Dry Lv.2 — Standard food group + Lugia/Ho-Oh 효과', () => {
    const e = entities.find((x) => x.slug === 'mosslax-dry-lv2');
    expect(e?.flavor).toBe('Dry');
    expect(e?.level).toBe(2);
    expect(e?.effectEn).toContain('Lugia');
    expect(e?.foodGroupEn).toContain('Simple Salad');
  });

  it('Sweet Lv.1 — Ancient Artefacts 효과', () => {
    const e = entities.find((x) => x.slug === 'mosslax-sweet-lv1');
    expect(e?.flavor).toBe('Sweet');
    expect(e?.effectEn).toBe('Increased chance of Ancient Artefacts');
  });
});

describe('MosslaxParser — 구조 불변식', () => {
  it('모든 slug 이 mosslax-<flavor>-lv<level> 형식', () => {
    expect(
      entities.every(
        (e) => e.slug === `mosslax-${e.flavor.toLowerCase()}-lv${e.level}`,
      ),
    ).toBe(true);
  });

  it('slug 15 개 모두 unique', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('동일 flavor 는 3 level 이 같은 effectEn 공유', () => {
    for (const flavor of ['Bitter', 'Dry', 'Sour', 'Spicy', 'Sweet'] as const) {
      const effects = entities
        .filter((e) => e.flavor === flavor)
        .map((e) => e.effectEn);
      expect(new Set(effects).size).toBe(1);
    }
  });

  it('동일 level 는 5 flavor 가 같은 foodGroupEn 공유', () => {
    for (const level of [1, 2, 3]) {
      const groups = entities
        .filter((e) => e.level === level)
        .map((e) => e.foodGroupEn);
      expect(new Set(groups).size).toBe(1);
    }
  });
});

describe('MosslaxParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('MosslaxParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });

  it('Effect Strength 표만 있고 List of Boosts 없음 — missing-section', () => {
    const html = `<!doctype html><html><body>
      <table class="dextable">
        <tr><td class="fooevo">Effect Strength</td><td class="fooevo">Food Items</td></tr>
        <tr><td class="fooinfo">Weakest</td><td class="fooinfo">Berries</td></tr>
      </table>
    </body></html>`;
    const result = parser.parse(html, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
