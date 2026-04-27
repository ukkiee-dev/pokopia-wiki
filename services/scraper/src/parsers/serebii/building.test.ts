/**
 * BuildingParser 회귀 테스트 (Phase 8 단계 11 — TDD).
 *
 * fixture: `__fixtures__/building.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 58KB)
 *
 * fixture 기준 47 building kit. 카테고리·치수·재료는 상세 페이지 영역(범위 밖).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BuildingParser } from './building.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/building.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/building.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new BuildingParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('BuildingParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('building');
  });

  it('fixture 기준 정확 47 building kit', () => {
    expect(entities.length).toBe(47);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('BuildingParser — 대표 엔티티 필드', () => {
  it('Leaf den kit — slug=leafdenkit, descriptionEn / imageUrl 존재', () => {
    const e = entities.find((x) => x.slug === 'leafdenkit');
    expect(e?.nameEn).toBe('Leaf den kit');
    expect(e?.descriptionEn).toContain('den for medium-sized');
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/items/leafdenkit.png',
    );
  });

  it('Poké Ball house kit — HTML 엔티티 자동 디코딩(é)', () => {
    const e = entities.find((x) => x.slug === 'pokeballhousekit');
    expect(e?.nameEn).toBe('Poké Ball house kit');
    expect(e?.descriptionEn).toContain('giant Poké Ball');
  });

  it('Wasteland Pokémon Center kit — 디코딩 확인', () => {
    const e = entities.find((x) => x.slug === 'wastelandpokemoncenterkit');
    expect(e?.nameEn).toBe('Wasteland Pokémon Center kit');
  });

  it('Stylish Café kit — 디코딩 확인', () => {
    const e = entities.find((x) => x.slug === 'stylishcafekit');
    expect(e?.nameEn).toBe('Stylish Café kit');
  });

  it('Tent kit — fixture 마지막 키트', () => {
    const e = entities.find((x) => x.slug === 'tentkit');
    expect(e?.nameEn).toBe('Tent kit');
    expect(e?.descriptionEn).toContain('repels rain and wind');
  });
});

describe('BuildingParser — 구조 불변식', () => {
  it('모든 slug 이 소문자 영숫자/하이픈', () => {
    expect(entities.every((e) => /^[a-z0-9-]+$/.test(e.slug))).toBe(true);
  });

  it('모든 slug 이 "kit" 으로 끝남', () => {
    expect(entities.every((e) => e.slug.endsWith('kit'))).toBe(true);
  });

  it('모든 nameEn 비어있지 않음', () => {
    expect(entities.every((e) => e.nameEn.length > 0)).toBe(true);
  });

  it('모든 imageUrl 이 절대 URL (serebii 도메인)', () => {
    expect(
      entities.every(
        (e) =>
          e.imageUrl !== undefined &&
          e.imageUrl.startsWith('https://www.serebii.net/pokemonpokopia/items/'),
      ),
    ).toBe(true);
  });

  it('slug 중복 없음', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('descriptionEn 95% 이상 채워짐', () => {
    const filled = entities.filter((e) => e.descriptionEn !== undefined).length;
    expect(filled / entities.length).toBeGreaterThanOrEqual(0.95);
  });
});

describe('BuildingParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
    expect(entities.every((e) => e.attribution.includes('Serebii.net'))).toBe(true);
  });
});

describe('BuildingParser — 엣지', () => {
  it('빈 HTML — missing-section 이슈 + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.kind).toBe('missing-section');
  });

  it('table 만 있고 데이터 행 없음 — missing-section', () => {
    const result = parser.parse(
      '<!doctype html><html><body><table class="dextable"></table></body></html>',
      { sourceUrl: FIXTURE_URL, scrapedAt: FIXED_SCRAPED_AT },
    );
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
