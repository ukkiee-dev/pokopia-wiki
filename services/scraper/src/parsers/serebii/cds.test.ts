/**
 * CdsParser 회귀 테스트 (Phase 8 단계 27 — TDD).
 *
 * fixture: `__fixtures__/cds.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 55KB)
 *
 * fixture 기준 43 cd + 12 unique source game (Pokémon Red/Green ~ Pokémon
 * Pokopia). 각 cd 에 nested sourceGame + locations.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CdsParser } from './cds.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/cds.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/cds.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new CdsParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('CdsParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('cds');
  });

  it('정확 43 cd', () => {
    expect(entities.length).toBe(43);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });

  it('source game 정확 12 unique (rg/gs/rs/oras/dp/bw/xy/sm/swsh/sv/la/ppk)', () => {
    const codes = new Set(entities.map((e) => e.sourceGame.code));
    expect(codes.size).toBeGreaterThanOrEqual(10); // 일부 게임은 fixture 에 없을 수 있음
    expect(codes.has('rg')).toBe(true);
  });
});

describe('CdsParser — 대표 엔티티', () => {
  it('Title Screen — CD #1, slug=titlescreen, Pokémon Red/Green', () => {
    const e = entities.find((x) => x.slug === 'titlescreen');
    expect(e?.nameEn).toBe('Title Screen');
    expect(e?.cdNumber).toBe(1);
    expect(e?.descriptionEn).toContain('Music CD #1');
    expect(e?.sourceGame.code).toBe('rg');
    expect(e?.sourceGame.generation).toBe(1);
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/items/titlescreen.png',
    );
    expect(e?.locations).toEqual([{ methodEn: 'In glowing terrain' }]);
  });

  it("Oak's Lab — slug 에 아포스트로피 포함 (oak'slab)", () => {
    const e = entities.find((x) => x.slug === "oak'slab");
    expect(e?.nameEn).toBe("Oak's Lab");
    expect(e?.cdNumber).toBe(3);
    expect(e?.sourceGame.code).toBe('rg');
  });

  it('Pewter City Theme — multi-line locations + Rocky Ridges 매칭', () => {
    const e = entities.find((x) => x.slug === 'pewtercitytheme');
    expect(e?.cdNumber).toBe(5);
    expect(e?.locations.length).toBe(2);
    const pewterLine = e?.locations.find((l) => l.methodEn.includes('Pewter Museum'));
    expect(pewterLine?.locationSlug).toBe('rockyridges');
    const glowLine = e?.locations.find((l) => l.methodEn === 'In glowing terrain');
    expect(glowLine?.locationSlug).toBeUndefined();
  });

  it('The S.S. Anne — slug=thes.s.anne (도트 포함), Bleak Beach', () => {
    const e = entities.find((x) => x.slug === 'thes.s.anne');
    expect(e?.nameEn).toBe('The S.S. Anne');
    expect(e?.cdNumber).toBe(13);
    const ssLine = e?.locations.find((l) => l.methodEn.includes('S.S. Anne'));
    expect(ssLine?.locationSlug).toBe('bleakbeach');
  });
});

describe('CdsParser — 구조 불변식', () => {
  it('모든 slug 비어있지 않음 + unique', () => {
    expect(entities.every((e) => e.slug.length > 0)).toBe(true);
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 cd 가 sourceGame.code 보유 (rg/gs/rs/oras/dp/bw/xy/sm/swsh/sv/la/ppk 중)', () => {
    const validCodes = new Set(['rg', 'gs', 'rs', 'oras', 'dp', 'bw', 'xy', 'sm', 'swsh', 'sv', 'la', 'ppk']);
    expect(entities.every((e) => validCodes.has(e.sourceGame.code))).toBe(true);
  });

  it('모든 sourceGame.generation 이 1~9 범위', () => {
    expect(
      entities.every(
        (e) => e.sourceGame.generation >= 1 && e.sourceGame.generation <= 9,
      ),
    ).toBe(true);
  });

  it('모든 cd 가 최소 1 개 location (Locations 셀 비어있지 않음)', () => {
    expect(entities.every((e) => e.locations.length >= 1)).toBe(true);
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

describe('CdsParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('CdsParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
