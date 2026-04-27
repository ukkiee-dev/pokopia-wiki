/**
 * Serebii `/cloudislands.shtml` 파서 — DATA_COLLECTION_PLAN Phase 7 단계 40.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/cloudislands.shtml
 *
 * 산출 엔티티:
 *   - `island_variant` × 6 (fixture 기준): Pokétimes / EIKO City / Sashihara /
 *     Color Peach / IKEA Island / Dolze Island
 *   - rewards 는 빈 배열 (cloud island 는 community-created code-based, 시스템적
 *     reward 없음).
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   `<table class="dextable">` (3 fooevo: Picture / Description / Code).
 *
 *   ```
 *   <tr>
 *     <td class="cen"><img src="cloudislandcode.jpg" .../></td>
 *     <td class="cen">This island was created by ...</td>
 *     <td class="cen">PXQC G03S</td>
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - **nameEn 추출**: img alt 의 "X Cloud Island" 에서 "X" 부분.
 *   - **variantKey**: code 를 slugify (예: "PXQC G03S" → "pxqcg03s").
 *   - slug 합성: `island-variant-cloudisland-<variantKey>`.
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  IslandVariantSchema,
  type IslandVariantInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

const LOCATION_SLUG = 'cloudisland';

export class CloudIslandsParser extends Parser<IslandVariantInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'cloudislands';

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

    const $table = pickCodeTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no cloudislands dextable (3 fooevo Picture/Description/Code) found',
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

function pickCodeTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 3) return;
    const second = normalizeText($headerCells.eq(1).text());
    const third = normalizeText($headerCells.eq(2).text());
    if (second === 'Description' && third === 'Code') chosen = $table;
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
  if ($tds.length < 3) return;

  const $picTd = $tds.eq(0);
  const descriptionEn = normalizeText($tds.eq(1).text());
  const code = normalizeText($tds.eq(2).text());

  const altText = $picTd.find('img').first().attr('alt') ?? '';
  const nameEn = normalizeText(altText.replace(/\s*Cloud\s*Island\s*$/i, ''));
  const imgSrc = $picTd.find('img').first().attr('src');
  const imageUrl = imgSrc !== undefined && imgSrc.length > 0
    ? safeAbsoluteUrl(imgSrc, sourceUrl)
    : undefined;

  if (nameEn.length === 0 || code.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'island-variant[?]',
      message: 'cloud island missing nameEn or code',
    });
    return;
  }

  const variantKey = slugifyCode(code);
  const slug = `island-variant-${LOCATION_SLUG}-${variantKey}`;

  const candidate = {
    slug,
    locationSlug: LOCATION_SLUG,
    variantKey,
    nameEn,
    ...(descriptionEn.length > 0 ? { descriptionEn } : {}),
    code,
    ...(imageUrl === undefined ? {} : { imageUrl }),
    rewards: [],
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

function slugifyCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function safeAbsoluteUrl(src: string, sourceUrl: string): string | undefined {
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return undefined;
  }
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
