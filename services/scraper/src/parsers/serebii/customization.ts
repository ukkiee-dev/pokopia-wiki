/**
 * Serebii `/customisation.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 30.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/customisation.shtml
 *
 * 산출 엔티티:
 *   - `customization_item` × 177 (fixture 기준):
 *     · Outfit 22 / Hair 15 / Top 36 / Pants 36 / Hat 22 / Bag 18 / Shoes 28
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문에 7 개 `<h3>` 섹션 (Outfit / Hair / Tops / Pants / Hat / Bags /
 *   Shoes), 각 h3 직후에 `<table class="dextable">` (4 fooevo: Picture / Name /
 *   Style / Location).
 *
 *   ```
 *   <p><h3><a name="uniforms"></a>Outfit</h3>...</p>
 *   <table class="dextable">
 *     <tr>
 *       <td class="fooevo">Picture</td>
 *       <td class="fooevo">Name</td>
 *       <td class="fooevo">Style</td>
 *       <td class="fooevo">Location</td>
 *     </tr>
 *     <tr>
 *       <td class="fooinfo">
 *         <a class="uniforms-select" data-key="1">
 *           <img src="/pokemonpokopia/custom/th/1.jpg" .../>
 *         </a>
 *       </td>
 *       <td class="fooinfo">
 *         <a class="uniforms-select" data-key="1"><u>Familiar Outfit 1</u></a>
 *       </td>
 *       <td class="fooinfo"></td>
 *       <td class="fooinfo">Beginning</td>
 *     </tr>
 *     ...
 *   </table>
 *   ```
 *
 * 특이사항:
 *   - **카테고리 매핑** (페이지 → SCHEMA ENUM): Outfit/Hair/Hat/Pants/Shoes 그대로,
 *     Tops → Top, Bags → Bag.
 *   - **slug 합성**: `customization-<categorySlug>-<imageId>` (예:
 *     "customization-outfit-1"). 이미지 ID 가 카테고리 내 unique 자연 키.
 *   - **imageUrl**: `/pokemonpokopia/custom/th/<id>.jpg` (다른 파서들과 다른 base
 *     path — `custom/th/`).
 *   - **unlockMethodEn**: Location 셀 raw 텍스트 그대로 (SCHEMA TEXT).
 *
 * 추출 전략:
 *   페이지에 단계 27 cds.ts 같은 헤더 식별이 어려우므로 (모든 dextable 이 4 fooevo
 *   Picture/Name/Style/Location), `<h3>` 직후 `<table class="dextable">` 7 개를
 *   카테고리 순서대로 매칭. h3 텍스트 → CATEGORY_MAP 으로 ENUM 변환.
 *
 * 에러 처리:
 *   - h3 카테고리 0 개: missing-section
 *   - h3 다음 dextable 미발견: unexpected-structure (해당 카테고리 skip)
 *   - h3 텍스트 카테고리 매칭 실패: skip (페이지의 다른 h3 무시)
 *   - imageId 추출 실패: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  CustomizationItemSchema,
  type CustomizationItemInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

type CustomizationCategory = CustomizationItemInput['category'];

/** `custom/th/<id>.jpg` — 카테고리 내 unique 이미지 ID. */
const CUSTOM_IMG_RE = /custom\/th\/([a-z0-9-]+)\.jpg/i;

/** 페이지 h3 텍스트 → SCHEMA ENUM 단수형. */
const CATEGORY_MAP: Record<string, CustomizationCategory> = {
  Outfit: 'Outfit',
  Outfits: 'Outfit',
  Hair: 'Hair',
  Top: 'Top',
  Tops: 'Top',
  Pants: 'Pants',
  Hat: 'Hat',
  Hats: 'Hat',
  Bag: 'Bag',
  Bags: 'Bag',
  Shoes: 'Shoes',
};

/** quests.ts / cds.ts 와 동일한 알려진 location 키워드. */
const LOCATION_KEYWORDS: ReadonlyArray<[string, string]> = [
  ['Withered Wastelands', 'witheredwastelands'],
  ['Withered Wasteland', 'witheredwastelands'],
  ['Sparkling Skylands', 'sparklingskylands'],
  ['Sparkling Skyland', 'sparklingskylands'],
  ['Rocky Ridges', 'rockyridges'],
  ['Rocky Ridge', 'rockyridges'],
  ['Bleak Beach', 'bleakbeach'],
  ['Palette Town', 'palettetown'],
  ['Cloud Island', 'cloudisland'],
  ['Dream Islands', 'dreamisland'],
  ['Dream Island', 'dreamisland'],
];

