/**
 * FlavorsParser 회귀 테스트 (Phase 8 단계 10 — TDD).
 *
 * fixture: `__fixtures__/flavors.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 52KB)
 *
 * fixture 기준 46 food.
 *   - No Flavor 10 / Bitter 7 / Dry 7 / Sour 7 / Spicy 7 / Sweet 8
 *   - ppRestore: little 1 / some 14 / lot 1 (총 16)
 *   - moveBoost: Leafage 6 / Water_Gun 6 / Cut 6 / Rock_Smash 6 (총 24)
 *   - neither(특수 음료/소스): 6 (Fresh Water / Curry and rice / Roserade Tea /
 *     Soda Pop / Chili sauce / Moomoo Milk Coffee)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FlavorsParser } from './flavors.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/flavors.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/flavors.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new FlavorsParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('FlavorsParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('flavors');
  });

  it('fixture 기준 정확 46 food (6 카테고리 합)', () => {
    expect(entities.length).toBe(46);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('FlavorsParser — flavor 분포', () => {
  it.each([
    ['None', 10],
    ['Bitter', 7],
    ['Dry', 7],
    ['Sour', 7],
    ['Spicy', 7],
    ['Sweet', 8],
  ] as const)('flavor %s 는 정확 %d 개', (flavor, count) => {
    expect(entities.filter((e) => e.flavor === flavor).length).toBe(count);
  });
});

describe('FlavorsParser — 대표 엔티티 필드', () => {
  it('Leppa Berry — flavor=None, ppRestore=some, moveBoost 없음', () => {
    const e = entities.find((x) => x.itemSlug === 'leppaberry');
    expect(e?.itemNameEn).toBe('Leppa Berry');
    expect(e?.flavor).toBe('None');
    expect(e?.ppRestore).toBe('some');
    expect(e?.moveBoost).toBeUndefined();
  });

  it('Simple salad — flavor=None, moveBoost=Leafage, ppRestore 없음', () => {
    const e = entities.find((x) => x.itemSlug === 'simplesalad');
    expect(e?.itemNameEn).toBe('Simple salad');
    expect(e?.flavor).toBe('None');
    expect(e?.moveBoost).toBe('Leafage');
    expect(e?.ppRestore).toBeUndefined();
  });

  it('Simple soup — moveBoost=Water_Gun', () => {
    const e = entities.find((x) => x.itemSlug === 'simplesoup');
    expect(e?.moveBoost).toBe('Water_Gun');
  });

  it('Simple bread — moveBoost=Cut', () => {
    const e = entities.find((x) => x.itemSlug === 'simplebread');
    expect(e?.moveBoost).toBe('Cut');
  });

  it('Simple hamburger steak — moveBoost=Rock_Smash', () => {
    const e = entities.find((x) => x.itemSlug === 'simplehamburgersteak');
    expect(e?.moveBoost).toBe('Rock_Smash');
  });

  it('Vibrant hamburger steak — "Rock Smash a lot" 수식어 무시하고 Rock_Smash', () => {
    const e = entities.find((x) => x.itemSlug === 'vibranthamburgersteak');
    expect(e?.moveBoost).toBe('Rock_Smash');
    expect(e?.ppRestore).toBeUndefined();
  });

  it('Bruised berry — ppRestore=little ("a bit of PP")', () => {
    const e = entities.find((x) => x.itemSlug === 'bruisedberry');
    expect(e?.flavor).toBe('None');
    expect(e?.ppRestore).toBe('little');
  });

  it('Rare Candy — flavor=Sweet, ppRestore=lot ("a lot of PP")', () => {
    const e = entities.find((x) => x.itemSlug === 'rarecandy');
    expect(e?.itemNameEn).toBe('Rare Candy');
    expect(e?.flavor).toBe('Sweet');
    expect(e?.ppRestore).toBe('lot');
  });

  it('Fluffy bread — 소문자 "cut" 표기도 Cut 으로 인식', () => {
    const e = entities.find((x) => x.itemSlug === 'fluffybread');
    expect(e?.flavor).toBe('Sweet');
    expect(e?.moveBoost).toBe('Cut');
  });

  it('Roserade Tea — Dry flavor, 특수 음료(둘 다 없음)', () => {
    const e = entities.find((x) => x.itemSlug === 'roseradetea');
    expect(e?.flavor).toBe('Dry');
    expect(e?.ppRestore).toBeUndefined();
    expect(e?.moveBoost).toBeUndefined();
  });

  it('Fresh Water — No Flavor, 둘 다 없음', () => {
    const e = entities.find((x) => x.itemSlug === 'freshwater');
    expect(e?.flavor).toBe('None');
    expect(e?.ppRestore).toBeUndefined();
    expect(e?.moveBoost).toBeUndefined();
  });

  it('Curry and rice — No Flavor, 둘 다 없음', () => {
    const e = entities.find((x) => x.itemSlug === 'curryandrice');
    expect(e?.flavor).toBe('None');
    expect(e?.ppRestore).toBeUndefined();
    expect(e?.moveBoost).toBeUndefined();
  });

  it('Soda Pop — Sour flavor, 둘 다 없음', () => {
    const e = entities.find((x) => x.itemSlug === 'sodapop');
    expect(e?.flavor).toBe('Sour');
    expect(e?.ppRestore).toBeUndefined();
    expect(e?.moveBoost).toBeUndefined();
  });
});

describe('FlavorsParser — ppRestore / moveBoost 분포', () => {
  it('ppRestore=little 은 정확 1 개 (bruisedberry)', () => {
    const matches = entities.filter((e) => e.ppRestore === 'little');
    expect(matches.length).toBe(1);
    expect(matches[0]?.itemSlug).toBe('bruisedberry');
  });

  it('ppRestore=lot 은 정확 1 개 (rarecandy)', () => {
    const matches = entities.filter((e) => e.ppRestore === 'lot');
    expect(matches.length).toBe(1);
    expect(matches[0]?.itemSlug).toBe('rarecandy');
  });

  it('ppRestore=some 은 정확 14 개', () => {
    expect(entities.filter((e) => e.ppRestore === 'some').length).toBe(14);
  });

  it.each([
    ['Leafage', 6],
    ['Water_Gun', 6],
    ['Cut', 6],
    ['Rock_Smash', 6],
  ] as const)('moveBoost %s 는 정확 %d 개', (move, count) => {
    expect(entities.filter((e) => e.moveBoost === move).length).toBe(count);
  });

  it('ppRestore 와 moveBoost 동시 보유 엔티티 0 개 (상호 배타)', () => {
    expect(
      entities.filter((e) => e.ppRestore !== undefined && e.moveBoost !== undefined).length,
    ).toBe(0);
  });

  it('둘 다 없는 특수 음식은 정확 6 개', () => {
    const specials = entities.filter(
      (e) => e.ppRestore === undefined && e.moveBoost === undefined,
    );
    expect(specials.length).toBe(6);
    const slugs = specials.map((e) => e.itemSlug).toSorted();
    expect(slugs).toEqual(
      [
        'chilisauce',
        'curryandrice',
        'freshwater',
        'moomoomilkcoffee',
        'roseradetea',
        'sodapop',
      ].toSorted(),
    );
  });
});

describe('FlavorsParser — 구조 불변식', () => {
  it('모든 itemSlug 이 소문자 영숫자/하이픈', () => {
    expect(entities.every((e) => /^[a-z0-9-]+$/.test(e.itemSlug))).toBe(true);
  });

  it('모든 itemNameEn 비어있지 않음', () => {
    expect(entities.every((e) => e.itemNameEn.length > 0)).toBe(true);
  });

  it('모든 flavor 가 ENUM 값에 포함', () => {
    const allowed = new Set(['None', 'Bitter', 'Dry', 'Sour', 'Spicy', 'Sweet']);
    expect(entities.every((e) => allowed.has(e.flavor))).toBe(true);
  });

  it('slug 중복 없음', () => {
    const slugs = entities.map((e) => e.itemSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('FlavorsParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
    expect(entities.every((e) => e.attribution.includes('Serebii.net'))).toBe(true);
  });
});

describe('FlavorsParser — 엣지', () => {
  it('빈 HTML — missing-section 이슈 + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.kind).toBe('missing-section');
  });

  it('table 은 있으나 데이터 행 없음 — missing-section', () => {
    const result = parser.parse(
      '<!doctype html><html><body><table class="dextable"></table></body></html>',
      { sourceUrl: FIXTURE_URL, scrapedAt: FIXED_SCRAPED_AT },
    );
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
