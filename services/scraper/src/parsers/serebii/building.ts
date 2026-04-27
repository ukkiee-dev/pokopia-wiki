/**
 * Serebii `/building.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 11.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/building.shtml
 *
 * 산출 엔티티:
 *   - `building_kit` (목록) — slug + nameEn + descriptionEn + imageUrl
 *   - `building_kit_material` 매핑 및 SCHEMA §2.6 의 추가 컬럼(category /
 *     pokemon_capacity / building_points / width / depth) 은 각 키트의
 *     `/build/<slug>.shtml` 상세 페이지에서 수집 — 본 파서 범위 밖.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   ```
 *   <table class="dextable">
 *     <tr>
 *       <td class="fooevo">Picture</td>
 *       <td class="fooevo">Name</td>
 *       <td class="fooevo">Description</td>
 *     </tr>
 *     <tr>
 *       <td class="cen">
 *         <a href="build/<slug>.shtml">
 *           <img src="items/<slug>.png" alt="<Name>"/>
 *         </a>
 *       </td>
 *       <td class="cen">
 *         <a href="build/<slug>.shtml"><u><Name></u></a>
 *       </td>
 *       <td class="fooinfo"><설명 텍스트></td>
 *     </tr>
 *     ...
 *   </table>
 *   ```
 *
 * 특이사항:
 *   - **단일 dextable** — 카테고리 헤더 없이 47 행 평면 나열.
 *   - **nameEn 추출** — Name 셀의 `<u>` 안 텍스트. `Pok&eacute;` 같은 HTML 엔티티는
 *     cheerio 가 자동 디코딩해 `é` 로 보존.
 *   - **slug 추출** — `<a href="build/<slug>.shtml">` 의 href 정규식. URL 토큰을
 *     natural key 로 사용하는 favorites/specialty 와 동일 정책.
 *   - **descriptionEn** — `<td class="fooinfo">` (3 번째 셀). 빈 셀이 있어도
 *     missing-section 이슈로 승격하지 않음 (optional).
 *   - **imageUrl** — img src 가 `items/<slug>.png` 상대 경로. items.ts 동일 전략으로
 *     sourceUrl 기준 절대 URL 화.
 *
 * 에러 처리:
 *   - 헤더(td.fooevo): 스킵
 *   - href 매칭 실패: 스킵 (키트가 아닌 행)
 *   - nameEn 비어있음: `unexpected-structure` + 스킵
 *   - Zod 실패: `zod-fail` + 스킵
 *   - 엔티티 0: `missing-section` 이슈
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  BuildingKitSchema,
  type BuildingKitInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** `build/<slug>.shtml` — 키트 상세 페이지 링크. */
const BUILD_HREF_RE = /build\/([a-z0-9-]+)\.shtml/i;

export class BuildingParser extends Parser<BuildingKitInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'building';

  parse(html: string, options: ParseOptions): ParseResult<BuildingKitInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: BuildingKitInput[] = [];
    const issues: ParseIssue[] = [];

    $('table.dextable tr').each((_, tr) => {
      processRow($, $(tr), options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no building kit rows matched — building.shtml structure likely changed',
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
  entities: BuildingKitInput[],
  issues: ParseIssue[],
): void {
  if ($tr.children('td.fooevo').length > 0) return;

  const $tds = $tr.children('td');
  if ($tds.length < 3) return;

  const $picTd = $tds.eq(0);
  const $nameTd = $tds.eq(1);
  const $descTd = $tds.eq(2);

  const slug = extractSlug($nameTd, $picTd);
  if (slug === null) return;

  const nameEn = extractNameEn($nameTd);
  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `building[${slug}]`,
      message: 'name cell missing readable text',
    });
    return;
  }

  const descriptionRaw = $descTd.text().replace(/\s+/g, ' ').trim();
  const descriptionEn = descriptionRaw.length > 0 ? descriptionRaw : undefined;
  const imageUrl = buildImageUrl($picTd, sourceUrl) ?? undefined;

  const candidate = {
    slug,
    nameEn,
    ...(descriptionEn === undefined ? {} : { descriptionEn }),
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...metadata,
  };

  const result = BuildingKitSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `building[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/**
 * slug 추출 — Name 셀 href 우선, 실패 시 Picture 셀 href 폴백.
 * 둘 다 실패하면 키트가 아닌 비정상 행으로 간주(null 반환).
 */
function extractSlug($nameTd: CheerioSelection, $picTd: CheerioSelection): string | null {
  const candidates = [
    $nameTd.find('a').first().attr('href') ?? '',
    $picTd.find('a').first().attr('href') ?? '',
  ];
  for (const href of candidates) {
    const match = href.match(BUILD_HREF_RE);
    if (!match) continue;
    const [, captured] = match;
    if (captured !== undefined && captured.length > 0) return captured;
  }
  return null;
}

/**
 * Name 셀에서 `<u>` 내부 텍스트 추출. `<u>` 가 없으면 셀 전체 텍스트 fallback.
 * cheerio 가 `&eacute;` 등 HTML 엔티티를 자동 디코딩한다.
 */
function extractNameEn($nameTd: CheerioSelection): string {
  const $u = $nameTd.find('u').first();
  const raw = $u.length > 0 ? $u.text() : $nameTd.text();
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Picture 셀의 `<img src>` 를 sourceUrl 기준 절대 URL 로 변환 (items.ts 동일 전략).
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
