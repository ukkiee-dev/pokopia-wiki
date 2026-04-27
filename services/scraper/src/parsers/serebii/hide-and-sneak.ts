/**
 * Serebii `/hideandsneak.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 21.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/hideandsneak.shtml
 *
 * 산출 엔티티:
 *   - `hideandsneak_reward` × 3 — 단일 dextable
 *     · Win without being detected → Fresh Carrot × 4
 *     · Win the game → Fresh Carrot × 3
 *     · Win the game several times in a row → Stardust × 2
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지에 단일 `<table class="dextable">` (4 fooevo: Picture/Item/Quantity/
 *   **Metod** — 페이지 오타!).
 *
 *   ```
 *   <tr>
 *     <td class="cen"><img src="items/<slug>.png" .../></td>
 *     <td class="cen">Fresh Carrot</td>
 *     <td class="cen">4</td>
 *     <td class="cen">Win without being detected</td>
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - **헤더 오타**: 4 번째 fooevo 셀이 "Metod" (Method 의 오타). 본 파서는 헤더
 *     인식 시 오타도 받아들임.
 *   - **slug 합성**: `hideandsneak-<conditionSlug>-<itemSlug>` (예:
 *     "hideandsneak-win-without-being-detected-freshcarrot").
 *   - **condition**: Method 셀 raw 텍스트 (SCHEMA 의 `condition` TEXT 컬럼).
 *   - **rewardType**: 본 페이지는 모두 'item' (coin reward 없음).
 *
 * 에러 처리:
 *   - 4 fooevo 헤더 dextable 미발견: missing-section
 *   - itemSlug / quantity / condition 파싱 실패: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  HideAndSneakRewardSchema,
  type HideAndSneakRewardInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

const ITEM_IMG_RE = /items\/([a-z0-9()-]+)\.png/i;

export class HideAndSneakParser extends Parser<HideAndSneakRewardInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'hideandsneak';

  parse(html: string, options: ParseOptions): ParseResult<HideAndSneakRewardInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: HideAndSneakRewardInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickRewardTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no hideandsneak dextable (4 fooevo Picture/Item/Quantity/Metod) found',
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
        message: 'no hideandsneak_reward rows extracted',
      });
    }

    return { entities, issues };
  }
}

/**
 * 4 fooevo 헤더 + 두 번째 셀 "Item" 인 dextable 채택. 4 번째 셀 "Metod"(오타) /
 * "Method" 둘 다 허용 — 향후 Serebii 가 오타 수정 시에도 작동.
 */
function pickRewardTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 4) return;
    const second = normalizeText($headerCells.eq(1).text());
    if (second === 'Item') chosen = $table;
  });
  return chosen;
}

function processRow(
  $: CheerioAPI,
  $row: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: HideAndSneakRewardInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 4) return;

  const $picTd = $tds.eq(0);
  const itemNameEn = normalizeText($tds.eq(1).text());
  const quantityText = normalizeText($tds.eq(2).text());
  const condition = normalizeText($tds.eq(3).text());
  const itemSlug = extractItemSlug($picTd);

  if (itemSlug === null || itemNameEn.length === 0 || condition.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'hideandsneak-reward[?]',
      message: 'data row missing itemSlug/itemNameEn/condition',
    });
    return;
  }

  const quantity = Number.parseInt(quantityText, 10);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `hideandsneak-reward[${itemSlug}]`,
      message: `quantity cell not a positive integer: "${quantityText}"`,
    });
    return;
  }

  const slug = `hideandsneak-${slugifyText(condition)}-${itemSlug}`;
  const imageUrl = buildImageUrl($picTd, sourceUrl) ?? undefined;

  const candidate = {
    slug,
    condition,
    rewardType: 'item' as const,
    itemSlug,
    itemNameEn,
    quantity,
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...metadata,
  };

  const result = HideAndSneakRewardSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `hideandsneak-reward[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

function extractItemSlug($picTd: CheerioSelection): string | null {
  const src = $picTd.find('img').first().attr('src') ?? '';
  const match = src.match(ITEM_IMG_RE);
  if (match === null) return null;
  const [, captured] = match;
  return captured !== undefined && captured.length > 0 ? captured : null;
}

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

function slugifyText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
