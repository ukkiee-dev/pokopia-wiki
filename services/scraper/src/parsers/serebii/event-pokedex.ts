/**
 * Serebii `/eventpokedex.shtml` 파서 — DATA_COLLECTION_PLAN Phase 6 단계 36.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/eventpokedex.shtml
 *
 * 산출 엔티티:
 *   - `event_pokemon` × 4 (fixture 기준): Hoppip / Skiploom / Jumpluff / Sableye
 *
 * Event 메타 (startAt/endAt/isRecurring) 는 페이지에 row-level 데이터가 없어
 * 본 파서가 산출하지 않는다. loader 가 페이지 단위 placeholder Event entity 를
 * 생성하거나 외부 데이터로 보강. 본 파서의 EventPokemonInput 의 eventSlug 는
 * "event-eventpokedex-default" 로 통일된 placeholder slug.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문에 단일 `<table class="tab">` (4 fooevo: No./Pic/Name/Specialty)
 *   — litter.shtml 동일 스타일.
 *
 *   ```
 *   <tr>
 *     <td class="cen">#001</td>
 *     <td class="cen"><a href="/pokemonpokopia/pokedex/hoppip.shtml"><img .../></a></td>
 *     <td class="cen"><a href="/pokemonpokopia/pokedex/hoppip.shtml"><u>Hoppip</u></a></td>
 *     <td class="cen"><table>specialty icons</table></td>
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - **표 식별**: `class="tab"` + 4 fooevo + 두 번째 셀 "Pic" + 세 번째 셀 "Name"
 *     (litter.shtml 5 fooevo 와 다름).
 *   - **eventPokedexNo**: "#NNN" 정규식 (예: #003 Sableye 처럼 중복 가능 — 단일
 *     페이지 내 unique 가 아님; 본 파서는 ENUM 위반 없이 산출하고 loader 가 처리).
 *   - **slug 합성**: `event-pokemon-eventpokedex-default-<pokemonSlug>` —
 *     pokemonSlug 가 unique 자연 키 (event-eventpokedex-default 는 페이지 단위).
 *
 * 에러 처리:
 *   - 4 fooevo 헤더 미발견: missing-section
 *   - pokemonSlug 추출 실패: unexpected-structure + skip
 *   - "#NNN" 정규식 fail: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  EventPokemonSchema,
  type EventPokemonInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** 페이지 단위 단일 이벤트 placeholder slug — loader 가 Event entity 생성 시 이 값 사용. */
const DEFAULT_EVENT_SLUG = 'event-eventpokedex-default';

/** `pokedex/<slug>.shtml` — 포켓몬 상세 링크. */
const POKEDEX_HREF_RE = /pokedex\/([a-z0-9-]+)\.shtml/i;

/** "#NNN" — 이벤트 도감 번호. */
const POKEDEX_NO_RE = /^#?(\d+)$/;

export class EventPokedexParser extends Parser<EventPokemonInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'eventpokedex';

  parse(html: string, options: ParseOptions): ParseResult<EventPokemonInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: EventPokemonInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickEventPokedexTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no eventpokedex tab table (4 fooevo No./Pic/Name/Specialty) found',
      });
      return { entities, issues };
    }

    $table.find('tr').each((_, tr) => {
      const $row = $(tr);
      if ($row.children('td.fooevo').length > 0) return;
      if ($row.children('td.cen').length === 0) return;
      processRow($row, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no event_pokemon rows extracted',
      });
    }

    return { entities, issues };
  }
}

function pickEventPokedexTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.tab').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 4) return;
    const second = normalizeText($headerCells.eq(1).text());
    const third = normalizeText($headerCells.eq(2).text());
    if (second === 'Pic' && third === 'Name') chosen = $table;
  });
  return chosen;
}

function processRow(
  $row: CheerioSelection,
  metadata: SourceMetadata,
  entities: EventPokemonInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 4) return;

  const $noTd = $tds.eq(0);
  const $picTd = $tds.eq(1);
  const $nameTd = $tds.eq(2);

  const noText = normalizeText($noTd.text());
  const noMatch = noText.match(POKEDEX_NO_RE);
  if (noMatch === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'event-pokemon[?]',
      message: `No. cell did not match "#NNN": "${noText}"`,
    });
    return;
  }
  const eventPokedexNo = Number.parseInt(noMatch[1] ?? '', 10);

  const pokemonSlug = extractPokedexSlug($picTd) ?? extractPokedexSlug($nameTd);
  const pokemonNameEn = normalizeText($nameTd.find('u').first().text() || $nameTd.text());

  if (pokemonSlug === null || pokemonNameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `event-pokemon[#${eventPokedexNo}]`,
      message: 'pokemonSlug or pokemonNameEn extraction failed',
    });
    return;
  }

  const slug = `event-pokemon-${DEFAULT_EVENT_SLUG.replace(/^event-/, '')}-${pokemonSlug}`;

  const candidate = {
    slug,
    eventSlug: DEFAULT_EVENT_SLUG,
    pokemonSlug,
    pokemonNameEn,
    eventPokedexNo,
    ...metadata,
  };

  const result = EventPokemonSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `event-pokemon[${slug}]`,
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

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
