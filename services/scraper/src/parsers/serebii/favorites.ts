/**
 * Serebii `/favorites.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 7.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/favorites.shtml
 *
 * 산출 엔티티:
 *   - `favorite_category` 루트 목록 (slug + nameEn)
 *   - 하위 매핑(`pokemon_favorite`, `item_favorite_tag`)은 각 카테고리의
 *     `/favorites/<slug>.shtml` 상세 페이지에서 추출 — 본 파서 범위 밖.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   ```
 *   <table class="dextable">
 *     <tr>
 *       <td class="fooevo">Favorites</td>
 *       <td class="fooevo">Quantity of Items</td>
 *     </tr>
 *     <tr>
 *       <td class="fooinfo"><a href="/pokemonpokopia/favorites/blockystuff.shtml"><u>Blocky stuff</u></a></td>
 *       <td class="cen">TBD</td>
 *     </tr>
 *     ...
 *     <tr>
 *       <td class="fooinfo"><a href="/pokemonpokopia/favorites/.shtml"><u></u></a></td>  <!-- 빈 slug/name 행 -->
 *       <td class="cen">TBD</td>
 *     </tr>
 *   </table>
 *   ```
 *
 * 특이사항:
 *   - `Quantity of Items` 는 모두 "TBD" — 데이터 미제공. 무시.
 *   - fixture 마지막 행은 **`<a href="/pokemonpokopia/favorites/.shtml"><u></u></a>`** 로
 *     빈 slug/name. regex 매칭이 빈 문자열을 배척하도록 `[a-z0-9]+` 최소 1자 요구해
 *     자동 스킵(이슈 아님). Serebii 사이트의 자리표시자 빈 링크 가능성.
 *
 * 에러 처리:
 *   - 헤더(fooevo): 스킵
 *   - 빈 slug 행: 스킵 (regex 배척)
 *   - Zod 실패: `zod-fail` + 스킵
 *   - 엔티티 0: `missing-section` 이슈
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  FavoriteCategorySchema,
  type FavoriteCategoryInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** `/favorites/<slug>.shtml` — 최소 1 자 slug. 빈 slug 자리표시자 자동 스킵. */
const FAVORITE_HREF_RE = /\/?favorites\/([a-z0-9]+)\.shtml/i;

export class FavoritesParser extends Parser<FavoriteCategoryInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'favorites';

  parse(html: string, options: ParseOptions): ParseResult<FavoriteCategoryInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: FavoriteCategoryInput[] = [];
    const issues: ParseIssue[] = [];

    $('table.dextable tr').each((_, tr) => {
      processRow($, $(tr), metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no favorite category rows matched — favorites.shtml structure likely changed',
      });
    }

    return { entities, issues };
  }
}

function processRow(
  $: CheerioAPI,
  $tr: CheerioSelection,
  metadata: SourceMetadata,
  entities: FavoriteCategoryInput[],
  issues: ParseIssue[],
): void {
  if ($tr.children('td.fooevo').length > 0) return; // 헤더

  const $nameTd = $tr.children('td.fooinfo').first();
  if ($nameTd.length === 0) return;

  const href = $nameTd.find('a').first().attr('href') ?? '';
  const slugMatch = href.match(FAVORITE_HREF_RE);
  if (!slugMatch) return; // 빈 slug 자동 스킵
  const [, capturedSlug] = slugMatch;
  if (capturedSlug === undefined || capturedSlug.length === 0) return;
  const slug = capturedSlug;

  const nameEn = $nameTd.find('u').first().text().trim();
  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `favorite[${slug}]`,
      message: 'name cell is missing the <u> wrapper',
    });
    return;
  }

  const candidate = {
    slug,
    nameEn,
    ...metadata,
  };

  const result = FavoriteCategorySchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `favorite[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}
