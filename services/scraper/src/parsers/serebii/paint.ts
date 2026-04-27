/**
 * Serebii `/paint.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 14.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/paint.shtml
 *
 * 산출 엔티티 (두 파서가 동일 fixture 에서 각각 추출):
 *   - PaintColorParser → 18 PaintColor + nested paint_recipe ingredients
 *   - PaintPatternParser → 38 PaintPattern + nested cost ingredients (보존만)
 *
 * loader 가 paint_color natural key 매핑(예: "Red Paint" → color.slug 'red') 으로
 * SCHEMA §2.11 paint_recipe(`result_color_id` / `ingredient_color_id` / `quantity`)
 * 를 구성. paint_pattern 의 cost 는 SCHEMA 에 별도 테이블이 없어 운영 메타로 활용.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지에 4 개의 `<table class="dextable">` 가 있다:
 *     1. Berry → paint 변환 표 (heading 없음, 본 단계 범위 외)
 *     2. Colours 표 — 헤더 `Picture | Colour | Cost` (3 fooevo)
 *     3. Patterns 표 — 헤더 `Picture | Location | Cost` (3 fooevo)
 *     4. List of Items that can be painted — 5 fooevo (단계 6 furniture 와 중복, 무시)
 *
 *   본 파서는 **3-fooevo 헤더 + 두 번째 셀 텍스트** 로 표를 식별:
 *     - "Colour" → PaintColorParser 채택
 *     - "Location" → PaintPatternParser 채택
 *
 *   각 표의 데이터 행 구조:
 *   ```
 *   <tr>
 *     <td class="cen"><img src="paint/<id>.png" .../></td>      <!-- Picture -->
 *     <td class="cen">White</td>                                  <!-- Colour/Location text -->
 *     <td class="fooinfo">                                        <!-- Cost (inner table) -->
 *       <table>
 *         <tr>
 *           <td><img src="items/whitepaint.png" .../></td>
 *           <td>White Paint * 2</td>
 *         </tr>
 *         ...
 *       </table>
 *     </td>
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - **PaintColor.slug**: `nameEn.lowercase()` (예: "white", "aquamarine"). Serebii
 *     이미지 ID 만 제공해 별도 URL 토큰이 없어 영문 색상명을 안정 자연키로 채택.
 *     18 색 모두 unique.
 *   - **PaintPattern.slug**: `pattern-<imageToken>` (예: "pattern-1", "pattern-pk6").
 *     패턴은 별도 이름이 없고 location 텍스트가 여러 패턴에 공유되므로 이미지 ID 가
 *     안정 자연키.
 *   - **cost 파싱**: inner `<table>` 의 각 `<tr>` 두 번째 셀 텍스트 `<itemName> * <qty>`
 *     정규식. `Cyan paint` vs `Cyan Paint` 같은 케이스 불일치는 raw 보존; loader
 *     가 normalize 처리.
 *
 * 에러 처리:
 *   - 대상 표 미발견: `missing-section`
 *   - cost 셀 비어있음: ingredients=[] 로 파서가 진행, Zod 가 .default([]) 로 통과
 *   - cost 행 정규식 실패: `unexpected-structure` + 해당 행 스킵 (다른 행은 진행)
 *   - Zod 실패: `zod-fail` + 스킵
 *   - 엔티티 0: `missing-section`
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  PaintColorSchema,
  PaintPatternSchema,
  type PaintColorInput,
  type PaintIngredientHint,
  type PaintPatternInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** `<itemName> * <qty>` 형식의 cost 셀 텍스트 (예: "Red Paint * 2"). */
const COST_LINE_RE = /^(.+?)\s*\*\s*(\d+)$/;

/** `paint/<id>.png` — 색상 이미지 토큰. */
const PAINT_IMG_RE = /paint\/([a-z0-9-]+)\.png/i;

/** `pattern/<id>.png` — 패턴 이미지 토큰 (예: "1", "16", "pk6"). */
const PATTERN_IMG_RE = /pattern\/([a-z0-9-]+)\.png/i;

/* ─────────────────────────────────────────────────────────
 *  PaintColorParser
 * ───────────────────────────────────────────────────────── */

export class PaintColorParser extends Parser<PaintColorInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'paint';

  parse(html: string, options: ParseOptions): ParseResult<PaintColorInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: PaintColorInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickTableByHeader($, 'Colour');
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no Colours dextable (header second cell "Colour") found',
      });
      return { entities, issues };
    }

    forEachDataRow($, $table, ($row) => {
      processColorRow($, $row, options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no PaintColor rows extracted from Colours table',
      });
    }

    return { entities, issues };
  }
}

