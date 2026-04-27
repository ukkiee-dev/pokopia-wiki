/**
 * Serebii `/flavors.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 10.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/flavors.shtml
 *
 * 산출 엔티티:
 *   - `food` — itemSlug/itemNameEn/flavor + optional ppRestore/moveBoost.
 *     loader 가 itemSlug 로 item FK 를 해소해 `food` 1:1 확장 레코드 생성.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   단일 `<table class="dextable">` 안에 6 카테고리(No Flavor/Bitter/Dry/Sour/
 *   Spicy/Sweet) 행이 순서대로 적재. 카테고리 구분은 cooking.shtml 과 유사하게
 *   `<td class="fooevo" colspan="4"><a name="<anchor>"></a><h3>카테고리명</td>` 행.
 *
 *   ```
 *   <table class="dextable">
 *     <tr><td class="fooevo">Picture</td><td class="fooevo">Name</td>
 *         <td class="fooevo">Description</td></tr>
 *     <tr><td class="fooevo" colspan="4"><a name="general"></a><h3>No Flavor</td></tr>
 *     <tr><td class="cen"><img src="items/leppaberry.png" alt="Leppa Berry"/></td>
 *         <td class="cen">Leppa Berry</td>
 *         <td class="fooinfo">A berry with a rather unremarkable flavor.
 *                             Restores some PP when eaten.</td></tr>
 *     ...
 *     <tr><td class="fooevo" colspan="4"><a name="bitter"></a><h3>Bitter</td></tr>
 *     ...
 *   </table>
 *   ```
 *
 * 특이사항:
 *   - **이중 카테고리 헤더 행** — 첫 `<tr>` 은 컬럼 헤더("Picture/Name/Description"),
 *     그 뒤의 `<td class="fooevo" colspan="4">` 행은 flavor 카테고리 구분자.
 *     `fooevo` 클래스로 데이터 행과 구분하고, `<h3>` 존재 여부로 카테고리 헤더를
 *     판별한다.
 *   - **"No Flavor" → `None` 매핑** — SCHEMA §2.8 의 ENUM 이 `None` 이므로 h3 텍스트
 *     정규화 필요.
 *   - **Description 텍스트 heuristic** — ppRestore 와 moveBoost 는 별도 셀이 없고
 *     모두 자연어 문장 내부. `Restores (a bit of|some|a lot of) PP` / `Powers up <move>`
 *     정규식으로 추출. 한 엔티티는 두 값 중 최대 한 개만 가짐 (테스트에서 검증).
 *   - **대소문자 유연** — fluffybread 는 원문이 "Powers up cut" (소문자) 이므로 move
 *     매칭은 case-insensitive.
 *   - **Malformed row** — Rare Candy 행(line 785) 은 opening `<tr>` 누락. cheerio
 *     (htmlparser2) 가 자동 보정해 `<table>` 직하 `<tr>` 로 재구성하므로 정상 처리.
 *   - **링크 없음** — 대부분 행은 `<a>` 없이 이미지·텍스트만. 드물게 `<a><u>Rare Candy</u></a>`
 *     중첩이 있으나 `.text()` 로 깨끗이 추출.
 *
 * 에러 처리:
 *   - 컬럼 헤더 / 카테고리 헤더 행: 스킵 (`td.fooevo` 로 판별)
 *   - 결과 이미지 src 파싱 실패: 스킵
 *   - 카테고리 헤더 전의 데이터 행: 스킵 (currentFlavor 미설정)
 *   - name 비어있음: `unexpected-structure` + 스킵
 *   - Zod 실패: `zod-fail` + 스킵
 *   - 엔티티 0: `missing-section` 이슈
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  FoodSchema,
  type FoodInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;
type ParserFlavor = FoodInput['flavor'];
type ParserPpRestore = NonNullable<FoodInput['ppRestore']>;
type ParserMoveBoost = NonNullable<FoodInput['moveBoost']>;

/** `items/<slug>.png` → slug. */
const IMG_ITEM_RE = /items\/([a-z0-9-]+)\.png/i;

/**
 * `<h3>` 카테고리 헤더 텍스트 → SCHEMA ENUM 매핑.
 *
 * Serebii 는 "No Flavor" 로 표기하지만 Prisma ENUM 은 `None` 이므로 정규화 필요.
 */
const CATEGORY_TO_FLAVOR: Record<string, ParserFlavor> = {
  'No Flavor': 'None',
  Bitter: 'Bitter',
  Dry: 'Dry',
  Sour: 'Sour',
  Spicy: 'Spicy',
  Sweet: 'Sweet',
};

/**
 * PP 복원 heuristic. 순서 중요 — "a bit of"/"a lot of" 가 "some" 보다 먼저 매치되어야
 * 한다 (실제로는 겹치지 않지만 regex 우선순위 명시).
 */
