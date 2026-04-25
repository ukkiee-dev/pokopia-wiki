/**
 * Serebii `/importantrequests.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 23.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/importantrequests.shtml
 *
 * 산출 엔티티:
 *   - `quest` × 5 (fixture 기준) — Yawn Up A Storm / Do the...Team Initiation
 *     Challenge / Brighten Things Up / Time To Party / Rebuild the Huge Building
 *
 * `quest_requirement` 는 본 페이지에 row-level 표가 없고 산문 안에 산재된
 * "25 Concrete, 10 Glass" 형태로만 존재하여 본 파서가 산출하지 않는다 (스키마
 * 정의만; 향후 단계 또는 외부 매핑 보강).
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문은 단일 `<table class="tab">` 안에 `td.fooleft h2` 섹션 + 같은
 *   tr 의 다음 tr 의 `td.foocontent` 안 본문 단락 + `td.picturetd` 이미지로 구성.
 *
 *   ```
 *   <tr><td class="fooleft" colspan="2"><h1>Important Requests</h1></td></tr>
 *   <tr><td class="foocontent">...intro paragraphs...</td><td class="picturetd"><img/></td></tr>
 *   <tr><td class="fooleft" colspan="2"><h2>Yawn Up A Storm</h2></td></tr>
 *   <tr><td class="foocontent">
 *     <p>As you work through restoring the Withered Wastelands ...</p>
 *     <p>...</p>
 *   </td><td class="picturetd"><img/></td></tr>
 *   ...
 *   ```
 *
 * 특이사항:
 *   - **slug 합성**: `quest-<nameSlug>` (예: "quest-yawn-up-a-storm",
 *     "quest-rebuild-the-huge-building").
 *   - **locationSlug 추출**: 본문에서 알려진 location 키워드 (Withered Wastelands /
 *     Bleak Beach / Rocky Ridges / Sparkling Skylands / Palette Town /
 *     Cloud Island) 첫 매치를 채택. 매칭 실패 시 'unknown' 사용 후
 *     unexpected-structure issue 추가 (loader 가 별도 매핑).
 *   - **objectiveEn**: 첫 단락 (요약)
 *   - **walkthroughEn**: 모든 단락 줄바꿈 join (전체 walkthrough, Markdown-friendly).
 *
 * 에러 처리:
 *   - h2 0 개: missing-section
 *   - locationSlug 매칭 실패: unexpected-structure + 'unknown' 으로 fallback
 *   - Zod 실패: zod-fail + skip
 *   - 엔티티 0: missing-section
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  QuestSchema,
  type QuestInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/**
 * 알려진 location 명 → slug 매핑. `[name, slug]` 튜플 배열로 입력 순서대로 매칭
 * (긴 이름 먼저 — "Withered Wastelands" 가 "Wastelands" 보다 우선).
 */
const LOCATION_KEYWORDS: ReadonlyArray<[string, string]> = [
  ['Withered Wastelands', 'witheredwastelands'],
  ['Sparkling Skylands', 'sparklingskylands'],
  ['Rocky Ridges', 'rockyridges'],
  ['Bleak Beach', 'bleakbeach'],
  ['Palette Town', 'palettetown'],
  ['Cloud Island', 'cloudisland'],
  ['Dream Island', 'dreamisland'],
];

const UNKNOWN_LOCATION_SLUG = 'unknown';

export class QuestsParser extends Parser<QuestInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'importantrequests';

  parse(html: string, options: ParseOptions): ParseResult<QuestInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: QuestInput[] = [];
    const issues: ParseIssue[] = [];

    const $h2List = $('td.fooleft h2');
    if ($h2List.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no h2 quest sections found in fooleft headings',
      });
      return { entities, issues };
    }

    $h2List.each((index, h2) => {
      processQuestSection($, $(h2), index + 1, options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no quest rows extracted',
      });
    }

    return { entities, issues };
  }
}

function processQuestSection(
  $: CheerioAPI,
  $h2: CheerioSelection,
  sortOrder: number,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: QuestInput[],
  issues: ParseIssue[],
): void {
  const nameEn = normalizeText($h2.text());
  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `quest[sort${sortOrder}]`,
      message: 'h2 has empty text',
    });
    return;
  }

  const slug = `quest-${slugifyText(nameEn)}`;
  const $headingTr = $h2.closest('tr');
  const $contentTr = $headingTr.next('tr');
  const $contentCell = $contentTr.find('td.foocontent').first();

  const paragraphs = collectParagraphs($, $contentCell);
  const objectiveEn = paragraphs[0];
  const walkthroughEn = paragraphs.length > 0 ? paragraphs.join('\n\n') : undefined;
  const fullText = paragraphs.join(' ');

  const locationMatch = matchLocationSlug(fullText);
  const locationSlug = locationMatch ?? UNKNOWN_LOCATION_SLUG;
  if (locationMatch === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: `quest[${slug}]`,
      message: 'no known location keyword matched in walkthrough text',
    });
  }

  const imageUrl = buildImageUrl($contentTr.find('td.picturetd img').first(), sourceUrl)
    ?? undefined;

  const candidate = {
    slug,
    nameEn,
    locationSlug,
    sortOrder,
    ...(objectiveEn === undefined ? {} : { objectiveEn }),
    ...(walkthroughEn === undefined ? {} : { walkthroughEn }),
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...metadata,
  };

  const result = QuestSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `quest[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

function collectParagraphs($: CheerioAPI, $cell: CheerioSelection): string[] {
  const paragraphs: string[] = [];
  $cell.find('p').each((_, p) => {
    const text = normalizeText($(p).text());
    if (text.length > 0) paragraphs.push(text);
  });
  return paragraphs;
}

/** 알려진 location 명 중 첫 매치를 slug 로 변환. 길이 내림차순으로 매칭. */
function matchLocationSlug(text: string): string | null {
  for (const [name, slug] of LOCATION_KEYWORDS) {
    if (text.includes(name)) return slug;
  }
  return null;
}

function buildImageUrl($img: CheerioSelection, sourceUrl: string): string | null {
  const src = $img.attr('src');
  if (src === undefined || src.length === 0) return null;
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return null;
  }
}

function slugifyText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\.\.\./g, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
