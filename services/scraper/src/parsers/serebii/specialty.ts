/**
 * Serebii `specialty.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 2.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/specialty.shtml
 *
 * 산출 엔티티:
 *   - `specialty` (본체) — slug, nameEn, imageUrl, descriptionEn
 *   - `specialty_i18n(locale='en')` 분리 적재는 loader 의 책임 (파서는 `nameEn`,
 *     `descriptionEn` 을 하나의 객체로 동반 출력)
 *
 * HTML 파서 선택 — cheerio:
 *   available-pokemon 과 동일한 이유. Serebii 는 HTML4 스타일로 엄격한 파서가
 *   꼬이는 구조가 종종 있으므로 cheerio(htmlparser2) 가 안전.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   ```
 *   <table class="dextable">
 *     <tr>                                                <!-- 헤더 (fooevo) -->
 *       <td class="fooevo">Picture</td>
 *       <td class="fooevo">Name</td>
 *       <td class="fooevo">Description</td>
 *     </tr>
 *     <tr>                                                <!-- 데이터 행 -->
 *       <td class="cen"><a href="pokedex/specialty/appraise.shtml">
 *         <img src="pokedex/specialty/appraise.png" alt="Appraise"/>
 *       </a></td>
 *       <td class="fooinfo"><a ...><u>Appraise</u></a></td>
 *       <td class="fooinfo">You can show lost relics ...</td>
 *     </tr>
 *     ...
 *   </table>
 *   ```
 *
 * 특이사항:
 *   - slug 는 URL 토큰 그대로 보존한다 (`gatherhoney`, `dreamisland`).
 *     하이픈/kebab-case 변환 없음 — loader 의 `source_slug` 에 1:1 매칭.
 *   - Serebii 원본에 `alt="Party "` 와 `<u>Party </u>` 처럼 trailing space 가
 *     붙는 경우가 있어 `.text().trim()` 을 강제.
 *   - descriptionEn 은 `&eacute;` → `é` 등 HTML entity 를 cheerio 가 디코드한
 *     결과를 그대로 보존. 추가 정규화 없음.
 *
 * 에러 처리:
 *   - `<td class="fooevo">` 포함 행은 헤더 — 스킵 (not an issue)
 *   - 데이터 행 형태이지만 specialty href 없음: 다른 섹션 tr — 스킵 (not an issue)
 *   - `<u>` 누락: `unexpected-structure` 이슈 + 스킵
 *   - Zod safeParse 실패: `zod-fail` 이슈 + 스킵
 *   - entities.length === 0: `missing-section` 이슈 (페이지 레이아웃 변경 신호)
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  SpecialtySchema,
  type SpecialtyInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/**
 * `pokedex/specialty/<slug>.shtml` 에서 slug 추출.
 *
 * slug 는 소문자 영문 + 숫자 조합 (`appraise`, `gatherhoney`, `dj`).
 * 다른 섹션 링크(예: `pokedex/pokemon/...`) 는 이 정규식을 통과하지 못해 자동 스킵.
 */
const SPECIALTY_HREF_RE = /\/specialty\/([a-z0-9]+)\.shtml/i;

export class SpecialtyParser extends Parser<SpecialtyInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'specialty';

  parse(html: string, options: ParseOptions): ParseResult<SpecialtyInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: SpecialtyInput[] = [];
    const issues: ParseIssue[] = [];

    $('table.dextable tr').each((_, tr) => {
      processRow($, $(tr), options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      // 레이아웃 변경 신호 — loader/QA 가 임계 판정.
      issues.push({
        kind: 'missing-section',
        message: 'no specialty rows matched — specialty.shtml structure likely changed',
      });
    }

    return { entities, issues };
  }
}

/** 한 `<tr>` 행 처리 — entities/issues 를 직접 변이. 호출자는 순회만 담당. */
function processRow(
  $: CheerioAPI,
  $tr: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: SpecialtyInput[],
  issues: ParseIssue[],
): void {
  // 헤더 행(fooevo) 스킵 — 이슈 아님.
  if ($tr.children('td.fooevo').length > 0) return;

  const $imgTd = $tr.children('td.cen').first();
  const $nameTd = $tr.children('td.fooinfo').eq(0);
  const $descTd = $tr.children('td.fooinfo').eq(1);
  if ($imgTd.length === 0 || $nameTd.length === 0) return;

  const href = $imgTd.find('a').first().attr('href') ?? '';
  const slugMatch = href.match(SPECIALTY_HREF_RE);
  if (!slugMatch) return;
  const [, captured] = slugMatch;
  if (captured === undefined || captured.length === 0) return;
  const slug = captured;

  const nameEn = $nameTd.find('u').first().text().trim();
  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `specialty[${slug}]`,
      message: 'name cell is missing the <u> wrapper',
    });
    return;
  }

  const descText = $descTd.length > 0 ? $descTd.text().trim() : '';
  const descriptionEn = descText.length > 0 ? descText : undefined;
  const imageUrl = buildImageUrl($imgTd, sourceUrl);

  const candidate = {
    slug,
    nameEn,
    ...(descriptionEn === undefined ? {} : { descriptionEn }),
    ...(imageUrl === null ? {} : { imageUrl }),
    ...metadata,
  };

  const result = SpecialtySchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `specialty[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/**
 * 이미지 셀에서 `<img src>` 를 절대 URL 로 변환.
 *
 * specialty.html 의 `src` 는 `pokedex/specialty/appraise.png` 형태 상대경로라
 * base URL 로 `sourceUrl` 자체를 사용해야 `/pokemonpokopia/` 디렉토리가 함께
 * 유지된다 (available-pokemon 파서는 `/pokemonpokopia/...` 절대경로라 루트
 * 기준으로도 통했지만, Serebii 전체 페이지가 상대경로인 경우가 더 일반적).
 *
 * src 가 없거나 URL 구성이 실패하면 null — imageUrl 은 optional.
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
