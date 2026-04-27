/**
 * Serebii `/habitats.shtml` 루트 페이지 파서 — DATA_COLLECTION_PLAN Phase 1 단계 5a.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/habitats.shtml
 *
 * 산출 엔티티:
 *   - `habitat` (본체) — slug/habitatNo/nameEn/descriptionEn/imageUrl
 *   - `habitat_i18n(locale='en')` 분리 적재는 loader 책임
 *
 * 본 파서의 범위 (단계 5a):
 *   - 209 개 habitat 메타만. 포켓몬 서식 매핑(habitat_pokemon)은 각 `/habitatdex/<slug>.shtml`
 *     상세 페이지에 있으며 단계 5b 의 별도 파서가 담당.
 *   - 이벤트 habitat(`isEvent=true`)는 본 페이지에 없음 — Phase 6 `/eventpokedex.shtml` 등에서 수집.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   ```
 *   <table class="dextable">
 *     <tr>                                             <!-- 헤더 (fooevo) -->
 *       <td class="fooevo">No.</td>
 *       <td class="fooevo">Picture</td>
 *       <td class="fooevo">Name</td>
 *       <td class="fooevo">Description</td>
 *     </tr>
 *     <tr>                                             <!-- 데이터 행 -->
 *       <td class="cen">#001</td>
 *       <td class="cen">
 *         <a href="habitatdex/tallgrass.shtml">
 *           <img src="habitatdex/1.png" alt="Tall Grass" />
 *         </a>
 *       </td>
 *       <td class="fooinfo"><a ...><u>Tall Grass</u></a></td>
 *       <td class="fooinfo">Four tufts of tall grass ...</td>
 *     </tr>
 *     ...
 *   </table>
 *   ```
 *
 * 특이사항:
 *   - slug 는 URL 토큰 그대로 — **하이픈 포함 가능**(`tree-shadedtallgrass`,
 *     `boulder-shadedtallgrass` 등). 다른 파서들의 `[a-z0-9]+` 와 달리 여기선
 *     `[a-z0-9-]+` 허용.
 *   - 이미지 파일명은 habitatNo 기반 (`habitatdex/1.png`, `.../2.png` ...).
 *   - pokemonSlugs 는 루트에서 빈 배열 — 단계 5b 의 상세 페이지 파서가 채움.
 *
 * 에러 처리:
 *   - 헤더 행(fooevo): 스킵 (이슈 아님)
 *   - habitatdex href 없음: 다른 섹션 tr — 스킵 (이슈 아님)
 *   - `<u>` 누락: `unexpected-structure` 이슈 + 스킵
 *   - Zod 실패: `zod-fail` 이슈 + 스킵
 *   - 엔티티 0: `missing-section` 이슈
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  HabitatSchema,
  type HabitatInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** `habitatdex/<slug>.shtml` — 하이픈 포함 slug 허용. */
const HABITAT_HREF_RE = /\/?habitatdex\/([a-z0-9-]+)\.shtml/i;

/** `#NNN` 에서 habitatNo 추출. */
const HABITAT_NO_RE = /^#(\d{1,4})$/;

/**
 * 이벤트 habitat 식별 — 이미지 파일명 `e<N>.png` (예: `habitatdex/e1.png`).
 *
 * habitats.shtml 은 일반 209 habitat + 이벤트 habitat 를 같은 table 에 섞어
 * 나열한다(섹션 헤더 없음). 이미지 파일명 prefix 만 다름. 이벤트 행에서는
 * `#NNN` 컬럼이 이벤트 내 순번(#001~)을 표시하므로 일반 habitatNo 1~209 와
 * 충돌 — 이벤트는 `habitatNo: null` + `isEvent: true` 로 강제한다
 * (SCHEMA §2.5 "이벤트 서식지는 habitat_no null").
 */
const EVENT_IMAGE_RE = /\/habitatdex\/e\d+\.png/i;

export class HabitatsIndexParser extends Parser<HabitatInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'habitats-index';

  parse(html: string, options: ParseOptions): ParseResult<HabitatInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: HabitatInput[] = [];
    const issues: ParseIssue[] = [];

    $('table.dextable tr').each((_, tr) => {
      processRow($, $(tr), options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no habitat rows matched — habitats.shtml structure likely changed',
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
  entities: HabitatInput[],
  issues: ParseIssue[],
): void {
  if ($tr.children('td.fooevo').length > 0) return; // 헤더

  const $tds = $tr.children('td');
  if ($tds.length < 4) return;

  const $noTd = $tds.eq(0);
  const $picTd = $tds.eq(1);
  const $nameTd = $tds.eq(2);
  const $descTd = $tds.eq(3);

  const href = $picTd.find('a').first().attr('href') ?? '';
  const slugMatch = href.match(HABITAT_HREF_RE);
  if (!slugMatch) return;
  const [, capturedSlug] = slugMatch;
  if (capturedSlug === undefined || capturedSlug.length === 0) return;
  const slug = capturedSlug;

  const nameEn = $nameTd.find('u').first().text().trim();
  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `habitat[${slug}]`,
      message: 'name cell is missing the <u> wrapper',
    });
    return;
  }

  const descText = $descTd.text().trim();
  const descriptionEn = descText.length > 0 ? descText : undefined;
  const imageUrl = buildImageUrl($picTd, sourceUrl);
  const isEvent = imageUrl !== null && EVENT_IMAGE_RE.test(imageUrl);

  // 일반 habitat 만 #NNN 컬럼을 habitatNo 로 사용. 이벤트는 null 강제.
  let habitatNo: number | null = null;
  if (!isEvent) {
    const noText = $noTd.text().trim();
    const noMatch = noText.match(HABITAT_NO_RE);
    habitatNo = noMatch?.[1] === undefined ? null : Number.parseInt(noMatch[1], 10);
  }

  const candidate = {
    slug,
    habitatNo,
    nameEn,
    ...(descriptionEn === undefined ? {} : { descriptionEn }),
    isEvent,
    pokemonSlugs: [], // 상세 파서(단계 5b) 가 채움
    ...(imageUrl === null ? {} : { imageUrl }),
    ...metadata,
  };

  const result = HabitatSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `habitat[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

function buildImageUrl($td: CheerioSelection, sourceUrl: string): string | null {
  const src = $td.find('img').first().attr('src');
  if (src === undefined || src.length === 0) return null;
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return null;
  }
}
