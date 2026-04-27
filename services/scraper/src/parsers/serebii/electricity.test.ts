/**
 * ElectricityParser 회귀 테스트 (Phase 8 단계 15 — TDD).
 *
 * fixture: `__fixtures__/electricity.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 60KB)
 *
 * fixture 기준 4 generator:
 *   - Mini generator (5 units, Automatic)
 *   - Windmill kit (10 standard / 20 high-altitude, Automatic)
 *   - Waterwheel kit (20, Automatic)
 *   - Furnace kit (30, Requires Renewing)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ElectricityParser } from './electricity.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/electricity.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/electricity.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new ElectricityParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('ElectricityParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('electricity');
  });

  it('fixture 기준 정확 4 generator', () => {
    expect(entities.length).toBe(4);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('ElectricityParser — 대표 엔티티', () => {
  it('Mini generator — 단순 정수 5, Automatic', () => {
    const e = entities.find((x) => x.slug === 'minigenerator');
    expect(e?.nameEn).toBe('Mini generator');
    expect(e?.outputUnits).toBe(5);
    expect(e?.outputUnitsAlt).toBeUndefined();
    expect(e?.isRenewable).toBe(true);
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/items/minigenerator.png',
    );
    expect(e?.descriptionEn).toContain('Place this anywhere');
  });

  it('Windmill kit — multi-line "10 standard / 20 high-altitude"', () => {
    const e = entities.find((x) => x.slug === 'windmillkit');
    expect(e?.nameEn).toBe('Windmill kit');
    expect(e?.outputUnits).toBe(10);
    expect(e?.outputUnitsLabel).toBe('standard');
    expect(e?.outputUnitsAlt).toBe(20);
    expect(e?.outputUnitsAltLabel).toBe('high-altitude');
    expect(e?.isRenewable).toBe(true);
  });

  it('Waterwheel kit — 단순 정수 20, Automatic', () => {
    const e = entities.find((x) => x.slug === 'waterwheelkit');
    expect(e?.nameEn).toBe('Waterwheel kit');
    expect(e?.outputUnits).toBe(20);
    expect(e?.outputUnitsAlt).toBeUndefined();
    expect(e?.isRenewable).toBe(true);
  });

  it('Furnace kit — 30, Requires Renewing → isRenewable=false', () => {
    const e = entities.find((x) => x.slug === 'furnacekit');
    expect(e?.nameEn).toBe('Furnace kit');
    expect(e?.outputUnits).toBe(30);
    expect(e?.isRenewable).toBe(false);
  });
});

describe('ElectricityParser — 구조 불변식', () => {
  it('모든 slug 이 소문자 영숫자/하이픈', () => {
    expect(entities.every((e) => /^[a-z0-9-]+$/.test(e.slug))).toBe(true);
  });

  it('slug 4 개 모두 unique', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 outputUnits ≥ 1', () => {
    expect(entities.every((e) => e.outputUnits >= 1)).toBe(true);
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

describe('ElectricityParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('ElectricityParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
