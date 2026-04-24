/**
 * Serebii `/crafting.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 8.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/crafting.shtml
 *
 * 산출 엔티티:
 *   - `crafting_recipe` — resultItemSlug/resultItemNameEn/resultQuantity/unlockMethod + ingredients[]
 *   - `crafting_ingredient` 은 ingredients 배열로 함께 실어 loader 가 분리 적재
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   ```
 *   <p><h2><a name="furniture"></a>List of Furniture</h2></p>
 *   <table class="dextable">
 *     <tr>
 *       <td class="fooevo">Picture</td>
 *       <td class="fooevo">Name</td>
 *       <td class="fooevo">Locations</td>      <!-- 사실상 unlock method 설명 -->
 *       <td class="fooevo">Requirements</td>   <!-- 재료 목록 -->
 *     </tr>
 *     <tr>
 *       <td class="cen"><a href="items/storagebox.shtml"><img ... /></a></td>
 *       <td class="cen"><a href="items/storagebox.shtml">Storage Box</a></td>
 *       <td class="fooinfo">Register 6 Pokémon</td>
 *       <td class="fooinfo"><table>
 *         <tr><td><a><img alt="Lumber"/></a></td><td><a><u>Lumber</u></a> * 1</td></tr>
 *       </table></td>
 *     </tr>
 *     ...
 *   </table>
 *   <p><h2><a name="misc."></a>List of Misc.</h2></p>
 *   ...
 *   ```
 *
 * 섹션 분할 — substring H2 anchor:
 *   items 파서와 동일 전략. `<h2><a name="...">` 경계로 substring 추출 후 각 섹션을
 *   별도 cheerio 인스턴스로 재파싱.
 *
 * 컬럼 매핑 주의:
 *   Serebii HTML 의 `td.fooevo:nth-child(3)` 는 **Locations** 헤더지만 실제 셀 값은
 *   unlock method(예: "Register 6 Pokémon", "Daily Shop Special", "Shop - Sparkling
 *   Skylands Lv. 10"). 헤더 이름과 의미가 달라 헷갈리지만, `unlock_method` 로 매핑.
 *
 * Ingredients 파싱:
 *   td[3] 내부 `<table>` 의 각 `<tr>` 이 재료 1종. 두 번째 셀의 `<u>Name</u> * N`
 *   패턴에서 `Name` 과 수량 `N` 을 추출.
 *
 * resultQuantity:
 *   현 페이지에는 결과 수량이 명시되지 않음 → 기본 1 (Zod default).
 *
 * 에러 처리:
 *   - 헤더 행: 스킵
 *   - 결과 아이템 href 없음: 스킵
 *   - `<u>` 누락: `unexpected-structure` + 스킵
 *   - Zod 실패: `zod-fail` + 스킵
 *   - 엔티티 0: `missing-section` 이슈
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  CraftingRecipeSchema,
  type CraftingRecipeInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;
type IngredientHint = CraftingRecipeInput['ingredients'][number];

/** `/items/<slug>.shtml` → slug. */
const ITEM_HREF_RE = /\/?items\/([a-z0-9]+)\.shtml/i;

/** `<h2><a name="...">` 경계 인식 */
const H2_ANCHOR_RE = /<h2>\s*<a\s+name="([^"]+)"\s*><\/a>[^<]*<\/h2>/gi;

/** `<u>Name</u> * N` 패턴에서 quantity 추출. */
const QUANTITY_RE = /\*\s*(\d+)/;

export class CraftingParser extends Parser<CraftingRecipeInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'crafting';

  parse(html: string, options: ParseOptions): ParseResult<CraftingRecipeInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const entities: CraftingRecipeInput[] = [];
    const issues: ParseIssue[] = [];

    const sections = splitH2Sections(html);
    for (const section of sections) {
      parseSection(section.body, metadata, entities, issues);
    }

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no crafting recipe rows matched — crafting.shtml structure likely changed',
      });
    }

    return { entities, issues };
  }
}

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

function parseSection(
  body: string,
  metadata: SourceMetadata,
  entities: CraftingRecipeInput[],
  issues: ParseIssue[],
): void {
  const $ = load(`<div>${body}</div>`);
  $('table.dextable tr').each((_, tr) => {
    processRow($, $(tr), metadata, entities, issues);
  });
}

function processRow(
  $: CheerioAPI,
  $tr: CheerioSelection,
  metadata: SourceMetadata,
  entities: CraftingRecipeInput[],
  issues: ParseIssue[],
): void {
  if ($tr.children('td.fooevo').length > 0) return; // 헤더

  const $tds = $tr.children('td');
  if ($tds.length < 4) return;

  const $picTd = $tds.eq(0);
  const $nameTd = $tds.eq(1);
  const $unlockTd = $tds.eq(2);
  const $ingredientsTd = $tds.eq(3);

  const href = $picTd.find('a').first().attr('href') ?? '';
  const slugMatch = href.match(ITEM_HREF_RE);
  if (!slugMatch) return;
  const [, capturedSlug] = slugMatch;
  if (capturedSlug === undefined || capturedSlug.length === 0) return;
  const resultItemSlug = capturedSlug;

  // Name 셀은 `<a>Storage Box</u></a>` 형태(malformed `</u>` 닫힘). `.text()` 로 trim.
  const resultItemNameEn = $nameTd.text().trim();
  if (resultItemNameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `crafting[${resultItemSlug}]`,
      message: 'result name cell is empty',
    });
    return;
  }

  // unlock method — `<br/>` 등 내부 줄바꿈 유지 어려우니 공백 정규화.
  const unlockMethod = $unlockTd.text().replace(/\s+/g, ' ').trim();
  if (unlockMethod.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `crafting[${resultItemSlug}]`,
      message: 'unlockMethod cell is empty',
    });
    return;
  }

  const ingredients = extractIngredients($, $ingredientsTd);

  const candidate = {
    resultItemSlug,
    resultItemNameEn,
    resultQuantity: 1,
    unlockMethod,
    ingredients,
    ...metadata,
  };

  const result = CraftingRecipeSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `crafting[${resultItemSlug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/**
 * ingredient 셀 내부 `<table>` 의 행 순회 — 각 행은 `<u>Name</u> * N` 형태.
 *
 * 두 번째 `<td>` 의 `<a href="items/<slug>.shtml">` 에서 slug, `<u>Name</u>` 에서
 * nameEn, 전체 텍스트에서 `* N` 수량 추출.
 */
function extractIngredients($: CheerioAPI, $td: CheerioSelection): IngredientHint[] {
  const out: IngredientHint[] = [];
  $td.find('table tr').each((_, tr) => {
    const $tr = $(tr);
    const $cells = $tr.find('td');
    if ($cells.length < 2) return;

    // 두 번째 셀에서 slug/nameEn/quantity 추출.
    const $nameCell = $cells.eq(1);
    const href = $nameCell.find('a').first().attr('href') ?? '';
    const slugMatch = href.match(ITEM_HREF_RE);
    if (!slugMatch) return;
    const [, capturedSlug] = slugMatch;
    if (capturedSlug === undefined || capturedSlug.length === 0) return;
    const itemSlug = capturedSlug;

    const itemNameEn = $nameCell.find('u').first().text().trim();
    if (itemNameEn.length === 0) return;

    const cellText = $nameCell.text();
    const qtyMatch = cellText.match(QUANTITY_RE);
    const quantity = qtyMatch?.[1] === undefined ? 1 : Number.parseInt(qtyMatch[1], 10);

    out.push({ itemSlug, itemNameEn, quantity });
  });
  return out;
}
