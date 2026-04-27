/**
 * Dream/Cloud Island 도메인 스크래퍼 입력 스키마 (SCHEMA §2.24).
 *
 * - IslandVariantSchema: `/dreamislands.shtml` 의 5 doll-based variant +
 *   `/cloudislands.shtml` 의 6 code-based variant (Phase 8 단계 39/40).
 *   각 variant 안에 nested rewards (Dream Island 의 focus items).
 *
 * SCHEMA §2.24 와의 매핑:
 *   - IslandVariant.locationId (FK) ← `dreamisland` 또는 `cloudisland` (단계 25
 *     legendary.ts LOCATION_KEYWORDS 와 일관 slug).
 *   - IslandVariant.difficulty / guaranteedLegendaryId: 본 페이지에 명시 없음
 *     (loader 보강).
 *   - IslandReward: islandVariantId FK + rewardType ENUM(item, cd, recipe) +
 *     rewardRefId + dropRate.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/** SCHEMA §2.24 `island_reward.reward_type` ENUM. */
export const IslandRewardTypeEnum = z.enum(['item', 'cd', 'recipe']);

/**
 * Island reward 힌트 (island_reward 매핑용 nested).
 */
const IslandRewardHintSchema = z.object({
  rewardType: IslandRewardTypeEnum,
  itemSlug: z.string().min(1),
  itemNameEn: z.string().min(1),
  dropRate: z.number().min(0).max(1).optional(),
});

export type IslandRewardHint = z.infer<typeof IslandRewardHintSchema>;

/**
 * IslandVariant 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `island-variant-<locationSlug>-<variantKey>` (예:
 *   "island-variant-dreamisland-pikachudoll", "island-variant-cloudisland-pxqcg03s").
 * - `locationSlug`: 'dreamisland' 또는 'cloudisland'.
 * - `variantKey`: doll slug (Dream) 또는 code slugified (Cloud).
 * - `nameEn`: variant 영문명 (Dream: doll name; Cloud: image alt 텍스트).
 * - `descriptionEn`: optional 부가 설명 (Cloud only).
 * - `code`: Cloud Island code (예: "PXQC G03S"). Dream 은 undefined.
 * - `imageUrl`: 대표 이미지.
 * - `rewards`: nested island_reward 힌트 배열 (Dream: 3 focus items; Cloud: 빈 배열).
 */
export const IslandVariantSchema = z
  .object({
    slug: z.string().min(1),
    locationSlug: z.string().min(1),
    variantKey: z.string().min(1),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    imageUrl: z.url().optional(),
    rewards: z.array(IslandRewardHintSchema).default([]),
  })
  .extend(SourceMetadataSchema.shape);

export type IslandVariantInput = z.infer<typeof IslandVariantSchema>;
