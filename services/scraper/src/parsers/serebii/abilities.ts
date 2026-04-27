/**
 * Serebii `/abilities.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 12.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/abilities.shtml
 *
 * 산출 엔티티:
 *   - `ditto_ability` — slug + type(Primary|Secondary) + nameEn + effectEn +
 *     unlockTextEn + imageUrl
 *
 * `unlockTextEn` 의 포켓몬·장소 텍스트(예: "Befriend Zorua in Bleak Beach") 분해 →
 * SCHEMA §2.9 의 `unlock_pokemon_id` / `unlock_location_id` FK 해소는 loader 책임.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지에 두 개의 `<table class="dextable">` 가 있다:
 *   1. "Powering Up Moves" — 식사 → 무브 강화 매핑 (3-컬럼 Meal/Move/Effect).
 *      **본 파서 범위 외.**
 *   2. "List of Ditto's Moves" — 본 파서 대상 (4-컬럼 Picture/Move/Effect/Location).
 *
 *   본 파서는 **첫 행(`<tr>`)의 `<td class="fooevo">` 가 정확히 4 개인 dextable**
 *   만 채택해 위쪽 3-컬럼 dextable 을 자연스럽게 배제한다.
 *
 *   ```
 *   <table class="dextable">
 *     <tr>  <!-- 컬럼 헤더 (4 fooevo) -->
 *       <td class="fooevo">Picture</td>
 *       <td class="fooevo">Move</td>
 *       <td class="fooevo">Effect</td>
 *       <td class="fooevo">Location</td>
 *     </tr>
 *     <tr><td class="fooevo" colspan="4">Primary Moves</td></tr>  <!-- 카테고리 헤더 -->
 *     <tr>  <!-- 데이터 행 -->
 *       <td class="fooinfo"><img src="ditto/<slug>.png" .../></td>
 *       <td class="fooinfo"><Name></td>
 *       <td class="fooinfo"><Effect></td>
 *       <td class="fooinfo"><Location/Unlock></td>
 *     </tr>
 *     ...
 *     <tr><td class="fooevo" colspan="4">Secondary Moves</td></tr>
 *     <tr>  <!-- Secondary 는 Picture 셀이 비어있음 -->
 *       <td class="fooinfo"></td>
 *       <td class="fooinfo">Strength</td>
 *       ...
 *     </tr>
 *   </table>
 *   ```
 *
 * 특이사항:
 *   - **카테고리 헤더 누적** — `<td class="fooevo" colspan="4">Primary Moves</td>`
 *     같은 단일 셀 헤더 행이 진행 중인 `currentType` 을 갱신한다. 이후 데이터 행이
 *     해당 타입을 상속.
 *   - **slug 결정**:
 *     - Primary 행: `<img src="ditto/<slug>.png">` 의 파일명 토큰 사용. Serebii
 *       URL 토큰을 natural key 로 채택해 building/items 와 일관.
 *     - Secondary 행: 이미지 셀이 비어 있으므로 `nameEn` 의 lowercase + 공백→하이픈
 *       으로 fallback (예: "Stockpile Water" → "stockpile-water").
 *   - **effectEn / unlockTextEn 정규화** — `.text()` 로 추출 후 연속 공백을 단일
 *     공백으로 평탄화. `<br>` 은 cheerio 가 자동 처리.
 *
 * 에러 처리:
 *   - 4-fooevo 헤더를 가진 dextable 미발견: `missing-section`
 *   - 컬럼 헤더 행(`Picture/Move/Effect/Location`): 스킵
 *   - 카테고리 헤더 행(colspan=4): currentType 갱신 또는 unrecognized 시 스킵
 *   - currentType 미설정 상태에서 데이터 행 진입: `unexpected-structure` + 스킵
 *   - nameEn 빈 행: `unexpected-structure` + 스킵
 *   - Zod 실패: `zod-fail` + 스킵
 *   - 엔티티 0: `missing-section` 이슈
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  DittoAbilitySchema,
  type DittoAbilityInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;
/**
 * `DittoAbilityType` 은 Prisma 가 동일 이름으로 export 하므로 Zod 측에서 타입을
 * 재export 하지 않는다 (geography.ts LocationType 과 동일 정책). 본 파일은
 * `DittoAbilityInput['type']` 로 파생해 사용한다.
 */
type DittoAbilityType = DittoAbilityInput['type'];

/** `ditto/<slug>.png` — 디토 무브 이미지 파일 토큰. */
const DITTO_IMG_RE = /ditto\/([a-z0-9-]+)\.png/i;

