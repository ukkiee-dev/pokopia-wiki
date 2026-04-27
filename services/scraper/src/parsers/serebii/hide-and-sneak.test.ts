/**
 * HideAndSneakParser 회귀 테스트 (Phase 8 단계 21 — TDD).
 *
 * fixture: `__fixtures__/hideandsneak.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 41KB)
 *
 * fixture 기준 3 hideandsneak_reward:
 *   - "Win without being detected" → Fresh Carrot × 4
 *   - "Win the game" → Fresh Carrot × 3
 *   - "Win the game several times in a row" → Stardust × 2
 *
 * 페이지 헤더 오타: 4 번째 fooevo 셀 "Metod" (Method 의 오타). 파서는 두 번째 셀
 * "Item" 으로 표를 식별해 오타에 영향받지 않음.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { HideAndSneakParser } from './hide-and-sneak.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/hideandsneak.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/hideandsneak.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new HideAndSneakParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('HideAndSneakParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('hideandsneak');
  });

  it('정확 3 hideandsneak_reward', () => {
    expect(entities.length).toBe(3);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('HideAndSneakParser — 대표 엔티티', () => {
  it('Win without being detected → Fresh Carrot × 4', () => {
    const e = entities.find((x) => x.condition === 'Win without being detected');
    expect(e?.itemNameEn).toBe('Fresh Carrot');
    expect(e?.itemSlug).toBe('freshcarrot');
    expect(e?.quantity).toBe(4);
    expect(e?.rewardType).toBe('item');
    expect(e?.slug).toBe('hideandsneak-win-without-being-detected-freshcarrot');
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/items/freshcarrot.png',
    );
  });

  it('Win the game → Fresh Carrot × 3', () => {
    const e = entities.find((x) => x.condition === 'Win the game');
    expect(e?.itemNameEn).toBe('Fresh Carrot');
    expect(e?.quantity).toBe(3);
  });

  it('Win the game several times in a row → Stardust × 2', () => {
    const e = entities.find(
      (x) => x.condition === 'Win the game several times in a row',
    );
    expect(e?.itemNameEn).toBe('Stardust');
    expect(e?.itemSlug).toBe('stardust');
    expect(e?.quantity).toBe(2);
  });
});

describe('HideAndSneakParser — 구조 불변식', () => {
  it('모든 slug 이 hideandsneak- 접두사', () => {
    expect(entities.every((e) => e.slug.startsWith('hideandsneak-'))).toBe(true);
  });

  it('slug 3 개 모두 unique (condition 다르면 같은 item 도 별도 entity)', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 rewardType = item', () => {
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

describe('HideAndSneakParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
