/**
 * HabitatsIndexParser 회귀 테스트 (Phase 8 단계 5a — TDD).
 *
 * fixture: `__fixtures__/habitats-index.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25T status 200 수집, 130KB)
 *
 * fixture 기준 201 habitat (일반 197 + 이벤트 4). DATA_COLLECTION_PLAN 의
 * "209 habitat" 추정 대비 일반 197 — habitatNo 1~209 중 12개 공백.
 * 수량 추정 업데이트는 Phase 9 Task 9.5.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { HabitatsIndexParser } from './habitats-index.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/habitats-index.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/habitats.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T02:15:00.000Z';

const parser = new HabitatsIndexParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('HabitatsIndexParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('habitats-index');
  });

  it('fixture 기준 정확 201 개 엔티티 (일반 197 + 이벤트 4)', () => {
    expect(entities.length).toBe(201);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('HabitatsIndexParser — 일반 vs 이벤트 habitat 구분', () => {
  const normal = entities.filter((e) => !e.isEvent);
  const event = entities.filter((e) => e.isEvent);

  it('일반 habitat 은 197 개, 이벤트는 4 개', () => {
    expect(normal.length).toBe(197);
    expect(event.length).toBe(4);
  });

  it('일반 habitat 은 모두 habitatNo 를 가짐 (1~209 범위)', () => {
    expect(normal.every((e) => e.habitatNo !== null)).toBe(true);
    const nos = normal.map((e) => e.habitatNo ?? 0);
    expect(Math.min(...nos)).toBe(1);
    expect(Math.max(...nos)).toBe(209);
  });

  it('이벤트 habitat 은 모두 habitatNo null', () => {
    expect(event.every((e) => e.habitatNo === null)).toBe(true);
  });

  it('이벤트 habitat 이미지 URL 은 `e<N>.png` 패턴', () => {
    expect(event.every((e) => /\/habitatdex\/e\d+\.png$/.test(e.imageUrl ?? ''))).toBe(true);
  });
});

describe('HabitatsIndexParser — 대표 엔티티 필드', () => {
  it('#001 Tall Grass — 첫 일반 habitat', () => {
    const first = entities.find((e) => e.slug === 'tallgrass');
    expect(first?.habitatNo).toBe(1);
    expect(first?.nameEn).toBe('Tall Grass');
    expect(first?.isEvent).toBe(false);
    expect(first?.imageUrl).toBe('https://www.serebii.net/pokemonpokopia/habitatdex/1.png');
    expect(first?.descriptionEn).toContain('tall grass');
  });

  it('하이픈 포함 slug — `tree-shadedtallgrass`', () => {
    const hyphenSlug = entities.find((e) => e.slug === 'tree-shadedtallgrass');
    expect(hyphenSlug?.habitatNo).toBe(2);
    expect(hyphenSlug?.nameEn).toBe('Tree-shaded  tall grass');
  });

  it('이벤트 habitat — Yellow Carpet (e1.png)', () => {
    const yellowCarpet = entities.find((e) => e.slug === 'yellowcarpet');
    expect(yellowCarpet?.isEvent).toBe(true);
    expect(yellowCarpet?.habitatNo).toBeNull();
    expect(yellowCarpet?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/habitatdex/e1.png',
    );
  });

  it('마지막 일반 habitat #209 — Lovely Ribbon Cake', () => {
    const lovely = entities.find((e) => e.slug === 'lovelyribboncake');
    expect(lovely?.habitatNo).toBe(209);
    expect(lovely?.isEvent).toBe(false);
  });
});

describe('HabitatsIndexParser — SourceMetadata / 불변식', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
    expect(entities.every((e) => e.attribution.includes('Serebii.net'))).toBe(true);
  });

  it('모든 slug 고유', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 imageUrl 이 Serebii habitatdex/ 하위 절대 URL', () => {
    expect(
      entities.every((e) =>
        (e.imageUrl ?? '').startsWith('https://www.serebii.net/pokemonpokopia/habitatdex/'),
      ),
    ).toBe(true);
  });

  it('pokemonSlugs 는 모두 빈 배열 (단계 5a 범위 — 상세 파서 영역)', () => {
    expect(entities.every((e) => e.pokemonSlugs.length === 0)).toBe(true);
  });

  it('descriptionEn 은 모두 주입됨 (Description 컬럼 비어있는 행 없음)', () => {
    expect(entities.every((e) => e.descriptionEn !== undefined)).toBe(true);
    expect(entities.every((e) => (e.descriptionEn ?? '').length > 0)).toBe(true);
  });
});

describe('HabitatsIndexParser — 엣지', () => {
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
          <td class="fooevo">No.</td><td class="fooevo">Picture</td>
          <td class="fooevo">Name</td><td class="fooevo">Description</td>
        </tr>
        <tr>
          <td class="cen">#001</td>
          <td class="cen"><a href="habitatdex/tallgrass.shtml"><img src="habitatdex/1.png" alt="Tall Grass" /></a></td>
          <td class="fooinfo"><a><u>Tall Grass</u></a></td>
          <td class="fooinfo">A plot of tall grass</td>
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
