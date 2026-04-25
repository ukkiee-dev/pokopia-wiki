/**
 * TradeParser 회귀 테스트 (Phase 8 단계 33 — TDD).
 *
 * fixture: `__fixtures__/trade.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 41KB)
 *
 * 본 페이지에는 row-level valuation 표가 없다 (prose only). 파서는 friendship.ts
 * 와 동일 패턴:
 *   - entities = [] (산출 불가 명시)
 *   - issues = [missing-section('no-valuation-table-yet')] 1 건으로 명시
 *   - 향후 Serebii 가 valuation 표를 추가하면 SELECTOR_VERSION bump + 자동 추출
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TradeParser } from './trade.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/trade.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/trade.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new TradeParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

describe('TradeParser — 메타 / 수량 / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('trade');
  });

  it('현 fixture 기준 entities 0 건 (페이지에 row-level valuation 표 부재)', () => {
    expect(entities).toEqual([]);
  });

  it('missing-section 이슈 1 건 + no-valuation-table-yet 라벨로 prose-only 명시', () => {
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: 'missing-section',
      at: 'trade[no-valuation-table-yet]',
    });
    expect(issues[0]?.message).toContain('prose only');
  });
});

describe('TradeParser — 셀렉터 드리프트 회복', () => {
  it('미래 dextable 추가 + 미인식 헤더 → unexpected-structure 알림', () => {
    const html = `<!doctype html><html><body>
      <table class="dextable">
        <tr><td class="fooevo">Foo</td><td class="fooevo">Bar</td></tr>
        <tr><td>x</td><td>y</td></tr>
      </table>
    </body></html>`;
    const result = parser.parse(html, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'unexpected-structure')).toBe(true);
  });

  it('Value/Points 키워드 헤더 → unexpected-structure 미발생 (헤더 인식)', () => {
    const html = `<!doctype html><html><body>
      <table class="dextable">
        <tr><td class="fooevo">Item</td><td class="fooevo">Value (Points)</td></tr>
      </table>
    </body></html>`;
    const result = parser.parse(html, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'unexpected-structure')).toBe(false);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
