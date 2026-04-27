/**
 * EventPokedexParser 회귀 테스트 (Phase 8 단계 36 — TDD).
 *
 * fixture: `__fixtures__/eventpokedex.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 42KB)
 *
 * fixture 기준 4 event_pokemon (Hoppip #1 / Skiploom #2 / Jumpluff #3 /
 * Sableye #3 — eventPokedexNo 가 페이지 내 중복 가능).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EventPokedexParser } from './event-pokedex.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/eventpokedex.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/eventpokedex.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new EventPokedexParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('EventPokedexParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('eventpokedex');
  });

  it('정확 4 event_pokemon', () => {
    expect(entities.length).toBe(4);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('EventPokedexParser — 대표 엔티티', () => {
  it('Hoppip #1', () => {
    const e = entities.find((x) => x.pokemonSlug === 'hoppip');
    expect(e?.pokemonNameEn).toBe('Hoppip');
    expect(e?.eventPokedexNo).toBe(1);
    expect(e?.eventSlug).toBe('event-eventpokedex-default');
  });

  it('Sableye #3 (eventPokedexNo 중복: Jumpluff #3 와 같음)', () => {
    const sableye = entities.find((x) => x.pokemonSlug === 'sableye');
    const jumpluff = entities.find((x) => x.pokemonSlug === 'jumpluff');
    expect(sableye?.eventPokedexNo).toBe(3);
    expect(jumpluff?.eventPokedexNo).toBe(3);
    // pokemonSlug 는 unique
    expect(sableye?.slug).not.toBe(jumpluff?.slug);
  });
});

describe('EventPokedexParser — 구조 불변식', () => {
  it('모든 slug 이 event-pokemon-eventpokedex-default- 접두사', () => {
    expect(
      entities.every((e) => e.slug.startsWith('event-pokemon-eventpokedex-default-')),
    ).toBe(true);
  });

  it('slug 4 개 모두 unique (pokemonSlug 가 자연 키)', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 eventSlug 이 placeholder default', () => {
    expect(
      entities.every((e) => e.eventSlug === 'event-eventpokedex-default'),
    ).toBe(true);
  });

  it('모든 pokemonNameEn 비어있지 않음', () => {
    expect(entities.every((e) => e.pokemonNameEn.length > 0)).toBe(true);
  });
});

describe('EventPokedexParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('EventPokedexParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
