/**
 * FurnitureParser 회귀 테스트 (Phase 8 단계 6 — TDD).
 *
 * fixture: `__fixtures__/furniture.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25T status 200, 114KB 수집)
 *
 * fixture 기준 115 furniture item — items.shtml 의 Furniture 카테고리 115 와 일치
 * (100% 매칭). loader 는 source_slug 기반 upsert 로 items 파서 출력과 furniture
 * 파서 출력의 isPaintable/isPatternable 필드를 병합한다.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FurnitureParser } from './furniture.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/furniture.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/furniture.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T02:30:00.000Z';

const parser = new FurnitureParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('FurnitureParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('furniture');
  });

  it('fixture 기준 정확 115 개 엔티티 (items.shtml Furniture 카테고리와 동일)', () => {
    expect(entities.length).toBe(115);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('FurnitureParser — 플래그 분포', () => {
  it('isPaintable=true 은 67 개 (실측)', () => {
    expect(entities.filter((e) => e.isPaintable).length).toBe(67);
  });

  it('isPatternable=true 은 27 개 (실측)', () => {
    expect(entities.filter((e) => e.isPatternable).length).toBe(27);
  });

  it('플래그 조합은 4 가지 모두 존재 (paint only / pattern only / both / neither)', () => {
    const pOnly = entities.filter((e) => e.isPaintable && !e.isPatternable).length;
    const patOnly = entities.filter((e) => !e.isPaintable && e.isPatternable).length;
    const both = entities.filter((e) => e.isPaintable && e.isPatternable).length;
    const neither = entities.filter((e) => !e.isPaintable && !e.isPatternable).length;
    expect(pOnly + patOnly + both + neither).toBe(entities.length);
  });
});

describe('FurnitureParser — 대표 엔티티 필드', () => {
  it('Storage box — Paint 가능, Pattern 불가, tag 없음', () => {
    const box = entities.find((e) => e.slug === 'storagebox');
    expect(box?.nameEn).toBe('Storage box');
    expect(box?.category).toBe('Furniture');
    expect(box?.isPaintable).toBe(true);
    expect(box?.isPatternable).toBe(false);
    expect(box?.tags).toEqual([]);
  });

  it('Plain chest — Paint + Pattern 둘 다 가능, Decoration tag', () => {
    const chest = entities.find((e) => e.slug === 'plainchest');
    expect(chest?.isPaintable).toBe(true);
    expect(chest?.isPatternable).toBe(true);
    expect(chest?.tags).toContain('Decoration');
  });

  it('Big storage box — "No change possible" → 둘 다 false', () => {
    const big = entities.find((e) => e.slug === 'bigstoragebox');
    expect(big?.isPaintable).toBe(false);
    expect(big?.isPatternable).toBe(false);
  });

  it('Wall storage box — Decoration tag + Paint 가능', () => {
    const wall = entities.find((e) => e.slug === 'wallstoragebox');
    expect(wall?.tags).toEqual(['Decoration']);
    expect(wall?.isPaintable).toBe(true);
  });
});

describe('FurnitureParser — SourceMetadata / 불변식', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
    expect(entities.every((e) => e.attribution.includes('Serebii.net'))).toBe(true);
  });

  it('모든 엔티티의 category 는 Furniture 고정', () => {
    expect(entities.every((e) => e.category === 'Furniture')).toBe(true);
  });

  it('모든 slug 고유', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 imageUrl 이 Serebii items/ 하위 절대 URL', () => {
    expect(
      entities.every((e) =>
        (e.imageUrl ?? '').startsWith('https://www.serebii.net/pokemonpokopia/items/'),
      ),
    ).toBe(true);
  });

  it('locations 는 모두 빈 배열 (단계 6 범위 밖)', () => {
    expect(entities.every((e) => e.locations.length === 0)).toBe(true);
  });

  it('isMagnetRiseOnly 는 모두 false (magnetrise.shtml 파서 책임)', () => {
    expect(entities.every((e) => e.isMagnetRiseOnly === false)).toBe(true);
  });
});

describe('FurnitureParser — 엣지', () => {
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
          <td class="fooevo">Picture</td><td class="fooevo">Name</td>
          <td class="fooevo">Description</td><td class="fooevo">Locations</td>
          <td class="fooevo">Flags</td><td class="fooevo">Colour</td>
        </tr>
        <tr>
          <td class="cen"><a href="items/test.shtml"><img src="items/test.png" /></a></td>
          <td class="cen"><a><u>Test chair</u></a></td>
          <td class="fooinfo">A test chair</td>
          <td class="fooinfo"></td>
          <td class="fooinfo">Decoration</td>
          <td class="fooinfo">Paint<br/></td>
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
