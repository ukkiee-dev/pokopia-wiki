/**
 * 환경 & 상점 도메인 스크래퍼 입력 스키마 (SCHEMA §2.10).
 *
 * - EnvironmentRewardSchema: `/environmentlevel.shtml` 의 "items given by Shop
 *   Unlocks" 표 (Phase 8 단계 16)
 * - ShopItemSchema, CurrencySchema: 본 페이지에 row-level 데이터 없음. 향후
 *   별도 데이터 소스(상점 페이지·매핑 파일)에서 활용될 스키마 기반 (단계 16
 *   에서는 정의만 추가).
 *
 * SCHEMA §2.10 와의 매핑 (EnvironmentReward):
 *   - `locationId` ← parser 가 카테고리 헤더(`<a name="<slug>">`) 의 location slug
 *     을 `locationSlug` 로 산출 → loader 가 location FK 해소.
 *   - `level` ← Level 셀 "Lv. N" 정수.
 *   - `rewardType` ← name 셀 "X Recipe" 접미사면 'recipe', 그 외 'item'. SCHEMA
 *     ENUM 의 'feature_unlock' / 'shop_unlock' 은 본 페이지 범위 외 (다른 단계).
 *   - `rewardRefId` ← parser 가 itemSlug / recipeSlug 텍스트로 산출 → loader 가
 *     item/recipe FK 해소.
 *   - `sourceSlug` ← `<location-slug>-lv<N>-<reward-type>-<item-slug>` 합성. 동일
 *     아이템과 그 레시피가 같은 location/level 에서 양쪽으로 unlock 되는 경우가
 *     있어 (location, level, rewardType, item) 4-튜플이 자연키.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/** SCHEMA §2.10 `environment_reward.reward_type` ENUM. */
export const EnvironmentRewardTypeEnum = z.enum([
  'item',
  'recipe',
  'feature_unlock',
  'shop_unlock',
]);

/**
 * EnvironmentReward 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `<locationSlug>-lv<level>-<rewardType>-<itemSlug>` 합성 (예:
 *   "witheredwastelands-lv2-item-gardenbench" / "witheredwastelands-lv2-recipe-workbench").
 *   loader 의 source_slug 1:1 주입.
 * - `locationSlug`: 카테고리 헤더 `<a name="<slug>">` 토큰 (예: "witheredwastelands").
 *   loader 가 location FK 해소.
 * - `level`: Level 셀 "Lv. N" 정수 (1~10).
 * - `rewardType`: 'item' | 'recipe' | 'feature_unlock' | 'shop_unlock'. 본 파서는
 *   'item' 또는 'recipe' 만 산출 (Recipe 접미사 분기).
 * - `itemSlug`: items/<slug>.png 토큰. loader 가 item / recipe FK 해소.
 * - `nameEn`: Name 셀 영문명 (Recipe 접미사 제거 전 raw, 감사용).
 * - `imageUrl`: Picture 셀 절대 URL.
 */
export const EnvironmentRewardSchema = z
  .object({
    slug: z.string().min(1),
    locationSlug: z.string().min(1),
    level: z.number().int().min(1).max(10),
    rewardType: EnvironmentRewardTypeEnum,
    itemSlug: z.string().min(1),
    nameEn: z.string().min(1),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type EnvironmentRewardInput = z.infer<typeof EnvironmentRewardSchema>;

/**
 * ShopItem 파서 출력 스키마 (SCHEMA §2.10 shop_item).
 *
 * 단계 16 페이지(`/environmentlevel.shtml`)에는 row-level shop_item 정보가 없다.
 * 본 스키마는 향후 별도 데이터 소스(상점 페이지·외부 매핑·운영 데이터)가 동일
 * 형식의 입력을 제공할 때를 위한 정의. loader 가 location/item/currency FK 해소.
 */
export const ShopItemSchema = z
  .object({
    slug: z.string().min(1),
    locationSlug: z.string().min(1),
    itemSlug: z.string().min(1),
    requiredEnvLevel: z.number().int().min(1).max(10),
    price: z.number().int().nonnegative().optional(),
    currencyCode: z.string().min(1),
  })
  .extend(SourceMetadataSchema.shape);

export type ShopItemInput = z.infer<typeof ShopItemSchema>;

/**
 * Currency 파서 출력 스키마 (SCHEMA §2.10 currency).
 *
 * 단계 16 페이지에는 currency 목록이 없다. 본 스키마는 향후 별도 매핑(예:
 * coin/pokemetal/feather 등)이 추가될 때를 위한 정의.
 */
export const CurrencySchema = z
  .object({
    code: z.string().min(1),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type CurrencyInput = z.infer<typeof CurrencySchema>;
