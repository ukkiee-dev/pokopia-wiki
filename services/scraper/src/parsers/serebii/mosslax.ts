/**
 * Serebii `/mosslaxboosts.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 19.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/mosslaxboosts.shtml
 *
 * 산출 엔티티:
 *   - `mosslax_boost` × 15 — Cartesian (5 flavor × 3 level)
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지에 두 개의 `<table class="dextable">` 가 위치한다:
 *
 *   1. **"Effect Strength" 표** (2 fooevo: `Effect Strength` | `Food Items`):
 *      ```
 *      <tr><td class="fooinfo">Weakest</td><td class="fooinfo">Berries<br />Drinks<br />Vegetables</td></tr>
 *      <tr><td class="fooinfo">Standard</td><td class="fooinfo">Simple Salad<br />Simple Soup<br />...</td></tr>
 *      <tr><td class="fooinfo">Strongest</td><td class="fooinfo">Vibrant hamburger steak<br />...</td></tr>
 *      ```
 *      → level 1 (Weakest) / 2 (Standard) / 3 (Strongest) ↔ foodGroup 매핑.
 *
 *   2. **"List of Boosts" 표** (2 fooevo: `Dominant Food Flavour` | `Effect`):
 *      ```
 *      <tr><td class="fooinfo">Generic Flavor Meals</td><td class="fooinfo">Increased rate ... </td></tr>
 *      <tr><td class="fooinfo">Bitter</td><td class="fooinfo">Increased chance of finding rare items</td></tr>
 *      <tr><td class="fooinfo">Dry</td><td class="fooinfo">...</td></tr>
 *      ...
 *      ```
 *      → flavor 별 effect description.
 *
 * Cartesian 합성:
 *   5 flavor (Bitter/Dry/Sour/Spicy/Sweet) × 3 level (1/2/3) = 15 mosslax_boost.
 *   "Generic Flavor Meals" 행은 SCHEMA ENUM 에 없어 본 entity 미포함 (향후 별도
 *   필드로 보강 가능). 동일 flavor 의 3 level 은 같은 effectEn 을 공유하고 다른
 *   foodGroupEn 만 가진다.
 *
 * 특이사항:
 *   - **표 식별**: 첫 번째 표는 헤더 두 번째 셀 "Food Items", 두 번째 표는
 *     "Effect" 로 구분.
 *   - **slug**: `mosslax-<flavor-lower>-lv<level>` (예: "mosslax-bitter-lv1").
 *   - **foodGroup join**: `<br />` 분리 라인을 ` / ` 로 join (공백 양쪽 강조).
 *
 * 에러 처리:
 *   - 두 표 중 하나 미발견: missing-section
 *   - 5 flavor 중 누락: zod-fail (ENUM 검증 실패) + skip
 *   - 3 level 중 누락: zod-fail
 *   - Cartesian 합성 후 entities 0: missing-section
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  MosslaxBoostSchema,
  MosslaxFlavorEnum,
  type MosslaxBoostInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

type MosslaxFlavor = MosslaxBoostInput['flavor'];

/** Effect Strength 라벨 → SCHEMA level 정수. */
const STRENGTH_TO_LEVEL: Record<string, number> = {
  Weakest: 1,
  Standard: 2,
  Strongest: 3,
};

export class MosslaxParser extends Parser<MosslaxBoostInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'mosslaxboosts';

  parse(html: string, options: ParseOptions): ParseResult<MosslaxBoostInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: MosslaxBoostInput[] = [];
    const issues: ParseIssue[] = [];

    const $strengthTable = pickTableByHeader($, 'Food Items');
    const $boostsTable = pickTableByHeader($, 'Effect');

    if ($strengthTable === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no Effect Strength dextable (header second cell "Food Items") found',
      });
    }
    if ($boostsTable === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no List of Boosts dextable (header second cell "Effect") found',
      });
    }
    if ($strengthTable === null || $boostsTable === null) {
      return { entities, issues };
    }

    const levelToFoodGroup = parseStrengthTable($, $strengthTable);
    const flavorToEffect = parseBoostsTable($, $boostsTable);

    if (levelToFoodGroup.size === 0 || flavorToEffect.size === 0) {
      issues.push({
        kind: 'missing-section',
        message: `Cartesian inputs incomplete: levels=${levelToFoodGroup.size} flavors=${flavorToEffect.size}`,
      });
      return { entities, issues };
    }

    cartesianProduct(levelToFoodGroup, flavorToEffect, metadata, entities, issues);

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no mosslax_boost rows synthesized after Cartesian product',
      });
    }

    return { entities, issues };
  }
}

