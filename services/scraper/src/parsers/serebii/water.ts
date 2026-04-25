/**
 * Serebii `/water.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 15.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/water.shtml
 *
 * 산출 엔티티:
 *   - `water_type` (5 종) — Water / Ocean Water / Muddy Water / Hot Spring Water / Lava
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지에 2 개의 `<table class="dextable">` 가 있다:
 *     1. "List of types of Water" — 4 fooevo (Picture/Name/Description/Item).
 *        **본 파서 대상.**
 *     2. Water/Lava Start/Coverage 비교 — 시각 비교용 fooevo 헤더가 다름. 범위 외.
 *
 *   첫 번째 헤더 두 번째 셀 "Name" 으로 식별 (4 fooevo + 두 번째 "Name").
 *
 *   각 데이터 행:
 *   ```
 *   <tr>
 *     <td class="cen"><img src="items/<water-slug>.png" .../></td>
 *     <td class="fooinfo">Water</td>
 *     <td class="fooinfo">Standard water. Allows for...</td>
 *     <td class="cen">
 *       <a href="items/<drink-slug>.shtml">
 *         <img src="items/<drink-slug>.png" .../><br />
 *         Fresh Water
 *       </a>
 *     </td>
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - **slug**: nameEn 의 lowercase + 공백→하이픈 ("water", "ocean-water"). Serebii
 *     가 row 별 별도 URL 토큰을 제공하지 않아 영문명이 자연키.
 *   - **hydrates 결정**: descriptionEn 에 "Does not hydrate" 키워드 → false, 그 외
 *     → true (SCHEMA non-null 기본값 true 가정).
 *   - **sourceItem**: Item 셀의 음료 아이템 (Fresh Water 드링크 → Water type 생성).
 *     loader 가 item FK 매핑 또는 메타로 활용.
 *
 * SCHEMA non-null 필드 중 row-level 추출 불가 (loader 보강):
 *   - `spreadRadius`, `trenchDistance` 는 페이지 산문(prose) 에만 명시되어 본 파서
 *     출력에 미포함 (Zod 에서 optional). loader 가 별도 추출 또는 외부 데이터 보강.
 *
 * 에러 처리:
 *   - 4 fooevo + 두 번째 "Name" 헤더 미발견: missing-section
 *   - nameEn 빈 행: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 *   - 엔티티 0: missing-section
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  WaterTypeSchema,
  type SourceMetadata,
  type WaterTypeInput,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** `items/<slug>.shtml` — 아이템 상세 페이지 링크. */
const ITEM_HREF_RE = /items\/([a-z0-9-]+)\.shtml/i;

/** `items/<slug>.png` — 아이템 이미지. */
const ITEM_IMG_RE = /items\/([a-z0-9-]+)\.png/i;

export class WaterParser extends Parser<WaterTypeInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'water';

  parse(html: string, options: ParseOptions): ParseResult<WaterTypeInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: WaterTypeInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickWaterTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no water-type dextable (4 fooevo, second cell "Name") found',
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
        message: 'no water-type rows extracted',
      });
    }

    return { entities, issues };
  }
}

/** 4-fooevo 헤더 + 두 번째 셀 "Name" 인 dextable 채택. */
function pickWaterTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 4) return;
    const second = normalizeText($headerCells.eq(1).text());
    if (second === 'Name') chosen = $table;
  });
  return chosen;
}

function processRow(
  $: CheerioAPI,
  $row: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: WaterTypeInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 4) return;

  const nameEn = normalizeText($tds.eq(1).text());
  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'water-type[?]',
      message: 'name cell empty',
    });
    return;
  }

  const slug = slugifyName(nameEn);
  const descriptionEn = optionalText($tds.eq(2));
  const hydrates = !(descriptionEn !== undefined && /does\s+not\s+hydrate/i.test(descriptionEn));
  const imageUrl = buildItemImageUrl($tds.eq(0), sourceUrl) ?? undefined;
  const sourceItem = parseSourceItem($tds.eq(3));

  const candidate = {
    slug,
    nameEn,
    ...maybeField('descriptionEn', descriptionEn),
    hydrates,
    ...maybeField('imageUrl', imageUrl),
    ...maybeField('sourceItemSlug', sourceItem.slug),
    ...maybeField('sourceItemNameEn', sourceItem.nameEn),
    ...metadata,
  };

  const result = WaterTypeSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `water-type[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/** Item 셀에서 음료 아이템 slug + nameEn 추출. */
function parseSourceItem($itemTd: CheerioSelection): {
  slug: string | undefined;
  nameEn: string | undefined;
} {
  const href = $itemTd.find('a').first().attr('href') ?? '';
  const match = href.match(ITEM_HREF_RE);
  const slug = match?.[1];
  const nameEn = normalizeText($itemTd.text());
  return {
    slug: slug !== undefined && slug.length > 0 ? slug : undefined,
    nameEn: nameEn.length > 0 ? nameEn : undefined,
  };
}

/** Picture 셀 img src 가 items/<slug>.png 매칭이면 sourceUrl 기준 절대 URL. */
function buildItemImageUrl($picTd: CheerioSelection, sourceUrl: string): string | null {
  const src = $picTd.find('img').first().attr('src');
  if (src === undefined || src.length === 0) return null;
  if (!ITEM_IMG_RE.test(src)) return null;
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return null;
  }
}

/** 셀 텍스트 → 빈 문자열은 undefined. */
function optionalText($td: CheerioSelection): string | undefined {
  const value = normalizeText($td.text());
  return value.length > 0 ? value : undefined;
}

/** 연속 공백/개행 평탄화. */
function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** "Ocean Water" → "ocean-water". */
function slugifyName(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** undefined 값 spread 제외. */
function maybeField<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : { [key]: value };
}
