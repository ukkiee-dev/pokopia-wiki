/**
 * LostRelicsParser 회귀 테스트 (Phase 8 단계 28 — TDD).
 *
 * fixture: `__fixtures__/lostrelics.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 63KB)
 *
 * fixture 기준 89 lost_relic:
 *   - Large (L): 43
 *   - Small (S): 46
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LostRelicsParser } from './lost-relics.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/lostrelics.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/lostrelics.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new LostRelicsParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('LostRelicsParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('lostrelics');
  });

  it('정확 89 lost_relic (Large 43 + Small 46)', () => {
    expect(entities.length).toBe(89);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });

  it('Large 43 + Small 46 분포', () => {
    expect(entities.filter((e) => e.sizeClass === 'L').length).toBe(43);
    expect(entities.filter((e) => e.sizeClass === 'S').length).toBe(46);
  });
});

describe('LostRelicsParser — 대표 엔티티', () => {
  it('Polygonal Shelf — Large, slug=lost-relic-polygonalshelf', () => {
    const e = entities.find((x) => x.itemSlug === 'polygonalshelf');
    expect(e?.slug).toBe('lost-relic-polygonalshelf');
    expect(e?.nameEn).toBe('Polygonal Shelf');
    expect(e?.sizeClass).toBe('L');
    expect(e?.isAppraisedForm).toBe(false);
    expect(e?.descriptionEn).toContain('shelf');
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/items/polygonalshelf.png',
    );
  });

  it('Boo-in-the-box — Large, slug 에 하이픈 다중 포함', () => {
    const e = entities.find((x) => x.itemSlug === 'boo-in-the-box');
    expect(e?.nameEn).toBe('Boo-in-the-box');
    expect(e?.sizeClass).toBe('L');
  });

  it('Pitcher-plant pot — Large, hyphen 변형', () => {
    const e = entities.find((x) => x.itemSlug === 'pitcher-plantpot');
    expect(e?.nameEn).toBe('Pitcher-plant pot');
    expect(e?.sizeClass).toBe('L');
  });

  it('Nugget — Small, slug=lost-relic-nugget', () => {
    const e = entities.find((x) => x.itemSlug === 'nugget');
    expect(e?.slug).toBe('lost-relic-nugget');
    expect(e?.sizeClass).toBe('S');
    expect(e?.descriptionEn).toContain('frame');
  });

  it('Never-Melt Ice — Small, slug=never-meltice', () => {
    const e = entities.find((x) => x.itemSlug === 'never-meltice');
    expect(e?.nameEn).toBe('Never-Melt Ice');
    expect(e?.sizeClass).toBe('S');
  });
});

describe('LostRelicsParser — 구조 불변식', () => {
  it('모든 slug 이 lost-relic- 접두사', () => {
    expect(entities.every((e) => e.slug.startsWith('lost-relic-'))).toBe(true);
  });

  it('slug 89 개 모두 unique', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 sizeClass 가 L 또는 S', () => {
    expect(entities.every((e) => e.sizeClass === 'L' || e.sizeClass === 'S')).toBe(
      true,
    );
  });

  it('모든 isAppraisedForm = false (페이지는 감정 전 형태 목록)', () => {
    expect(entities.every((e) => e.isAppraisedForm === false)).toBe(true);
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

describe('LostRelicsParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('LostRelicsParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });

  it('카테고리 헤더 없이 데이터 행 → unexpected-structure', () => {
    const html = `<!doctype html><html><body>
      <table class="dextable">
        <tr><td class="fooevo">Picture</td><td class="fooevo">Name</td><td class="fooevo">Description</td></tr>
        <tr>
          <td class="cen"><img src="items/foo.png"></td>
          <td class="cen">Foo</td>
          <td class="fooinfo">x</td>
        </tr>
      </table>
    </body></html>`;
    const result = parser.parse(html, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'unexpected-structure')).toBe(true);
  });
});
