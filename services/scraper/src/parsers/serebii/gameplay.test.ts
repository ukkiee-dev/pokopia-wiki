/**
 * GameplayParser 회귀 테스트 (Phase 8 단계 22 — TDD).
 *
 * fixture: `__fixtures__/gameplay.html`
 *   (scripts/capture-fixture.ts 로 2026-04-25 status 200, 41KB)
 *
 * fixture 기준 1 GameplayReference (DB 비대상 reference document):
 *   - titleEn: "Pokémon Pokopia Gameplay Mechanics" (latin-1 인코딩으로 é 가
 *     `�` 로 깨질 수 있음)
 *   - introEn: 페이지 첫 단락
 *   - sections (3): Create Habitats / Crafting / Use Pokémon
 *
 * 주의: stamp-card 와 동일하게 fixture 의 일부 텍스트에 Unicode replacement
 * char(`�`) 가 포함됨 (Pokémon → Pok�mon).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { GameplayParser } from './gameplay.js';

const FIXTURE_PATH = path.resolve(import.meta.dirname, '__fixtures__/gameplay.html');
const FIXTURE_URL = 'https://www.serebii.net/pokemonpokopia/gameplay.shtml';
const FIXED_SCRAPED_AT = '2026-04-25T03:00:00.000Z';

const parser = new GameplayParser();
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');
const { entities, issues } = parser.parse(fixtureHtml, {
  sourceUrl: FIXTURE_URL,
  scrapedAt: FIXED_SCRAPED_AT,
});

const reference = entities[0];

describe('GameplayParser — 메타 / 단일 reference / 이슈', () => {
  it('파서 메타 — SELECTOR_VERSION / sourceSite / pageId', () => {
    expect(parser.SELECTOR_VERSION).toBe('1');
    expect(parser.sourceSite).toBe('serebii');
    expect(parser.pageId).toBe('gameplay');
  });

  it('단일 GameplayReference 산출, slug=gameplay-mechanics', () => {
    expect(entities.length).toBe(1);
    expect(reference?.slug).toBe('gameplay-mechanics');
  });

  it('구조적 파싱 이슈 0 건', () => {
    expect(issues).toEqual([]);
  });
});

describe('GameplayParser — 본문', () => {
  it('titleEn 에 Gameplay Mechanics 포함 (fixture 의 latin-1 깨짐 허용)', () => {
    expect(reference?.titleEn).toContain('Gameplay Mechanics');
  });

  it('introEn 비어있지 않음 + 페이지 unique 키워드 포함', () => {
    expect(reference?.introEn).toBeDefined();
    expect(reference?.introEn).toContain('unique game');
  });

  it('sections 정확 3 (Create Habitats / Crafting / Use ...)', () => {
    expect(reference?.sections.length).toBe(3);
    const headings = reference?.sections.map((s) => s.headingEn) ?? [];
    expect(headings[0]).toBe('Create Habitats');
    expect(headings[1]).toBe('Crafting');
    expect(headings[2]).toContain('Use');
  });

  it('Create Habitats 섹션 — 2 단락 + "habitat" 키워드 포함', () => {
    const section = reference?.sections.find((s) => s.headingEn === 'Create Habitats');
    expect(section?.paragraphsEn.length).toBeGreaterThanOrEqual(2);
    expect(section?.paragraphsEn.join(' ')).toContain('habitat');
  });

  it('Crafting 섹션 — 2 단락 + "Craft" 키워드 포함', () => {
    const section = reference?.sections.find((s) => s.headingEn === 'Crafting');
    expect(section?.paragraphsEn.length).toBeGreaterThanOrEqual(2);
    expect(section?.paragraphsEn.join(' ')).toContain('Craft');
  });
});

describe('GameplayParser — SourceMetadata', () => {
  it('reference 에 SourceMetadata 완전 주입', () => {
    expect(reference?.sourceSite).toBe('serebii');
    expect(reference?.sourceUrl).toBe(FIXTURE_URL);
    expect(reference?.scrapedAt).toBe(FIXED_SCRAPED_AT);
    expect(reference?.attribution).toContain('Serebii.net');
  });
});

describe('GameplayParser — 엣지', () => {
  it('빈 HTML — missing-section + entities 0', () => {
    const result = parser.parse('<!doctype html><html></html>', {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });

  it('h1 만 있고 h2 없음 — missing-section', () => {
    const html = `<!doctype html><html><body><main><h1>Title</h1><p>Intro</p></main></body></html>`;
    const result = parser.parse(html, {
      sourceUrl: FIXTURE_URL,
      scrapedAt: FIXED_SCRAPED_AT,
    });
    expect(result.entities).toEqual([]);
    expect(result.issues.some((i) => i.kind === 'missing-section')).toBe(true);
  });
});
