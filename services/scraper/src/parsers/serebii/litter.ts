/**
 * Serebii `/litter.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 35.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/litter.shtml
 *
 * 산출 엔티티:
 *   - `pokemon_litter_reward` × 34 (fixture 기준): Litter specialty 보유 포켓몬
 *     별 보상 item 매핑.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문에 단일 `<table class="tab">` (5 fooevo: No./Pic/Name/Specialty/
 *   Item). 다른 파서들과 다르게 dextable 이 아닌 **tab class** 사용.
 *
 *   ```
 *   <tr>
 *     <td class="cen">#003</td>
 *     <td class="cen"><a href="/pokemonpokopia/pokedex/venusaur.shtml"><img src="/pokemonpokopia/pokemon/small/003.png" .../></a></td>
 *     <td class="cen"><a href="/pokemonpokopia/pokedex/venusaur.shtml"><u>Venusaur</u></a></td>
 *     <td class="cen"><table>...specialty icons...</table></td>
 *     <td class="cen"><img src="items/leaf.png" .../><br/>Leaf</td>
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - **표 식별**: `class="dextable"` 가 아닌 `class="tab"` — pickTable 헬퍼는
 *     `class="tab"` + 5 fooevo + 두 번째 셀 "Pic" + 다섯 번째 셀 "Item" 조합.
 *   - **pokedexNo 추출**: "#NNN" 정규식 (예: "#003" → 3).
 *   - **pokemonSlug**: `pokedex/<slug>.shtml` href 토큰.
 *   - **itemSlug**: `items/<slug>.png` img src 토큰.
 *   - **itemNameEn**: Item 셀 텍스트 (img alt + br + 텍스트 노드).
 *   - **habitatSlug** / **dropRate**: 본 페이지에 명시 없어 미산출 (loader 보강).
 *
 * 에러 처리:
 *   - 5 fooevo 헤더 미발견: missing-section
 *   - pokemonSlug / itemSlug 추출 실패: unexpected-structure + skip
 *   - "#NNN" 정규식 fail: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  PokemonLitterRewardSchema,
  type PokemonLitterRewardInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** `pokedex/<slug>.shtml` — 포켓몬 상세 링크. */
const POKEDEX_HREF_RE = /pokedex\/([a-z0-9-]+)\.shtml/i;

/** `items/<slug>.png` — 아이템 이미지. */
const ITEM_IMG_RE = /items\/([a-z0-9()-]+)\.png/i;

/** "#NNN" — 포코피아 도감 번호 셀. */
const POKEDEX_NO_RE = /^#?(\d+)$/;

export class LitterParser extends Parser<PokemonLitterRewardInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'litter';

  parse(html: string, options: ParseOptions): ParseResult<PokemonLitterRewardInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: PokemonLitterRewardInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickLitterTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message:
          'no litter tab table (5 fooevo, "Pic" + "Item" headers) found',
      });
      return { entities, issues };
    }

    $table.find('tr').each((_, tr) => {
      const $row = $(tr);
      // 헤더 행(fooevo) 또는 nested specialty 표의 tr 은 처리 안 함.
      if ($row.children('td.fooevo').length > 0) return;
      if ($row.children('td.cen').length === 0) return;
      processRow($row, options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no pokemon_litter_reward rows extracted',
      });
    }

    return { entities, issues };
  }
}

/**
 * `class="tab"` 표 중 5 fooevo + 두 번째 셀 "Pic" + 다섯 번째 셀 "Item" 인 표 채택.
 */
function pickLitterTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.tab').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 5) return;
    const second = normalizeText($headerCells.eq(1).text());
    const fifth = normalizeText($headerCells.eq(4).text());
    if (second === 'Pic' && fifth === 'Item') chosen = $table;
  });
  return chosen;
}

function processRow(
  $row: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: PokemonLitterRewardInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 5) return;

  const $noTd = $tds.eq(0);
  const $picTd = $tds.eq(1);
  const $nameTd = $tds.eq(2);
  const $itemTd = $tds.eq(4);

  const noText = normalizeText($noTd.text());
  const noMatch = noText.match(POKEDEX_NO_RE);
  if (noMatch === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'litter[?]',
      message: `No. cell did not match "#NNN": "${noText}"`,
    });
    return;
  }
  const pokedexNo = Number.parseInt(noMatch[1] ?? '', 10);

  const pokemonSlug = extractPokedexSlug($picTd) ?? extractPokedexSlug($nameTd);
  const pokemonNameEn = normalizeText($nameTd.find('u').first().text() || $nameTd.text());
  const itemSlug = extractItemSlug($itemTd);
  const itemNameEn = normalizeText($itemTd.text());

  if (pokemonSlug === null || itemSlug === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: `litter[#${pokedexNo}]`,
      message: 'pokemonSlug or itemSlug extraction failed',
    });
    return;
  }
  if (pokemonNameEn.length === 0 || itemNameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `litter[${pokemonSlug}/${itemSlug}]`,
      message: 'pokemonNameEn or itemNameEn empty',
    });
    return;
  }

  const slug = `litter-reward-${pokemonSlug}-${itemSlug}`;

  const candidate = {
    slug,
    pokemonSlug,
    pokemonNameEn,
    pokedexNo,
    itemSlug,
    itemNameEn,
    ...metadata,
  };

  const result = PokemonLitterRewardSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `litter[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

function extractPokedexSlug($td: CheerioSelection): string | null {
  const href = $td.find('a').first().attr('href') ?? '';
  const match = href.match(POKEDEX_HREF_RE);
  if (match === null) return null;
  const [, captured] = match;
  return captured !== undefined && captured.length > 0 ? captured : null;
}

function extractItemSlug($td: CheerioSelection): string | null {
  const src = $td.find('img').first().attr('src') ?? '';
  const match = src.match(ITEM_IMG_RE);
  if (match === null) return null;
  const [, captured] = match;
  return captured !== undefined && captured.length > 0 ? captured : null;
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
