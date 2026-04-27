/**
 * Serebii `/cooking.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 9.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/cooking.shtml
 *
 * 산출 엔티티:
 *   - `cooking_recipe` — resultItemSlug/resultItemNameEn/mealCategory/bonusSpecialtyNameEn +
 *     ingredients[]
 *   - ingredients 는 main 1 + secondary 0~2 개. loader 가 `cooking_ingredient` 분리 적재.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   단일 테이블에 4 카테고리(Salad/Soup/Bread/Steak) 혼합. 각 카테고리 시작은
 *   `<td class="fooevo" colspan="7"><h3>Salad</h3>` 로 구분 — 일반 데이터 행이
 *   아닌 카테고리 헤더 행.
 *
 *   ```
 *   <table class="dextable">
 *     <tr>                                   <!-- 테이블 헤더 -->
 *       <td class="fooevo">Picture</td>
 *       <td class="fooevo">Name</td>
 *       <td class="fooevo">Description</td>
 *       <td class="fooevo">Main Ingredient</td>
 *       <td class="fooevo" colspan="2">Secondary Ingredients</td>
 *       <td class="fooevo">Pokémon Specialty</td>
 *     </tr>
 *     <tr><td class="fooevo" colspan="7"><h3>Salad</h3></td></tr>  <!-- 카테고리 헤더 -->
 *     <tr>                                   <!-- 데이터 행 -->
 *       <td class="cen"><img src="items/simplesalad.png" alt="Simple salad"/></td>
 *       <td class="cen">Simple salad</td>
 *       <td class="fooinfo">An ordinary salad ...</td>
 *       <td class="fooinfo"><img src="items/leaf.png" alt="Leaf"/><br />Leaf</td>
 *       <td class="cen">&nbsp;</td>          <!-- secondary 1 -->
 *       <td class="cen">&nbsp;</td>          <!-- secondary 2 -->
 *       <td class="cen">&nbsp;</td>          <!-- specialty bonus -->
 *     </tr>
 *     ...
 *   </table>
 *   ```
 *
 * 특이사항:
 *   - **링크 없음** — 결과/재료 모두 `<a>` 로 감싸지지 않음. slug 는 `<img src>`
 *     basename 에서 추출 (예: `items/leaf.png` → `leaf`).
 *   - Secondary Ingredient 셀 2 개는 colspan=2 헤더 대응. 각각 비어있을 수 있음.
 *   - Specialty 컬럼도 optional — `<a>` 내부 `<br/>Chop` 같은 텍스트에서 이름 추출.
 *   - HTML 이 malformed — `<h3>` 래핑 `<tr>` 뒤에 `<tr>` 이 또 붙는 패턴. cheerio 가
 *     관대하게 복구하지만 substring 경계를 정확히 잡기 위해 `<h3>카테고리</h3>` 와
 *     다음 `<h3>` 또는 `</table>` 사이의 HTML 을 잘라 각 카테고리 섹션을 개별 재파싱.
 *
 * 에러 처리:
 *   - 헤더/카테고리 헤더 행: 스킵
 *   - 결과 이미지 src 파싱 실패: 스킵
 *   - name 비어있음: `unexpected-structure` + 스킵
 *   - Zod 실패: `zod-fail` + 스킵
 *   - 엔티티 0: `missing-section` 이슈
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  CookingRecipeSchema,
  type CookingRecipeInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;
type ParserMealCategory = CookingRecipeInput['mealCategory'];
type IngredientHint = CookingRecipeInput['ingredients'][number];

/** `items/<slug>.png` → slug. */
const IMG_ITEM_RE = /items\/([a-z0-9-]+)\.png/i;

/** `specialty/<slug>.png|.shtml` — bonus specialty slug 추출용 (text 로 이름 확인). */
const SPECIALTY_HREF_RE = /specialty\/([a-z0-9-]+)\.shtml/i;

const MEAL_CATEGORIES: readonly ParserMealCategory[] = ['Salad', 'Soup', 'Bread', 'Steak'];

export class CookingParser extends Parser<CookingRecipeInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'cooking';

  parse(html: string, options: ParseOptions): ParseResult<CookingRecipeInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const entities: CookingRecipeInput[] = [];
    const issues: ParseIssue[] = [];

    const sections = splitByMealH3(html);
    for (const section of sections) {
      parseSection(section.category, section.body, metadata, entities, issues);
    }

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no cooking recipes matched — cooking.shtml structure likely changed',
      });
    }

    return { entities, issues };
  }
}

/**
 * `<h3>Salad|Soup|Bread|Steak</h3>` 위치로 HTML 을 잘라 카테고리별 섹션 반환.
 *
 * 각 섹션은 해당 h3 직후부터 다음 h3 또는 문서 끝까지. cheerio 로 재파싱 시
 * 이 섹션 내 `<tr>` 을 순회해 데이터 행을 확보.
 */
