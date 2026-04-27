/**
 * FriendshipParser 회귀 테스트 (Phase 8 단계 18 — TDD).
 *
 * fixture: `__fixtures__/friendship.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 41KB)
 *
 * 본 페이지에는 row-level tier 표가 없다 (prose only). 파서는:
 *   - entities = [] (산출 불가 명시)
 *   - issues = [missing-section('no-tier-table-yet')] 1 건으로 명시
 *   - 향후 Serebii 가 tier 표를 추가하면 SELECTOR_VERSION bump + 자동 추출 구조 유지
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FriendshipParser } from './friendship.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/friendship.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/friendship.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new FriendshipParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('FriendshipParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('friendship');
  });

  it('현 fixture 기준 entities 0 건 (페이지에 row-level tier 표 부재)', () => {
    expect(entities).toEqual([]);
  });

  it('missing-section 이슈 1 건 + no-tier-table-yet 라벨로 prose-only 명시', () => {
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: 'missing-section',
      at: 'friendship[no-tier-table-yet]',
    });
    expect(issues[0]?.message).toContain('prose only');
  });
});

describe('FriendshipParser — 셀렉터 드리프트 회복', () => {
  it('미래 dextable 추가 + 미인식 헤더 → unexpected-structure 알림', () => {
    const html = `<!doctype html><html><body>
      <table class="dextable">
        <tr><td class="fooevo">Foo</td><td class="fooevo">Bar</td></tr>
        <tr><td>1</td><td>2</td></tr>
      </table>
    </body></html>`;
    const result = parser.parse(html, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'unexpected-structure')).toBe(true);
  });

  it('Tier 키워드를 포함한 헤더 → unexpected-structure 미발생 (헤더 인식)', () => {
    const html = `<!doctype html><html><body>
      <table class="dextable">
        <tr><td class="fooevo">Tier</td><td class="fooevo">Required Points</td></tr>
      </table>
    </body></html>`;
    const result = parser.parse(html, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    // 헤더는 인식했지만 data 행이 없으므로 missing-section issue 발생
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'unexpected-structure')).toBe(false);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
