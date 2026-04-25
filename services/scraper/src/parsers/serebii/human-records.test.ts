/**
 * HumanRecordsParser 회귀 테스트 (Phase 8 단계 29 — TDD).
 *
 * fixture: `__fixtures__/humanrecords.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 78KB)
 *
 * fixture 기준 126 human_record:
 *   - Newspaper 12 / Diary 16 / Magazine 53 / Note 11 / Letter 12 / Paper 4 / Photo 18
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { HumanRecordsParser } from './human-records.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/humanrecords.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/humanrecords.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new HumanRecordsParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('HumanRecordsParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('humanrecords');
  });

  it('정확 126 human_record', () => {
    expect(entities.length).toBe(126);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });

  it('카테고리별 분포: Newspaper 12 / Diary 16 / Magazine 53 / Note 11 / Letter 12 / Paper 4 / Photo 18', () => {
    expect(entities.filter((e) => e.category === 'Newspaper').length).toBe(12);
    expect(entities.filter((e) => e.category === 'Diary').length).toBe(16);
    expect(entities.filter((e) => e.category === 'Magazine').length).toBe(53);
    expect(entities.filter((e) => e.category === 'Note').length).toBe(11);
    expect(entities.filter((e) => e.category === 'Letter').length).toBe(12);
    expect(entities.filter((e) => e.category === 'Paper').length).toBe(4);
    expect(entities.filter((e) => e.category === 'Photo').length).toBe(18);
  });
});

describe('HumanRecordsParser — 대표 엔티티', () => {
  it('Road Closure Announcement — Newspaper, Withered Wastelands, none reward', () => {
    const e = entities.find(
      (x) => x.nameEn === 'Road Closure Announcement' && x.category === 'Newspaper',
    );
    expect(e?.locationSlug).toBe('witheredwastelands');
    expect(e?.rawLocationEn).toBe('Withered Wasteland');
    expect(e?.rewardType).toBe('none');
    expect(e?.slug).toContain('human-record-newspaper-');
  });

  it('The Legendary Ninja Family — Newspaper + Ninja outfit → customization', () => {
    const e = entities.find((x) => x.nameEn === 'The Legendary Ninja Family');
    expect(e?.category).toBe('Newspaper');
    expect(e?.rewardType).toBe('customization');
    expect(e?.rawRewardEn).toBe('Ninja outfit');
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/items/grubbytablet.png',
    );
  });
});

describe('HumanRecordsParser — 구조 불변식', () => {
  it('모든 slug 이 human-record- 접두사', () => {
    expect(entities.every((e) => e.slug.startsWith('human-record-'))).toBe(true);
  });

  it('slug 126 개 모두 unique (category + name 조합)', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 category 가 SCHEMA ENUM 7 종 중 하나', () => {
    const validCategories = new Set([
      'Newspaper',
      'Diary',
      'Magazine',
      'Note',
      'Letter',
      'Paper',
      'Photo',
    ]);
    expect(entities.every((e) => validCategories.has(e.category))).toBe(true);
  });

  it('모든 rewardType 이 SCHEMA ENUM 4 종 중 하나', () => {
    const validRewardTypes = new Set(['customization', 'item', 'cd', 'none']);
    expect(entities.every((e) => validRewardTypes.has(e.rewardType))).toBe(true);
  });

  it('모든 nameEn 비어있지 않음', () => {
    expect(entities.every((e) => e.nameEn.length > 0)).toBe(true);
  });
});

describe('HumanRecordsParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('HumanRecordsParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
