/**
 * 수집 교환 도메인 스크래퍼 입력 스키마 (SCHEMA §2.27 exchange_recipe).
 *
 * - ExchangeRecipeSchema: 향후 데이터 소스를 위한 스키마 정의 (Phase 8 단계 34)
 *
 * Serebii `/collect.shtml` 은 prose + 60 result item 목록만 제공하고 row-level
 * (cost ↔ result) 매핑은 부재한다. 산문에는 "Rainbow and Silver Feathers", "Gholdengo
 * Collect Specialty", "appraised Lost Relics" 가 cost 후보로 언급되지만 어느 item
 * 이 어느 cost 와 매핑되는지 명시 없음.
 *
 * 단계 33 trade + 단계 18 friendship + 단계 16 ShopItem/Currency 와 동일한 패턴:
 * 스키마는 정의하되 파서는 entities 0 + missing-section('no-recipe-table-yet')
 * 라벨로 매핑 부재를 명시. 향후 외부 데이터(공식 가이드/운영 매핑/커뮤니티
 * 데이터)로 보강.
 *
 * SCHEMA §2.27 와의 매핑:
 *   - ExchangeRecipe.costCurrencyId (FK) ← currencyCode 또는 itemSlug 매핑.
 *   - ExchangeRecipe.costAmount (INT) ← 외부 매핑.
 *   - ExchangeRecipe.resultItemId (FK) ← resultItemSlug → loader.
 *   - ExchangeRecipe.resultQuantity (INT default 1)
 *   - ExchangeRecipe.requiredEnvLevel (INT nullable)
 *   - ExchangeRecipe.sourceLocationId (FK nullable)
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * ExchangeRecipe 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드 (현재 Serebii 본 페이지에는 row-level 매핑 없음 — 향후
 * 외부 데이터 소스가 본 형식의 입력을 제공할 때 활용)
 * - `slug`: `exchange-recipe-<costCurrency>-<resultItemSlug>` (예:
 *   "exchange-recipe-rainbowfeather-strangestrings"). cost + result 조합으로 unique.
 * - `costCurrencySlug`: 지불 통화/아이템 (예: "rainbowfeather", "silverfeather").
 *   loader 가 currency 또는 item FK 해소.
 * - `costAmount`: 지불 수량.
 * - `resultItemSlug`: 획득 아이템 (loader 가 item FK 해소).
 * - `resultQuantity`: 획득 수량 (default 1).
 * - `requiredEnvLevel`: 해금 환경 레벨 (optional).
 * - `sourceLocationSlug`: 교환 가능 지역 (optional).
 */
export const ExchangeRecipeSchema = z
  .object({
    slug: z.string().min(1),
    costCurrencySlug: z.string().min(1),
    costAmount: z.number().int().positive(),
    resultItemSlug: z.string().min(1),
    resultQuantity: z.number().int().positive().default(1),
    requiredEnvLevel: z.number().int().min(1).max(10).optional(),
    sourceLocationSlug: z.string().min(1).optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type ExchangeRecipeInput = z.infer<typeof ExchangeRecipeSchema>;
