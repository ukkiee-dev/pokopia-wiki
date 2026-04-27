/**
 * QuestsParser 회귀 테스트 (Phase 8 단계 23 — TDD).
 *
 * fixture: `__fixtures__/importantrequests.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 47KB)
 *
 * fixture 기준 5 quest:
 *   1. Yawn Up A Storm (Withered Wastelands)
 *   2. Do the...Team Initiation Challenge (Withered Wastelands)
 *   3. Brighten Things Up (Bleak Beach)
 *   4. Time To Party (Rocky Ridges)
 *   5. Rebuild the Huge Building (Sparkling Skylands)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { QuestsParser } from './quests.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/importantrequests.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/importantrequests.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new QuestsParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('QuestsParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('importantrequests');
  });

  it('fixture 기준 정확 5 quest', () => {
    expect(entities.length).toBe(5);
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });

  it('sortOrder 1~5 순서대로', () => {
    const orders = entities.map((e) => e.sortOrder);
    expect(orders).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('QuestsParser — 대표 엔티티', () => {
  it('Yawn Up A Storm — Withered Wastelands, sortOrder 1', () => {
    const e = entities.find((x) => x.slug === 'quest-yawn-up-a-storm');
    expect(e?.nameEn).toBe('Yawn Up A Storm');
    expect(e?.locationSlug).toBe('witheredwastelands');
    expect(e?.sortOrder).toBe(1);
    expect(e?.objectiveEn).toContain('Withered Wastelands');
    expect(e?.walkthroughEn).toContain('Slowpoke');
    expect(e?.walkthroughEn).toContain('Kyogre');
  });

  it('Do the...Team Initiation Challenge — slug 의 ... 처리', () => {
    const e = entities.find(
      (x) => x.slug === 'quest-do-the-team-initiation-challenge',
    );
    expect(e?.nameEn).toBe('Do the...Team Initiation Challenge');
    expect(e?.locationSlug).toBe('witheredwastelands');
    expect(e?.sortOrder).toBe(2);
  });

  it('Brighten Things Up — Bleak Beach', () => {
    const e = entities.find((x) => x.slug === 'quest-brighten-things-up');
    expect(e?.locationSlug).toBe('bleakbeach');
    expect(e?.walkthroughEn).toContain('Mosslax');
  });

  it('Time To Party — Rocky Ridges, Volcanion 언급', () => {
    const e = entities.find((x) => x.slug === 'quest-time-to-party');
    expect(e?.locationSlug).toBe('rockyridges');
    expect(e?.walkthroughEn).toContain('Volcanion');
  });

  it('Rebuild the Huge Building — Sparkling Skylands, Mewtwo 등장', () => {
    const e = entities.find((x) => x.slug === 'quest-rebuild-the-huge-building');
    expect(e?.locationSlug).toBe('sparklingskylands');
    expect(e?.walkthroughEn).toContain('Mewtwo');
    expect(e?.walkthroughEn).toContain('Concrete');
  });
});

describe('QuestsParser — 구조 불변식', () => {
  it('모든 slug 이 quest- 접두사', () => {
    expect(entities.every((e) => e.slug.startsWith('quest-'))).toBe(true);
  });

  it('slug 5 개 모두 unique', () => {
    const slugs = entities.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 locationSlug 이 알려진 location (unknown 없음)', () => {
    expect(entities.every((e) => e.locationSlug !== 'unknown')).toBe(true);
  });

  it('모든 quest 가 objectiveEn + walkthroughEn 보유', () => {
    expect(entities.every((e) => (e.objectiveEn ?? '').length > 0)).toBe(true);
    expect(entities.every((e) => (e.walkthroughEn ?? '').length > 0)).toBe(true);
  });

  it('모든 imageUrl 이 절대 URL', () => {
    expect(
      entities.every(
        (e) =>
          e.imageUrl !== undefined &&
          e.imageUrl.startsWith('https://www.serebii.net/pokemonpokopia/'),
      ),
    ).toBe(true);
  });
});

describe('QuestsParser — SourceMetadata', () => {
  it('모든 엔티티에 SourceMetadata 완전 주입', () => {
    expect(entities.every((e) => e.sourceSite === 'serebii')).toBe(true);
    expect(entities.every((e) => e.sourceUrl === FIXTURE_URL)).toBe(true);
    expect(entities.every((e) => e.scrapedAt === FIXED_SCRAPED_AT)).toBe(true);
  });
});

describe('QuestsParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });

  it('h2 만 있고 location 키워드 없음 → unexpected-structure + locationSlug=unknown', () => {
    const html = `<!doctype html><html><body>
      <table>
        <tr><td class="fooleft"><h2>Foo Quest</h2></td></tr>
        <tr><td class="foocontent"><p>This quest has no known place name.</p></td></tr>
      </table>
    </body></html>`;
    const result = parser.parse(html, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities.length).toBe(1);
    expect(result.entities[0]?.locationSlug).toBe('unknown');
    expect(result.issues.some((i) => i.kind === 'unexpected-structure')).toBe(true);
  });
});
