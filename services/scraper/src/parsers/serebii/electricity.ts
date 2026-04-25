/**
 * Serebii `/electricity.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 15.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/electricity.shtml
 *
 * 산출 엔티티:
 *   - `generator` (4 개) — Mini generator + Windmill kit + Waterwheel kit + Furnace kit
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지에 4 개의 `<table class="dextable">` 가 있다:
 *     1. "items that generate electricity" — 5 fooevo (Picture/Name/Description/
 *        Units/Renewed?). **본 파서 대상.**
 *     2. "items that transmit electricity" — 5 fooevo (Distance/Size). 단계 6
 *        furniture 와 중복, 본 파서 범위 외.
 *     3~4. "items that require Electricity" — 3 fooevo, 단계 4 items 와 중복, 범위 외.
 *
 *   첫 번째 헤더의 4 번째 fooevo 셀 텍스트 "Units of Electricity Generated" 가
 *   유일 식별 키 (다른 표는 다른 4 번째 셀 라벨).
 *
 *   각 데이터 행:
 *   ```
 *   <tr>
 *     <td class="cen"><img src="items/<slug>.png" .../></td>
 *     <td class="cen">Mini generator</td>             <!-- 또는 <a href="build/<slug>.shtml"><u>Name</u></a> -->
 *     <td class="fooinfo">설명...</td>
 *     <td class="cen">5</td>                          <!-- 또는 "10 standard\n20 high-altitude" -->
 *     <td class="fooinfo">Automatic</td>              <!-- 또는 "Requires Renewing" -->
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - **slug 결정**: items/<slug>.png 의 토큰 우선, 실패 시 nameEn slugify.
 *     Windmill/Waterwheel/Furnace 는 build/<slug>.shtml 도 동시에 존재 (단계 11
 *     BuildingKit 과 자연 키 공유; loader 가 두 엔티티에 동시 upsert).
 *   - **outputUnits 파싱**: Units 셀의 첫 정수. "10 standard\n20 high-altitude"
 *     같은 multi-line 은 두 번째 정수를 outputUnitsAlt 로, 라벨은 보존.
 *   - **isRenewable 매핑**: Renewed? 셀 → "Automatic" → true, "Requires Renewing"
 *     → false. 그 외 텍스트는 unexpected-structure issue + skip.
 *
 * 에러 처리:
 *   - 5 fooevo + "Units of Electricity Generated" 헤더 미발견: missing-section
 *   - outputUnits 정수 파싱 실패: zod-fail (정수 미주입 → safeParse 실패)
 *   - isRenewable 결정 실패: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 *   - 엔티티 0: missing-section
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  GeneratorSchema,
  type GeneratorInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** `items/<slug>.png` — 아이템 이미지 토큰. */
const ITEM_IMG_RE = /items\/([a-z0-9-]+)\.png/i;

/** `<n> <label?>` cost 셀 라인 — 정수 + 선택적 라벨 (예: "10 standard"). */
const UNITS_LINE_RE = /^(\d+)(?:\s+(.+))?$/;

export class ElectricityParser extends Parser<GeneratorInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'electricity';

  parse(html: string, options: ParseOptions): ParseResult<GeneratorInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: GeneratorInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickGeneratorTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no generator dextable (header "Units of Electricity Generated") found',
      });
      return { entities, issues };
    }

    $table.find('tr').each((_, tr) => {
      const $row = $(tr);
      if ($row.children('td.fooevo').length > 0) return;
      processRow($, $row, options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no generator rows extracted',
      });
    }

    return { entities, issues };
  }
}

/**
 * 5-fooevo 헤더 + 4 번째 셀 텍스트 "Units of Electricity Generated" 인 dextable
 * 채택. 다른 5-fooevo 표(transmit) 와 3-fooevo 표(require) 를 자연스럽게 배제.
 */
function pickGeneratorTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 5) return;
    const fourth = normalizeText($headerCells.eq(3).text());
    if (fourth === 'Units of Electricity Generated') chosen = $table;
  });
  return chosen;
}

