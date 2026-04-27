/**
 * Serebii `/jumprope.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 21.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/jumprope.shtml
 *
 * 산출 엔티티:
 *   - `jumprope_tier` × 11 — 두 dextable 합산
 *     · "List of rewards" 표 (3 행, Method = "0-49"/"50-99"/"100+")
 *     · "List of Jump Rope contest rewards" 표 (8 행, Score = "5+"~"100+")
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   두 dextable 모두 4 fooevo 헤더:
 *     - 첫 표: Picture | Item | Quantity | **Method**
 *     - 둘째 표: Picture | Item | Quantity | **Score**
 *   4 번째 셀 라벨로 표 구분.
 *
 *   각 데이터 행:
 *   ```
 *   <tr>
 *     <td class="cen"><img src="items/<slug>.png" .../></td>
 *     <td class="cen">Copper Ore</td>
 *     <td class="cen">3</td>
 *     <td class="cen">0-49</td>
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - **requiredJumps 추출**: "0-49" → 0 (lower bound), "50+" → 50, "100+" → 100.
 *     정규식 `/^(\d+)(?:[-+].*)?$/` 의 첫 정수 캡처.
 *   - **tier 합산**: 두 표 행을 순서대로 1~11 부여. standard 1~3, contest 4~11.
 *   - **slug 합성**: `jumprope-tier<n>-<itemSlug>` (예: "jumprope-tier1-copperore").
 *   - **rewardType**: 본 페이지는 모두 'item' (coin reward 없음).
 *   - **itemSlug**: items/<slug>.png 토큰 (괄호 허용 — magnet-rise 동일).
 *
 * 에러 처리:
 *   - 4 fooevo 헤더 dextable 미발견: missing-section
 *   - itemSlug / quantity 파싱 실패: unexpected-structure + skip
 *   - requiredJumps 추출 실패: 0 으로 회복 (Schema validation 통과)
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  JumpropeTierSchema,
  type JumpropeTierInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** "items/<slug>.png" — 괄호/하이픈 허용 (magnet-rise 동일 정책). */
const ITEM_IMG_RE = /items\/([a-z0-9()-]+)\.png/i;

/** "0-49" / "50+" / "100+" — 첫 정수만 캡처 (lower bound 또는 minimum). */
const JUMPS_RE = /^(\d+)/;

export class JumpropeParser extends Parser<JumpropeTierInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'jumprope';

  parse(html: string, options: ParseOptions): ParseResult<JumpropeTierInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: JumpropeTierInput[] = [];
    const issues: ParseIssue[] = [];

    const $tables = pickRewardTables($);
    if ($tables.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no jumprope dextable (4 fooevo, 4th cell Method/Score) found',
      });
      return { entities, issues };
    }

    let tier = 0;
    for (const $table of $tables) {
      $table.find('tr').each((_, tr) => {
        const $row = $(tr);
        if ($row.children('td.fooevo').length > 0) return;
        tier += 1;
        processRow($, $row, tier, options.sourceUrl, metadata, entities, issues);
      });
    }

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no jumprope_tier rows extracted',
      });
    }

    return { entities, issues };
  }
}

/** 4 fooevo 헤더 + 4 번째 셀 "Method" 또는 "Score" 인 dextable 채택 (두 표 모두). */
function pickRewardTables($: CheerioAPI): CheerioSelection[] {
  const tables: CheerioSelection[] = [];
  $('table.dextable').each((_, table) => {
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 4) return;
    const fourth = normalizeText($headerCells.eq(3).text());
    if (fourth === 'Method' || fourth === 'Score') tables.push($table);
  });
  return tables;
}

function processRow(
  $: CheerioAPI,
  $row: CheerioSelection,
  tier: number,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: JumpropeTierInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 4) return;

  const $picTd = $tds.eq(0);
  const itemNameEn = normalizeText($tds.eq(1).text());
  const quantityText = normalizeText($tds.eq(2).text());
  const methodEn = normalizeText($tds.eq(3).text());
  const itemSlug = extractItemSlug($picTd);

  if (itemSlug === null || itemNameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `jumprope-tier[tier${tier}]`,
      message: 'data row missing itemSlug or itemNameEn',
    });
    return;
  }

  const quantity = Number.parseInt(quantityText, 10);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `jumprope-tier[tier${tier}-${itemSlug}]`,
      message: `quantity cell not a positive integer: "${quantityText}"`,
    });
    return;
  }

  const requiredJumps = extractRequiredJumps(methodEn);
  const slug = `jumprope-tier${tier}-${itemSlug}`;
  const imageUrl = buildImageUrl($picTd, sourceUrl) ?? undefined;

  const candidate = {
    slug,
    tier,
    requiredJumps,
    rewardType: 'item' as const,
    itemSlug,
    itemNameEn,
    quantity,
    methodEn,
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...metadata,
  };

  const result = JumpropeTierSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `jumprope-tier[${slug}]`,
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

function extractRequiredJumps(methodEn: string): number {
  const match = methodEn.match(JUMPS_RE);
  if (match === null) return 0;
  const value = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
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