/** dextable 의 첫 행 두 번째 fooevo 셀 텍스트가 `headerLabel` 과 일치하면 채택. */
function pickTableByHeader($: CheerioAPI, headerLabel: string): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length < 2) return;
    const second = normalizeText($headerCells.eq(1).text());
    if (second === headerLabel) chosen = $table;
  });
  return chosen;
}

/**
 * Effect Strength 표 → Map<level (1~3), foodGroupEn>.
 * 각 행: `<td>Weakest</td><td>Berries<br />Drinks<br />Vegetables</td>`
 */
function parseStrengthTable($: CheerioAPI, $table: CheerioSelection): Map<number, string> {
  const map = new Map<number, string>();
  $table.find('tr').each((_, tr) => {
    const $row = $(tr);
    if ($row.children('td.fooevo').length > 0) return;
    const $tds = $row.children('td');
    if ($tds.length < 2) return;
    const strength = normalizeText($tds.eq(0).text());
    const level = STRENGTH_TO_LEVEL[strength];
    if (level === undefined) return;
    const foodGroup = brSeparatedToList($tds.eq(1).html() ?? '');
    if (foodGroup.length === 0) return;
    map.set(level, foodGroup);
  });
  return map;
}

/**
 * List of Boosts 표 → Map<flavor, effectEn>. SCHEMA ENUM 5 flavor 만 채택,
 * "Generic Flavor Meals" 같은 비-ENUM 행은 무시.
 */
function parseBoostsTable($: CheerioAPI, $table: CheerioSelection): Map<MosslaxFlavor, string> {
  const map = new Map<MosslaxFlavor, string>();
  $table.find('tr').each((_, tr) => {
    const $row = $(tr);
    if ($row.children('td.fooevo').length > 0) return;
    const $tds = $row.children('td');
    if ($tds.length < 2) return;
    const flavorText = normalizeText($tds.eq(0).text());
    const flavorParse = MosslaxFlavorEnum.safeParse(flavorText);
    if (!flavorParse.success) return;
    const effect = normalizeText($tds.eq(1).text());
    if (effect.length === 0) return;
    map.set(flavorParse.data, effect);
  });
  return map;
}

/** 5 flavor × 3 level Cartesian 합성. */
function cartesianProduct(
  levelToFoodGroup: Map<number, string>,
  flavorToEffect: Map<MosslaxFlavor, string>,
  metadata: SourceMetadata,
  entities: MosslaxBoostInput[],
  issues: ParseIssue[],
): void {
  for (const [flavor, effectEn] of flavorToEffect) {
    for (const [level, foodGroupEn] of levelToFoodGroup) {
      const slug = `mosslax-${flavor.toLowerCase()}-lv${level}`;
      const candidate = {
        slug,
        flavor,
        level,
        effectEn,
        foodGroupEn,
        ...metadata,
      };
      const result = MosslaxBoostSchema.safeParse(candidate);
      if (result.success) {
        entities.push(result.data);
        continue;
      }
      issues.push({
        kind: 'zod-fail',
        at: `mosslax-boost[${slug}]`,
        message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
      });
    }
  }
}

/** `<br />` 분리 텍스트 → " / " join. cheerio 가 br 사이 텍스트를 그대로 보존. */
function brSeparatedToList(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' / ');
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