function splitByMealH3(html: string): Array<{ category: ParserMealCategory; body: string }> {
  const markers: Array<{ category: ParserMealCategory; start: number }> = [];
  for (const category of MEAL_CATEGORIES) {
    const tag = `<h3>${category}</h3>`;
    const idx = html.indexOf(tag);
    if (idx >= 0) markers.push({ category, start: idx });
  }
  markers.sort((a, b) => a.start - b.start);
  const sections: Array<{ category: ParserMealCategory; body: string }> = [];
  for (let i = 0; i < markers.length; i++) {
    const current = markers[i];
    if (current === undefined) continue;
    const next = markers[i + 1];
    const end = next === undefined ? html.length : next.start;
    sections.push({ category: current.category, body: html.slice(current.start, end) });
  }
  return sections;
}

function parseSection(
  category: ParserMealCategory,
  body: string,
  metadata: SourceMetadata,
  entities: CookingRecipeInput[],
  issues: ParseIssue[],
): void {
  const $ = load(`<table>${body}</table>`);
  $('tr').each((_, tr) => {
    processRow($, $(tr), category, metadata, entities, issues);
  });
}

function processRow(
  $: CheerioAPI,
  $tr: CheerioSelection,
  category: ParserMealCategory,
  metadata: SourceMetadata,
  entities: CookingRecipeInput[],
  issues: ParseIssue[],
): void {
  // 카테고리 헤더 행(colspan=7) 스킵.
  if ($tr.children('td.fooevo').length > 0) return;

  const $tds = $tr.children('td');
  if ($tds.length < 7) return;

  const $picTd = $tds.eq(0);
  const $nameTd = $tds.eq(1);
  const $descTd = $tds.eq(2);
  const $mainTd = $tds.eq(3);
  const $sub1Td = $tds.eq(4);
  const $sub2Td = $tds.eq(5);
  const $specialtyTd = $tds.eq(6);

  const resultSlug = extractItemSlug($picTd);
  if (resultSlug === null) return;

  const resultItemNameEn = $nameTd.text().trim();
  if (resultItemNameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `cooking[${resultSlug}]`,
      message: 'result name cell is empty',
    });
    return;
  }

  const ingredients: IngredientHint[] = [];
  const main = extractIngredient($mainTd, 'main');
  if (main !== null) ingredients.push(main);
  const sub1 = extractIngredient($sub1Td, 'sub');
  if (sub1 !== null) ingredients.push(sub1);
  const sub2 = extractIngredient($sub2Td, 'sub');
  if (sub2 !== null) ingredients.push(sub2);

  const bonusSpecialtyNameEn = extractSpecialty($specialtyTd);

  const candidate = {
    resultItemSlug: resultSlug,
    resultItemNameEn,
    mealCategory: category,
    ...(bonusSpecialtyNameEn === undefined ? {} : { bonusSpecialtyNameEn }),
    ingredients,
    ...metadata,
  };

  const result = CookingRecipeSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `cooking[${resultSlug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/** `<img src="items/<slug>.png">` → slug, 아니면 null. */
function extractItemSlug($td: CheerioSelection): string | null {
  const src = $td.find('img').first().attr('src') ?? '';
  const match = src.match(IMG_ITEM_RE);
  if (!match) return null;
  const [, captured] = match;
  return captured !== undefined && captured.length > 0 ? captured : null;
}

/**
 * ingredient 셀 파싱 — `<img src="items/leaf.png" alt="Leaf"/><br/>Leaf`.
 *
 * slug 는 img src, name 은 alt 우선(텍스트 fallback). 빈 셀(`&nbsp;`) 은 null 반환.
 */
function extractIngredient(
  $td: CheerioSelection,
  role: 'main' | 'sub',
): IngredientHint | null {
  const slug = extractItemSlug($td);
  if (slug === null) return null;
  const alt = ($td.find('img').first().attr('alt') ?? '').trim();
  const text = $td.text().replace(/\s+/g, ' ').trim();
  const itemNameEn = alt.length > 0 ? alt : text;
  if (itemNameEn.length === 0) return null;
  return { itemSlug: slug, itemNameEn, quantity: 1, role };
}

/**
 * 보너스 specialty 셀 파싱 — `<a href="specialty/chop.shtml"><img alt="Chop"/><br/>Chop</a>`.
 *
 * 비어있으면 undefined. href 가 있으면 alt 또는 `<br/>` 뒤 텍스트에서 이름 추출.
 */
function extractSpecialty($td: CheerioSelection): string | undefined {
  const $a = $td.find('a').first();
  if ($a.length === 0) return undefined;
  const href = $a.attr('href') ?? '';
  if (!SPECIALTY_HREF_RE.test(href)) return undefined;
  const alt = ($a.find('img').attr('alt') ?? '').trim();
  if (alt.length > 0) return alt;
  const text = $a.text().replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : undefined;
}
