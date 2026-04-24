/**
 * Serebii `locations.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 3 (루트).
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/locations.shtml
 *
 * 산출 엔티티:
 *   - `location` (본체) — slug/nameEn/type/imageUrl
 *   - `location_i18n(locale='en')` 는 loader 가 `nameEn` 에서 분리 적재
 *
 * 본 파서의 범위 (단계 3a):
 *   루트 페이지의 6 개 상위 지역 목록만. 각 지역 상세 페이지(단계 3b,
 *   `location-detail.ts`) 에서 설명·하위 지역·부가 정보가 추가된다.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   ```
 *   <table class="dextable">
 *     <tr>                                             <!-- 헤더 (fooevo) -->
 *       <td class="fooevo">Picture</td>
 *       <td class="fooevo">Name</td>
 *     </tr>
 *     <tr>                                             <!-- 데이터 행 -->
 *       <td class="cen">
 *         <a href="locations/witheredwastelands.shtml">
 *           <img src="locations/witheredwastelandsth.jpg" />
 *         </a>
 *       </td>
 *       <td class="fooinfo">
 *         <a href="locations/witheredwastelands.shtml"><u>Withered Wastelands</u></a>
 *       </td>
 *     </tr>
 *     ...
 *   </table>
 *   ```
 *
 * 특이사항:
 *   - slug 는 URL 토큰 그대로 (`cloudisland`, `palettetown`). kebab-case 변환 없음.
 *   - 이미지는 `<slug>th.jpg` (thumbnail). 상세 페이지에서 본 이미지가 별도 존재.
 *   - `type` 은 slug 기반 매핑 — `cloudisland` 만 `Cloud Island`, 나머지 `Main`.
 *     `Dream Island` 는 본 페이지에 나오지 않음(별도 `/dreamislands.shtml`).
 *   - descriptionEn / parentSlug 는 루트 페이지에서는 항상 undefined.
 *
 * 에러 처리:
 *   - `<td class="fooevo">` 포함 행은 헤더 — 스킵 (이슈 아님)
 *   - location href 없음: 다른 섹션의 tr — 스킵 (이슈 아님)
 *   - `<u>` 누락: `unexpected-structure` 이슈 + 스킵
 *   - Zod safeParse 실패: `zod-fail` 이슈 + 스킵
 *   - entities.length === 0: `missing-section` 이슈
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  LocationSchema,
  type LocationInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** `LocationInput['type']` 축약 — Prisma `LocationType` 과의 이름 충돌을 회피. */
type ParserLocationType = LocationInput['type'];

/**
 * `locations/<slug>.shtml` 에서 slug 추출. 앞에 `/pokemonpokopia/` 가 붙어도
 * 끝 토큰만 캡처. 다른 섹션 링크는 자동으로 regex 를 통과하지 못해 스킵.
 */
const LOCATION_HREF_RE = /\/?locations\/([a-z0-9]+)\.shtml/i;

/**
 * slug 기반 특수 타입 매핑.
 *
 * 루트 페이지에는 일반 지역(Main) + Cloud Island 까지만 등장한다.
 * Dream Island 는 `/dreamislands.shtml` 별도 파서에서 본 엔티티로 등록
 * (로드맵 Phase 8 Task 8.7).
 */
const SPECIAL_TYPE_BY_SLUG: Readonly<Record<string, ParserLocationType>> = {
  cloudisland: 'Cloud Island',
};

function inferType(slug: string): ParserLocationType {
  return SPECIAL_TYPE_BY_SLUG[slug] ?? 'Main';
}

export class LocationsIndexParser extends Parser<LocationInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'locations-index';

  parse(html: string, options: ParseOptions): ParseResult<LocationInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: LocationInput[] = [];
    const issues: ParseIssue[] = [];

    $('table.dextable tr').each((_, tr) => {
      processRow($, $(tr), options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no location rows matched — locations.shtml structure likely changed',
      });
    }

    return { entities, issues };
  }
}

function processRow(
  $: CheerioAPI,
  $tr: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: LocationInput[],
  issues: ParseIssue[],
): void {
  if ($tr.children('td.fooevo').length > 0) return;

  const $imgTd = $tr.children('td.cen').first();
  const $nameTd = $tr.children('td.fooinfo').first();
  if ($imgTd.length === 0 || $nameTd.length === 0) return;

  const href = $imgTd.find('a').first().attr('href') ?? '';
  const slugMatch = href.match(LOCATION_HREF_RE);
  if (!slugMatch) return;
  const [, captured] = slugMatch;
  if (captured === undefined || captured.length === 0) return;
  const slug = captured;

  const nameEn = $nameTd.find('u').first().text().trim();
  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `location[${slug}]`,
      message: 'name cell is missing the <u> wrapper',
    });
    return;
  }

  const imageUrl = buildImageUrl($imgTd, sourceUrl);
  const type = inferType(slug);

  const candidate = {
    slug,
    nameEn,
    type,
    ...(imageUrl === null ? {} : { imageUrl }),
    ...metadata,
  };

  const result = LocationSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `location[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/**
 * 이미지 셀에서 `<img src>` 를 절대 URL 로 변환.
 * base URL 로 `sourceUrl` 사용 — specialty 파서와 동일 전략.
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
