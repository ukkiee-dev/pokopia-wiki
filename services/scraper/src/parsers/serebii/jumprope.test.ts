/**
 * JumpropeParser 회귀 테스트 (Phase 8 단계 21 — TDD).
 *
 * fixture: `__fixtures__/jumprope.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 43KB)
 *
 * fixture 기준 11 jumprope_tier (두 dextable 합산):
 *   - "List of rewards" 표 (3 행): Copper Ore × 3 (0-49), Honey × 1 (50-99),
 *     Small Lost Relic × 1 (100+)
 *   - "List of Jump Rope contest rewards" 표 (8 행): Leppa Berry (5+) ~
 *     Rare Pokémetal (100+)
 *
 * 주의: fixture 의 일부 stamp/item 이름에 latin-1 인코딩 이슈로 `�` 가 포함될 수
 * 있음 (Pokémetal → Pok�metal).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { JumpropeParser } from './jumprope.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/jumprope.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/jumprope.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new JumpropeParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('JumpropeParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('jumprope');
  });

  it('두 표 합산 11 jumprope_tier', () => {
    expect(entities.length).toBe(11);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });

  it('tier 1~11 모두 unique', () => {
    const tiers = entities.map((e) => e.tier).toSorted((a, b) => a - b);
    expect(tiers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('JumpropeParser — 첫 표 (List of rewards)', () => {
  it('tier 1 — Copper Ore × 3, requiredJumps=0 (range 0-49)', () => {
    const e = entities.find((x) => x.tier === 1);
    expect(e?.itemNameEn).toBe('Copper Ore');
    expect(e?.itemSlug).toBe('copperore');
    expect(e?.quantity).toBe(3);
    expect(e?.requiredJumps).toBe(0);
    expect(e?.methodEn).toBe('0-49');
    expect(e?.rewardType).toBe('item');
  });

  it('tier 2 — Honey × 1, requiredJumps=50', () => {
    const e = entities.find((x) => x.tier === 2);
    expect(e?.itemNameEn).toBe('Honey');
    expect(e?.requiredJumps).toBe(50);
  });

  it('tier 3 — Small Lost Relic × 1, requiredJumps=100', () => {
    const e = entities.find((x) => x.tier === 3);
    expect(e?.itemNameEn).toBe('Small Lost Relic');
    expect(e?.requiredJumps).toBe(100);
    expect(e?.methodEn).toBe('100+');
  });
});

describe('JumpropeParser — 둘째 표 (Contest rewards)', () => {
  it('tier 4 — Leppa Berry × 5, requiredJumps=5 (Score)', () => {
    const e = entities.find((x) => x.tier === 4);
    expect(e?.itemNameEn).toBe('Leppa Berry');
    expect(e?.quantity).toBe(5);
    expect(e?.requiredJumps).toBe(5);
    expect(e?.methodEn).toBe('5+');
  });

  it('tier 9 — Jump Rope Trophy × 1, requiredJumps=50', () => {
    const e = entities.find((x) => x.tier === 9);
    expect(e?.itemNameEn).toBe('Jump Rope Trophy');
    expect(e?.requiredJumps).toBe(50);
  });

  it('tier 11 — Rare Pokémetal × 10, requiredJumps=100 (마지막 행)', () => {
    const e = entities.find((x) => x.tier === 11);
    expect(e?.itemSlug).toBe('rarepokemetal');
    expect(e?.quantity).toBe(10);
    expect(e?.requiredJumps).toBe(100);
  });
});

describe('JumpropeParser — 구조 불변식', () => {
  it('모든 slug 이 jumprope-tier<n>-<itemSlug> 형식', () => {
    expect(
      entities.every((e) => e.slug === `jumprope-tier${e.tier}-${e.itemSlug}`),
    ).toBe(true);
  });

  it('slug 11 개 모두 unique', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 rewardType = item (페이지 내 coin 보상 없음)', () => {
    expect(entities.every((e) => e.rewardType === 'item')).toBe(true);
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

describe('JumpropeParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
