/**
 * Serebii `availablepokemon.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 1.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/availablepokemon.shtml
 *
 * 산출 엔티티:
 *   - `pokemon` (본체) — pokedex_no, nameEn, imageUrl, specialties, is* 플래그
 *   - `pokemon_specialty` (M:N) 는 `specialties: string[]` 로 함께 실어 loader 가 해소
 *
 * HTML 파서 선택 — cheerio:
 *   Serebii 페이지는 HTML4 스타일로 `</tr>` 이 생략된 multi-specialty 중첩 테이블이
 *   다수 존재한다. 더 엄격한 파서는 DOM 트리 꼬임으로 행이 누락된다. cheerio
 *   (htmlparser2 기반) 가 이 malformed HTML 에 가장 관대하다.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   ```
 *   <tr>                                                  <!-- 포켓몬 1 행 -->
 *     <td class="cen">#001</td>                           <!-- pokedex_no -->
 *     <td class="cen"><a><img src="/.../001.png"/></a></td>
 *     <td class="cen"><a><u>Bulbasaur</u></a></td>
 *     <td class="cen">
 *       <table><tr>
 *         <td><a href="/.../specialty/grow.shtml"><img alt="Grow" /></a></td>
 *         <td><a href="/.../specialty/grow.shtml"><u>Grow</u></a></td>
 *       <tr>  <!-- 닫힘 </tr> 생략 패턴, multi-specialty 일 때 -->
 *         <td><a href="/.../specialty/litter.shtml"><img alt="Litter" /></a></td>
 *         <td><a href="/.../specialty/litter.shtml"><u>Litter</u></a></td>
 *       </tr></table>
 *     </td>
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - Pokopia 자체 도감 번호와 전국 도감 번호는 다르다 (예: Pidgey #010, 전국 #016).
 *     `imageUrl` 의 파일명은 전국 도감 번호(sprite) 이지만 파서는 그대로 보존한다.
 *   - 같은 `pokedex_no` 가 여러 행에 나올 수 있다 (form variant). 파서는 중복을
 *     제거하지 않는다 — 해소는 loader 단계에서 결정.
 *   - 이 페이지는 **일반 포켓몬만** 담는다. event/unique/legendary 는 각각 전용
 *     페이지에서 수집되므로 여기서는 세 플래그를 모두 false 로 고정.
 *
 * 에러 처리:
 *   - name `<u>` 가 없는 행: `unexpected-structure` 이슈로 기록 후 스킵
 *   - Zod safeParse 실패: `zod-fail` 이슈 기록 후 스킵
 *   - 결과적으로 entities.length 가 0 이면 `missing-section` 이슈 추가 (페이지
 *     레이아웃 변경 가능성을 loader/QA 로 전달)
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  PokemonSchema,
  type PokemonInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

/** cheerio 의 selection wrapper 타입을 domhandler 를 import 하지 않고 얻는다. */
type CheerioSelection = ReturnType<CheerioAPI>;

/** Serebii 루트. 상대 이미지 경로를 절대 URL 로 바꿀 때 사용. */
const SEREBII_BASE = 'https://www.serebii.net';

/** `#001` 패턴에서 숫자만 추출. 선행 0 은 `parseInt(…, 10)` 로 제거. */
const POKEDEX_NO_RE = /^#(\d{1,4})$/;

export class AvailablePokemonParser extends Parser<PokemonInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'available-pokemon';

  parse(html: string, options: ParseOptions): ParseResult<PokemonInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: PokemonInput[] = [];
    const issues: ParseIssue[] = [];

    // 직계 자식 `td.cen` 개수 === 4 인 `<tr>` 만 포켓몬 본체 행으로 간주. specialty
    // 중첩 테이블 내부 `<tr>` 은 직계 td 에 class="cen" 이 없어 자동 제외된다.
    $('tr').each((_, tr) => {
      processRow($, $(tr), metadata, entities, issues);
    });

    if (entities.length === 0) {
      // 하나도 못 뽑은 상태는 레이아웃 변경 신호로 해석. loader/QA 가 임계 판정.
      issues.push({
        kind: 'missing-section',
        message: 'no pokemon rows matched — availablepokemon.shtml structure likely changed',
      });
    }

    return { entities, issues };
  }
}

/** 포켓몬 1 행 처리 — entities / issues 를 직접 변이. 호출자는 순회만. */
function processRow(
  $: CheerioAPI,
  $tr: CheerioSelection,
  metadata: SourceMetadata,
  entities: PokemonInput[],
  issues: ParseIssue[],
): void {
  const $tds = $tr.children('td.cen');
  if ($tds.length !== 4) return;

  const noText = $tds.eq(0).text().trim();
  const noMatch = noText.match(POKEDEX_NO_RE);
  if (!noMatch) return;
  const [, captured] = noMatch;
  if (captured === undefined) return;
  const pokedexNo = Number.parseInt(captured, 10);

  const nameText = $tds.eq(2).find('u').first().text().trim();
  if (nameText.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: formatKey(pokedexNo),
      message: 'name cell is missing the <u> wrapper',
    });
    return;
  }

  const imageUrl = buildImageUrl($tds.eq(1));
  const specialties = collectSpecialties($, $tds.eq(3));

  const candidate = {
    pokedexNo,
    nameEn: nameText,
    ...(imageUrl === null ? {} : { imageUrl }),
    specialties,
    isEvent: false,
    isUniqueCharacter: false,
    isLegendary: false,
    ...metadata,
  };

  const result = PokemonSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: formatKey(pokedexNo),
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/** 포켓몬 식별 키 — `pokemon[#001]` 형태. 이슈 리포트에서 위치 추적용. */
function formatKey(pokedexNo: number): string {
  return `pokemon[#${String(pokedexNo).padStart(3, '0')}]`;
}

/**
 * 이미지 셀에서 `<img src>` 를 절대 URL 로 변환. src 가 없거나 URL 구성이
 * 실패하면 null (imageUrl 은 optional 이므로 스키마 통과 가능).
 */
function buildImageUrl($td: CheerioSelection): string | null {
  const src = $td.find('img').first().attr('src');
  if (src === undefined || src.length === 0) return null;
  try {
    return new URL(src, SEREBII_BASE).toString();
  } catch {
    return null;
  }
}

/**
 * 스페셜티 셀에서 모든 `<a href*="/specialty/">` 아래 `<u>` 텍스트를 추출.
 * 한 specialty 가 img + name 두 anchor 로 나오므로 Set 으로 중복 제거하면서
 * 원본 순서를 보존한다.
 */
function collectSpecialties($: CheerioAPI, $td: CheerioSelection): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  $td.find('a[href*="/specialty/"]').each((_, a) => {
    const text = $(a).find('u').first().text().trim();
    if (text.length === 0 || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  });
  return out;
}
