/**
 * Serebii `/items.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 4.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/items.shtml
 *
 * 산출 엔티티:
 *   - `item` (본체) — slug/nameEn/category/description/tags/imageUrl
 *   - `item_i18n(locale='en')` 분리 적재는 loader 책임
 *
 * 본 파서의 범위 (단계 4):
 *   - item 본체 + tag 배열 (Decoration/Food/Relaxation/Road/Toy)
 *   - **locations 는 빈 배열** — 본 페이지에 풍부하지만 상세(method + locationName)
 *     파싱이 복잡해 별도 배치(`ItemLocationParser`)에서 처리 예정
 *   - **isPaintable / isPatternable / isMagnetRiseOnly 는 기본 false** — 별도
 *     `/paint.shtml`, `/magnetrise.shtml` 등에서 보강
 *
 * 범위 밖 (별도 파서):
 *   - Lost Relics (L/S) 섹션 — `lost_relic` 1:1 확장 테이블 (SCHEMA §2.20)
 *   - Fossils 섹션 — 현재 ItemCategoryEnum 에 없음, 별도 분류 필요
 *   - Other 섹션 — 현재 매핑 없음, skip
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   ```
 *   <p><h2><a name="materials"></a>List of Materials</h2></p>
 *   <table class="dextable">
 *     <tr><td class="fooevo">Picture</td>... (헤더)
 *     <tr>
 *       <td class="cen"><a href="items/honey.shtml"><img src="items/honey.png" alt="Honey"/></a></td>
 *       <td class="cen"><a href="items/honey.shtml"><u>Honey</u></a></td>
 *       <td class="fooinfo">Sweet-smelling honey...</td>
 *       <td class="fooinfo">&nbsp;</td>                          (tag 비어있음)
 *       <td class="fooinfo">locations ...</td>
 *     </tr>
 *   </table>
 *   <p><h2><a name="food"></a>List of Food</h2></p>
 *   ...
 *   ```
 *
 * 파싱 전략 — substring 섹션 분할:
 *   전체 HTML 을 `<h2><a name="...">` 기준으로 구간 자르고, 각 구간을 별도
 *   cheerio 인스턴스로 재파싱. 섹션 내부 `<table class="dextable">` 의 행만
 *   처리해 다른 섹션의 행이 섞이지 않는다. malformed `<p><h2>...</h2></p>`
 *   중첩에 강하다 (LocationDetailParser 와 동일 전략).
 *
 * 에러 처리:
 *   - 헤더 행 (td.fooevo): 스킵 (이슈 아님)
 *   - slug 파싱 실패: 스킵 (이슈 아님 — 다른 섹션 링크 가능)
 *   - `<u>` 누락: `unexpected-structure` 이슈 + 스킵
 *   - Zod 실패: `zod-fail` 이슈 + 스킵
 *   - 전체 엔티티 0: `missing-section` 이슈
 *   - 매핑 안 된 카테고리 anchor: 무시 (lostrelics/fossils/other 정상 skip)
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
type ParserItemCategory = ItemInput['category'];
type ParserItemTag = ItemInput['tags'][number];

/** `/items/<slug>.shtml` → slug. 다른 섹션(예: `/locations/`, `/crafting.shtml`) 은 통과 못 함. */
const ITEM_HREF_RE = /\/?items\/([a-z0-9]+)\.shtml/i;

/** `<h2><a name="materials"></a>List of Materials</h2>` 에서 anchor 추출. */
const H2_ANCHOR_RE = /<h2>\s*<a\s+name="([^"]+)"\s*><\/a>[^<]*<\/h2>/gi;

/**
 * Serebii anchor → Prisma ItemCategory 매핑.
 *
 * `other` / `lostrelics(l)` / `lostrelics(s)` / `fossils` 는 매핑하지 않아
 * 파서가 해당 섹션을 자동으로 스킵한다 (로드맵에서 각각 별도 엔티티 처리 예정).
 */
const CATEGORY_BY_ANCHOR: Readonly<Record<string, ParserItemCategory>> = {
  materials: 'Materials',
  food: 'Food',
  furniture: 'Furniture',
  'misc.': 'Misc',
  outdoor: 'Outdoor',
  utilities: 'Utilities',
  nature: 'Nature',
  buildings: 'Buildings',
  blocks: 'Blocks',
  kits: 'Kits',
  keyitems: 'Key_Items',
};

/** ItemSchema 의 ItemTagEnum 값 — 집합 검사용. */
const ITEM_TAG_SET: ReadonlySet<ParserItemTag> = new Set<ParserItemTag>([
  'Decoration',
  'Food',
  'Relaxation',
  'Road',
  'Toy',
]);

