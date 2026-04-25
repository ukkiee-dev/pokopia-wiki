/**
 * Serebii `/cds.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 27.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/cds.shtml
 *
 * 산출 엔티티:
 *   - `cd` × 43 (fixture 기준), 각 CD 안에 nested:
 *     - `sourceGame` (12 unique 게임 중 하나)
 *     - `locations` (cd_location 힌트 배열)
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문 후반부에 단일 `<table class="dextable">` (5 fooevo:
 *   Picture / Name / Description / Locations / Game).
 *
 *   ```
 *   <tr>
 *     <td class="cen"><img src="items/<slug>.png" .../></td>
 *     <td class="cen">Title Screen</td>
 *     <td class="fooinfo">Music CD #1 If you have a music player...</td>
 *     <td class="fooinfo">In glowing terrain</td>     <!-- multi-line via <br /> -->
 *     <td class="fooinfo">Pokémon Red/Green</td>
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - **slug**: items/<slug>.png 토큰 (괄호/하이픈/도트 허용; "oak'slab" 같은
 *     아포스트로피 포함 케이스도). magnet-rise 보다 더 넓은 charset.
 *   - **cdNumber**: Description 셀 "Music CD #(\d+)" 정규식 추출.
 *   - **sourceGame**: GAME_TO_CODE 맵으로 raw 게임명 → code 변환 (rg/gs/rs/dp/bw/
 *     xy/oras/sm/swsh/la/sv/ppk). generation 도 동일 맵에 정의.
 *   - **locations**: Locations 셀 `<br />` 분리 라인 → 각 라인이 한 cd_location.
 *     라인 안에서 LOCATION_KEYWORDS 매칭으로 locationSlug 결정.
 *
 * 에러 처리:
 *   - 5 fooevo 헤더 dextable 미발견: missing-section
 *   - itemSlug 추출 실패 / nameEn 빈 행: unexpected-structure + skip
 *   - sourceGame 매칭 실패: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  CdSchema,
  type CdInput,
  type CdLocationHint,
  type SourceGameHint,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/**
 * `items/<slug>.png` — slug 에 영문/숫자/하이픈/괄호/도트/아포스트로피/느낌표 허용
 * (예: "oak'slab", "thes.s.anne", "cavesofmt.moon", "battle!(gymleader)1",
 * "supertraining!").
 */
const ITEM_IMG_RE = /items\/([a-z0-9().!'-]+)\.png/i;

/** "Music CD #(\d+)" — Description 셀 첫 부분. */
const CD_NUMBER_RE = /Music\s+CD\s+#(\d+)/i;

/**
 * Serebii 의 raw 게임명 → SCHEMA §2.16 source_game.code + generation.
 * 키 비교는 `Pok&eacute;mon` 디코딩 후 (cheerio 자동 처리) 그대로 매칭.
 */
const GAME_MAP: ReadonlyMap<string, { code: string; generation: number }> = new Map([
  ['Pokémon Red/Green', { code: 'rg', generation: 1 }],
  ['Pokémon Gold/Silver', { code: 'gs', generation: 2 }],
  ['Pokémon Ruby/Sapphire', { code: 'rs', generation: 3 }],
  ['Pokémon Omega Ruby/Alpha Sapphire', { code: 'oras', generation: 6 }],
  ['Pokémon Omega Ruby / Alpha Sapphire', { code: 'oras', generation: 6 }], // slash 양쪽 공백 변형
  ['Pokémon Omega', { code: 'oras', generation: 6 }], // Serebii 의 "Pokémon Omega" 약식 표현
  ['Pokémon Diamond/Pearl', { code: 'dp', generation: 4 }],
  ['Pokémon Black/White', { code: 'bw', generation: 5 }],
  ['Pokémon X/Y', { code: 'xy', generation: 6 }],
  ['Pokémon Sun/Moon', { code: 'sm', generation: 7 }],
  ['Pokémon Sword/Shield', { code: 'swsh', generation: 8 }],
  ['Pokémon Scarlet/Violet', { code: 'sv', generation: 9 }],
  ['Pokémon Legends: Arceus', { code: 'la', generation: 8 }],
  ['Pokémon Legends', { code: 'la', generation: 8 }],
  ['Pokémon Pokopia', { code: 'ppk', generation: 9 }],
]);

/** 알려진 location 명 → slug. cd_location 힌트의 locationSlug 매칭용. */
const LOCATION_KEYWORDS: ReadonlyArray<[string, string]> = [
  ['Withered Wastelands', 'witheredwastelands'],
  ['Sparkling Skylands', 'sparklingskylands'],
  ['Rocky Ridges', 'rockyridges'],
  ['Bleak Beach', 'bleakbeach'],
  ['Palette Town', 'palettetown'],
  ['Cloud Island', 'cloudisland'],
  ['Dream Islands', 'dreamisland'],
  ['Dream Island', 'dreamisland'],
];

export class CdsParser extends Parser<CdInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'cds';

  parse(html: string, options: ParseOptions): ParseResult<CdInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: CdInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickCdTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no cd dextable (5 fooevo Picture/Name/Description/Locations/Game) found',
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
        message: 'no cd rows extracted',
      });
    }

    return { entities, issues };
  }
}

function pickCdTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 5) return;
    const second = normalizeText($headerCells.eq(1).text());
    const fourth = normalizeText($headerCells.eq(3).text());
    if (second === 'Name' && fourth === 'Locations') chosen = $table;
  });
  return chosen;
}

function processRow(
  $: CheerioAPI,
  $row: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: CdInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 5) return;

  const $picTd = $tds.eq(0);
  const nameEn = normalizeText($tds.eq(1).text());
  const descriptionEn = normalizeText($tds.eq(2).text());
  const gameNameEn = normalizeText($tds.eq(4).text());

  const itemSlug = extractItemSlug($picTd);
  if (itemSlug === null || nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'cd[?]',
      message: 'data row missing itemSlug or nameEn',
    });
    return;
  }

  const sourceGame = resolveSourceGame(gameNameEn);
  if (sourceGame === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: `cd[${itemSlug}]`,
      message: `Game cell did not match GAME_MAP: "${gameNameEn}"`,
    });
    return;
  }

  const cdNumber = extractCdNumber(descriptionEn);
  const locations = parseLocationsCell($tds.eq(3));
  const imageUrl = buildImageUrl($picTd, sourceUrl) ?? undefined;

  const candidate = {
    slug: itemSlug,
    ...(cdNumber === undefined ? {} : { cdNumber }),
    nameEn,
    ...(descriptionEn.length > 0 ? { descriptionEn } : {}),
    ...(imageUrl === undefined ? {} : { imageUrl }),
    sourceGame,
    locations,
    ...metadata,
  };

  const result = CdSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `cd[${itemSlug}]`,
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

function extractCdNumber(descriptionEn: string): number | undefined {
  const match = descriptionEn.match(CD_NUMBER_RE);
  if (match === null) return undefined;
  const value = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function resolveSourceGame(gameNameEn: string): SourceGameHint | null {
  const meta = GAME_MAP.get(gameNameEn);
  if (meta === undefined) return null;
  return { code: meta.code, nameEn: gameNameEn, generation: meta.generation };
}

/** Locations 셀의 `<br />` 분리 라인 → cd_location 힌트 배열. */
function parseLocationsCell($td: CheerioSelection): CdLocationHint[] {
  const lines = ($td.html() ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line) => {
    const locationSlug = matchLocationSlug(line) ?? undefined;
    return locationSlug === undefined
      ? { methodEn: line }
      : { methodEn: line, locationSlug };
  });
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
