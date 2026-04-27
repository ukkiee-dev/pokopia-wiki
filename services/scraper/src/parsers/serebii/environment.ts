/**
 * Serebii `/environmentlevel.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 16.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/environmentlevel.shtml
 *
 * 산출 엔티티:
 *   - `environment_reward` — 6 location × Lv. 1~10 의 unlock 아이템/레시피 (~428 행)
 *
 * `shop_item` / `currency` 는 본 페이지에 row-level 정보가 없어 파서가 산출하지
 * 않는다 (스키마는 정의됨, 향후 별도 데이터 소스에서 채움).
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문 후반부에 단일 `<table class="dextable">` 가 위치한다 (페이지 상단의
 *   class="tab" 개요 표는 무시).
 *
 *   ```
 *   <table class="dextable">
 *     <tr>
 *       <td class="fooevo">Picture</td>
 *       <td class="fooevo">Name</td>
 *       <td class="fooevo">Level</td>
 *     </tr>
 *     <tr>
 *       <td class="fooevo" colspan="5">
 *         <a name="<location-slug>"></a>
 *         <h3>Withered Wastelands</h3>
 *       </td>
 *     </tr>
 *     <tr>
 *       <td class="cen"><img src="items/<slug>.png" .../></td>
 *       <td class="cen">Garden bench</td>           <!-- 또는 "Workbench Recipe" -->
 *       <td class="fooinfo">Lv. 2</td>
 *     </tr>
 *     ...
 *   </table>
 *   ```
 *
 * 특이사항:
 *   - **카테고리 헤더 누적**: `<td class="fooevo" colspan="5">` 안 `<a name="...">`
 *     의 location slug 를 currentLocationSlug 로 누적. 6 지역 = Withered Wastelands
 *     / Bleak Beach / Rocky Ridges / Sparkling Skylands / Palette Town / Cloud Island.
 *   - **rewardType 분기**: Name 셀이 "X Recipe" 패턴이면 'recipe', 그 외 'item'.
 *     SCHEMA ENUM 의 'feature_unlock' / 'shop_unlock' 은 본 페이지 범위 외.
 *   - **slug 합성**: `<location-slug>-lv<level>-<item-slug>`. 동일 아이템이 여러
 *     location 에서 다른 level 로 unlock 될 수 있어 (location, level, item) 3-튜플이
 *     자연키.
 *   - **itemSlug 추출**: items/<slug>.png 토큰. loader 가 item / recipe FK 해소.
 *   - **level 파싱**: "Lv. N" 정규식 `/^Lv\.\s*(\d+)$/`.
 *
 * 에러 처리:
 *   - 3 fooevo 헤더(Picture/Name/Level) 미발견: missing-section
 *   - 카테고리 헤더 행에 location slug 없음: unexpected-structure (currentLocationSlug
 *     유지)
 *   - currentLocationSlug 미설정 상태에서 데이터 행 진입: unexpected-structure + skip
 *   - itemSlug 추출 실패 / level 파싱 실패: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 *   - 엔티티 0: missing-section
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  EnvironmentRewardSchema,
  type EnvironmentRewardInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** `items/<slug>.png` — 아이템 이미지 토큰. slug 에 괄호/하이픈 허용 (예:
 *  `antiquewall(lower)`, `brickborder(corner)`). magnet-rise.ts 동일 정책. */
const ITEM_IMG_RE = /items\/([a-z0-9()-]+)\.png/i;

/** "Lv. N" — Level 셀. */
const LEVEL_RE = /^Lv\.\s*(\d+)$/i;

/** "X Recipe" 접미사 — recipe rewardType 분기. */
const RECIPE_SUFFIX_RE = /\s+Recipe$/i;

export class EnvironmentRewardParser extends Parser<EnvironmentRewardInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'environmentlevel';

  parse(html: string, options: ParseOptions): ParseResult<EnvironmentRewardInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: EnvironmentRewardInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickRewardTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no environment-reward dextable (3 fooevo Picture/Name/Level) found',
      });
      return { entities, issues };
    }

    let currentLocationSlug: string | null = null;

    $table.find('tr').each((_, tr) => {
      const $row = $(tr);
      const $fooevoTds = $row.children('td.fooevo');

      if ($fooevoTds.length > 0) {
        const updated = updateLocationContext($fooevoTds);
        if (updated !== null) currentLocationSlug = updated;
        return;
      }

      processRow($row, currentLocationSlug, options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no environment-reward rows extracted',
      });
    }

    return { entities, issues };
  }
}

/** 3-fooevo 헤더(Picture/Name/Level) 인 dextable 채택. */
function pickRewardTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 3) return;
    const second = normalizeText($headerCells.eq(1).text());
    const third = normalizeText($headerCells.eq(2).text());
    if (second === 'Name' && third === 'Level') chosen = $table;
  });
  return chosen;
}

/**
 * 카테고리 헤더 행 (`<td class="fooevo" colspan="5"><a name="<slug>">...`) 해석.
 * 컬럼 헤더 행(3 개의 fooevo) 은 무시하고 null 반환. <a name> 이 있으면 location slug 갱신.
 */
function updateLocationContext($fooevoTds: CheerioSelection): string | null {
  if ($fooevoTds.length !== 1) return null;
  const slug = $fooevoTds.find('a[name]').first().attr('name') ?? '';
  return slug.length > 0 ? slug : null;
}

function processRow(
  $row: CheerioSelection,
  currentLocationSlug: string | null,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: EnvironmentRewardInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 3) return;

  if (currentLocationSlug === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'environment-reward[?]',
      message: 'data row encountered before any location category header',
    });
    return;
  }

  const $picTd = $tds.eq(0);
  const nameRaw = normalizeText($tds.eq(1).text());
  const levelText = normalizeText($tds.eq(2).text());

  const itemSlug = extractItemSlug($picTd);
  if (itemSlug === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: `environment-reward[${currentLocationSlug}/?]`,
      message: 'picture cell missing items/<slug>.png src',
    });
    return;
  }

  const level = parseLevel(levelText);
  if (level === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: `environment-reward[${currentLocationSlug}/${itemSlug}]`,
      message: `level cell did not match "Lv. <n>": "${levelText}"`,
    });
    return;
  }

  const isRecipe = RECIPE_SUFFIX_RE.test(nameRaw);
  const rewardType = isRecipe ? 'recipe' : 'item';
  // rewardType 포함: 동일 item 과 recipe 가 같은 location/level 에 양쪽으로 unlock
  // 되는 케이스(예: gardenbench 와 gardenbench recipe)에서 (location, level, type,
  // item) 4-튜플을 자연키로 보장.
  const slug = `${currentLocationSlug}-lv${level}-${rewardType}-${itemSlug}`;
  const imageUrl = buildImageUrl($picTd, sourceUrl) ?? undefined;

  const candidate = {
    slug,
    locationSlug: currentLocationSlug,
    level,
    rewardType,
    itemSlug,
    nameEn: nameRaw,
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...metadata,
  };

  const result = EnvironmentRewardSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `environment-reward[${slug}]`,
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

function parseLevel(text: string): number | null {
  const match = text.match(LEVEL_RE);
  if (match === null) return null;
  const value = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(value) && value >= 1 && value <= 10 ? value : null;
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

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
