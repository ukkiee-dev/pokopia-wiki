/**
 * AvailablePokemonParser 회귀 테스트 (Phase 8 단계 1 — TDD RED/GREEN).
 *
 * fixture: `__fixtures__/available-pokemon.html`
 *   (Phase 4 HtmlCache 자동 저장본, 2026-04-24T07:49Z status 200)
 *
 * describe 는 `max-lines-per-function` 60 룰을 지키기 위해 주제별로 분할한다.
 * fixture 파싱 결과는 모듈 레벨에서 한 번만 수행하여 모든 describe 가 공유.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AvailablePokemonParser } from './available-pokemon.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/available-pokemon.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/availablepokemon.shtml';
const FIXED_SCRAPED_AT = '2026-04-24T07:49:02.136Z';

const parser = new AvailablePokemonParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('AvailablePokemonParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('available-pokemon');
  });

  it('fixture 기준 정확 308 개 엔티티 추출', () => {
    // 셀렉터 드리프트 시 제일 먼저 깨질 기대값. 실패하면 fixture 갱신 + 셀렉터
    // 점검 + SELECTOR_VERSION bump 여부 판단.
    expect(entities.length).toBe(308);
  });

  it('구조적 파싱 이슈 0 건 (깨끗한 파싱)', () => {
    expect(issues).toEqual([]);
  });
});

describe('AvailablePokemonParser — 대표 엔티티 필드', () => {
  it('#001 Bulbasaur — 단일 specialty / 절대 이미지 URL / 플래그 false', () => {
    const first = entities[0];
    expect(first).toBeDefined();
    expect(first?.pokedexNo).toBe(1);
    expect(first?.nameEn).toBe('Bulbasaur');
    expect(first?.imageUrl).toBe('https://www.serebii.net/pokemonpokopia/pokemon/small/001.png');
    expect(first?.specialties).toEqual(['Grow']);
    expect(first?.isEvent).toBe(false);
    expect(first?.isUniqueCharacter).toBe(false);
    expect(first?.isLegendary).toBe(false);
  });

  it('#003 Venusaur — specialty 2 개 (Grow + Litter, 순서 보존)', () => {
    const venusaur = entities.find((e) => e.pokedexNo === 3);
    expect(venusaur?.nameEn).toBe('Venusaur');
    expect(venusaur?.specialties).toEqual(['Grow', 'Litter']);
  });

  it('#006 Charizard — specialty 2 개 (Burn + Fly)', () => {
    const charizard = entities.find((e) => e.pokedexNo === 6);
    expect(charizard?.nameEn).toBe('Charizard');
    expect(charizard?.specialties).toEqual(['Burn', 'Fly']);
  });
});

describe('AvailablePokemonParser — SourceMetadata / 불변식', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
    expect(entities.every((e) => e.license.length > 0)).toBe(true);
    expect(entities.every((e) => e.copyrightHolder.length > 0)).toBe(true);
    expect(entities.every((e) => e.attribution.includes('Serebii.net'))).toBe(true);
  });

  it('imageUrl 은 항상 Serebii 절대 URL', () => {
    const withImage = entities.filter((e) => e.imageUrl !== undefined);
    expect(withImage.length).toBe(entities.length);
    expect(
      withImage.every((e) => (e.imageUrl ?? '').startsWith('https://www.serebii.net/')),
    ).toBe(true);
  });

  it('pokedex_no 범위 1..300, unique 300 (form variant 로 중복 8 행 허용)', () => {
    const nos = entities.map((e) => e.pokedexNo).filter((n): n is number => n !== null);
    expect(nos.length).toBe(308);
    expect(Math.min(...nos)).toBe(1);
    expect(Math.max(...nos)).toBe(300);
    expect(new Set(nos).size).toBe(300);
  });

  it('모든 엔티티의 isEvent/isUniqueCharacter/isLegendary 가 false (이 페이지 대상)', () => {
    expect(entities.every((e) => e.isEvent === false)).toBe(true);
    expect(entities.every((e) => e.isUniqueCharacter === false)).toBe(true);
    expect(entities.every((e) => e.isLegendary === false)).toBe(true);
  });
});

describe('AvailablePokemonParser — 엣지', () => {
  it('빈 HTML — missing-section 이슈 1 건 + entities 0', () => {
    const result = parser.parse('<!doctype html><html><body></body></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.kind).toBe('missing-section');
  });

  it('scrapedAt 미지정 시 호출 시점 UTC ISO 문자열 생성 + 모든 엔티티 공유', () => {
    const minimalHtml = `
      <table class="tab">
        <tr>
          <td class="cen">#001</td>
          <td class="cen"><img src="/pokemonpokopia/pokemon/small/001.png" /></td>
          <td class="cen"><a><u>Bulbasaur</u></a></td>
          <td class="cen">
            <table><tr>
              <td><a href="/pokemonpokopia/pokedex/specialty/grow.shtml"><u>Grow</u></a></td>
            </tr></table>
          </td>
        </tr>
      </table>
    `;
    const before = Date.now();
    const result = parser.parse(minimalHtml, { sourceUrl: FIXTURE_URL });
    const after = Date.now();

    expect(result.entities.length).toBe(1);
    const first = result.entities[0];
    expect(first).toBeDefined();
    if (!first) return;
    const scrapedMs = new Date(first.scrapedAt).getTime();
    expect(scrapedMs).toBeGreaterThanOrEqual(before);
    expect(scrapedMs).toBeLessThanOrEqual(after);
  });
});
