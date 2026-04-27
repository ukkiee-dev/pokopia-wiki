/**
 * SpecialtyParser 회귀 테스트 (Phase 8 단계 2 — TDD RED/GREEN).
 *
 * fixture: `__fixtures__/specialty.html`
 *   (scripts/capture-fixture.ts 로 2026-04-24T21:39Z status 200 수집)
 *
 * fixture 기준 31 개 specialty 관측 — DATA_COLLECTION_PLAN 의 "33 종 추정" 대비
 * 실측 차이. 수량 추정 업데이트는 Phase 9 (`실측 수량 문서 반영`) 에서 처리.
 *
 * describe 는 `max-lines-per-function` 60 룰에 맞춰 주제별 분할.
 * 파싱 결과는 모듈 레벨에서 한 번 수행 후 재사용.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SpecialtyParser } from './specialty.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/specialty.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/specialty.shtml';
const FIXED_SCRAPED_AT = '2026-04-24T21:39:43.000Z';

const parser = new SpecialtyParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('SpecialtyParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('specialty');
  });

  it('fixture 기준 정확 31 개 엔티티 추출', () => {
    // 셀렉터 드리프트 시 제일 먼저 깨질 기대값. 실패하면 fixture 갱신 + 셀렉터
    // 점검 + SELECTOR_VERSION bump 여부 판단.
    expect(entities.length).toBe(31);
  });

  it('구조적 파싱 이슈 0 건 (깨끗한 파싱)', () => {
    expect(issues).toEqual([]);
  });
});

describe('SpecialtyParser — 대표 엔티티 필드', () => {
  it('Appraise — 첫 행, 단일 단어 slug, 설명 포함', () => {
    const first = entities[0];
    expect(first).toBeDefined();
    expect(first?.slug).toBe('appraise');
    expect(first?.nameEn).toBe('Appraise');
    expect(first?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/pokedex/specialty/appraise.png',
    );
    expect(first?.descriptionEn).toContain('lost relics');
    expect(first?.descriptionEn).toContain('Tangrowth');
  });

  it('Gather Honey — 복합 단어 nameEn, 붙여쓰기 slug', () => {
    const gatherHoney = entities.find((e) => e.slug === 'gatherhoney');
    expect(gatherHoney?.nameEn).toBe('Gather Honey');
    expect(gatherHoney?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/pokedex/specialty/gatherhoney.png',
    );
  });

  it('Party — alt/u 에 trailing space 가 붙어있어도 nameEn 은 trim 됨', () => {
    const party = entities.find((e) => e.slug === 'party');
    expect(party?.nameEn).toBe('Party');
  });

  it('DJ — 2 글자 slug 와 대문자 nameEn 보존', () => {
    const dj = entities.find((e) => e.slug === 'dj');
    expect(dj?.nameEn).toBe('DJ');
  });

  it('Yawn — 마지막 행, descriptionEn 에 HTML entity 디코드 (Pokémon)', () => {
    const yawn = entities.find((e) => e.slug === 'yawn');
    expect(yawn?.nameEn).toBe('Yawn');
    expect(yawn?.descriptionEn).toContain('Pokémon');
    expect(yawn?.descriptionEn).toContain('humid');
  });
});

describe('SpecialtyParser — SourceMetadata / 불변식', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
    expect(entities.every((e) => e.license.length > 0)).toBe(true);
    expect(entities.every((e) => e.copyrightHolder.length > 0)).toBe(true);
    expect(entities.every((e) => e.attribution.includes('Serebii.net'))).toBe(true);
  });

  it('모든 slug 고유 + 소문자 + 공백 없음', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((s) => s === s.toLowerCase())).toBe(true);
    expect(slugs.every((s) => !s.includes(' '))).toBe(true);
  });

  it('모든 imageUrl 이 Serebii 절대 URL', () => {
    const withImage = entities.filter((e) => e.imageUrl !== undefined);
    expect(withImage.length).toBe(entities.length);
    expect(
      withImage.every((e) => (e.imageUrl ?? '').startsWith('https://www.serebii.net/')),
    ).toBe(true);
  });

  it('모든 descriptionEn 이 존재하고 비어있지 않음', () => {
    const withDesc = entities.filter((e) => e.descriptionEn !== undefined);
    expect(withDesc.length).toBe(entities.length);
    expect(withDesc.every((e) => (e.descriptionEn ?? '').length > 0)).toBe(true);
  });
});

describe('SpecialtyParser — 엣지', () => {
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
      <table class="dextable">
        <tr>
          <td class="fooevo">Picture</td>
          <td class="fooevo">Name</td>
          <td class="fooevo">Description</td>
        </tr>
        <tr>
          <td class="cen"><a href="pokedex/specialty/grow.shtml"><img src="pokedex/specialty/grow.png" alt="Grow" /></a></td>
          <td class="fooinfo"><a href="pokedex/specialty/grow.shtml"><u>Grow</u></a></td>
          <td class="fooinfo">Grow things.</td>
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