const PP_RESTORE_PATTERNS: ReadonlyArray<[RegExp, ParserPpRestore]> = [
  [/restores a bit of pp/i, 'little'],
  [/restores a lot of pp/i, 'lot'],
  [/restores some pp/i, 'some'],
];

/**
 * Move boost heuristic. "Powers up <move>" 뒤에 "a lot" 수식어가 붙어도 무시
 * (SCHEMA 의 ENUM 은 강도 구분 없음 — 이름만).
 *
 * `Water Gun` / `Rock Smash` 는 공백 포함 — 정규식에 `\s+` 사용.
 */
const MOVE_BOOST_PATTERNS: ReadonlyArray<[RegExp, ParserMoveBoost]> = [
  [/powers up leafage\b/i, 'Leafage'],
  [/powers up water\s+gun\b/i, 'Water_Gun'],
  [/powers up rock\s+smash\b/i, 'Rock_Smash'],
  [/powers up cut\b/i, 'Cut'],
];

export class FlavorsParser extends Parser<FoodInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'flavors';

  parse(html: string, options: ParseOptions): ParseResult<FoodInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const $table = $('table.dextable').first();
    const issues: ParseIssue[] = [];

    if ($table.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'table.dextable not found — flavors.shtml structure likely changed',
      });
      return { entities: [], issues };
    }

    const entities: FoodInput[] = [];
    let currentFlavor: ParserFlavor | null = null;

    $table.find('tr').each((_, tr) => {
      const $tr = $(tr);
      const categoryFromHeader = detectCategoryHeader($tr);
      if (categoryFromHeader !== null) {
        currentFlavor = categoryFromHeader;
        return;
      }
      // `fooevo` 클래스는 카테고리 헤더 또는 컬럼 헤더 — 데이터 행이 아님.
      if ($tr.children('td.fooevo').length > 0) return;
      // 카테고리 헤더 이전 데이터 행(없어야 정상) — 스킵.
      if (currentFlavor === null) return;
      processRow($, $tr, currentFlavor, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no food rows matched — flavors.shtml structure likely changed',
      });
    }

    return { entities, issues };
  }
}

/**
 * `<td class="fooevo" colspan="4"><h3>Bitter</h3></td>` 형태의 카테고리 헤더 행
 * 감지. `<h3>` 텍스트를 SCHEMA ENUM 으로 정규화해 반환; 카테고리 헤더가 아니면 null.
 */
function detectCategoryHeader($tr: CheerioSelection): ParserFlavor | null {
  const $h3 = $tr.find('td.fooevo h3').first();
  if ($h3.length === 0) return null;
  const label = $h3.text().trim();
  return CATEGORY_TO_FLAVOR[label] ?? null;
}

function processRow(
  $: CheerioAPI,
  $tr: CheerioSelection,
  flavor: ParserFlavor,
  metadata: SourceMetadata,
  entities: FoodInput[],
  issues: ParseIssue[],
): void {
  const $tds = $tr.children('td');
  if ($tds.length < 3) return;

  const $picTd = $tds.eq(0);
  const $nameTd = $tds.eq(1);
  const $descTd = $tds.eq(2);

  const itemSlug = extractItemSlug($picTd);
  if (itemSlug === null) return;

  const itemNameEn = $nameTd.text().replace(/\s+/g, ' ').trim();
  if (itemNameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `flavors[${itemSlug}]`,
      message: 'name cell is empty',
    });
    return;
  }

  const description = $descTd.text().replace(/\s+/g, ' ').trim();
  const ppRestore = detectPpRestore(description);
  const moveBoost = detectMoveBoost(description);

  const candidate = {
    itemSlug,
    itemNameEn,
    flavor,
    ...(ppRestore === undefined ? {} : { ppRestore }),
    ...(moveBoost === undefined ? {} : { moveBoost }),
    ...metadata,
  };

  const result = FoodSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `flavors[${itemSlug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

function extractItemSlug($td: CheerioSelection): string | null {
  const src = $td.find('img').first().attr('src') ?? '';
  const match = src.match(IMG_ITEM_RE);
  if (!match) return null;
  const [, captured] = match;
  return captured !== undefined && captured.length > 0 ? captured : null;
}

function detectPpRestore(description: string): ParserPpRestore | undefined {
  for (const [pattern, value] of PP_RESTORE_PATTERNS) {
    if (pattern.test(description)) return value;
  }
  return undefined;
}

function detectMoveBoost(description: string): ParserMoveBoost | undefined {
  for (const [pattern, value] of MOVE_BOOST_PATTERNS) {
    if (pattern.test(description)) return value;
  }
  return undefined;
}
