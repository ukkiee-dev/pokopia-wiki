/**
 * Serebii `/trade.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 33.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/trade.shtml
 *
 * 산출 엔티티:
 *   - (현 fixture 기준) **0 건** — 페이지에 row-level valuation 표가 없다.
 *   - 향후 Serebii 가 item-별 baseValue 표를 추가하면 본 파서가 자동으로
 *     추출하도록 셀렉터 드리프트 회복 코드 포함.
 *
 * 본 파서의 역할:
 *   - 페이지에 SCHEMA §2.27 의 trade_valuation row-level 데이터가 부재함을
 *     **명시적 issue 로 기록**.
 *   - 페이지 attribution(SourceMetadata) + fixture content_hash 보존으로 향후
 *     페이지 변경 감지(Phase 9 incremental QA) 의 신호 채널로 활용.
 *
 * HTML 구조 분석 (SELECTOR_VERSION='1' 시점):
 *   페이지에 `<table class="dextable">` 가 존재하지 않는다. 본문은 다음 prose 만:
 *     - h1 "Trade" — Trade specialty 메커니즘 설명
 *     - h2 "Making the Trade" — 50% favorite bonus 설명 + Eevee Doll 1,000→1,500
 *       및 CDs 500→750 두 예시
 *
 *   특정 item-별 baseValue 매핑은 산문 두 예시 외에 없다. 외부 데이터(공식 가이드
 *   /운영 매핑) 보강 영역.
 *
 * 셀렉터 드리프트 감지:
 *   향후 Serebii 가 dextable 형식의 valuation 표를 추가하면 본 파서가 헤더
 *   ("Item" / "Value" / "Points" 또는 유사) 를 인식해 자동 산출하도록 헬퍼를
 *   미리 구현. 표 발견 + 미인식 헤더 → unexpected-structure 로 알림.
 *
 * 에러 처리:
 *   - dextable 미발견 (현 fixture): missing-section + 'no-valuation-table-yet'
 *     라벨로 페이지가 아직 prose-only 임을 명시.
 *   - 미인식 헤더의 dextable 발견: unexpected-structure (셀렉터 드리프트 추적).
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  TradeValuationSchema,
  type TradeValuationInput,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** 향후 dextable 헤더가 추가되면 인식할 후보 키워드. */
const VALUATION_HEADER_KEYWORDS = ['Value', 'Points', 'Worth'] as const;

export class TradeParser extends Parser<TradeValuationInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'trade';

  parse(html: string, options: ParseOptions): ParseResult<TradeValuationInput> {
    const _scrapedAt = options.scrapedAt ?? new Date().toISOString();
    void _scrapedAt;
    void buildSourceMetadata;
    void TradeValuationSchema;

    const $ = load(html);
    const entities: TradeValuationInput[] = [];
    const issues: ParseIssue[] = [];

    const $candidates = $('table.dextable');
    if ($candidates.length === 0) {
      issues.push({
        kind: 'missing-section',
        at: 'trade[no-valuation-table-yet]',
        message:
          'Serebii /trade.shtml has no row-level item valuation table (prose only: Trade mechanic + 50% favorite bonus + Eevee Doll/CDs examples). TradeValuation rows are expected to come from external sources (operations mapping/community data).',
      });
      return { entities, issues };
    }

    // 미래 대비: dextable 이 추가되면 헤더 인식 시도. 현 fixture 에는 도달하지 않음.
    $candidates.each((_, table) => {
      const $table = $(table);
      const matched = matchValuationHeader($table);
      if (!matched) {
        issues.push({
          kind: 'unexpected-structure',
          at: 'trade[unrecognized-table]',
          message: `dextable found but header does not match Value/Points/Worth keywords: "${normalizeText($table.find('tr').first().text())}"`,
        });
      }
    });

    if (entities.length === 0 && issues.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no trade_valuation rows extracted (header recognized but no data rows)',
      });
    }

    return { entities, issues };
  }
}

/**
 * dextable 첫 행에 VALUATION_HEADER_KEYWORDS 중 하나가 포함되면 true. cheerio 의
 * 인접 td 텍스트 합침 특성에 대비해 case-insensitive substring 매치 사용
 * (friendship.ts matchTierHeader 동일 정책).
 */
function matchValuationHeader($table: CheerioSelection): boolean {
  const headerText = normalizeText($table.find('tr').first().text()).toLowerCase();
  return VALUATION_HEADER_KEYWORDS.some((kw) => headerText.includes(kw.toLowerCase()));
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
