/**
 * Serebii `/flowers.shtml` + `/vegetables.shtml` 파서 — DATA_COLLECTION_PLAN
 * Phase 1 단계 31. 두 별도 Parser 클래스로 구성.
 *
 * 산출 엔티티:
 *   - FlowersParser → 13 base plant (flowers.shtml 첫 dextable "List of Standard
 *     Plants & Berry Trees")
 *   - VegetablesParser → 4 vegetable (vegetables.shtml 의 Bean/Tomato/Potato/Wheat
 *     stages 표 헤더에서 추출)
 *   - 합계 17 plant
 *
 * 본 단계에서는 base plant 만 추출하고 색상/stage variants 는 nested 빈 배열로
 * 두며, 다른 dextable 의 옵션 데이터(Wildflowers 색상, Berry Tree 종류) 는 향후
 * 단계 또는 loader 가 외부 매핑으로 보강.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *
 *   flowers.html 첫 표:
 *   ```
 *   <table class="dextable">
 *     <tr><td class="fooevo" colspan="4"><h2>List of Standard Plants & Berry Trees</h2></td></tr>
 *     <tr>
 *       <td class="fooevo"><a href="items/leppatree.shtml">Leppa tree</a></td>
 *       ... (4 셀씩)
 *     </tr>
 *     <tr>
 *       <td class="cen"><a href="items/leppatree.shtml"><img src="items/leppatree.png" .../></a></td>
 *       ... (4 셀씩)
 *     </tr>
 *     ...
 *   </table>
 *   ```
 *   각 셀이 한 plant. fooevo 행에 nameEn + slug, cen 행에 image.
 *
 *   vegetables.html:
 *   ```
 *   <table class="dextable">
 *     <tr><td class="fooevo" colspan="4"><h2>Bean Stages</h2></td></tr>
 *     ... (각 stage 이미지)
 *   </table>
 *   ```
 *   "X Stages" h2 에서 X 추출 → vegetable nameEn.
 *
 * 특이사항:
 *   - **Plant.type 추론**: nameEn 키워드로 결정 (PLANT_TYPE_RULES).
 *   - **slug**: items/<slug>.png 토큰 또는 nameEn slugify.
 *   - **growthDays 등**: SCHEMA non-null 이지만 본 페이지 명시 없어 default 1
 *     (Zod default). loader 보강 영역.
 *
 * 에러 처리:
 *   - 대상 표 미발견: missing-section
 *   - plant slug/name 추출 실패: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  PlantSchema,
  type PlantInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;
type PlantType = PlantInput['type'];

/** items/<slug>.shtml 또는 items/<slug>.png — 영문/숫자/하이픈/괄호 허용. */
const ITEM_LINK_RE = /items\/([a-z0-9()-]+)\.(?:shtml|png)/i;

/** "X Stages" h2 → vegetable nameEn (X). */
const STAGES_RE = /^(.+?)\s*Stages?$/i;

/**
 * nameEn 키워드 → SCHEMA `plant.type` ENUM 매핑 (우선순위 순).
 * 더 구체적인 키워드(`hedge`, `tree`)가 일반 `flower` 보다 먼저.
 */
const PLANT_TYPE_RULES: ReadonlyArray<[RegExp, PlantType]> = [
  [/\btree\b/i, 'BerryTree'],
  [/\bhedge\b/i, 'Hedge'],
  [/\bwildflowers?\b/i, 'Wildflower'],
  [/\bseashore\s+flowers?\b/i, 'SeashorFlower'],
  [/\bmountain\s+flowers?\b/i, 'MountainFlower'],
  [/\bskyland\s+flowers?\b/i, 'SkylandFlower'],
  [/\b(?:beautiful|cute|elegant|robust)\s+flower\b/i, 'DecorativeFlower'],
  [/\bflower\b/i, 'DecorativeFlower'], // fallback for generic "flower"
];

/* ─────────────────────────────────────────────────────────
 *  FlowersParser
 * ───────────────────────────────────────────────────────── */

export class FlowersParser extends Parser<PlantInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'flowers';

  parse(html: string, options: ParseOptions): ParseResult<PlantInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: PlantInput[] = [];
    const issues: ParseIssue[] = [];

    const $standardTable = pickStandardPlantsTable($);
    if ($standardTable === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no "List of Standard Plants & Berry Trees" dextable found',
      });
      return { entities, issues };
    }

    extractStandardPlants($, $standardTable, options.sourceUrl, metadata, entities, issues);

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no plant rows extracted from standard plants table',
      });
    }

    return { entities, issues };
  }
}

