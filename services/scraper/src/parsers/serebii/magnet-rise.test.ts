/**
 * MagnetRiseParser 회귀 테스트 (Phase 8 단계 13 — TDD).
 *
 * fixture: `__fixtures__/magnet-rise.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 75KB)
 *
 * fixture 기준 87 magnet rise 전용 아이템. 본 파서는 SCHEMA §2.2 의
 * `item.is_magnet_rise_only` 플래그 보강용 슬림 출력만 산출한다.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MagnetRiseParser } from './magnet-rise.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/magnet-rise.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/magnetrise.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new MagnetRiseParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('MagnetRiseParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('magnet-rise');
  });

  it('fixture 기준 정확 87 magnet rise 전용 아이템', () => {
    expect(entities.length).toBe(87);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('MagnetRiseParser — 대표 엔티티', () => {
  it('Grubby rags — 첫 행, slug=grubbyrags', () => {
    const e = entities.find((x) => x.slug === 'grubbyrags');
    expect(e?.nameEn).toBe('Grubby rags');
    expect(e?.descriptionEn).toContain('tattered cloth');
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/items/grubbyrags.png',
    );
  });

  it('Nonburnable garbage (outdoor) — slug 에 괄호 포함', () => {
    const e = entities.find((x) => x.slug === 'nonburnablegarbage(outdoor)');
    expect(e?.nameEn).toBe('Nonburnable garbage (outdoor)');
    expect(e?.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/items/nonburnablegarbage(outdoor).png',
    );
  });

  it('Yellow-green shoots — slug 에 하이픈 포함', () => {
    const e = entities.find((x) => x.slug === 'yellow-greenshoots');
    expect(e?.nameEn).toBe('Yellow-green shoots');
  });

  it('Driftwood — descriptionEn 의 HTML 엔티티 자동 디코딩(é)', () => {
    const e = entities.find((x) => x.slug === 'driftwood');
    expect(e?.nameEn).toBe('Driftwood');
    expect(e?.descriptionEn).toContain('décor');
  });
});

describe('MagnetRiseParser — 구조 불변식', () => {
  it('모든 slug 이 소문자 영숫자/하이픈/괄호', () => {
    expect(entities.every((e) => /^[a-z0-9()-]+$/.test(e.slug))).toBe(true);
  });

  it('모든 nameEn 비어있지 않음', () => {
    expect(entities.every((e) => e.nameEn.length > 0)).toBe(true);
  });

  it('모든 imageUrl 이 절대 URL (serebii items/ 경로)', () => {
    expect(
      entities.every(
        (e) =>
          e.imageUrl !== undefined &&
          e.imageUrl.startsWith('https://www.serebii.net/pokemonpokopia/items/'),
      ),
    ).toBe(true);
  });

  it('slug 중복 없음', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('descriptionEn 95% 이상 채워짐', () => {
    const filled = entities.filter((e) => e.descriptionEn !== undefined).length;
    expect(filled / entities.length).toBeGreaterThanOrEqual(0.95);
  });
});

describe('MagnetRiseParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
    expect(entities.every((e) => e.attribution.includes('Serebii.net'))).toBe(true);
  });
});

const HTML_NO_TABLE = '<!doctype html><html><body><p>nothing</p></body></html>';

const HTML_EMPTY_TABLE = `<!doctype html><html><body>
  <table class="dextable">
    <tr><td class="fooevo">Picture</td><td class="fooevo">Name</td><td class="fooevo">Description</td></tr>
  </table>
</body></html>`;

describe('MagnetRiseParser — 엣지', () => {
  it('빈 HTML — missing-section 이슈 + entities 0', () => {
    const result = parser.parse(HTML_NO_TABLE, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });

  it('헤더만 있고 데이터 행 없음 — missing-section', () => {
    const result = parser.parse(HTML_EMPTY_TABLE, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