function processRow(
  $: CheerioAPI,
  $row: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: GeneratorInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 5) return;

  const $picTd = $tds.eq(0);
  const $nameTd = $tds.eq(1);
  const nameEn = normalizeText($nameTd.find('u').first().text() || $nameTd.text());
  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'generator[?]',
      message: 'name cell empty',
    });
    return;
  }

  const slug = extractSlug($picTd, $nameTd, nameEn);
  const descriptionEn = optionalText($tds.eq(2));
  const units = parseUnitsCell($, $tds.eq(3));
  if (units === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: `generator[${slug}]`,
      message: `units cell unparseable: "${normalizeMultiline($tds.eq(3))}"`,
    });
    return;
  }
  const isRenewable = parseRenewable(normalizeText($tds.eq(4).text()));
  if (isRenewable === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: `generator[${slug}]`,
      message: `renewed cell did not match Automatic|Requires Renewing: "${normalizeText($tds.eq(4).text())}"`,
    });
    return;
  }
  const imageUrl = buildImageUrl($picTd, sourceUrl) ?? undefined;

  const candidate = {
    slug,
    nameEn,
    ...maybeField('descriptionEn', descriptionEn),
    outputUnits: units.primary,
    ...maybeField('outputUnitsAlt', units.alt),
    ...maybeField('outputUnitsLabel', units.primaryLabel),
    ...maybeField('outputUnitsAltLabel', units.altLabel),
    isRenewable,
    ...maybeField('imageUrl', imageUrl),
    ...metadata,
  };

  const result = GeneratorSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `generator[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/** items/<slug>.png 토큰 우선, 실패 시 nameEn slugify. */
function extractSlug(
  $picTd: CheerioSelection,
  $nameTd: CheerioSelection,
  nameEn: string,
): string {
  const candidates = [
    $picTd.find('img').first().attr('src') ?? '',
    $nameTd.find('a').first().attr('href') ?? '',
  ];
  for (const src of candidates) {
    const match = src.match(ITEM_IMG_RE);
    if (!match) continue;
    const [, captured] = match;
    if (captured !== undefined && captured.length > 0) return captured;
  }
  return slugifyName(nameEn);
}

type UnitsParse = {
  primary: number;
  primaryLabel?: string;
  alt?: number;
  altLabel?: string;
};

/**
 * Units 셀 파싱. 단순 정수("5") 와 multi-line ("10 standard\n20 high-altitude")
 * 둘 다 처리. 라인 단위로 정규식 매칭해 1~2 정수 + 라벨 추출.
 */
function parseUnitsCell($: CheerioAPI, $td: CheerioSelection): UnitsParse | null {
  const lines = normalizeMultiline($td)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;

  const parsed: Array<{ value: number; label?: string }> = [];
  for (const line of lines) {
    const match = line.match(UNITS_LINE_RE);
    if (match === null) continue;
    const value = Number.parseInt(match[1] ?? '', 10);
    if (!Number.isFinite(value) || value <= 0) continue;
    const label = match[2]?.trim();
    parsed.push(label !== undefined && label.length > 0 ? { value, label } : { value });
  }
  const first = parsed[0];
  if (first === undefined) return null;

  const result: UnitsParse = { primary: first.value };
  if (first.label !== undefined) result.primaryLabel = first.label;
  const second = parsed[1];
  if (second !== undefined) {
    result.alt = second.value;
    if (second.label !== undefined) result.altLabel = second.label;
  }
  return result;
}

/** "Automatic" → true, "Requires Renewing" → false, 그 외 → null. */
function parseRenewable(text: string): boolean | null {
  if (/^automatic$/i.test(text)) return true;
  if (/^requires\s+renewing$/i.test(text)) return false;
  return null;
}

/** 셀 안의 `<br>` 을 개행으로 보존하면서 텍스트 추출. */
function normalizeMultiline($td: CheerioSelection): string {
  return $td
    .html()
    ?.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim() ?? '';
}

/** 셀 src 가 ITEM_IMG_RE 매칭되면 sourceUrl 기준 절대 URL. */
function buildImageUrl($picTd: CheerioSelection, sourceUrl: string): string | null {
  const src = $picTd.find('img').first().attr('src');
  if (src === undefined || src.length === 0) return null;
  if (!ITEM_IMG_RE.test(src)) return null;
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return null;
  }
}

/** 셀 텍스트 → 빈 문자열은 undefined 로 변환 (Zod optional 호환). */
function optionalText($td: CheerioSelection): string | undefined {
  const value = normalizeText($td.text());
  return value.length > 0 ? value : undefined;
}

/** 연속 공백/개행을 단일 공백으로 평탄화. */
function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** "Stockpile Water" → "stockpile-water". */
function slugifyName(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** undefined 값을 spread 시 제외 — exactOptionalPropertyTypes 호환. */
function maybeField<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : { [key]: value };
}