function processColorRow(
  $: CheerioAPI,
  $row: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: PaintColorInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 3) return;

  const $picTd = $tds.eq(0);
  const $nameTd = $tds.eq(1);
  const $costTd = $tds.eq(2);

  const nameEn = normalizeText($nameTd.text());
  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'paint-color[?]',
      message: 'colour cell missing readable text',
    });
    return;
  }

  const slug = slugifyName(nameEn);
  const ingredients = parseCostCell($, $costTd, `paint-color[${slug}]`, issues);
  const imageUrl = buildImageUrl($picTd, sourceUrl, PAINT_IMG_RE) ?? undefined;

  const candidate = {
    slug,
    nameEn,
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ingredients,
    ...metadata,
  };

  const result = PaintColorSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `paint-color[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/* ─────────────────────────────────────────────────────────
 *  PaintPatternParser
 * ───────────────────────────────────────────────────────── */

export class PaintPatternParser extends Parser<PaintPatternInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'paint';

  parse(html: string, options: ParseOptions): ParseResult<PaintPatternInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: PaintPatternInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickTableByHeader($, 'Location');
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no Patterns dextable (header second cell "Location") found',
      });
      return { entities, issues };
    }

    forEachDataRow($, $table, ($row) => {
      processPatternRow($, $row, options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no PaintPattern rows extracted from Patterns table',
      });
    }

    return { entities, issues };
  }
}

function processPatternRow(
  $: CheerioAPI,
  $row: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: PaintPatternInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 3) return;

  const $picTd = $tds.eq(0);
  const imageToken = extractImageToken($picTd, PATTERN_IMG_RE);
  if (imageToken === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'paint-pattern[?]',
      message: 'picture cell missing pattern/<id>.png src',
    });
    return;
  }
  const slug = `pattern-${imageToken}`;

  const locationEn = normalizeText($tds.eq(1).text());
  if (locationEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `paint-pattern[${slug}]`,
      message: 'location cell missing readable text',
    });
    return;
  }

  const candidate = {
    slug,
    locationEn,
    ...maybeField('imageUrl', buildImageUrl($picTd, sourceUrl, PATTERN_IMG_RE) ?? undefined),
    ingredients: parseCostCell($, $tds.eq(2), `paint-pattern[${slug}]`, issues),
    ...metadata,
  };

  const result = PaintPatternSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `paint-pattern[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/** undefined 값을 spread 시 제외 — Zod optional + exactOptionalPropertyTypes 호환 헬퍼. */
function maybeField<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : { [key]: value };
}

/* ─────────────────────────────────────────────────────────
 *  공통 헬퍼
 * ───────────────────────────────────────────────────────── */

/**
 * 페이지의 모든 `table.dextable` 중 헤더 행 두 번째 fooevo 셀이 `headerLabel`
 * 과 일치하는 표를 찾는다. 3-fooevo 헤더(Picture | <label> | Cost) 만 채택해
 * paintable items 표(5 fooevo) 와 berry 변환 표를 자연스럽게 배제.
 */
function pickTableByHeader($: CheerioAPI, headerLabel: string): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 3) return;
    const second = normalizeText($headerCells.eq(1).text());
    if (second === headerLabel) chosen = $table;
  });
  return chosen;
}

/**
 * 표의 데이터 행(헤더 fooevo 행 제외)을 순회하며 `handler` 호출.
 *
 * paint.shtml 의 데이터 행은 cost 셀 안에 inner `<table>` 을 품고 있는데, cheerio
 * 의 HTML 정규화 과정에서 nested table 구조가 부분적으로 평탄화되어 inner 테이블
 * 의 tr 이 outer find('tr') 에 함께 잡힌다(closest('table') 비교로도 분리 불가).
 *
 * 다행히 outer 데이터 행은 첫 td 가 `class="cen"` 이고 inner cost 행은 attrs 없는
 * plain `<td>` 라는 명확한 구조 차이가 있다. **첫 td 에 `class="cen"` 이 있는
 * 행만 채택** 해 inner cost 행이 outer 데이터 행으로 잘못 인식되는 것을 막는다.
 */
function forEachDataRow(
  $: CheerioAPI,
  $table: CheerioSelection,
  handler: ($row: CheerioSelection) => void,
): void {
  $table.find('tr').each((_, tr) => {
    const $row = $(tr);
    if ($row.children('td.fooevo').length > 0) return;
    if ($row.children('td.cen').length === 0) return;
    handler($row);
  });
}

/**
 * cost 셀(3 번째 td.fooinfo) 안의 inner `<table>` 행들을 순회하며 ingredient 추출.
 * 각 inner 행의 두 번째 셀 텍스트 `<itemName> * <qty>` 정규식.
 */
function parseCostCell(
  $: CheerioAPI,
  $costTd: CheerioSelection,
  rowAt: string,
  issues: ParseIssue[],
): PaintIngredientHint[] {
  const ingredients: PaintIngredientHint[] = [];
  $costTd.find('table tr').each((_, tr) => {
    const $cells = $(tr).children('td');
    if ($cells.length < 2) return;
    const text = normalizeText($cells.eq(1).text());
    if (text.length === 0) return;
    const match = text.match(COST_LINE_RE);
    if (match === null) {
      issues.push({
        kind: 'unexpected-structure',
        at: rowAt,
        message: `cost line did not match "<name> * <qty>": "${text}"`,
      });
      return;
    }
    const itemNameEn = match[1]?.trim() ?? '';
    const quantity = Number.parseInt(match[2] ?? '0', 10);
    if (itemNameEn.length === 0 || !Number.isFinite(quantity) || quantity < 1) {
      issues.push({
        kind: 'unexpected-structure',
        at: rowAt,
        message: `cost line parsed to invalid pair: "${text}"`,
      });
      return;
    }
    ingredients.push({ itemNameEn, quantity });
  });
  return ingredients;
}

/** 이미지 셀의 `<img src>` 에서 `paint/<id>.png` 또는 `pattern/<id>.png` 토큰 추출. */
function extractImageToken($picTd: CheerioSelection, re: RegExp): string | null {
  const src = $picTd.find('img').first().attr('src') ?? '';
  const match = src.match(re);
  if (match === null) return null;
  const [, captured] = match;
  return captured !== undefined && captured.length > 0 ? captured : null;
}

/** 이미지 셀 src 가 정규식 매칭되면 sourceUrl 기준 절대 URL 로 변환. */
function buildImageUrl(
  $picTd: CheerioSelection,
  sourceUrl: string,
  re: RegExp,
): string | null {
  const src = $picTd.find('img').first().attr('src');
  if (src === undefined || src.length === 0) return null;
  if (!re.test(src)) return null;
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return null;
  }
}

/** 영문명 → slug. 공백→하이픈, 특수문자 제거. */
function slugifyName(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** 연속 공백/개행을 단일 공백으로 평탄화. */
function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
