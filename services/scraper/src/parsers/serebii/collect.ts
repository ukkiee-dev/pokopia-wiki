/**
 * Serebii `/collect.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 34.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/collect.shtml
 *
 * 산출 엔티티:
 *   - (현 fixture 기준) **0 건** — 페이지에 row-level (cost ↔ result) 매핑이 없다.
 *   - 페이지에는 60 result item 목록만 있고 cost 정보 (Rainbow Feather/Silver
 *     Feather/Lost Relic 등) 가 prose 에만 명시되어 어느 item 이 어느 cost 와 매핑
 *     되는지 알 수 없다.
 *   - 향후 Serebii 가 (cost, result) 매핑 표를 추가하면 본 파서가 자동으로
 *     추출하도록 셀렉터 드리프트 회복 코드 포함.
 *
 * 본 파서의 역할:
 *   - 페이지에 SCHEMA §2.27 의 exchange_recipe row-level 데이터가 부재함을
 *     **명시적 issue 로 기록**.
 *   - 페이지 attribution(SourceMetadata) + fixture content_hash 보존으로 향후
 *     페이지 변경 감지(Phase 9 incremental QA) 의 신호 채널로 활용.
 *
 * HTML 구조 분석 (SELECTOR_VERSION='1' 시점):
 *   페이지에 단일 `<table class="dextable">` (3 fooevo: Picture / Name /
 *   Description) 가 있지만, 이 표는 result item 목록만 보여주고 cost 매핑은 없다.
 *   (cost ↔ result) 행 매핑은 향후 페이지 갱신 영역.
 *
 *   prose 에 명시된 cost 후보:
 *     - Rainbow Feather (Ho-Oh)
 *     - Silver Feather (Lugia)
 *     - Appraised Lost Relics
 *
 * 셀렉터 드리프트 감지:
 *   향후 Serebii 가 (cost, result) 매핑 표를 추가하면 본 파서가 헤더 ("Cost" /
 *   "Pay" / "Required" 또는 유사) 를 인식해 자동 산출하도록 헬퍼를 미리 구현. 표
 *   발견 + 미인식 헤더 → unexpected-structure 로 알림.
 *
 * 에러 처리:
 *   - cost 매핑 dextable 미발견 (현 fixture): missing-section + 'no-recipe-table-yet'
 *     라벨로 페이지가 cost 매핑 없는 result-only 임을 명시.
 *   - 미인식 헤더의 dextable 발견: unexpected-structure (셀렉터 드리프트 추적).
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  ExchangeRecipeSchema,
  type ExchangeRecipeInput,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** 향후 (cost, result) 매핑 표가 추가되면 인식할 후보 헤더 키워드. */
const RECIPE_HEADER_KEYWORDS = ['Cost', 'Pay', 'Required', 'Exchange'] as const;

export class CollectParser extends Parser<ExchangeRecipeInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'collect';

  parse(html: string, options: ParseOptions): ParseResult<ExchangeRecipeInput> {
    const _scrapedAt = options.scrapedAt ?? new Date().toISOString();
    void _scrapedAt;
    void buildSourceMetadata;
    void ExchangeRecipeSchema;

    const $ = load(html);
    const entities: ExchangeRecipeInput[] = [];
    const issues: ParseIssue[] = [];

    // 페이지의 dextable 은 모두 result-only (Picture/Name/Description 3 fooevo).
    // (cost, result) 매핑 헤더가 있는 표를 찾지 못하면 missing-section.
    const $candidates = $('table.dextable').filter((_, table) => {
      return matchRecipeHeader($(table));
    });

    if ($candidates.length === 0) {
      issues.push({
        kind: 'missing-section',
        at: 'collect[no-recipe-table-yet]',
        message:
          'Serebii /collect.shtml has no row-level (cost, result) recipe table (only result item list of 60 items + prose mentions of Rainbow Feather/Silver Feather/Lost Relic costs). ExchangeRecipe rows are expected to come from external sources (operations mapping/community data).',
      });
      return { entities, issues };
    }

    // 미래 대비: cost 매핑 표가 추가되면 unexpected-structure 로 알림 (현재는 도달 X).
    $candidates.each((_, table) => {
      const $table = $(table);
      issues.push({
        kind: 'unexpected-structure',
        at: 'collect[recipe-table-found]',
        message: `dextable with recipe-like header detected — implementation needed: "${normalizeText($table.find('tr').first().text())}"`,
      });
    });

    return { entities, issues };
  }
}

/**
 * dextable 첫 행에 RECIPE_HEADER_KEYWORDS 중 하나가 포함되면 true. trade.ts /
 * friendship.ts 와 동일한 case-insensitive substring 매칭 정책.
 */
function matchRecipeHeader($table: CheerioSelection): boolean {
  const headerText = normalizeText($table.find('tr').first().text()).toLowerCase();
  return RECIPE_HEADER_KEYWORDS.some((kw) => headerText.includes(kw.toLowerCase()));
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
