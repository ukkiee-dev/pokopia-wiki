/**
 * DreamIslandsParser / CloudIslandsParser 회귀 테스트 (Phase 8 단계 39/40 — TDD).
 *
 * fixture: `__fixtures__/dreamislands.html` (45KB) + `__fixtures__/cloudislands.html` (43KB)
 *
 * fixture 기준:
 *   - DreamIslandsParser: 5 island_variant + 각 3 focus rewards = 15 reward
 *   - CloudIslandsParser: 6 island_variant (rewards 없음, code-based)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CloudIslandsParser } from './cloud-islands.js';
import { DreamIslandsParser } from './dream-islands.js';

const DREAM_PATH = path.resolve(import.meta.dirname, '__fixtures__/dreamislands.html');
const CLOUD_PATH = path.resolve(import.meta.dirname, '__fixtures__/cloudislands.html');
const DREAM_URL = 'https://www.serebii.net/pokemonpokopia/dreamislands.shtml';
const CLOUD_URL = 'https://www.serebii.net/pokemonpokopia/cloudislands.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const dreamParser = new DreamIslandsParser();
const cloudParser = new CloudIslandsParser();

const dreamResult = dreamParser.parse(readFileSync(DREAM_PATH, 'utf8'), {
  sourceUrl: DREAM_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});
const cloudResult = cloudParser.parse(readFileSync(CLOUD_PATH, 'utf8'), {
  sourceUrl: CLOUD_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('DreamIslandsParser', () => {
  it('파서 메타', () => {
    expect(dreamParser.SELECTOR_VERSION).toBe('1');
    expect(dreamParser.pageId).toBe('dreamislands');
  });

  it('정확 7 island_variant (5 doll + Ditto/Substitute Doll)', () => {
    expect(dreamResult.entities.length).toBe(7);
  });

  it('이슈 0 건', () => {
    expect(dreamResult.issues).toEqual([]);
  });

  it('총 17 reward (5 doll × 3 focus + Ditto/Substitute × Random 1 each)', () => {
    const total = dreamResult.entities.reduce((s, e) => s + e.rewards.length, 0);
    expect(total).toBe(17);
  });

  it('Pikachu Doll variant — 첫 행', () => {
    const e = dreamResult.entities.find((x) => x.variantKey === 'pikachudoll');
    expect(e?.slug).toBe('island-variant-dreamisland-pikachudoll');
    expect(e?.nameEn).toBe('Pikachu Doll');
    expect(e?.locationSlug).toBe('dreamisland');
    expect(e?.rewards.length).toBe(3);
    expect(e?.rewards[0]?.itemSlug).toBe('twine');
  });

  it('Eevee Doll → Suicune (Leppa Berry, Vine Rope, Glowing Mushrooms focus)', () => {
    const e = dreamResult.entities.find((x) => x.variantKey === 'eeveedoll');
    expect(e?.rewards.map((r) => r.itemSlug)).toEqual([
      'leppaberry',
      'vinerope',
      'glowingmushrooms',
    ]);
  });

  it('모든 rewards 의 rewardType=item', () => {
    expect(
      dreamResult.entities.every((e) => e.rewards.every((r) => r.rewardType === 'item')),
    ).toBe(true);
  });
});

describe('CloudIslandsParser', () => {
  it('파서 메타', () => {
    expect(cloudParser.SELECTOR_VERSION).toBe('1');
    expect(cloudParser.pageId).toBe('cloudislands');
  });

  it('정확 6 island_variant', () => {
    expect(cloudResult.entities.length).toBe(6);
  });

  it('이슈 0 건', () => {
    expect(cloudResult.issues).toEqual([]);
  });

  it('rewards 모두 빈 배열 (cloud island 는 reward 없음)', () => {
    expect(cloudResult.entities.every((e) => e.rewards.length === 0)).toBe(true);
  });

  it('Poké Times 첫 cloud island — code 정확 추출', () => {
    const e = cloudResult.entities[0];
    expect(e?.locationSlug).toBe('cloudisland');
    expect(e?.code).toBe('PXQC G03S');
    expect(e?.variantKey).toBe('pxqcg03s');
    expect(e?.slug).toBe('island-variant-cloudisland-pxqcg03s');
  });

  it('IKEA Island code', () => {
    const e = cloudResult.entities.find((x) => x.code === '0SJ8 5TRX');
    expect(e?.nameEn).toContain('IKEA');
  });

  it('모든 code 가 unique', () => {
    const codes = cloudResult.entities.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('Islands — 통합 불변식', () => {
  const all = [...dreamResult.entities, ...cloudResult.entities];

  it('총 13 island_variant (7 dream + 6 cloud)', () => {
    expect(all.length).toBe(13);
  });

  it('모든 slug 이 island-variant- 접두사 + unique', () => {
    expect(all.every((e) => e.slug.startsWith('island-variant-'))).toBe(true);
    const slugs = all.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('locationSlug 가 dreamisland 또는 cloudisland', () => {
    expect(
      all.every(
        (e) => e.locationSlug === 'dreamisland' || e.locationSlug === 'cloudisland',
      ),
    ).toBe(true);
  });
});

describe('Islands — 엣지', () => {
  it('Dream 빈 HTML — missing-section', () => {
    const r = dreamParser.parse('<!doctype html><html></html>', {
      sourceUrl: DREAM_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(r.entities).toEqual([]);
    expect(r.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });

  it('Cloud 빈 HTML — missing-section', () => {
    const r = cloudParser.parse('<!doctype html><html></html>', {
      sourceUrl: CLOUD_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(r.entities).toEqual([]);
    expect(r.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
