/**
 * Serebii `/pokedexcompletion.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 32.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/pokedexcompletion.shtml
 *
 * 산출 엔티티:
 *   - `pokedex_milestone` × 38 (fixture 기준): requiredCount 6/15/20/25/.../300
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문 후반부에 단일 `<table class="dextable">` (2 fooevo: Number /
 *   Reward).
 *
 *   ```
 *   <tr><td class="fooinfo">6 Registered</td><td class="fooinfo">Storage Box recipe</td></tr>
 *   <tr><td class="fooinfo">15 Registered</td><td class="fooinfo">Wooden plate recipe</td></tr>
 *   ...
 *   <tr><td class="fooinfo">300 Registered</td><td class="fooinfo">Neo Dowsing Machine recipe</td></tr>
 *   ```
 *
 * 특이사항:
 *   - **requiredCount 추출**: "N Registered" 정규식 첫 정수.
 *   - **rewardType 분류**: Reward 셀이 "X recipe" / "X Recipe" / "X receipe" (typo)
 *     형식이면 'recipe', 그 외 명사형 → 'item'. fixture 의 모든 38 행은 recipe.
 *   - **slug**: `pokedex-milestone-<requiredCount>` — requiredCount unique.
 *
 * 에러 처리:
 *   - 2 fooevo 헤더(Number/Reward) 미발견: missing-section
 *   - "N Registered" 정규식 fail: unexpected-structure + skip
 *   - rewardItemNameEn 빈 셀: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  PokedexMilestoneSchema,
  type PokedexMilestoneInput,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

type PokedexMilestoneRewardType = PokedexMilestoneInput['rewardType'];

/** "N Registered" — Number 셀. */
const REGISTERED_RE = /^(\d+)\s+Registered$/i;

/** Reward 셀 끝의 "recipe" / "Recipe" / "receipe" (typo) 매칭. */
const RECIPE_SUFFIX_RE = /\b(?:recipe|receipe)\s*$/i;

export class PokedexMilestoneParser extends Parser<PokedexMilestoneInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'pokedexcompletion';

  parse(html: string, options: ParseOptions): ParseResult<PokedexMilestoneInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: PokedexMilestoneInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickMilestoneTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no pokedex-milestone dextable (2 fooevo Number/Reward) found',
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
        message: 'no pokedex_milestone rows extracted',
      });
    }

    return { entities, issues };
  }
}

function pickMilestoneTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 2) return;
    const first = normalizeText($headerCells.eq(0).text());
    const second = normalizeText($headerCells.eq(1).text());
    if (first === 'Number' && second === 'Reward') chosen = $table;
  });
  return chosen;
}

function processRow(
  $row: CheerioSelection,
  metadata: SourceMetadata,
  entities: PokedexMilestoneInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 2) return;

  const numberText = normalizeText($tds.eq(0).text());
  const rewardItemNameEn = normalizeText($tds.eq(1).text());

  const numberMatch = numberText.match(REGISTERED_RE);
  if (numberMatch === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'pokedex-milestone[?]',
      message: `Number cell did not match "<n> Registered": "${numberText}"`,
    });
    return;
  }
  const requiredCount = Number.parseInt(numberMatch[1] ?? '', 10);
  if (!Number.isFinite(requiredCount) || requiredCount <= 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'pokedex-milestone[?]',
      message: `requiredCount not positive integer: "${numberText}"`,
    });
    return;
  }

  if (rewardItemNameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `pokedex-milestone[${requiredCount}]`,
      message: 'reward cell empty',
    });
    return;
  }

  const rewardType = classifyRewardType(rewardItemNameEn);
  const slug = `pokedex-milestone-${requiredCount}`;

  const candidate = {
    slug,
    requiredCount,
    rewardType,
    rewardItemNameEn,
    ...metadata,
  };

  const result = PokedexMilestoneSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `pokedex-milestone[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/** Reward 셀 텍스트 → SCHEMA reward_type ENUM. recipe/receipe(typo) suffix → 'recipe'. */
function classifyRewardType(rewardText: string): PokedexMilestoneRewardType {
  if (RECIPE_SUFFIX_RE.test(rewardText)) return 'recipe';
  return 'item';
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
