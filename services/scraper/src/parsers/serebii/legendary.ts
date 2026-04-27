/**
 * Serebii `/legendary.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 25.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/legendary.shtml
 *
 * 산출 엔티티:
 *   - `legendary_acquisition` × 11 (fixture 기준):
 *     · Dream Islands 섹션: Suicune / Raikou / Entei / Mewtwo (4)
 *     · Palette Town 섹션: Articuno / Zapdos / Moltres (3)
 *     · Ho-Oh & Lugia 섹션: Ho-Oh / Lugia (2)
 *     · Volcanion 섹션: Volcanion (1)
 *     · Mew 섹션: Mew (1)
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문은 단일 `<table class="tab">` 안에 5 개 `td.fooleft h2` 섹션
 *   + 같은 tr 의 다음 tr 의 `td.foocontent` 안 본문 단락. quests.ts 와 유사하나
 *   각 섹션이 0~4 개의 legendary 를 동시에 다룸.
 *
 * 추출 전략:
 *   1. 5 섹션을 순회하며 각 섹션의 paragraphs 수집 (sectionEn + fullText).
 *   2. 각 섹션의 fullText 에서 LEGENDARY_KEYWORDS 11 개 키워드 매칭.
 *   3. 매칭된 legendary 마다 LegendaryAcquisition 1 개 산출 — 같은 섹션 본문을
 *      unlockConditionEn 으로 공유, locationSlug 는 LOCATION_KEYWORDS 매칭.
 *   4. **첫 번째 매치 우선 dedupe** — 같은 legendary 가 여러 섹션에 등장 시
 *      처음 만난 섹션만 채택 (pokemon_id UNIQUE 보장).
 *
 * 특이사항:
 *   - **slug 합성**: `legendary-<pokemonSlug>` (예: "legendary-articuno",
 *     "legendary-ho-oh", "legendary-mewtwo").
 *   - **Ho-Oh slug**: "ho-oh" (하이픈 보존). LEGENDARY_KEYWORDS 에 "Ho-Oh" 그대로.
 *   - **locationSlug**: section 본문에서 LOCATION_KEYWORDS 매치. Dream Islands 는
 *     특수 영역으로 'dreamisland' slug 사용 (Phase 8 단계 39 dreamislands 와 일관).
 *
 * 에러 처리:
 *   - h2 0 개: missing-section
 *   - 섹션 본문에서 legendary 매칭 0 개: 해당 섹션 skip (issue 없음 — 메타 섹션 가능)
 *   - 11 legendary 모두 미매치: missing-section + entities 0
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  LegendaryAcquisitionSchema,
  type LegendaryAcquisitionInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/**
 * 알려진 legendary/mythical 포켓몬 키워드 → slug. 본 페이지 fixture 의 11 종.
 * 길이 내림차순 정렬 (Mewtwo > Mew, Ho-Oh > 다른 -oh) 로 substring 충돌 방지.
 */
const LEGENDARY_KEYWORDS: ReadonlyArray<[string, string]> = [
  ['Articuno', 'articuno'],
  ['Zapdos', 'zapdos'],
  ['Moltres', 'moltres'],
  ['Raikou', 'raikou'],
  ['Entei', 'entei'],
  ['Suicune', 'suicune'],
  ['Ho-Oh', 'ho-oh'],
  ['Lugia', 'lugia'],
  ['Mewtwo', 'mewtwo'], // Mew 보다 먼저 (Mew 가 Mewtwo 의 substring)
  ['Volcanion', 'volcanion'],
  ['Mew', 'mew'],
];

/**
 * 알려진 location 명 → slug. 길이 내림차순. Dream Islands 는 Phase 8 단계 39 의
 * dreamislands.shtml 과 일관된 'dreamisland' slug.
 */
const LOCATION_KEYWORDS: ReadonlyArray<[string, string]> = [
  ['Withered Wastelands', 'witheredwastelands'],
  ['Sparkling Skylands', 'sparklingskylands'],
  ['Rocky Ridges', 'rockyridges'],
  ['Bleak Beach', 'bleakbeach'],
  ['Palette Town', 'palettetown'],
  ['Cloud Island', 'cloudisland'],
  ['Dream Islands', 'dreamisland'],
  ['Dream Island', 'dreamisland'],
];

