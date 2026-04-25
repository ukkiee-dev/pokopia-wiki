/**
 * 도감 완성 보상 도메인 스크래퍼 입력 스키마 (SCHEMA §2.18 pokedex_milestone).
 *
 * - PokedexMilestoneSchema: `/pokedexcompletion.shtml` 의 38 milestone (Phase 8
 *   단계 32)
 *
 * SCHEMA §2.18 와의 매핑:
 *   - PokedexMilestone.requiredCount (INT) ← "N Registered" 정수.
 *   - PokedexMilestone.rewardType ENUM(item, recipe, feature_unlock) ← Reward
 *     셀 키워드 분류 ("X recipe" → 'recipe', 그 외 → 'item').
 *   - PokedexMilestone.rewardRefId (INT, non-null) ← rewardItemSlug → loader
 *     가 item/recipe FK 해소.
 *   - PokedexMilestone.note (TEXT, nullable) ← 본 페이지에 별도 note 없어 미산출.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/** SCHEMA §2.18 `pokedex_milestone.reward_type` ENUM. */
export const PokedexMilestoneRewardTypeEnum = z.enum([
  'item',
  'recipe',
  'feature_unlock',
]);

/**
 * PokedexMilestone 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `pokedex-milestone-<requiredCount>` (예: "pokedex-milestone-6").
 *   requiredCount 가 unique 자연 키.
 * - `requiredCount`: "N Registered" 정수 (6/15/20/.../300).
 * - `rewardType`: 'recipe' | 'item' | 'feature_unlock' — Reward 셀 텍스트 분류.
 * - `rewardItemNameEn`: Reward 셀의 raw 텍스트 ("Storage Box recipe", "Wreath
 *   Recipe"). loader 가 키워드로 item/recipe FK 해소.
 * - `note`: SCHEMA 의 note 컬럼은 본 페이지 데이터에 없음 (optional).
 */
export const PokedexMilestoneSchema = z
  .object({
    slug: z.string().min(1),
    requiredCount: z.number().int().positive(),
    rewardType: PokedexMilestoneRewardTypeEnum,
    rewardItemNameEn: z.string().min(1),
    note: z.string().min(1).optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type PokedexMilestoneInput = z.infer<typeof PokedexMilestoneSchema>;
