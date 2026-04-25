/**
 * LitterParser 회귀 테스트 (Phase 8 단계 35 — TDD).
 *
 * fixture: `__fixtures__/litter.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 71KB)
 *
 * fixture 기준 34 pokemon_litter_reward (Litter specialty 보유 포켓몬).
 * 페이지 표는 dextable 이 아닌 class="tab" 사용.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LitterParser } from './litter.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/litter.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/litter.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new LitterParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('LitterParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('litter');
  });

  it('정확 34 pokemon_litter_reward', () => {
    expect(entities.length).toBe(34);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('LitterParser — 대표 엔티티', () => {
  it('Venusaur #3 → Leaf (slug=litter-reward-venusaur-leaf)', () => {
    const e = entities.find((x) => x.pokemonSlug === 'venusaur');
    expect(e?.slug).toBe('litter-reward-venusaur-leaf');
    expect(e?.pokemonNameEn).toBe('Venusaur');
    expect(e?.pokedexNo).toBe(3);
    expect(e?.itemSlug).toBe('leaf');
    expect(e?.itemNameEn).toContain('Leaf');
  });

  it('Bellsprout #21 → Vine Rope (slug=vinerope)', () => {
    const e = entities.find((x) => x.pokemonSlug === 'bellsprout');
    expect(e?.pokedexNo).toBe(21);
    expect(e?.itemSlug).toBe('vinerope');
  });

  it('Combee #57 → Honey', () => {
    const e = entities.find((x) => x.pokemonSlug === 'combee');
    expect(e?.itemSlug).toBe('honey');
    expect(e?.pokedexNo).toBe(57);
  });
});

describe('LitterParser — 구조 불변식', () => {
  it('모든 slug 이 litter-reward- 접두사', () => {
    expect(entities.every((e) => e.slug.startsWith('litter-reward-'))).toBe(true);
  });

  it('slug 34 개 모두 unique (pokemon + item 조합)', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 pokedexNo 가 양의 정수', () => {
    expect(entities.every((e) => e.pokedexNo >= 1)).toBe(true);
  });

  it('모든 habitatSlug / dropRate 미산출 (loader 보강 영역)', () => {
    expect(entities.every((e) => e.habitatSlug === undefined)).toBe(true);
    expect(entities.every((e) => e.dropRate === undefined)).toBe(true);
  });
});

describe('LitterParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('LitterParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
