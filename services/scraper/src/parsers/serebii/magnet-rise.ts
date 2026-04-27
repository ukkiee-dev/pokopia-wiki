/**
 * Serebii `/magnetrise.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 13.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/magnetrise.shtml
 *
 * 산출 엔티티 (보강 전용):
 *   - `MagnetRiseItemInput` 목록 — slug + nameEn + descriptionEn + imageUrl
 *
 * **본 파서는 새 엔티티를 만들지 않는다.** loader 가 산출된 slug 목록으로
 * `item.sourceSlug` 매칭해 SCHEMA §2.2 의 `is_magnet_rise_only = true` 마킹.
 * nameEn / descriptionEn / imageUrl 은 items.shtml 결손 시 보조 데이터로 활용.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문 후반부에 단일 dextable("List of Items only able to be picked up
 *   via Magnet Rise") 이 위치한다. 헤더는 3-컬럼 Picture / Name / Description.
 *   ```
 *   <table class="dextable">
 *     <tr>
 *       <td class="fooevo">Picture</td>
 *       <td class="fooevo">Name</td>
 *       <td class="fooevo">Description</td>
 *     </tr>
 *     <tr>
 *       <td class="cen">
 *         <a href="items/<slug>.shtml"><img src="items/<slug>.png" .../></a>
 *       </td>
 *       <td class="cen">
 *         <a href="items/<slug>.shtml"><u><Name></u></a>
 *       </td>
 *       <td class="fooinfo"><설명 텍스트></td>
 *     </tr>
 *     ...
 *   </table>
 *   ```
 *
 *   페이지 상단의 `class="tab"` 테이블(개요/Building/Magnet Rise 섹션)은 본 파서
 *   대상이 아니다 — `table.dextable` 만 채택해 자연스럽게 배제된다.
 *
 * 특이사항:
 *   - **slug 추출** — Name 셀 또는 Picture 셀의 `<a href="items/<slug>.shtml">`
 *     정규식. items.ts 와 동일한 natural key 라 loader 가 1:1 매칭 가능.
 *   - **slug 문자 집합** — 소문자 영숫자 + 하이픈 + **괄호** (예:
 *     `nonburnablegarbage(outdoor)`). building 단계와 달리 괄호 허용 필요.
 *   - **nameEn 추출** — Name 셀 `<u>` 안 텍스트. cheerio 가 `&eacute;` 등 자동 디코딩.
 *   - **imageUrl** — Picture 셀 `<img src>` 를 sourceUrl 기준 절대 URL 로 변환.
 *
 * 에러 처리:
 *   - 헤더(td.fooevo): 스킵
 *   - href 매칭 실패: 스킵 (아이템이 아닌 행)
 *   - nameEn 비어있음: `unexpected-structure` + 스킵
 *   - Zod 실패: `zod-fail` + 스킵
 *   - 엔티티 0: `missing-section` 이슈
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  MagnetRiseItemSchema,
  type MagnetRiseItemInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** `items/<slug>.shtml` — 아이템 상세 페이지 링크. slug 에 괄호/하이픈 허용. */
const ITEM_HREF_RE = /items\/([a-z0-9()-]+)\.shtml/i;

export class MagnetRiseParser extends Parser<MagnetRiseItemInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'magnet-rise';

  parse(html: string, options: ParseOptions): ParseResult<MagnetRiseItemInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: MagnetRiseItemInput[] = [];
    const issues: ParseIssue[] = [];

    $('table.dextable tr').each((_, tr) => {
      processRow($, $(tr), options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message:
          'no magnet-rise item rows matched — magnetrise.shtml structure likely changed',
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
  entities: MagnetRiseItemInput[],
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
      at: `magnet-rise[${slug}]`,
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

  const result = MagnetRiseItemSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `magnet-rise[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/**
 * slug 추출 — Name 셀 href 우선, 실패 시 Picture 셀 href 폴백 (building.ts 동일 정책).
 */
function extractSlug($nameTd: CheerioSelection, $picTd: CheerioSelection): string | null {
  const candidates = [
    $nameTd.find('a').first().attr('href') ?? '',
    $picTd.find('a').first().attr('href') ?? '',
  ];
  for (const href of candidates) {
    const match = href.match(ITEM_HREF_RE);
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
 * Picture 셀의 `<img src>` 를 sourceUrl 기준 절대 URL 로 변환 (items.ts/building.ts
 * 동일 전략).
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