export class CustomizationParser extends Parser<CustomizationItemInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'customisation';

  parse(html: string, options: ParseOptions): ParseResult<CustomizationItemInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: CustomizationItemInput[] = [];
    const issues: ParseIssue[] = [];

    const $h3List = $('h3');
    if ($h3List.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no h3 category sections found',
      });
      return { entities, issues };
    }

    $h3List.each((_, h3) => {
      const $h3 = $(h3);
      const categoryText = normalizeText($h3.text());
      const category = CATEGORY_MAP[categoryText];
      if (category === undefined) return; // 페이지의 다른 h3 무시

      const $table = findFollowingTable($h3);
      if ($table === null) {
        issues.push({
          kind: 'unexpected-structure',
          at: `customization[${category}]`,
          message: `no dextable found after h3 "${categoryText}"`,
        });
        return;
      }

      processTable($, $table, category, options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no customization_item rows extracted',
      });
    }

    return { entities, issues };
  }
}

/**
 * h3 다음의 첫 `<table class="dextable">` 를 찾는다. h3 가 `<p>` 안에 있는 경우가
 * 많아 nextAll 보다 closest('p').nextAll(...) 가 안정적.
 */
function findFollowingTable($h3: CheerioSelection): CheerioSelection | null {
  const $wrapper = $h3.closest('p');
  const $base = $wrapper.length > 0 ? $wrapper : $h3;
  const $next = $base.nextAll('table.dextable').first();
  return $next.length > 0 ? $next : null;
}

function processTable(
  $: CheerioAPI,
  $table: CheerioSelection,
  category: CustomizationCategory,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: CustomizationItemInput[],
  issues: ParseIssue[],
): void {
  $table.find('tr').each((_, tr) => {
    const $row = $(tr);
    if ($row.children('td.fooevo').length > 0) return;
    processRow($, $row, category, sourceUrl, metadata, entities, issues);
  });
}

function processRow(
  $: CheerioAPI,
  $row: CheerioSelection,
  category: CustomizationCategory,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: CustomizationItemInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 4) return;

  const $picTd = $tds.eq(0);
  const $nameTd = $tds.eq(1);
  const styleEn = normalizeText($tds.eq(2).text());
  const unlockMethodEn = normalizeText($tds.eq(3).text());

  const imageId = extractImageId($picTd);
  if (imageId === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: `customization[${category}/?]`,
      message: 'picture cell missing custom/th/<id>.jpg src',
    });
    return;
  }

  const nameEn = normalizeText($nameTd.find('u').first().text() || $nameTd.text());
  if (nameEn.length === 0 || unlockMethodEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `customization[${category}/${imageId}]`,
      message: 'name or location cell empty',
    });
    return;
  }

  const slug = `customization-${slugifyText(category)}-${imageId}`;
  const unlockLocationSlug = matchLocationSlug(unlockMethodEn) ?? undefined;
  const imageUrl = buildImageUrl($picTd, sourceUrl) ?? undefined;

  const candidate = {
    slug,
    category,
    nameEn,
    ...(styleEn.length > 0 ? { styleEn } : {}),
    unlockMethodEn,
    ...(unlockLocationSlug === undefined ? {} : { unlockLocationSlug }),
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...metadata,
  };

  const result = CustomizationItemSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `customization[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

function extractImageId($picTd: CheerioSelection): string | null {
  const src = $picTd.find('img').first().attr('src') ?? '';
  const match = src.match(CUSTOM_IMG_RE);
  if (match === null) return null;
  const [, captured] = match;
  return captured !== undefined && captured.length > 0 ? captured : null;
}

function matchLocationSlug(text: string): string | null {
  for (const [name, slug] of LOCATION_KEYWORDS) {
    if (text.includes(name)) return slug;
  }
  return null;
}

function buildImageUrl($picTd: CheerioSelection, sourceUrl: string): string | null {
  const src = $picTd.find('img').first().attr('src');
  if (src === undefined || src.length === 0) return null;
  if (!CUSTOM_IMG_RE.test(src)) return null;
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
