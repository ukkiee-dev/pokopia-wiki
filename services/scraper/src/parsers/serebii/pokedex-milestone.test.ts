/**
 * PokedexMilestoneParser 회귀 테스트 (Phase 8 단계 32 — TDD).
 *
 * fixture: `__fixtures__/pokedexcompletion.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 44KB)
 *
 * fixture 기준 38 pokedex_milestone (6, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60,
 * 65, 70, 75, 80, 85, 90, 95, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190,
 * 200, 210, 220, 230, 240, 250, 260, 270, 290, 300 Registered).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PokedexMilestoneParser } from './pokedex-milestone.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/pokedexcompletion.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/pokedexcompletion.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new PokedexMilestoneParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('PokedexMilestoneParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('pokedexcompletion');
  });

  it('정확 38 pokedex_milestone', () => {
    expect(entities.length).toBe(38);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });

  it('requiredCount 분포: 6/15/20~100 (5단위)/110~270 (10단위)/290/300', () => {
    const counts = entities.map((e) => e.requiredCount).toSorted((a, b) => a - b);
    expect(counts[0]).toBe(6);
    expect(counts.at(-1)).toBe(300);
    expect(counts).toContain(15);
    expect(counts).toContain(100);
    expect(counts).toContain(290);
  });
});

describe('PokedexMilestoneParser — 대표 엔티티', () => {
  it('6 Registered → Storage Box recipe (recipe, slug=pokedex-milestone-6)', () => {
    const e = entities.find((x) => x.requiredCount === 6);
    expect(e?.slug).toBe('pokedex-milestone-6');
    expect(e?.rewardItemNameEn).toBe('Storage Box recipe');
    expect(e?.rewardType).toBe('recipe');
  });

  it('300 Registered → Neo Dowsing Machine recipe', () => {
    const e = entities.find((x) => x.requiredCount === 300);
    expect(e?.slug).toBe('pokedex-milestone-300');
    expect(e?.rewardItemNameEn).toBe('Neo Dowsing Machine recipe');
    expect(e?.rewardType).toBe('recipe');
  });

  it('20 Registered — "Stone tiling receipe" (typo) 도 recipe 분류', () => {
    const e = entities.find((x) => x.requiredCount === 20);
    expect(e?.rewardItemNameEn).toContain('receipe');
    expect(e?.rewardType).toBe('recipe');
  });

  it('100 Registered → Stylish stool recipe', () => {
    const e = entities.find((x) => x.requiredCount === 100);
    expect(e?.rewardItemNameEn).toBe('Stylish stool recipe');
  });
});

describe('PokedexMilestoneParser — 구조 불변식', () => {
  it('모든 slug 이 pokedex-milestone-<n> 형식', () => {
    expect(
      entities.every((e) => e.slug === `pokedex-milestone-${e.requiredCount}`),
    ).toBe(true);
  });

  it('slug 38 개 모두 unique (requiredCount unique)', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 rewardType 이 SCHEMA ENUM 3 종 중 하나', () => {
    const valid = new Set(['item', 'recipe', 'feature_unlock']);
    expect(entities.every((e) => valid.has(e.rewardType))).toBe(true);
  });

  it('모든 38 행이 rewardType=recipe (페이지 전체가 recipe 보상)', () => {
    expect(entities.every((e) => e.rewardType === 'recipe')).toBe(true);
  });

  it('모든 rewardItemNameEn 비어있지 않음', () => {
    expect(entities.every((e) => e.rewardItemNameEn.length > 0)).toBe(true);
  });
});

describe('PokedexMilestoneParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('PokedexMilestoneParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
