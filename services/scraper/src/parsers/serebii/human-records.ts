/**
 * Serebii `/humanrecords.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 29.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/humanrecords.shtml
 *
 * 산출 엔티티:
 *   - `human_record` × 126 (fixture 기준):
 *     · Newspaper 12 / Diary 16 / Magazine 53 / Note 11 / Letter 12 / Paper 4 / Photo 18
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문 후반부에 단일 `<table class="dextable">` (5 fooevo:
 *   Picture / Name / Description / Locations / Rewards). 카테고리 헤더는
 *   `<td colspan="6" class="fooevo"><h3>Newspaper</h3></td>` 같은 형식 (colspan=6
 *   은 fixture 의 quirk; 컬럼 수보다 큰 값 허용).
 *
 *   ```
 *   <tr><td colspan="6" class="fooevo"><h3>Newspaper</h3></td></tr>
 *   <tr>
 *     <td class="cen"><img src="items/<slug>.png" .../></td>
 *     <td class="fooinfo">Road Closure Announcement</td>
 *     <td class="fooinfo"></td>
 *     <td class="fooinfo">Withered Wasteland</td>
 *     <td class="fooinfo"></td>
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - **카테고리 매핑**: 페이지의 복수형 → SCHEMA ENUM 단수형
 *     (Diary Entries→Diary, Magazines→Magazine, Notes→Note, Letters→Letter,
 *     Papers→Paper, Photos→Photo, Newspaper 그대로).
 *   - **rewardType 분류**: Rewards 셀 키워드 휴리스틱:
 *     - 빈 셀 → 'none'
 *     - "outfit" / "clothing" / "Ditto" 변신 → 'customization'
 *     - "CD" prefix → 'cd'
 *     - 그 외 텍스트 → 'item'
 *   - **빈 src (items/.png)**: imageUrl 미부여 (Newspaper 의 일부 행).
 *   - **slug 합성**: `human-record-<categorySlug>-<nameSlug>` 로 카테고리 + name
 *     조합으로 unique 보장.
 *
 * 에러 처리:
 *   - 5 fooevo 헤더 미발견: missing-section
 *   - 카테고리 헤더 인식 불가: unexpected-structure (currentCategory 유지)
 *   - currentCategory 미설정 상태에서 데이터 행: unexpected-structure + skip
 *   - nameEn 빈 행: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  HumanRecordSchema,
  type HumanRecordInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

type HumanRecordCategory = HumanRecordInput['category'];
type HumanRecordRewardType = HumanRecordInput['rewardType'];

/** items/<slug>.png — 영문/숫자/하이픈/괄호/도트/아포스트로피/느낌표 허용. */
const ITEM_IMG_RE = /items\/([a-z0-9().!'-]+)\.png/i;

/** 페이지 카테고리(복수형) → SCHEMA ENUM 단수형 매핑. */
const CATEGORY_MAP: Record<string, HumanRecordCategory> = {
  Newspaper: 'Newspaper',
  Newspapers: 'Newspaper',
  Diary: 'Diary',
  'Diary Entries': 'Diary',
  Magazine: 'Magazine',
  Magazines: 'Magazine',
  Note: 'Note',
  Notes: 'Note',
  Letter: 'Letter',
  Letters: 'Letter',
  Paper: 'Paper',
  Papers: 'Paper',
  Photo: 'Photo',
  Photos: 'Photo',
};

/** 알려진 location 명 → slug. quests.ts 와 동일 + 단수형 변형 ("Wasteland"). */
const LOCATION_KEYWORDS: ReadonlyArray<[string, string]> = [
  ['Withered Wastelands', 'witheredwastelands'],
  ['Withered Wasteland', 'witheredwastelands'], // 단수형 변형 (fixture 의 표기)
  ['Sparkling Skylands', 'sparklingskylands'],
  ['Sparkling Skyland', 'sparklingskylands'],
  ['Rocky Ridges', 'rockyridges'],
  ['Rocky Ridge', 'rockyridges'],
  ['Bleak Beach', 'bleakbeach'],
  ['Palette Town', 'palettetown'],
  ['Cloud Island', 'cloudisland'],
  ['Dream Islands', 'dreamisland'],
  ['Dream Island', 'dreamisland'],
];

export class HumanRecordsParser extends Parser<HumanRecordInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'humanrecords';

  parse(html: string, options: ParseOptions): ParseResult<HumanRecordInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: HumanRecordInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickRecordTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message:
          'no human-records dextable (5 fooevo Picture/Name/Description/Locations/Rewards) found',
      });
      return { entities, issues };
    }

    let currentCategory: HumanRecordCategory | null = null;
    let categorySeq = 0;

    $table.find('tr').each((_, tr) => {
      const $row = $(tr);
      const $fooevoTds = $row.children('td.fooevo');

      if ($fooevoTds.length > 0) {
        const updated = updateCategoryContext($fooevoTds);
        if (updated !== null) {
          currentCategory = updated;
          categorySeq = 0; // 카테고리 변경 시 seq 리셋
        }
        return;
      }

      categorySeq += 1;
      processDataRow(
        $row,
        currentCategory,
        categorySeq,
        options.sourceUrl,
        metadata,
        entities,
        issues,
      );
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no human_record rows extracted',
      });
    }

    return { entities, issues };
  }
}

