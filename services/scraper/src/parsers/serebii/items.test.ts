/**
 * ItemsParser 회귀 테스트 (Phase 8 단계 4 — TDD).
 *
 * fixture: `__fixtures__/items.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25T00:33Z status 200, 1MB 수집)
 *
 * fixture 기준 894 item 관측 (11 카테고리). Lost Relics / Fossils / Other 섹션은
 * 본 파서가 자동 스킵(매핑 없는 anchor) — 별도 파서에서 처리.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ItemsParser } from './items.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/items.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/items.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T00:33:00.000Z';

const parser = new ItemsParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

/** 카테고리 → 기대 개수 (fixture 실측). 셀렉터 드리프트 감지의 핵심 기대값. */
const EXPECTED_BY_CATEGORY: ReadonlyArray<readonly [string, number]> = [
  ['Materials', 45],
  ['Food', 45],
  ['Furniture', 115],
  ['Misc', 149],
  ['Outdoor', 62],
  ['Utilities', 68],
  ['Nature', 129],
  ['Buildings', 88],
  ['Blocks', 137],
  ['Kits', 49],
  ['Key_Items', 7],
];

const EXPECTED_TOTAL = EXPECTED_BY_CATEGORY.reduce((acc, [, n]) => acc + n, 0);

describe('ItemsParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('items');
  });

  it(`fixture 기준 정확 ${EXPECTED_TOTAL} 개 엔티티 추출 (11 카테고리)`, () => {
    expect(entities.length).toBe(EXPECTED_TOTAL);
  });

  it('구조적 파싱 이슈 0 건 (깨끗한 파싱)', () => {
    expect(issues).toEqual([]);
  });
});

describe('ItemsParser — 카테고리 분포', () => {
  it.each(EXPECTED_BY_CATEGORY)('카테고리 %s 는 정확 %d 개', (category, count) => {
    const actual = entities.filter((e) => e.category === category).length;
    expect(actual).toBe(count);
  });

  it('Lost Relics / Fossils / Other 섹션은 항목 0 개 (매핑 제외)', () => {
    const unmapped = entities.filter(
      (e) =>
        !EXPECTED_BY_CATEGORY.some(
          ([cat]) => cat === (e.category as unknown as string),
        ),
    );
    expect(unmapped.length).toBe(0);
  });
});

describe('ItemsParser — 대표 엔티티 필드', () => {
  it('Honey — Materials 첫 아이템, description 포함, tag 없음', () => {
    const honey = entities.find((e) => e.slug === 'honey');
    expect(honey?.nameEn).toBe('Honey');
    expect(honey?.category).toBe('Materials');
    expect(honey?.description).toContain('honey');
    expect(honey?.tags).toEqual([]);
    expect(honey?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/items/honey.png',
    );
  });

  it('Wall storage box — Furniture + Decoration tag', () => {
    const item = entities.find((e) => e.slug === 'wallstoragebox');
    expect(item?.nameEn).toBe('Wall storage box');
    expect(item?.category).toBe('Furniture');
    expect(item?.tags).toContain('Decoration');
  });

  it('Storage box — Furniture + tag 비어있음 (plain storage)', () => {
    const item = entities.find((e) => e.slug === 'storagebox');
    expect(item?.nameEn).toBe('Storage box');
    expect(item?.tags).toEqual([]);
  });
});

describe('ItemsParser — Tag 분포', () => {
  it('전체 ENUM tag 각 1 회 이상 등장 (Decoration/Food/Relaxation/Road/Toy)', () => {
    const flat = entities.flatMap((e) => e.tags);
    const set = new Set(flat);
    expect(set.has('Decoration')).toBe(true);
    expect(set.has('Food')).toBe(true);
    expect(set.has('Relaxation')).toBe(true);
    expect(set.has('Road')).toBe(true);
    expect(set.has('Toy')).toBe(true);
  });

  it('모든 tags 원소가 ENUM 집합 안에 포함 (unknown 없음)', () => {
    const allowed = new Set(['Decoration', 'Food', 'Relaxation', 'Road', 'Toy']);
    for (const entity of entities) {
      for (const tag of entity.tags) {
        expect(allowed.has(tag)).toBe(true);
      }
    }
  });
});

describe('ItemsParser — SourceMetadata / 불변식', () => {
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

  it('모든 imageUrl 이 Serebii items/ 하위 절대 URL', () => {
    expect(
      entities.every((e) =>
        (e.imageUrl ?? '').startsWith('https://www.serebii.net/pokemonpokopia/items/'),
      ),
    ).toBe(true);
  });

  it('locations 는 모두 빈 배열 (단계 4 범위 밖 — 별도 파서)', () => {
    expect(entities.every((e) => e.locations.length === 0)).toBe(true);
  });

  it('플래그 isPaintable/isPatternable/isMagnetRiseOnly 는 모두 false (기본값)', () => {
    expect(entities.every((e) => e.isPaintable === false)).toBe(true);
    expect(entities.every((e) => e.isPatternable === false)).toBe(true);
    expect(entities.every((e) => e.isMagnetRiseOnly === false)).toBe(true);
  });
});

describe('ItemsParser — 엣지', () => {
  it('빈 HTML — missing-section 이슈 1 건 + entities 0', () => {
    const result = parser.parse('<!doctype html><html><body></body></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.kind).toBe('missing-section');
  });

  it('매핑 없는 카테고리 anchor (fossils) 는 엔티티 추출하지 않음', () => {
    const fossilsHtml = `
      <div>
        <h2><a name="fossils"></a>List of Fossils</h2>
        <table class="dextable">
          <tr><td class="fooevo">Picture</td><td class="fooevo">Name</td></tr>
          <tr>
            <td class="cen"><a href="items/somefossil.shtml"><img src="items/somefossil.png" alt="Some Fossil"/></a></td>
            <td class="cen"><a href="items/somefossil.shtml"><u>Some Fossil</u></a></td>
            <td class="fooinfo">A fossil</td>
            <td class="fooinfo">&nbsp;</td>
            <td class="fooinfo">Rocky Ridges</td>
          </tr>
        </table>
      </div>
    `;
    const result = parser.parse(fossilsHtml, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
  });

  it('scrapedAt 미지정 시 호출 시점 UTC ISO 문자열 생성', () => {
    const minimalHtml = `
      <h2><a name="materials"></a>List of Materials</h2>
      <table class="dextable">
        <tr><td class="fooevo">Picture</td></tr>
        <tr>
          <td class="cen"><a href="items/test.shtml"><img src="items/test.png" alt="Test"/></a></td>
          <td class="cen"><a href="items/test.shtml"><u>Test</u></a></td>
          <td class="fooinfo">A test item</td>
          <td class="fooinfo">&nbsp;</td>
          <td class="fooinfo">Nowhere</td>
        </tr>
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