export class AbilitiesParser extends Parser<DittoAbilityInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'abilities';

  parse(html: string, options: ParseOptions): ParseResult<DittoAbilityInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: DittoAbilityInput[] = [];
    const issues: ParseIssue[] = [];

    const $targetTable = pickFourColumnTable($);
    if ($targetTable === null) {
      issues.push({
        kind: 'missing-section',
        message:
          'no 4-column dextable (Picture/Move/Effect/Location) found — abilities.shtml structure likely changed',
      });
      return { entities, issues };
    }

    let currentType: DittoAbilityType | null = null;

    $targetTable.find('tr').each((_, tr) => {
      const $tr = $(tr);
      const $fooevoTds = $tr.children('td.fooevo');

      if ($fooevoTds.length > 0) {
        const updated = updateCurrentType($fooevoTds);
        if (updated !== null) currentType = updated;
        return;
      }

      processDataRow($tr, currentType, options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no ditto_ability rows extracted — abilities.shtml structure likely changed',
      });
    }

    return { entities, issues };
  }
}

/**
 * 페이지의 모든 `table.dextable` 중 **첫 행이 정확히 4 개의 `td.fooevo` 헤더**를
 * 가진 테이블을 채택한다. 위쪽 "Powering Up Moves" (3-컬럼) 는 자동 배제.
 */
function pickFourColumnTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const headerCount = $table.find('tr').first().children('td.fooevo').length;
    if (headerCount === 4) chosen = $table;
  });
  return chosen;
}

/**
 * 카테고리 헤더 행 (`<td class="fooevo" colspan="4">Primary Moves</td>` 등) 을 해석.
 * 컬럼 헤더 행 (4 개의 fooevo) 은 무시하고 null 반환.
 */
function updateCurrentType($fooevoTds: CheerioSelection): DittoAbilityType | null {
  if ($fooevoTds.length !== 1) return null;
  const text = $fooevoTds.text().trim();
  if (/^primary\s+moves$/i.test(text)) return 'Primary';
  if (/^secondary\s+moves$/i.test(text)) return 'Secondary';
  return null;
}

function processDataRow(
  $tr: CheerioSelection,
  currentType: DittoAbilityType | null,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: DittoAbilityInput[],
  issues: ParseIssue[],
): void {
  const $tds = $tr.children('td');
  if ($tds.length < 4) return;

  const $picTd = $tds.eq(0);
  const nameEn = normalizeText($tds.eq(1).text());
  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'abilities[?]',
      message: 'data row has empty Move cell',
    });
    return;
  }
  if (currentType === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: `abilities[${nameEn}]`,
      message: 'data row encountered before any Primary/Secondary category header',
    });
    return;
  }

  const slug = extractSlug($picTd, nameEn);
  const candidate = {
    slug,
    type: currentType,
    nameEn,
    ...maybeField('effectEn', optionalText($tds.eq(2))),
    ...maybeField('unlockTextEn', optionalText($tds.eq(3))),
    ...maybeField('imageUrl', buildImageUrl($picTd, sourceUrl) ?? undefined),
    ...metadata,
  };

  const result = DittoAbilitySchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `abilities[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/** undefined 값을 spread 시 제외 — Zod optional + exactOptionalPropertyTypes 호환 헬퍼. */
function maybeField<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : { [key]: value };
}

/**
 * Picture 셀의 `<img src="ditto/<slug>.png">` 정규식으로 slug 추출. 셀이 비어있는
 * Secondary 행은 nameEn 의 lowercase + 공백→하이픈 으로 fallback.
 */
function extractSlug($picTd: CheerioSelection, nameEn: string): string {
  const src = $picTd.find('img').first().attr('src') ?? '';
  const match = src.match(DITTO_IMG_RE);
  if (match !== null) {
    const [, captured] = match;
    if (captured !== undefined && captured.length > 0) return captured;
  }
  return slugifyName(nameEn);
}

/** "Stockpile Water" → "stockpile-water". 영숫자/공백 외 문자는 제거. */
function slugifyName(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Picture 셀의 `<img src>` 를 sourceUrl 기준 절대 URL 로 변환.
 * Secondary 행처럼 셀이 비어있으면 null.
 */
function buildImageUrl($picTd: CheerioSelection, sourceUrl: string): string | null {
  const src = $picTd.find('img').first().attr('src');
  if (src === undefined || src.length === 0) return null;
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return null;
  }
}

/** 셀 텍스트 → 빈 문자열은 undefined 로 변환 (Zod optional 호환). */
function optionalText($td: CheerioSelection): string | undefined {
  const value = normalizeText($td.text());
  return value.length > 0 ? value : undefined;
}

/** 연속 공백/개행을 단일 공백으로 평탄화. */
function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
