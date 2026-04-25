/**
 * TeamChallengeParser 회귀 테스트 (Phase 8 단계 24 — TDD).
 *
 * fixture: `__fixtures__/teaminitiationchallenge.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 42KB)
 *
 * fixture 기준 9 team_challenge:
 *   - Stage 1 → Bouldery Badge (5 Leppa Berry)
 *   - Stage 2 → Cascade-like Badge (10 Beans + 10 Tomatoes + 10 Wheat)
 *   - Stage 3 → Thunderish Badge (20 Lumber + 5 Fluff + 10 Paper) + Notes
 *   - Stage 4 → Rainbowish Badge
 *   - Stage 5 → Soul-like Badge
 *   - Stage 6 → Marshy Badge (4 Industrial Beds + 4 Resort Lights + 4 Office Desks)
 *   - Stage 7 → Volcanoey Badge (수량 없는 item: Washing Machine/Refrigerator/Game Boy)
 *   - Stage 8 → Earth Badge (Cherished Photo, 수량 없음)
 *   - Stage 9 → 빈 reward (badgeName undefined)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TeamChallengeParser } from './team-challenge.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/teaminitiationchallenge.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/teaminitiationchallenge.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new TeamChallengeParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('TeamChallengeParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('teaminitiationchallenge');
  });

  it('정확 9 team_challenge', () => {
    expect(entities.length).toBe(9);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });

  it('stage 1~9 모두 unique', () => {
    const stages = entities.map((e) => e.stage).toSorted((a, b) => a - b);
    expect(stages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('TeamChallengeParser — 대표 엔티티', () => {
  it('Stage 1 — Bouldery Badge, 단일 requirement (5 Leppa Berry)', () => {
    const e = entities.find((x) => x.stage === 1);
    expect(e?.slug).toBe('team-challenge-stage1');
    expect(e?.badgeName).toBe('Bouldery Badge');
    expect(e?.requirements).toEqual([{ itemNameEn: 'Leppa Berry', quantity: 5 }]);
  });

  it('Stage 2 — Cascade-like Badge, 3 requirements 모두 10', () => {
    const e = entities.find((x) => x.stage === 2);
    expect(e?.badgeName).toBe('Cascade-like Badge');
    expect(e?.requirements).toEqual([
      { itemNameEn: 'Beans', quantity: 10 },
      { itemNameEn: 'Tomatoes', quantity: 10 },
      { itemNameEn: 'Wheat', quantity: 10 },
    ]);
  });

  it('Stage 3 — Thunderish Badge + notesEn 보유 (Fluff/Paper 출처)', () => {
    const e = entities.find((x) => x.stage === 3);
    expect(e?.badgeName).toBe('Thunderish Badge');
    expect(e?.notesEn).toContain('Fluff');
    expect(e?.notesEn).toContain('Paper');
  });

  it('Stage 7 — 수량 없는 items (Washing Machine/Refrigerator/Game Boy 각 quantity=1)', () => {
    const e = entities.find((x) => x.stage === 7);
    expect(e?.badgeName).toBe('Volcanoey Badge');
    expect(e?.requirements).toEqual([
      { itemNameEn: 'Washing Machine', quantity: 1 },
      { itemNameEn: 'Refrigerator', quantity: 1 },
      { itemNameEn: 'Game Boy', quantity: 1 },
    ]);
  });

  it('Stage 8 — Cherished Photo (수량 없음)', () => {
    const e = entities.find((x) => x.stage === 8);
    expect(e?.badgeName).toBe('Earth Badge');
    expect(e?.requirements).toEqual([{ itemNameEn: 'Cherished Photo', quantity: 1 }]);
  });

  it('Stage 9 — 빈 reward → badgeName undefined (loader placeholder 영역)', () => {
    const e = entities.find((x) => x.stage === 9);
    expect(e?.badgeName).toBeUndefined();
    expect(e?.requirements.length).toBeGreaterThanOrEqual(1);
  });
});

describe('TeamChallengeParser — 구조 불변식', () => {
  it('모든 slug 이 team-challenge-stage<n> 형식', () => {
    expect(
      entities.every((e) => e.slug === `team-challenge-stage${e.stage}`),
    ).toBe(true);
  });

  it('slug 9 개 모두 unique', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 stage 가 1~9 범위', () => {
    expect(entities.every((e) => e.stage >= 1 && e.stage <= 9)).toBe(true);
  });

  it('모든 challenge 가 최소 1 개 requirement', () => {
    expect(entities.every((e) => e.requirements.length >= 1)).toBe(true);
  });

  it('모든 requirement quantity ≥ 1', () => {
    expect(
      entities.every((e) => e.requirements.every((r) => r.quantity >= 1)),
    ).toBe(true);
  });
});

describe('TeamChallengeParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('TeamChallengeParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
