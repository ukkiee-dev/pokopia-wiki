/**
 * Serebii `/dreamislands.shtml` 파서 — DATA_COLLECTION_PLAN Phase 7 단계 39.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/dreamislands.shtml
 *
 * 산출 엔티티:
 *   - `island_variant` × 5 (Pikachu/Eevee/Clefairy/Arcanine/Dragonite Doll)
 *   - 각 variant 안에 nested `rewards` × 3 (focus items) = 총 15 island_reward
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   `<table class="dextable">` (4 fooevo: Doll / Focus 1 / Focus 2 / Focus 3).
 *   각 행: doll cell + 3 focus item cell.
 *
 *   ```
 *   <tr>
 *     <td class="cen"><a href="dreamisland/<doll-slug>.shtml"><img src="items/<slug>.png" .../><br/><u>Pikachu Doll</u></a></td>
 *     <td class="cen"><img src="items/<focus1>.png" .../><br/>Focus 1 Name</td>
 *     <td class="cen"><img src="items/<focus2>.png" .../><br/>Focus 2 Name</td>
 *     <td class="cen"><img src="items/<focus3>.png" .../><br/>Focus 3 Name</td>
 *   </tr>
 *   ```
 *
 * slug 합성:
 *   - IslandVariant: `island-variant-dreamisland-<dollSlug>` (예:
 *     "island-variant-dreamisland-pikachudoll").
 *   - rewards 는 nested.
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  IslandVariantSchema,
  type IslandRewardHint,
  type IslandVariantInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

const ITEM_IMG_RE = /items\/([a-z0-9()-]+)\.png/i;
const DOLL_HREF_RE = /dreamisland\/([a-z0-9-]+)\.shtml/i;
const LOCATION_SLUG = 'dreamisland';

export class DreamIslandsParser extends Parser<IslandVariantInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'dreamislands';

  parse(html: string, options: ParseOptions): ParseResult<IslandVariantInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: IslandVariantInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickDollTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no dreamislands dextable (4 fooevo Doll/Focus 1/2/3) found',
      });
      return { entities, issues };
    }

    $table.find('tr').each((_, tr) => {
      const $row = $(tr);
      if ($row.children('td.fooevo').length > 0) return;
      processRow($row, options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no island_variant rows extracted',
      });
    }

    return { entities, issues };
  }
}

function pickDollTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 4) return;
    const first = normalizeText($headerCells.eq(0).text());
    if (first === 'Doll') chosen = $table;
  });
  return chosen;
}

function processRow(
  $row: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: IslandVariantInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 4) return;

  const $dollTd = $tds.eq(0);
  const dollHref = $dollTd.find('a').first().attr('href') ?? '';
  const hrefMatch = dollHref.match(DOLL_HREF_RE);
  // doll href fallback: Ditto/Substitute Doll 같은 별도 shtml 없는 doll 은 img src 에서 slug 추출.
  const imgSrc = $dollTd.find('img').first().attr('src') ?? '';
  const imgMatch = imgSrc.match(ITEM_IMG_RE);
  const dollSlug = hrefMatch?.[1] ?? imgMatch?.[1];
  const dollNameEn = normalizeText($dollTd.find('u').first().text() || $dollTd.text());

  if (dollSlug === undefined || dollSlug.length === 0 || dollNameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'island-variant[?]',
      message: 'doll cell missing href/img-src or name',
    });
    return;
  }

  const rewards: IslandRewardHint[] = [];
  for (let i = 1; i <= 3; i += 1) {
    const $focusTd = $tds.eq(i);
    const reward = extractFocusReward($focusTd);
    if (reward !== null) rewards.push(reward);
  }

  const slug = `island-variant-${LOCATION_SLUG}-${dollSlug}`;
  const imageUrl = buildImageUrl($dollTd, sourceUrl) ?? undefined;

  const candidate = {
    slug,
    locationSlug: LOCATION_SLUG,
    variantKey: dollSlug,
    nameEn: dollNameEn,
    ...(imageUrl === undefined ? {} : { imageUrl }),
    rewards,
    ...metadata,
  };

  const result = IslandVariantSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `island-variant[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

function extractFocusReward($td: CheerioSelection): IslandRewardHint | null {
  const src = $td.find('img').first().attr('src') ?? '';
  const match = src.match(ITEM_IMG_RE);
  const itemSlug = match?.[1];
  const itemNameEn = normalizeText($td.text());
  if (itemSlug === undefined || itemSlug.length === 0 || itemNameEn.length === 0) return null;
  return { rewardType: 'item', itemSlug, itemNameEn };
}

function buildImageUrl($td: CheerioSelection, sourceUrl: string): string | null {
  const src = $td.find('img').first().attr('src');
  if (src === undefined || src.length === 0) return null;
  if (!ITEM_IMG_RE.test(src)) return null;
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return null;
  }
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
