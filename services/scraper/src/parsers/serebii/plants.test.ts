/**
 * FlowersParser / VegetablesParser 회귀 테스트 (Phase 8 단계 31 — TDD).
 *
 * fixture: `__fixtures__/flowers.html` (63KB) + `__fixtures__/vegetables.html` (46KB)
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200)
 *
 * fixture 기준:
 *   - FlowersParser: 13 base plant ("List of Standard Plants & Berry Trees" 표)
 *   - VegetablesParser: 4 vegetable (Bean/Tomato/Potato/Wheat)
 *   - 합계 17 plant
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FlowersParser, VegetablesParser } from './plants.js';

const FLOWERS_PATH = path.resolve(import.meta.dirname, '__fixtures__/flowers.html');
const VEGETABLES_PATH = path.resolve(import.meta.dirname, '__fixtures__/vegetables.html');
const FLOWERS_URL = 'https://www.serebii.net/pokemonpokopia/flowers.shtml';
const VEGETABLES_URL = 'https://www.serebii.net/pokemonpokopia/vegetables.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const flowersParser = new FlowersParser();
const vegetablesParser = new VegetablesParser();

const flowersResult = flowersParser.parse(readFileSync(FLOWERS_PATH, 'utf8'), {
  sourceUrl: FLOWERS_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

const vegetablesResult = vegetablesParser.parse(readFileSync(VEGETABLES_PATH, 'utf8'), {
  sourceUrl: VEGETABLES_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('FlowersParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(flowersParser.SELECTOR_VERSION).toBe('1');
    expect(flowersParser.sourceSite).toBe('serebii');
    expect(flowersParser.pageId).toBe('flowers');
  });

  it('정확 13 base plant', () => {
    expect(flowersResult.entities.length).toBe(13);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(flowersResult.issues).toEqual([]);
  });
});

describe('FlowersParser — type 추론', () => {
  it('Leppa tree → BerryTree', () => {
    const e = flowersResult.entities.find((x) => x.slug === 'leppatree');
    expect(e?.nameEn).toBe('Leppa tree');
    expect(e?.type).toBe('BerryTree');
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/items/leppatree.png',
    );
  });

  it('Wildflowers → Wildflower', () => {
    const e = flowersResult.entities.find((x) => x.slug === 'wildflowers');
    expect(e?.type).toBe('Wildflower');
  });

  it('Seashore flowers → SeashorFlower (SCHEMA 의 typo 그대로)', () => {
    const e = flowersResult.entities.find((x) => x.slug === 'seashoreflowers');
    expect(e?.type).toBe('SeashorFlower');
  });

  it('Mountain flowers → MountainFlower', () => {
    const e = flowersResult.entities.find((x) => x.slug === 'mountainflowers');
    expect(e?.type).toBe('MountainFlower');
  });

  it('Skyland flowers → SkylandFlower', () => {
    const e = flowersResult.entities.find((x) => x.slug === 'skylandflowers');
    expect(e?.type).toBe('SkylandFlower');
  });

  it('Beautiful flower → DecorativeFlower', () => {
    const e = flowersResult.entities.find((x) => x.slug === 'beautifulflower');
    expect(e?.type).toBe('DecorativeFlower');
  });

  it('Adorable hedge → Hedge', () => {
    const e = flowersResult.entities.find((x) => x.slug === 'adorablehedge');
    expect(e?.type).toBe('Hedge');
  });
});

describe('VegetablesParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타', () => {
    expect(vegetablesParser.SELECTOR_VERSION).toBe('1');
    expect(vegetablesParser.sourceSite).toBe('serebii');
    expect(vegetablesParser.pageId).toBe('vegetables');
  });

  it('정확 4 vegetable (Bean/Tomato/Potato/Wheat)', () => {
    expect(vegetablesResult.entities.length).toBe(4);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(vegetablesResult.issues).toEqual([]);
  });

  it('모든 vegetable 의 type=Vegetable', () => {
    expect(vegetablesResult.entities.every((e) => e.type === 'Vegetable')).toBe(true);
  });

  it('Bean / Tomato / Potato / Wheat 4 종 정확', () => {
    const slugs = new Set(vegetablesResult.entities.map((e) => e.slug));
    expect(slugs).toEqual(new Set(['bean', 'tomato', 'potato', 'wheat']));
  });
});

describe('Plants — 구조 불변식 (전체)', () => {
  const all = [...flowersResult.entities, ...vegetablesResult.entities];

  it('총 17 plant', () => {
    expect(all.length).toBe(17);
  });

  it('모든 slug unique', () => {
    const slugs = all.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 type 이 SCHEMA ENUM 8 종 중 하나', () => {
    const validTypes = new Set([
      'BerryTree',
      'Wildflower',
      'SeashorFlower',
      'MountainFlower',
      'SkylandFlower',
      'DecorativeFlower',
      'Hedge',
      'Vegetable',
    ]);
    expect(all.every((e) => validTypes.has(e.type))).toBe(true);
  });

  it('default 값: growthDays=1, growthDaysWithGrow=1, requiresHydration=false', () => {
    expect(all.every((e) => e.growthDays === 1)).toBe(true);
    expect(all.every((e) => e.growthDaysWithGrow === 1)).toBe(true);
    expect(all.every((e) => e.requiresHydration === false)).toBe(true);
  });

  it('variants 모두 빈 배열 (loader 보강 영역)', () => {
    expect(all.every((e) => e.variants.length === 0)).toBe(true);
  });
});

describe('Plants — SourceMetadata', () => {
  it('flowers entities 에 SourceMetadata 완전 주입', () => {
    expect(flowersResult.entities.every((e) => e.sourceUrl === FLOWERS_URL)).toBe(true);
  });

  it('vegetables entities 에 SourceMetadata 완전 주입', () => {
    expect(vegetablesResult.entities.every((e) => e.sourceUrl === VEGETABLES_URL)).toBe(
      true,
    );
  });
});

describe('Plants — 엣지', () => {
  it('FlowersParser 빈 HTML — missing-section', () => {
    const result = flowersParser.parse('<!doctype html><html></html>', {
      sourceUrl: FLOWERS_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });

  it('VegetablesParser 빈 HTML — missing-section', () => {
    const result = vegetablesParser.parse('<!doctype html><html></html>', {
      sourceUrl: VEGETABLES_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
