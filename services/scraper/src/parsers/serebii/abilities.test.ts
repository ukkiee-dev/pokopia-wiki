/**
 * AbilitiesParser 회귀 테스트 (Phase 8 단계 12 — TDD).
 *
 * fixture: `__fixtures__/abilities.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 45KB)
 *
 * fixture 기준 13 ditto_ability:
 *   - Primary Moves: 10 (Camouflage, Cut, Leafage, Glide, Magnet Rise,
 *     Rock Smash, Rollout, Rototiller, Surf, Water Gun)
 *   - Secondary Moves: 3 (Strength, Stockpile Water, Waterfall)
 *
 * 페이지에는 두 개의 dextable 이 있다 — 위쪽 "Powering Up Moves" (3-컬럼,
 * Meal/Move/Effect) 는 본 파서 범위 외이며, 아래쪽 "List of Ditto's Moves"
 * (4-컬럼, Picture/Move/Effect/Location) 만 채택한다.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AbilitiesParser } from './abilities.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/abilities.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/abilities.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new AbilitiesParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('AbilitiesParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('abilities');
  });

  it('fixture 기준 정확 13 ditto_ability', () => {
    expect(entities.length).toBe(13);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });

  it('Primary 10 + Secondary 3 분포', () => {
    const primary = entities.filter((e) => e.type === 'Primary');
    const secondary = entities.filter((e) => e.type === 'Secondary');
    expect(primary.length).toBe(10);
    expect(secondary.length).toBe(3);
  });
});

describe('AbilitiesParser — Primary 대표 엔티티', () => {
  it('Camouflage — slug=camouflage, imageUrl 존재', () => {
    const e = entities.find((x) => x.slug === 'camouflage');
    expect(e?.type).toBe('Primary');
    expect(e?.nameEn).toBe('Camouflage');
    expect(e?.effectEn).toBe('Turn into the object in front of you');
    expect(e?.unlockTextEn).toBe('Befriend Zorua in Bleak Beach');
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/ditto/camouflage.png',
    );
  });

  it('Magnet Rise — slug=magnetrise (Serebii 파일명 그대로)', () => {
    const e = entities.find((x) => x.slug === 'magnetrise');
    expect(e?.type).toBe('Primary');
    expect(e?.nameEn).toBe('Magnet Rise');
    expect(e?.effectEn).toContain('Fly through the sky quickly');
    expect(e?.unlockTextEn).toBe('Befriend Magnemite in post-game');
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/ditto/magnetrise.png',
    );
  });

  it('Water Gun — slug=watergun', () => {
    const e = entities.find((x) => x.slug === 'watergun');
    expect(e?.type).toBe('Primary');
    expect(e?.nameEn).toBe('Water Gun');
    expect(e?.unlockTextEn).toBe('Befriend Squirtle in Withered Wastelands');
  });
});

describe('AbilitiesParser — Secondary 대표 엔티티', () => {
  it('Strength — slug=strength, imageUrl undefined', () => {
    const e = entities.find((x) => x.slug === 'strength');
    expect(e?.type).toBe('Secondary');
    expect(e?.nameEn).toBe('Strength');
    expect(e?.effectEn).toBe('Press A to push objects');
    expect(e?.unlockTextEn).toBe('Befriend Machoke in Rocky Ridges');
    expect(e?.imageUrl).toBeUndefined();
  });

  it('Stockpile Water — slug=stockpile-water (nameEn 슬러그화)', () => {
    const e = entities.find((x) => x.slug === 'stockpile-water');
    expect(e?.type).toBe('Secondary');
    expect(e?.nameEn).toBe('Stockpile Water');
    expect(e?.effectEn).toContain('Press ZR while in water');
    expect(e?.unlockTextEn).toContain("Complete Piplup's request");
    expect(e?.imageUrl).toBeUndefined();
  });

  it('Waterfall — slug=waterfall, fixture 마지막', () => {
    const e = entities.find((x) => x.slug === 'waterfall');
    expect(e?.type).toBe('Secondary');
    expect(e?.nameEn).toBe('Waterfall');
    expect(e?.effectEn).toBe('Press A at a Waterfall to climb to the top');
  });
});

describe('AbilitiesParser — 구조 불변식', () => {
  it('모든 slug 이 소문자 영숫자/하이픈', () => {
    expect(entities.every((e) => /^[a-z0-9-]+$/.test(e.slug))).toBe(true);
  });

  it('모든 nameEn 비어있지 않음', () => {
    expect(entities.every((e) => e.nameEn.length > 0)).toBe(true);
  });

  it('모든 type 이 Primary 또는 Secondary', () => {
    expect(
      entities.every((e) => e.type === 'Primary' || e.type === 'Secondary'),
    ).toBe(true);
  });

  it('Primary 는 모두 imageUrl 보유 (serebii ditto/ 경로)', () => {
    const primary = entities.filter((e) => e.type === 'Primary');
    expect(
      primary.every(
        (e) =>
          e.imageUrl !== undefined &&
          e.imageUrl.startsWith('https://www.serebii.net/pokemonpokopia/ditto/'),
      ),
    ).toBe(true);
  });

  it('Secondary 는 imageUrl 모두 undefined (Serebii 빈 셀)', () => {
    const secondary = entities.filter((e) => e.type === 'Secondary');
    expect(secondary.every((e) => e.imageUrl === undefined)).toBe(true);
  });

  it('slug 중복 없음', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 effectEn 채워짐', () => {
    expect(entities.every((e) => (e.effectEn ?? '').length > 0)).toBe(true);
  });

  it('모든 unlockTextEn 채워짐', () => {
    expect(entities.every((e) => (e.unlockTextEn ?? '').length > 0)).toBe(true);
  });
});

describe('AbilitiesParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
    expect(entities.every((e) => e.attribution.includes('Serebii.net'))).toBe(true);
  });
});

const HTML_3COL_ONLY = `<!doctype html><html><body>
  <table class="dextable">
    <tr><td class="fooevo">Meal</td><td class="fooevo">Move</td><td class="fooevo">Effect</td></tr>
    <tr><td class="fooinfo">Salad</td><td class="fooinfo">Leafage</td><td class="fooinfo">x</td></tr>
  </table>
</body></html>`;

const HTML_NO_CATEGORY_HEADER = `<!doctype html><html><body>
  <table class="dextable">
    <tr>
      <td class="fooevo">Picture</td>
      <td class="fooevo">Move</td>
      <td class="fooevo">Effect</td>
      <td class="fooevo">Location</td>
    </tr>
    <tr>
      <td class="fooinfo"><img src="ditto/foo.png"></td>
      <td class="fooinfo">Foo</td>
      <td class="fooinfo">e</td>
      <td class="fooinfo">u</td>
    </tr>
  </table>
</body></html>`;

describe('AbilitiesParser — 엣지', () => {
  it('빈 HTML — missing-section 이슈 + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });

  it('3-컬럼 dextable 만 존재 — 본 파서 대상 아님 → missing-section', () => {
    const result = parser.parse(HTML_3COL_ONLY, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });

  it('카테고리 헤더 없이 데이터 행 — unexpected-structure 누적 + 엔티티 0', () => {
    const result = parser.parse(HTML_NO_CATEGORY_HEADER, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'unexpected-structure')).toBe(true);
  });
});