/** "List of Standard Plants & Berry Trees" h2 헤더 행을 가진 dextable. */
function pickStandardPlantsTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const headerText = $table.find('tr').first().text();
    if (/Standard\s+Plants/i.test(headerText)) chosen = $table;
  });
  return chosen;
}

/**
 * Standard Plants 표에서 각 fooevo 셀(이름 링크)을 한 plant 로 추출. cen 행의
 * 이미지 src 와 매칭.
 */
function extractStandardPlants(
  $: CheerioAPI,
  $table: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: PlantInput[],
  issues: ParseIssue[],
): void {
  // 표의 모든 tr 을 순회하며 fooevo 셀(이름 링크) 수집. h2 헤더 셀(colspan=4) 은 무시.
  $table.find('tr').each((_, tr) => {
    const $row = $(tr);
    const $fooevoCells = $row.children('td.fooevo');
    if ($fooevoCells.length === 0) return;
    if ($fooevoCells.length === 1 && ($fooevoCells.attr('colspan') ?? '') !== '') return;

    $fooevoCells.each((_index, cell) => {
      const $cell = $(cell);
      const href = $cell.find('a').first().attr('href') ?? '';
      const match = href.match(ITEM_LINK_RE);
      if (match === null) return;
      const slug = match[1];
      if (slug === undefined || slug.length === 0) return;
      const nameEn = normalizeText($cell.text());
      if (nameEn.length === 0) return;

      // 동일 slug 가 여러 표/행에 등장할 수 있어 dedupe.
      if (entities.some((e) => e.slug === slug)) return;

      const type = inferPlantType(nameEn);
      const imageUrl = buildImageUrl(slug, sourceUrl);

      buildAndPushPlant({
        slug,
        nameEn,
        type,
        imageUrl,
        metadata,
        entities,
        issues,
      });
    });
  });
}

/* ─────────────────────────────────────────────────────────
 *  VegetablesParser
 * ───────────────────────────────────────────────────────── */

export class VegetablesParser extends Parser<PlantInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'vegetables';

  parse(html: string, options: ParseOptions): ParseResult<PlantInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: PlantInput[] = [];
    const issues: ParseIssue[] = [];

    // "X Stages" h2 헤더 dextable 마다 vegetable 1 개 산출.
    $('table.dextable').each((_, table) => {
      const $table = $(table);
      const headerText = normalizeText($table.find('tr').first().text());
      const match = headerText.match(STAGES_RE);
      if (match === null) return;
      const nameEn = (match[1] ?? '').trim();
      if (nameEn.length === 0) return;

      const slug = nameEn.toLowerCase().replace(/\s+/g, '');
      if (entities.some((e) => e.slug === slug)) return;

      const imageUrl = buildImageUrl(slug, options.sourceUrl);
      buildAndPushPlant({
        slug,
        nameEn,
        type: 'Vegetable',
        imageUrl,
        metadata,
        entities,
        issues,
      });
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no vegetable plants extracted (no "X Stages" dextables found)',
      });
    }

    return { entities, issues };
  }
}

/* ─────────────────────────────────────────────────────────
 *  공통 헬퍼
 * ───────────────────────────────────────────────────────── */

function buildAndPushPlant(args: {
  slug: string;
  nameEn: string;
  type: PlantType;
  imageUrl: string | undefined;
  metadata: SourceMetadata;
  entities: PlantInput[];
  issues: ParseIssue[];
}): void {
  const { slug, nameEn, type, imageUrl, metadata, entities, issues } = args;
  const candidate = {
    slug,
    nameEn,
    type,
    growthDays: 1,
    growthDaysWithGrow: 1,
    requiresHydration: false,
    variants: [],
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...metadata,
  };
  const result = PlantSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `plant[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/** nameEn 에서 PLANT_TYPE_RULES 우선순위로 type 추론, fallback: DecorativeFlower. */
function inferPlantType(nameEn: string): PlantType {
  for (const [pattern, type] of PLANT_TYPE_RULES) {
    if (pattern.test(nameEn)) return type;
  }
  return 'DecorativeFlower';
}

function buildImageUrl(slug: string, sourceUrl: string): string | undefined {
  try {
    return new URL(`items/${slug}.png`, sourceUrl).toString();
  } catch {
    return undefined;
  }
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
