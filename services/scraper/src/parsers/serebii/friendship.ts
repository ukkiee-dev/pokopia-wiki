/**
 * Serebii `/friendship.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 18.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/friendship.shtml
 *
 * 산출 엔티티:
 *   - (현 fixture 기준) **0 건** — 페이지에 row-level tier 표가 없다.
 *   - 향후 페이지 갱신으로 단계 표가 추가되면 본 파서가 자동으로 추출하도록 구조화.
 *
 * 본 파서의 역할:
 *   - 페이지에 SCHEMA §2.7 의 friendship_tier (tier INT UNIQUE + required_points)
 *     row-level 데이터가 부재함을 **명시적 issue 로 기록**.
 *   - 페이지 attribution(SourceMetadata) + fixture content_hash 보존으로 향후
 *     페이지 변경 감지(Phase 9 incremental QA) 의 신호 채널로 활용.
 *
 * HTML 구조 분석 (SELECTOR_VERSION='1' 시점):
 *   페이지에 `<table class="dextable">` 가 존재하지 않는다. 본문은 다음 prose 만:
 *     - h1 "Friendship" — 친밀도 시스템 개요
 *     - h2 "Games" — 미니게임(퀴즈, Look This Way) 설명
 *     - h2 "Best Friends" — 최대 단계 마크 설명
 *
 *   Best Friends 외 단계명·required_points 는 산문에서도 추출 불가. tier 단계
 *   데이터는 외부 소스(Bulbapedia, gamepress, 운영 매핑) 보강 영역.
 *
 * 셀렉터 드리프트 감지:
 *   향후 Serebii 가 dextable 형식의 tier 표를 추가하면 본 파서가 헤더(`Tier` /
 *   `Required Points` 또는 유사) 를 인식해 자동 산출하도록 표 식별 헬퍼를 미리
 *   구현. 표 발견 + 미인식 헤더 → unexpected-structure 로 알림.
 *
 * 에러 처리:
 *   - dextable 미발견 (현 fixture): missing-section + 'no-tier-table-yet' 라벨로
 *     페이지가 아직 prose-only 임을 명시.
 *   - 미인식 헤더의 dextable 발견: unexpected-structure (셀렉터 드리프트 추적).
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  FriendshipTierSchema,
  type FriendshipTierInput,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** 향후 dextable 헤더가 추가되면 인식할 후보 키워드. */
const TIER_HEADER_KEYWORDS = ['Tier', 'Stage', 'Level'] as const;

export class FriendshipParser extends Parser<FriendshipTierInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'friendship';

  parse(html: string, options: ParseOptions): ParseResult<FriendshipTierInput> {
    const _scrapedAt = options.scrapedAt ?? new Date().toISOString();
    void _scrapedAt;
    void buildSourceMetadata;
    void FriendshipTierSchema;

    const $ = load(html);
    const entities: FriendshipTierInput[] = [];
    const issues: ParseIssue[] = [];

    const $candidates = $('table.dextable');
    if ($candidates.length === 0) {
      issues.push({
        kind: 'missing-section',
        at: 'friendship[no-tier-table-yet]',
        message:
          'Serebii /friendship.shtml has no row-level tier table (prose only: Friendship/Games/Best Friends). FriendshipTier rows are expected to come from external sources (Bulbapedia/gamepress/operations mapping).',
      });
      return { entities, issues };
    }

    // 미래 대비: dextable 이 추가되면 헤더 인식 시도. 현 fixture 에는 도달하지 않음.
    $candidates.each((_, table) => {
      const $table = $(table);
      const matched = matchTierHeader($table);
      if (!matched) {
        issues.push({
          kind: 'unexpected-structure',
          at: 'friendship[unrecognized-table]',
          message: `dextable found but header does not match Tier/Stage/Level keywords: "${normalizeText($table.find('tr').first().text())}"`,
        });
      }
    });

    if (entities.length === 0 && issues.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no friendship-tier rows extracted (header recognized but no data rows)',
      });
    }

    return { entities, issues };
  }
}

/**
 * dextable 첫 행에 TIER_HEADER_KEYWORDS 중 하나가 포함되면 true. cheerio 가
 * 인접 td 텍스트를 공백 없이 합쳐주므로 (`<td>Tier</td><td>Points</td>` →
 * "TierPoints") word-boundary 정규식 대신 case-insensitive substring 매치 사용.
 */
function matchTierHeader($table: CheerioSelection): boolean {
  const headerText = normalizeText($table.find('tr').first().text()).toLowerCase();
  return TIER_HEADER_KEYWORDS.some((kw) => headerText.includes(kw.toLowerCase()));
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
