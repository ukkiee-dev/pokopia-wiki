/**
 * PaintColorParser / PaintPatternParser 회귀 테스트 (Phase 8 단계 14 — TDD).
 *
 * fixture: `__fixtures__/paint.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 228KB)
 *
 * fixture 기준
 *   - PaintColorParser: 18 색 + paint_recipe ingredients (8 primary 1개씩 + 10
 *     compound 2개씩 = 28 ingredient 행)
 *   - PaintPatternParser: 98 pattern (pattern/1~38 + pk 시리즈, 모두 unique image)
 *
 * paint.shtml 에는 4 개의 dextable 이 있다:
 *   1. Berry → paint 변환 표 (본 단계 범위 외)
 *   2. Colours 표 (3 fooevo, 두 번째 셀 "Colour")
 *   3. Patterns 표 (3 fooevo, 두 번째 셀 "Location")
 *   4. List of Items that can be painted (5 fooevo, 단계 6 furniture 와 중복)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PaintColorParser, PaintPatternParser } from './paint.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/paint.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/paint.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');

const colorParser = new PaintColorParser();
const colorResult = colorParser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

const patternParser = new PaintPatternParser();
const patternResult = patternParser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('PaintColorParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(colorParser.SELECTOR_VERSION).toBe('1');
    expect(colorParser.sourceSite).toBe('serebii');
    expect(colorParser.pageId).toBe('paint');
  });

  it('fixture 기준 정확 18 색', () => {
    expect(colorResult.entities.length).toBe(18);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(colorResult.issues).toEqual([]);
  });
});

describe('PaintColorParser — 대표 색', () => {
  it('White — primary, 자기 자신 White Paint * 2', () => {
    const e = colorResult.entities.find((x) => x.slug === 'white');
    expect(e?.nameEn).toBe('White');
    expect(e?.imageUrl).toBe('https://www.serebii.net/pokemonpokopia/paint/1.png');
    expect(e?.ingredients).toEqual([{ itemNameEn: 'White Paint', quantity: 2 }]);
  });

  it('Aquamarine — compound, Green + Cyan 각 1', () => {
    const e = colorResult.entities.find((x) => x.slug === 'aquamarine');
    expect(e?.nameEn).toBe('Aquamarine');
    expect(e?.ingredients).toHaveLength(2);
    expect(e?.ingredients).toEqual([
      { itemNameEn: 'Green paint', quantity: 1 },
      { itemNameEn: 'Cyan paint', quantity: 1 },
    ]);
  });

  it('Black — primary, Black Paint * 2', () => {
    const e = colorResult.entities.find((x) => x.slug === 'black');
    expect(e?.nameEn).toBe('Black');
    expect(e?.imageUrl).toBe('https://www.serebii.net/pokemonpokopia/paint/16.png');
    expect(e?.ingredients).toEqual([{ itemNameEn: 'Black paint', quantity: 2 }]);
  });

  it('Pink — primary, fixture 마지막 색', () => {
    const e = colorResult.entities.find((x) => x.slug === 'pink');
    expect(e?.nameEn).toBe('Pink');
    expect(e?.ingredients).toEqual([{ itemNameEn: 'Pink paint', quantity: 2 }]);
  });
});

describe('PaintColorParser — 구조 불변식', () => {
  it('모든 slug 이 nameEn lowercase 와 일치', () => {
    expect(
      colorResult.entities.every((e) => e.slug === e.nameEn.toLowerCase()),
    ).toBe(true);
  });

  it('slug 18 개 모두 unique', () => {
    const slugs = colorResult.entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 imageUrl 이 paint/ 경로 절대 URL', () => {
    expect(
      colorResult.entities.every(
        (e) =>
          e.imageUrl !== undefined &&
          /^https:\/\/www\.serebii\.net\/pokemonpokopia\/paint\/\d+\.png$/.test(
            e.imageUrl,
          ),
      ),
    ).toBe(true);
  });

  it('총 ingredient 수 28 (8 primary × 1 + 10 compound × 2)', () => {
    const total = colorResult.entities.reduce(
      (sum, e) => sum + e.ingredients.length,
      0,
    );
    expect(total).toBe(28);
  });

  it('모든 ingredient quantity ≥ 1', () => {
    expect(
      colorResult.entities.every((e) =>
        e.ingredients.every((i) => i.quantity >= 1),
      ),
    ).toBe(true);
  });
});

describe('PaintColorParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(colorResult.entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(colorResult.entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(colorResult.entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(
      true,
    );
  });
});

describe('PaintPatternParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(patternParser.SELECTOR_VERSION).toBe('1');
    expect(patternParser.sourceSite).toBe('serebii');
    expect(patternParser.pageId).toBe('paint');
  });

  it('fixture 기준 정확 98 pattern', () => {
    expect(patternResult.entities.length).toBe(98);
  });

  /**
   * fixture 의 pattern-pk42 cost 셀에 `Black Paint * ` 로 quantity 누락 (Serebii
   * 측 데이터 입력 결함). 파서는 해당 ingredient 만 스킵하고 issue 1 건 기록 +
   * pattern-pk42 자체와 정상 ingredient(`White Paint * 1`) 는 entities 에 포함.
   * fixture 갱신 시 이 결함이 수정되면 본 테스트도 0 건으로 조정 필요.
   */
  it('구조적 파싱 이슈 — fixture pk42 quantity 누락 1 건', () => {
    expect(patternResult.issues).toHaveLength(1);
    expect(patternResult.issues[0]).toMatchObject({
      kind: 'unexpected-structure',
      at: 'paint-pattern[pattern-pk42]',
    });
  });

  it('pk42 자체는 정상 추가 + 정상 ingredient 1 개 보존', () => {
    const e = patternResult.entities.find((x) => x.slug === 'pattern-pk42');
    expect(e?.locationEn).toBe('On item given by Vespiquen');
    expect(e?.ingredients).toEqual([{ itemNameEn: 'White Paint', quantity: 1 }]);
  });
});