export class ItemsParser extends Parser<ItemInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'items';

  parse(html: string, options: ParseOptions): ParseResult<ItemInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const entities: ItemInput[] = [];
    const issues: ParseIssue[] = [];

    const sections = splitH2Sections(html);
    for (const section of sections) {
      const category = CATEGORY_BY_ANCHOR[section.anchor];
      if (category === undefined) continue; // lostrelics/fossils/other 정상 스킵
      parseSection(section.body, category, options.sourceUrl, metadata, entities, issues);
    }

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no item rows matched — items.shtml structure likely changed',
      });
    }

    return { entities, issues };
  }
}

/**
 * HTML 을 `<h2><a name="...">` 경계로 잘라 (anchor, body) 목록 반환.
 *
 * 각 body 는 `<h2>` 태그부터 **다음 `<h2>` 직전까지** — 마지막 섹션은 EOF 까지.
 * `matchAll` 로 anchor 인덱스를 한 번에 모아 잘라낸다.
 */
function splitH2Sections(html: string): Array<{ anchor: string; body: string }> {
  const markers: Array<{ anchor: string; start: number }> = [];
  for (const match of html.matchAll(H2_ANCHOR_RE)) {
    const [, anchor] = match;
    if (anchor === undefined || match.index === undefined) continue;
    markers.push({ anchor: anchor.toLowerCase(), start: match.index });
  }
  const sections: Array<{ anchor: string; body: string }> = [];
  for (let i = 0; i < markers.length; i++) {
    const current = markers[i];
    if (current === undefined) continue;
    const next = markers[i + 1];
    const end = next === undefined ? html.length : next.start;
    sections.push({ anchor: current.anchor, body: html.slice(current.start, end) });
  }
  return sections;
}

/** 한 카테고리 섹션의 body 를 받아 `<table class="dextable">` 의 행들을 처리. */
function parseSection(
  body: string,
  category: ParserItemCategory,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: ItemInput[],
  issues: ParseIssue[],
): void {
  const $ = load(`<div>${body}</div>`);
  $('table.dextable tr').each((_, tr) => {
    processRow($, $(tr), category, sourceUrl, metadata, entities, issues);
  });
}

/** 한 `<tr>` 행 처리 — 실패/헤더는 silent skip, 구조 이상은 이슈. */
function processRow(
  $: CheerioAPI,
  $tr: CheerioSelection,
  category: ParserItemCategory,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: ItemInput[],
  issues: ParseIssue[],
): void {
  if ($tr.children('td.fooevo').length > 0) return; // 헤더

  const $tds = $tr.children('td');
  if ($tds.length < 4) return; // 빈/유실 행 보호

  const $picTd = $tds.eq(0);
  const $nameTd = $tds.eq(1);
  const $descTd = $tds.eq(2);
  const $tagTd = $tds.eq(3);

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
  const tags = extractTags($, $tagTd);
  const imageUrl = buildImageUrl($picTd, sourceUrl);

  const candidate = {
    slug,
    nameEn,
    description,
    category,
    tags,
    locations: [], // 별도 ItemLocationParser 에서 보강
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
 * tag 셀에서 ENUM 매칭 태그를 추출.
 *
 * 빈 tag: `<td class="fooinfo">&nbsp;</td>` → 빈 배열.
 * 값 있는 tag: `<a><img alt="Decoration"/><br />Decoration</a>` → ['Decoration'].
 *
 * `<img alt>` 가 ENUM 값과 1:1 이라 alt 우선. 없으면 `<a>` 말미 텍스트 fallback.
 */
function extractTags($: CheerioAPI, $td: CheerioSelection): ParserItemTag[] {
  const out: ParserItemTag[] = [];
  const seen = new Set<ParserItemTag>();
  $td.find('a').each((_, a) => {
    const $a = $(a);
    const alt = ($a.find('img').attr('alt') ?? '').trim();
    const lastToken = $a.text().trim().split(/\s+/).pop() ?? '';
    const candidate = alt.length > 0 ? alt : lastToken;
    if (isItemTag(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  });
  return out;
}

function isItemTag(value: string): value is ParserItemTag {
  return ITEM_TAG_SET.has(value as ParserItemTag);
}

/**
 * 이미지 셀에서 `<img src>` 를 절대 URL 로 변환 — base=sourceUrl (specialty/location 과 동일 전략).
 */
function buildImageUrl($td: CheerioSelection, sourceUrl: string): string | null {
  const src = $td.find('img').first().attr('src');
  if (src === undefined || src.length === 0) return null;
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return null;
  }
}
