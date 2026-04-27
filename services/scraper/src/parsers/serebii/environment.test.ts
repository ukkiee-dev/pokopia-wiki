/**
 * EnvironmentRewardParser 회귀 테스트 (Phase 8 단계 16 — TDD).
 *
 * fixture: `__fixtures__/environmentlevel.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 125KB)
 *
 * fixture 기준 428 environment_reward (6 location × Lv. 1~10):
 *   - Withered Wastelands / Bleak Beach / Rocky Ridges / Sparkling Skylands /
 *     Palette Town / Cloud Island
 *   - Lv. 1: 17, Lv. 10: 28, Lv. 2: 46, Lv. 3: 66, Lv. 4: 71, Lv. 5: 95,
 *     Lv. 6: 36, Lv. 7: 28, Lv. 8: 29, Lv. 9: 32 = 448 행
 *   - 335 unique itemSlug (113 행은 동일 item 이 여러 location 에서 unlock)
 *   - slug 합성 (location, level, rewardType, item) 4-튜플로 448 모두 unique
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EnvironmentRewardParser } from './environment.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/environmentlevel.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/environmentlevel.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new EnvironmentRewardParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('EnvironmentRewardParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('environmentlevel');
  });

  it('fixture 기준 정확 448 environment_reward', () => {
    expect(entities.length).toBe(448);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });

  it('6 location 모두 데이터 보유', () => {
    const locations = new Set(entities.map((e) => e.locationSlug));
    expect(locations).toEqual(
      new Set([
        'witheredwastelands',
        'bleakbeach',
        'rockyridges',
        'sparklingskylands',
        'palettetown',
        'cloudisland',
      ]),
    );
  });

  it('level 분포 모두 1~10 범위', () => {
    expect(entities.every((e) => e.level >= 1 && e.level <= 10)).toBe(true);
  });
});

describe('EnvironmentRewardParser — 대표 엔티티', () => {
  it('Withered Wastelands Lv.2 Garden bench — item, slug 합성', () => {
    const e = entities.find((x) => x.slug === 'witheredwastelands-lv2-item-gardenbench');
    expect(e?.locationSlug).toBe('witheredwastelands');
    expect(e?.level).toBe(2);
    expect(e?.rewardType).toBe('item');
    expect(e?.itemSlug).toBe('gardenbench');
    expect(e?.nameEn).toBe('Garden bench');
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/items/gardenbench.png',
    );
  });

  it('Withered Wastelands Lv.2 Workbench Recipe — recipe', () => {
    const e = entities.find((x) => x.slug === 'witheredwastelands-lv2-recipe-workbench');
    expect(e?.rewardType).toBe('recipe');
    expect(e?.nameEn).toBe('Workbench Recipe');
    expect(e?.itemSlug).toBe('workbench');
  });

  it('Withered Wastelands Lv.2 Leaf hut kit', () => {
    const e = entities.find((x) => x.slug === 'witheredwastelands-lv2-item-leafhutkit');
    expect(e?.locationSlug).toBe('witheredwastelands');
    expect(e?.level).toBe(2);
    expect(e?.rewardType).toBe('item');
    expect(e?.nameEn).toBe('Leaf hut kit');
  });

  it('slug 에 괄호 포함 itemSlug — antiquewall(lower) 추출 성공', () => {
    const e = entities.find((x) => x.itemSlug === 'antiquewall(lower)');
    expect(e).toBeDefined();
    expect(e?.slug).toContain('antiquewall(lower)');
  });
});

describe('EnvironmentRewardParser — 구조 불변식', () => {
  it('모든 slug 이 locationSlug-lvN-rewardType-itemSlug 형식', () => {
    expect(
      entities.every(
        (e) =>
          e.slug === `${e.locationSlug}-lv${e.level}-${e.rewardType}-${e.itemSlug}`,
      ),
    ).toBe(true);
  });

  it('slug 모두 unique', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('rewardType 은 item 또는 recipe', () => {
    expect(
      entities.every((e) => e.rewardType === 'item' || e.rewardType === 'recipe'),
    ).toBe(true);
  });

  it('모든 itemSlug 비어있지 않음', () => {
    expect(entities.every((e) => e.itemSlug.length > 0)).toBe(true);
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

describe('EnvironmentRewardParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('EnvironmentRewardParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });

  it('카테고리 헤더 없이 데이터 행 — unexpected-structure', () => {
    const html = `<!doctype html><html><body>
      <table class="dextable">
        <tr><td class="fooevo">Picture</td><td class="fooevo">Name</td><td class="fooevo">Level</td></tr>
        <tr>
          <td class="cen"><img src="items/foo.png"></td>
          <td class="cen">Foo</td>
          <td class="fooinfo">Lv. 1</td>
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
