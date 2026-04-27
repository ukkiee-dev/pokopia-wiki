/**
 * UniquePokemonParser 회귀 테스트 (Phase 8 단계 26 — TDD).
 *
 * fixture: `__fixtures__/uniquepokemon.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 41KB)
 *
 * fixture 기준 4 unique pokemon (pokemon entity 보강 전용):
 *   - Professor Tangrowth (slug=professortangrowth)
 *   - Peakychu (variant of Pikachu)
 *   - Mosslax (variant of Snorlax)
 *   - Smearguru (variant of Smeargle)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { UniquePokemonParser } from './unique-pokemon.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/uniquepokemon.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/uniquepokemon.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new UniquePokemonParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('UniquePokemonParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('uniquepokemon');
  });

  it('정확 4 unique pokemon', () => {
    expect(entities.length).toBe(4);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('UniquePokemonParser — 대표 엔티티', () => {
  it('Professor Tangrowth — slug=professortangrowth, imageUrl 존재', () => {
    const e = entities.find((x) => x.slug === 'professortangrowth');
    expect(e?.nameEn).toBe('Professor Tangrowth');
    expect(e?.descriptionEn).toContain('guide to Ditto');
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/professortangrowth.png',
    );
  });

  it('Peakychu — Pikachu variant 정보', () => {
    const e = entities.find((x) => x.slug === 'peakychu');
    expect(e?.nameEn).toBe('Peakychu');
    expect(e?.descriptionEn).toContain('Pikachu');
    expect(e?.descriptionEn).toContain('droopy');
  });

  it('Mosslax — Snorlax variant 정보', () => {
    const e = entities.find((x) => x.slug === 'mosslax');
    expect(e?.nameEn).toBe('Mosslax');
    expect(e?.descriptionEn).toContain('Snorlax');
    expect(e?.descriptionEn).toContain('Moss');
  });

  it('Smearguru — painter 키워드', () => {
    const e = entities.find((x) => x.slug === 'smearguru');
    expect(e?.nameEn).toBe('Smearguru');
    expect(e?.descriptionEn).toContain('painter');
  });
});

describe('UniquePokemonParser — 구조 불변식', () => {
  it('모든 slug 이 소문자 영숫자', () => {
    expect(entities.every((e) => /^[a-z0-9]+$/.test(e.slug))).toBe(true);
  });

  it('slug 4 개 모두 unique', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 엔티티가 nameEn / descriptionEn / imageUrl 보유', () => {
    expect(entities.every((e) => e.nameEn.length > 0)).toBe(true);
    expect(entities.every((e) => (e.descriptionEn ?? '').length > 0)).toBe(true);
    expect(entities.every((e) => e.imageUrl !== undefined)).toBe(true);
  });

  it('모든 imageUrl 이 serebii 절대 URL', () => {
    expect(
      entities.every(
        (e) =>
          e.imageUrl !== undefined &&
          e.imageUrl.startsWith('https://www.serebii.net/pokemonpokopia/'),
      ),
    ).toBe(true);
  });
});

describe('UniquePokemonParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('UniquePokemonParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
