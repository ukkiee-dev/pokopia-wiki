/**
 * Serebii `/furniture.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 6.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/furniture.shtml
 *
 * 산출 엔티티:
 *   - `item` (Furniture 카테고리 전용 갱신) — slug/nameEn/description/category/tags
 *     + **isPaintable / isPatternable 플래그 주입**
 *
 * 목적:
 *   items.shtml 파서가 채우지 못하는 `isPaintable` / `isPatternable` 필드를
 *   furniture.shtml 의 Colour 컬럼에서 추출. loader 는 `source_slug` 기반 upsert 로
 *   기존 Item 레코드에 플래그 필드만 병합한다.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   ```
 *   <table class="dextable">
 *     <tr>                                         <!-- 헤더 -->
 *       <td class="fooevo">Picture</td>
 *       <td class="fooevo">Name</td>
 *       <td class="fooevo">Description</td>
 *       <td class="fooevo">Locations</td>
 *       <td class="fooevo">Flags</td>              <!-- items.shtml 의 Tag 와 동일 정보 -->
 *       <td class="fooevo">Colour</td>             <!-- Paint / Pattern / No change possible -->
 *     </tr>
 *     <tr>
 *       <td class="cen"><a href="items/storagebox.shtml"><img ... /></a></td>
 *       <td class="cen"><a ...><u>Storage box</u></a></td>
 *       <td class="fooinfo">설명 ...</td>
 *       <td class="fooinfo">locations ...</td>
 *       <td class="fooinfo">Decoration</td>        <!-- Flags(tag) 없으면 빈 값 -->
 *       <td class="fooinfo">Paint<br /></td>       <!-- "Pattern\nPaint" 또는 "No change possible" -->
 *     </tr>
 *   </table>
 *   ```
 *
 * Colour 컬럼 파싱:
 *   - 텍스트에 `Paint` 포함 → `isPaintable=true`
 *   - 텍스트에 `Pattern` 포함 → `isPatternable=true`
 *   - `No change possible` → 둘 다 false
 *   - 빈 값 → 둘 다 false
 *
 * 범위 밖:
 *   - locations 컬럼 — items.shtml 과 동일하게 복잡해 본 파서는 빈 배열. 별도 파서 담당.
 *   - `isMagnetRiseOnly` — magnetrise.shtml 이 제공 (단계 13).
 *
 * 에러 처리:
 *   - 헤더 행: 스킵
 *   - items 링크 없음: 스킵 (다른 섹션 tr)
 *   - Zod 실패: `zod-fail` + 스킵
 *   - 엔티티 0: `missing-section` 이슈
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  ItemSchema,
  type ItemInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;
type ParserItemTag = ItemInput['tags'][number];

/** `/items/<slug>.shtml` — 끝 토큰 추출. */
const ITEM_HREF_RE = /\/?items\/([a-z0-9]+)\.shtml/i;

/** ItemSchema 의 ItemTagEnum 값. */
const ITEM_TAG_SET: ReadonlySet<ParserItemTag> = new Set<ParserItemTag>([
  'Decoration',
  'Food',
  'Relaxation',
  'Road',
  'Toy',
]);

export class FurnitureParser extends Parser<ItemInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'furniture';

  parse(html: string, options: ParseOptions): ParseResult<ItemInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: ItemInput[] = [];
    const issues: ParseIssue[] = [];

    $('table.dextable tr').each((_, tr) => {
      processRow($, $(tr), options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no furniture rows matched — furniture.shtml structure likely changed',
      });
    }

    return { entities, issues };
  }
}

function processRow(
  $: CheerioAPI,
  $tr: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: ItemInput[],
  issues: ParseIssue[],
): void {
  if ($tr.children('td.fooevo').length > 0) return; // 헤더

  const $tds = $tr.children('td');
  if ($tds.length < 6) return;

  const $picTd = $tds.eq(0);
  const $nameTd = $tds.eq(1);
  const $descTd = $tds.eq(2);
  const $tagTd = $tds.eq(4);
  const $colourTd = $tds.eq(5);

  const href = $picTd.find('a').first().attr('href') ?? '';
  const slugMatch = href.match(ITEM_HREF_RE);
  if (!slugMatch) return;
  const [, capturedSlug] = slugMatch;
  if (capturedSlug === undefined || capturedSlug.length === 0) return;
  const slug = capturedSlug;

  const nameEn = $nameTd.find('u').first().text().trim();
  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `item[${slug}]`,
      message: 'name cell is missing the <u> wrapper',
    });
    return;
  }

  const description = $descTd.text().trim();
  const tags = extractTags($tagTd);
  const colourText = $colourTd.text();
  const isPaintable = colourText.includes('Paint');
  const isPatternable = colourText.includes('Pattern');
  const imageUrl = buildImageUrl($picTd, sourceUrl);

  const candidate = {
    slug,
    nameEn,
    description,
    category: 'Furniture' as const,
    tags,
    locations: [],
    isPaintable,
    isPatternable,
    ...(imageUrl === null ? {} : { imageUrl }),
    ...metadata,
  };

  const result = ItemSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `item[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/**
 * Flag 셀에서 tag 추출. furniture.shtml 은 `<a>` 없이 평문 "Decoration" 을 주로 쓴다
 * (items.shtml 은 `<a><img alt="..."/><br/>...` 형태). 평문 fallback 과 `<a>` 모두 처리.
 */
function extractTags($td: CheerioSelection): ParserItemTag[] {
  const tokens = $td.text().trim().split(/\s+/);
  const out: ParserItemTag[] = [];
  const seen = new Set<ParserItemTag>();
  for (const token of tokens) {
    if (isItemTag(token) && !seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

function isItemTag(value: string): value is ParserItemTag {
  return ITEM_TAG_SET.has(value as ParserItemTag);
}

function buildImageUrl($td: CheerioSelection, sourceUrl: string): string | null {
  const src = $td.find('img').first().attr('src');
  if (src === undefined || src.length === 0) return null;
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return null;
  }
}
