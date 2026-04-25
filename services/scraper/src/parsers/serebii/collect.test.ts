/**
 * CollectParser 회귀 테스트 (Phase 8 단계 34 — TDD).
 *
 * fixture: `__fixtures__/collect.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 55KB)
 *
 * 본 페이지에는 row-level (cost ↔ result) 매핑이 없다 (60 result item 목록만
 * 제공 + prose 에 cost 후보 언급). 파서는 trade.ts / friendship.ts 와 동일
 * 패턴:
 *   - entities = [] (산출 불가 명시)
 *   - issues = [missing-section('no-recipe-table-yet')] 1 건으로 명시
 *   - 향후 Serebii 가 (cost, result) 매핑 표 추가 시 SELECTOR_VERSION bump
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CollectParser } from './collect.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/collect.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/collect.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new CollectParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('CollectParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('collect');
  });

  it('현 fixture 기준 entities 0 건 (페이지에 row-level 매핑 부재)', () => {
    expect(entities).toEqual([]);
  });

  it('missing-section 이슈 1 건 + no-recipe-table-yet 라벨로 result-only 명시', () => {
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: 'missing-section',
      at: 'collect[no-recipe-table-yet]',
    });
    expect(issues[0]?.message).toContain('result item list');
  });
});

describe('CollectParser — 셀렉터 드리프트 회복', () => {
  it('미래 (cost, result) 매핑 표 추가 시 unexpected-structure 알림', () => {
    const html = `<!doctype html><html><body>
      <table class="dextable">
        <tr><td class="fooevo">Cost</td><td class="fooevo">Result</td></tr>
        <tr><td>Rainbow Feather × 1</td><td>Strange strings</td></tr>
      </table>
    </body></html>`;
    const result = parser.parse(html, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'unexpected-structure')).toBe(true);
  });

  it('result-only dextable (Cost 키워드 없음) → missing-section 만 발생', () => {
    const html = `<!doctype html><html><body>
      <table class="dextable">
        <tr><td class="fooevo">Picture</td><td class="fooevo">Name</td><td class="fooevo">Description</td></tr>
        <tr><td>img</td><td>Strange strings</td><td>desc</td></tr>
      </table>
    </body></html>`;
    const result = parser.parse(html, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
    expect(result.issues.some((i) => i.kind === 'unexpected-structure')).toBe(false);
  });
});