describe('PaintPatternParser — 대표 패턴', () => {
  it('pattern-1 — Beginning, Red Paint * 2', () => {
    const e = patternResult.entities.find((x) => x.slug === 'pattern-1');
    expect(e?.locationEn).toBe('Beginning');
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/pattern/1.png',
    );
    expect(e?.ingredients).toEqual([{ itemNameEn: 'Red Paint', quantity: 2 }]);
  });

  it('pattern-pk6 — On item given by Vespiquen, Red + Green', () => {
    const e = patternResult.entities.find((x) => x.slug === 'pattern-pk6');
    expect(e?.locationEn).toBe('On item given by Vespiquen');
    expect(e?.ingredients).toEqual([
      { itemNameEn: 'Red Paint', quantity: 1 },
      { itemNameEn: 'Green Paint', quantity: 1 },
    ]);
  });

  it('pattern-pk29 — Vespiquen, Cyan Paint * 2', () => {
    const e = patternResult.entities.find((x) => x.slug === 'pattern-pk29');
    expect(e?.locationEn).toBe('On item given by Vespiquen');
    expect(e?.ingredients).toEqual([{ itemNameEn: 'Cyan Paint', quantity: 2 }]);
  });

  it('pattern-13 — Dream Island, Red * 3 + Yellow * 1', () => {
    const e = patternResult.entities.find((x) => x.slug === 'pattern-13');
    expect(e?.locationEn).toBe('Dream Island');
    expect(e?.ingredients).toEqual([
      { itemNameEn: 'Red Paint', quantity: 3 },
      { itemNameEn: 'Yellow Paint', quantity: 1 },
    ]);
  });
});

describe('PaintPatternParser — 구조 불변식', () => {
  it('모든 slug 이 pattern- 접두사', () => {
    expect(
      patternResult.entities.every((e) => /^pattern-(?:[a-z]+)?\d+$/.test(e.slug)),
    ).toBe(true);
  });

  it('slug 98 개 모두 unique', () => {
    const slugs = patternResult.entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 imageUrl 이 pattern/ 경로 절대 URL', () => {
    expect(
      patternResult.entities.every(
        (e) =>
          e.imageUrl !== undefined &&
          /^https:\/\/www\.serebii\.net\/pokemonpokopia\/pattern\/[a-z0-9]+\.png$/.test(
            e.imageUrl,
          ),
      ),
    ).toBe(true);
  });

  it('모든 패턴이 최소 1 개 ingredient 보유', () => {
    expect(patternResult.entities.every((e) => e.ingredients.length > 0)).toBe(true);
  });

  it('모든 ingredient quantity ≥ 1', () => {
    expect(
      patternResult.entities.every((e) =>
        e.ingredients.every((i) => i.quantity >= 1),
      ),
    ).toBe(true);
  });
});

const HTML_NO_TABLE = '<!doctype html><html><body><p>nothing</p></body></html>';

describe('PaintColorParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = colorParser.parse(HTML_NO_TABLE, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});

describe('PaintPatternParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = patternParser.parse(HTML_NO_TABLE, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