/** 5 fooevo 헤더 + 두 번째 셀 "Name" + 다섯 번째 "Rewards" 인 dextable 채택. */
function pickRecordTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 5) return;
    const second = normalizeText($headerCells.eq(1).text());
    const fifth = normalizeText($headerCells.eq(4).text());
    if (second === 'Name' && fifth === 'Rewards') chosen = $table;
  });
  return chosen;
}

/**
 * 카테고리 헤더 행 (`<td colspan="6" class="fooevo"><h3>...</h3>`) 해석. 단일
 * fooevo 셀일 때만 카테고리 헤더로 간주 (5 셀 컬럼 헤더는 무시).
 */
function updateCategoryContext($fooevoTds: CheerioSelection): HumanRecordCategory | null {
  if ($fooevoTds.length !== 1) return null;
  const text = normalizeText($fooevoTds.find('h3').first().text() || $fooevoTds.text());
  return CATEGORY_MAP[text] ?? null;
}

function processDataRow(
  $row: CheerioSelection,
  currentCategory: HumanRecordCategory | null,
  categorySeq: number,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: HumanRecordInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 5) return;

  if (currentCategory === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'human-record[?]',
      message: 'data row encountered before any category header',
    });
    return;
  }

  const $picTd = $tds.eq(0);
  const nameEn = normalizeText($tds.eq(1).text());
  const descriptionEn = normalizeText($tds.eq(2).text());
  const rawLocationEn = normalizeText($tds.eq(3).text());
  const rawRewardEn = normalizeText($tds.eq(4).text());

  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `human-record[${currentCategory}/?]`,
      message: 'name cell empty',
    });
    return;
  }

  // slug 에 카테고리 내 sequence 포함 — 동일 (category, nameEn) 조합이 다른 위치
  // 에서 중복 등장하는 케이스 (Magazines 등에 흔함) 의 unique 보장.
  const slug = `human-record-${slugifyText(currentCategory)}-${categorySeq.toString().padStart(3, '0')}-${slugifyText(nameEn)}`;
  const locationSlug = matchLocationSlug(rawLocationEn) ?? undefined;
  const rewardType = classifyRewardType(rawRewardEn);
  const imageUrl = buildImageUrl($picTd, sourceUrl) ?? undefined;

  const candidate = {
    slug,
    category: currentCategory,
    nameEn,
    ...(descriptionEn.length > 0 ? { descriptionEn } : {}),
    ...(locationSlug === undefined ? {} : { locationSlug }),
    ...(rawLocationEn.length > 0 ? { rawLocationEn } : {}),
    rewardType,
    ...(rawRewardEn.length > 0 ? { rawRewardEn } : {}),
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...metadata,
  };

  const result = HumanRecordSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `human-record[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

function matchLocationSlug(text: string): string | null {
  for (const [name, slug] of LOCATION_KEYWORDS) {
    if (text.includes(name)) return slug;
  }
  return null;
}

/**
 * Rewards 셀 텍스트 → SCHEMA reward_type ENUM 분류.
 * 빈 셀은 'none', 키워드 휴리스틱으로 customization/cd, 그 외 raw 텍스트는 'item'.
 */
function classifyRewardType(rewardText: string): HumanRecordRewardType {
  if (rewardText.length === 0) return 'none';
  if (/\boutfit\b|\bclothing\b|\bDitto\b/i.test(rewardText)) return 'customization';
  if (/^CD\b|Music\s*CD/i.test(rewardText)) return 'cd';
  return 'item';
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

function slugifyText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