export class LegendaryParser extends Parser<LegendaryAcquisitionInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'legendary';

  parse(html: string, options: ParseOptions): ParseResult<LegendaryAcquisitionInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: LegendaryAcquisitionInput[] = [];
    const issues: ParseIssue[] = [];

    const $h2List = $('td.fooleft h2');
    if ($h2List.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no h2 sections found in fooleft headings',
      });
      return { entities, issues };
    }

    // 페이지 전체 텍스트 + h2 등장 위치를 추출. cheerio 가 nested dextable 을
    // outer table 의 직계 tr 로 흡수하는 현상(paint.ts 에서도 발견)에 영향받지
    // 않도록 DOM 구조 의존 대신 텍스트 기반 슬라이싱으로 섹션을 결정.
    const pageText = normalizeText($('main').text());
    const sections = locateSections($, $h2List, pageText);

    for (const section of sections) {
      processSection(section, metadata, entities, issues);
    }

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no legendary keywords matched in any section',
      });
    }

    return { entities, issues };
  }
}

type SectionSlice = {
  sectionEn: string;
  text: string; // 다음 h2 또는 페이지 끝까지의 본문 텍스트
};

/**
 * 페이지 전체 텍스트에서 각 h2 등장 위치를 페이지 순서대로 추적해 본문 슬라이스
 * 결정. h2 텍스트가 본문 안에 substring 으로도 등장(예: "Mew" 가 "Mewtwo" 안)
 * 하므로 단순 `indexOf` 는 위치 오인식 위험 — h2 List 의 DOM 순서를 신뢰하고
 * 이전 h2 다음 위치(`cursor`)부터 검색해 페이지 순서를 보존.
 */
function locateSections(
  $: CheerioAPI,
  $h2List: CheerioSelection,
  pageText: string,
): SectionSlice[] {
  const positions: Array<{ sectionEn: string; pos: number }> = [];
  let cursor = 0;
  $h2List.each((_, h2) => {
    const sectionEn = normalizeText($(h2).text());
    if (sectionEn.length === 0) return;
    const pos = pageText.indexOf(sectionEn, cursor);
    if (pos < 0) return;
    positions.push({ sectionEn, pos });
    cursor = pos + sectionEn.length;
  });

  const slices: SectionSlice[] = [];
  for (const [i, current] of positions.entries()) {
    const next = positions[i + 1];
    const start = current.pos + current.sectionEn.length;
    const end = next ? next.pos : pageText.length;
    slices.push({ sectionEn: current.sectionEn, text: pageText.slice(start, end) });
  }
  return slices;
}

function processSection(
  section: SectionSlice,
  metadata: SourceMetadata,
  entities: LegendaryAcquisitionInput[],
  issues: ParseIssue[],
): void {
  const fullText = section.text;
  if (fullText.length === 0) return;

  const locationSlug = matchLocationSlug(fullText) ?? undefined;

  for (const [pokemonNameEn, pokemonSlug] of LEGENDARY_KEYWORDS) {
    if (!matchesAsWord(fullText, pokemonNameEn)) continue;
    // 중복 체크: 이미 추가된 pokemonSlug 는 skip (pokemon_id UNIQUE 보장).
    if (entities.some((e) => e.pokemonSlug === pokemonSlug)) continue;

    const slug = `legendary-${pokemonSlug}`;
    const candidate = {
      slug,
      pokemonSlug,
      pokemonNameEn,
      unlockConditionEn: fullText.trim(),
      ...(locationSlug === undefined ? {} : { locationSlug }),
      sourceSectionEn: section.sectionEn,
      ...metadata,
    };

    const result = LegendaryAcquisitionSchema.safeParse(candidate);
    if (result.success) {
      entities.push(result.data);
      continue;
    }
    issues.push({
      kind: 'zod-fail',
      at: `legendary[${slug}]`,
      message: result.error.issues
        .map((i) => `${i.path.join('.')}:${i.message}`)
        .join('; '),
    });
  }
}

function matchLocationSlug(text: string): string | null {
  for (const [name, slug] of LOCATION_KEYWORDS) {
    if (text.includes(name)) return slug;
  }
  return null;
}

/**
 * `keyword` 가 `text` 안에 단어 경계로 등장하는지. Mew 가 Mewtwo 안에 substring
 * 매치되는 것을 방지하기 위해 word boundary 정규식 사용. Ho-Oh 같은 하이픈
 * 포함 키워드도 정규식 escape 후 매치.
 */
function matchesAsWord(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`);
  return re.test(text);
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
