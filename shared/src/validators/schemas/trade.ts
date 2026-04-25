/**
 * 교역 도메인 스크래퍼 입력 스키마 (SCHEMA §2.27 trade_valuation).
 *
 * - TradeValuationSchema: 향후 데이터 소스를 위한 스키마 정의 (Phase 8 단계 33)
 *
 * Serebii `/trade.shtml` 은 prose only 페이지 (Trade specialty 메커니즘 + 50%
 * favorite bonus 설명). row-level 의 item-별 baseValue 매핑이 부재하며, 산문에는
 * "Eevee Doll 1,000 → 1,500", "CDs 500 → 750" 두 예시만 있다.
 *
 * 단계 18 friendship + 단계 16 ShopItem/Currency 와 동일한 패턴: 스키마는 정의
 * 하되 파서는 entities 0 + missing-section('no-valuation-table-yet') 라벨로
 * prose-only 임을 명시. 향후 외부 데이터(공식 가이드/운영 매핑)로 보강.
 *
 * SCHEMA §2.27 와의 매핑:
 *   - TradeValuation.itemId (FK/PK 1:1) ← itemSlug → loader 가 item 매칭.
 *   - TradeValuation.baseValue (INT) ← 외부 매핑.
 *   - TradeValuation.favoriteBonusMultiplier (FLOAT) ← 산문에서 추출한 1.5
 *     (50% bonus). loader 가 모든 row 에 default 값 주입 가능.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * TradeValuation 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드 (현재 Serebii 본 페이지에는 row-level 데이터 없음 — 향후
 * 외부 데이터 소스가 본 형식의 입력을 제공할 때 활용)
 * - `slug`: `trade-valuation-<itemSlug>` (예: "trade-valuation-eeveedoll").
 * - `itemSlug`: 대상 item 의 sourceSlug. loader 가 item 1:1 매칭.
 * - `baseValue`: 기본 교역 가치 (Points).
 * - `favoriteBonusMultiplier`: 포켓몬 선호도 일치 시 보너스 배수 (default 1.5).
 */
export const TradeValuationSchema = z
  .object({
    slug: z.string().min(1),
    itemSlug: z.string().min(1),
    baseValue: z.number().int().positive(),
    favoriteBonusMultiplier: z.number().positive().default(1.5),
  })
  .extend(SourceMetadataSchema.shape);

export type TradeValuationInput = z.infer<typeof TradeValuationSchema>;
