/**
 * Serebii `/teaminitiationchallenge.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 24.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/teaminitiationchallenge.shtml
 *
 * 산출 엔티티:
 *   - `team_challenge` × 9 + nested `requirements`
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문 후반부에 단일 `<table class="dextable">` (4 fooevo:
 *   Challenge Number / Item Requirements / Notes / Reward).
 *
 *   ```
 *   <tr>
 *     <td class="fooinfo">1</td>
 *     <td class="fooinfo">5 Leppa Berry</td>
 *     <td class="fooinfo"></td>
 *     <td class="fooinfo">Bouldery Badge</td>
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - **수량 있는 라인**: `<qty> <itemName>` 정규식 (예: "5 Leppa Berry").
 *   - **수량 없는 라인**: Stage 7-8 처럼 "Washing Machine" / "Cherished Photo"
 *     단독 → quantity 1 default.
 *   - **Stage 9 빈 Reward**: badgeName 빈 셀 → undefined, loader 에서 placeholder.
 *   - **Notes 셀**: `<br />` 분리 라인을 줄바꿈으로 join (Markdown-friendly).
 *
 * 에러 처리:
 *   - 4 fooevo 헤더 (Challenge Number/Item Requirements/Notes/Reward) 미발견:
 *     missing-section
 *   - stage 정수 파싱 실패: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  TeamChallengeSchema,
  type SourceMetadata,
  type TeamChallengeInput,
  type TeamChallengeRequirementHint,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** "<qty> <itemName>" 정규식 (예: "5 Leppa Berry"). */
const REQUIREMENT_WITH_QTY_RE = /^(\d+)\s+(.+)$/;

export class TeamChallengeParser extends Parser<TeamChallengeInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'teaminitiationchallenge';

  parse(html: string, options: ParseOptions): ParseResult<TeamChallengeInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: TeamChallengeInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickChallengeTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message:
          'no team-challenge dextable (4 fooevo Challenge Number/Item Requirements/Notes/Reward) found',
      });
      return { entities, issues };
    }

    $table.find('tr').each((_, tr) => {
      const $row = $(tr);
      if ($row.children('td.fooevo').length > 0) return;
      processRow($row, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no team_challenge rows extracted',
      });
    }

    return { entities, issues };
  }
}

/** 4 fooevo 헤더 + 두 번째 셀 "Item Requirements" 인 dextable 채택. */
function pickChallengeTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 4) return;
    const second = normalizeText($headerCells.eq(1).text());
    if (second === 'Item Requirements') chosen = $table;
  });
  return chosen;
}

function processRow(
  $row: CheerioSelection,
  metadata: SourceMetadata,
  entities: TeamChallengeInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 4) return;

  const stageText = normalizeText($tds.eq(0).text());
  const stage = Number.parseInt(stageText, 10);
  if (!Number.isFinite(stage) || stage < 1 || stage > 9) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'team-challenge[?]',
      message: `stage cell not 1~9 integer: "${stageText}"`,
    });
    return;
  }

  const slug = `team-challenge-stage${stage}`;
  const requirements = parseRequirementsCell($tds.eq(1));
  const notesEn = brSeparatedToString($tds.eq(2).html() ?? '');
  const badgeName = normalizeText($tds.eq(3).text());

  const candidate = {
    slug,
    stage,
    ...(badgeName.length > 0 ? { badgeName } : {}),
    ...(notesEn === undefined ? {} : { notesEn }),
    requirements,
    ...metadata,
  };

  const result = TeamChallengeSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `team-challenge[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/**
 * Item Requirements 셀의 `<br />` 분리 라인 → requirement 배열.
 * 각 라인 "<qty> <itemName>" 매치, 미매치 시 quantity 1 default 로 itemNameEn 보존.
 */
function parseRequirementsCell($td: CheerioSelection): TeamChallengeRequirementHint[] {
  const lines = (($td.html() ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const requirements: TeamChallengeRequirementHint[] = [];
  for (const line of lines) {
    const match = line.match(REQUIREMENT_WITH_QTY_RE);
    if (match !== null) {
      const quantity = Number.parseInt(match[1] ?? '', 10);
      const itemNameEn = match[2]?.trim() ?? '';
      if (Number.isFinite(quantity) && quantity > 0 && itemNameEn.length > 0) {
        requirements.push({ itemNameEn, quantity });
        continue;
      }
    }
    // 수량 없는 라인 — itemNameEn 그대로, quantity 1 default
    requirements.push({ itemNameEn: line, quantity: 1 });
  }
  return requirements;
}

/** `<br />` 분리 셀 html → 줄바꿈 join. 빈 셀은 undefined. */
function brSeparatedToString(html: string): string | undefined {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
  return text.length > 0 ? text : undefined;
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
