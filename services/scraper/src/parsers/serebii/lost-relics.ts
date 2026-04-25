/**
 * Serebii `/lostrelics.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 28.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/lostrelics.shtml
 *
 * 산출 엔티티:
 *   - `lost_relic` (fixture 기준): Large + Small 합산
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문 후반부에 단일 `<table class="dextable">` (3 fooevo:
 *   Picture / Name / Description) 안에 `<a name="large|small">` 카테고리 헤더로
 *   분할.
 *   ```
 *   <tr>
 *     <td class="fooevo" colspan="3"><h3><a name="large"></a>Lost Relic (L)</h3></td>
 *   </tr>
 *   <tr>
 *     <td class="cen"><img src="items/<slug>.png" .../></td>
 *     <td class="cen">Polygonal Shelf</td>
 *     <td class="fooinfo">A stylish, eye-catching shelf...</td>
 *   </tr>
 *   ...
 *   <tr>
 *     <td class="fooevo" colspan="3"><h3><a name="small"></a>Lost Relic (S)</h3></td>
 *   </tr>
 *   ...
 *   ```
 *
 * 특이사항:
 *   - **카테고리 헤더 누적**: abilities.ts / environment.ts 동일 패턴 — `<a name>`
 *     의 토큰 ("large" / "small") 으로 currentSizeClass 갱신.
 *   - **slug 합성**: `lost-relic-<itemSlug>` (네임스페이스 분리).
 *   - **isAppraisedForm**: 본 페이지는 감정 전 형태 목록이므로 false 기본값.
 *     loader 가 외부 매핑으로 감정 후 형태 쌍 식별 시 true 마킹.
 *   - **itemSlug 정규식**: cds.ts 와 동일하게 영문/숫자/하이픈/괄호/도트/아포스트로피
 *     /느낌표 허용 (예: "boo-in-the-box", "never-meltice", "pitcher-plantpot",
 *     "team rocket wall hanging").
 *
 * 에러 처리:
 *   - 3 fooevo 헤더(Picture/Name/Description) 미발견: missing-section
 *   - 카테고리 헤더 인식 불가 (large/small 외): unexpected-structure
 *   - currentSizeClass 미설정 상태에서 데이터 행: unexpected-structure + skip
 *   - itemSlug 추출 실패: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  LostRelicSchema,
  type LostRelicInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

type LostRelicSize = LostRelicInput['sizeClass'];

/** items/<slug>.png — 영문/숫자/하이픈/괄호/도트/아포스트로피/느낌표 허용 (cds.ts 동일). */
const ITEM_IMG_RE = /items\/([a-z0-9().!'-]+)\.png/i;

/** `<a name="large|small">` → sizeClass. */
const ANCHOR_TO_SIZE: Record<string, LostRelicSize> = {
  large: 'L',
  small: 'S',
};

export class LostRelicsParser extends Parser<LostRelicInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'lostrelics';

  parse(html: string, options: ParseOptions): ParseResult<LostRelicInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: LostRelicInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickRelicTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no lost-relic dextable (3 fooevo Picture/Name/Description) found',
      });
      return { entities, issues };
    }

    let currentSize: LostRelicSize | null = null;

    $table.find('tr').each((_, tr) => {
      const $row = $(tr);
      const $fooevoTds = $row.children('td.fooevo');

      if ($fooevoTds.length > 0) {
        const updated = updateSizeContext($fooevoTds);
        if (updated !== null) currentSize = updated;
        return;
      }

      processDataRow($row, currentSize, options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no lost-relic rows extracted',
      });
    }

    return { entities, issues };
  }
}

function pickRelicTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 3) return;
    const second = normalizeText($headerCells.eq(1).text());
    const third = normalizeText($headerCells.eq(2).text());
    if (second === 'Name' && third === 'Description') chosen = $table;
  });
  return chosen;
}

/**
 * 카테고리 헤더 행 (`<td class="fooevo" colspan="3"><a name="large|small">`) 에서
 * sizeClass 결정. 컬럼 헤더 행(3 fooevo)은 무시하고 null 반환.
 */
function updateSizeContext($fooevoTds: CheerioSelection): LostRelicSize | null {
  if ($fooevoTds.length !== 1) return null;
  const anchorName = $fooevoTds.find('a[name]').first().attr('name')?.toLowerCase() ?? '';
  return ANCHOR_TO_SIZE[anchorName] ?? null;
}

function processDataRow(
  $row: CheerioSelection,
  currentSize: LostRelicSize | null,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: LostRelicInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 3) return;

  if (currentSize === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'lost-relic[?]',
      message: 'data row encountered before any size category header (large/small)',
    });
    return;
  }

  const $picTd = $tds.eq(0);
  const nameEn = normalizeText($tds.eq(1).text());
  const descriptionEn = normalizeText($tds.eq(2).text());
  const itemSlug = extractItemSlug($picTd);

  if (itemSlug === null || nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'lost-relic[?]',
      message: 'data row missing itemSlug or nameEn',
    });
    return;
  }

  const slug = `lost-relic-${itemSlug}`;
  const imageUrl = buildImageUrl($picTd, sourceUrl) ?? undefined;

  const candidate = {
    slug,
    itemSlug,
    nameEn,
    ...(descriptionEn.length > 0 ? { descriptionEn } : {}),
    sizeClass: currentSize,
    isAppraisedForm: false,
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...metadata,
  };

  const result = LostRelicSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `lost-relic[${slug}]`,
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
