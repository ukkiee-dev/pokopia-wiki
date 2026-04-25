/**
 * StampCardParser / StampRewardParser 회귀 테스트 (Phase 8 단계 20 — TDD).
 *
 * fixture: `__fixtures__/stampcard.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 41KB)
 *
 * fixture 기준
 *   - StampCardParser: 1 StampCard (slug=weekly-stamp-card, weekGoal=5)
 *   - StampRewardParser: 5 StampReward
 *     · tier 1 Basic Pokémon — 50 Coins
 *     · tier 2 Evolved Pokémon — 100 Coins
 *     · tier 3 Legendary Pokémon — 200 Coins
 *     · tier 4 Mew — 1000 Coins
 *     · tier 5 Bonus (full card) — requiredStamps=5, 1500 Coins
 *
 * 주의: fixture 의 stamp 이름에 Unicode replacement char(`�`) 가 포함되어
 * 있다 — Serebii 가 본 페이지를 latin-1 로 저장해 capture-fixture 가 utf-8 로
 * 읽을 때 é 가 깨진 것 (fixture 갱신 시 인코딩 처리 추가 필요). 테스트는 fixture
 * 실측치(`Pok�mon`) 로 검증하여 결함을 명시.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { StampCardParser, StampRewardParser } from './stamp-card.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/stampcard.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/stampcard.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');

const cardParser = new StampCardParser();
const cardResult = cardParser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

const rewardParser = new StampRewardParser();
const rewardResult = rewardParser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('StampCardParser — 메타 / 단일 카드', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(cardParser.SELECTOR_VERSION).toBe('1');
    expect(cardParser.sourceSite).toBe('serebii');
    expect(cardParser.pageId).toBe('stampcard');
  });

  it('1 StampCard, slug=weekly-stamp-card, weekGoal=5', () => {
    expect(cardResult.entities.length).toBe(1);
    const e = cardResult.entities[0];
    expect(e?.slug).toBe('weekly-stamp-card');
    expect(e?.weekGoal).toBe(5);
  });

  it('issues 0 건', () => {
    expect(cardResult.issues).toEqual([]);
  });
});

describe('StampRewardParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타', () => {
    expect(rewardParser.SELECTOR_VERSION).toBe('1');
    expect(rewardParser.sourceSite).toBe('serebii');
    expect(rewardParser.pageId).toBe('stampcard');
  });

  it('정확 5 StampReward (4 stamp + 1 bonus)', () => {
    expect(rewardResult.entities.length).toBe(5);
  });

  it('issues 0 건', () => {
    expect(rewardResult.issues).toEqual([]);
  });
});

describe('StampRewardParser — 대표 엔티티', () => {
  it('Basic Pok�mon — tier 1, 50 Coins', () => {
    const e = rewardResult.entities.find((x) => x.tier === 1);
    expect(e?.stampNameEn).toBe('Basic Pok�mon');
    expect(e?.requiredStamps).toBe(1);
    expect(e?.coinAmount).toBe(50);
    expect(e?.imageUrl).toBe('https://www.serebii.net/pokemonpokopia/stamps/basic.png');
    expect(e?.cardSlug).toBe('weekly-stamp-card');
    expect(e?.slug).toBe('stamp-reward-tier1-basic');
  });

  it('Evolved Pok�mon — tier 2, 100 Coins', () => {
    const e = rewardResult.entities.find((x) => x.tier === 2);
    expect(e?.stampNameEn).toBe('Evolved Pok�mon');
    expect(e?.coinAmount).toBe(100);
  });

  it('Legendary Pok�mon — tier 3, 200 Coins', () => {
    const e = rewardResult.entities.find((x) => x.tier === 3);
    expect(e?.stampNameEn).toBe('Legendary Pok�mon');
    expect(e?.coinAmount).toBe(200);
  });

  it('Mew — tier 4, 1000 Coins', () => {
    const e = rewardResult.entities.find((x) => x.tier === 4);
    expect(e?.stampNameEn).toBe('Mew');
    expect(e?.coinAmount).toBe(1000);
  });

  it('Full Card Bonus — tier 5, requiredStamps=5, 1500 Coins (prose)', () => {
    const e = rewardResult.entities.find((x) => x.tier === 5);
    expect(e?.stampNameEn).toBe('Full Card Bonus');
    expect(e?.requiredStamps).toBe(5);
    expect(e?.coinAmount).toBe(1500);
    expect(e?.slug).toBe('stamp-reward-tier5-bonus');
  });
});

describe('StampRewardParser — 구조 불변식', () => {
  it('모든 cardSlug = weekly-stamp-card (단일 카드)', () => {
    expect(rewardResult.entities.every((e) => e.cardSlug === 'weekly-stamp-card')).toBe(true);
  });

  it('tier 1~5 모두 unique', () => {
    const tiers = rewardResult.entities.map((e) => e.tier).toSorted((a, b) => a - b);
    expect(tiers).toEqual([1, 2, 3, 4, 5]);
  });

  it('slug 모두 unique', () => {
    const slugs = rewardResult.entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('tier 1~4 모두 imageUrl 보유 (stamps/ 경로)', () => {
    const stamps = rewardResult.entities.filter((e) => e.tier <= 4);
    expect(
      stamps.every(
        (e) =>
          e.imageUrl !== undefined &&
          e.imageUrl.startsWith('https://www.serebii.net/pokemonpokopia/stamps/'),
      ),
    ).toBe(true);
  });

  it('tier 5 (bonus) 는 imageUrl 미부여', () => {
    const bonus = rewardResult.entities.find((e) => e.tier === 5);
    expect(bonus?.imageUrl).toBeUndefined();
  });
});

describe('StampRewardParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(rewardResult.entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(rewardResult.entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(rewardResult.entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('StampRewardParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = rewardParser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
