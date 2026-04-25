/**
 * 미니게임 도메인 스크래퍼 입력 스키마 (SCHEMA §2.22 미니게임 & 주간 콘텐츠).
 *
 * - JumpropeTierSchema: `/jumprope.shtml` 의 tier 보상 (Phase 8 단계 21)
 * - HideAndSneakRewardSchema: `/hideandsneak.shtml` 의 보상 (Phase 8 단계 21)
 *
 * 두 모델 모두 SCHEMA 의 polymorphic reward 패턴 (rewardType ENUM + rewardRefId
 * FK). 본 파서는 itemSlug + nameEn 을 보존하고 loader 가 item FK 해소.
 *
 * SCHEMA 비교:
 *   - JumpropeTier: tier(INT UNIQUE) + requiredJumps + rewardType + rewardRefId(nullable)
 *   - HideAndSneakReward: condition(TEXT) + rewardType + rewardRefId(non-null)
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * SCHEMA §2.22 reward_type ENUM (jumprope_tier / hideandsneak_reward 공유).
 * Prisma `JumpropeRewardType` / `HideAndSneakRewardType` 와 동일 값 — 본 파일은
 * 공통 enum 으로 통합 정의 후 두 스키마가 참조.
 *
 * TypeScript 타입 재export 금지: Prisma 동명 충돌 회피 (geography.ts 동일 정책).
 */
export const MinigameRewardTypeEnum = z.enum(['item', 'coin']);

/**
 * JumpropeTier 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `jumprope-tier<n>-<itemSlug>` (예: "jumprope-tier1-copperore").
 * - `tier`: 페이지 행 순서 정수 (두 표 합산: standard 1~3 + contest 4~11).
 * - `requiredJumps`: Method/Score 셀에서 추출 (예: "0-49" → 0, "50+" → 50).
 * - `rewardType`: 'item' (본 페이지는 모두 item; coin 은 향후 단계 또는 보강).
 * - `itemSlug`: items/<slug>.png 토큰. loader 가 item FK 해소 → rewardRefId.
 * - `itemNameEn`: Item 셀 영문명.
 * - `quantity`: Quantity 셀 정수.
 * - `methodEn`: Method/Score 셀 raw 텍스트 (예: "0-49", "100+", "20+").
 * - `imageUrl`: items/<slug>.png 절대 URL.
 */
export const JumpropeTierSchema = z
  .object({
    slug: z.string().min(1),
    tier: z.number().int().positive(),
    requiredJumps: z.number().int().nonnegative(),
    rewardType: MinigameRewardTypeEnum,
    itemSlug: z.string().min(1),
    itemNameEn: z.string().min(1),
    quantity: z.number().int().positive(),
    methodEn: z.string().min(1),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type JumpropeTierInput = z.infer<typeof JumpropeTierSchema>;

/**
 * HideAndSneakReward 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `hideandsneak-<conditionSlug>-<itemSlug>` (예:
 *   "hideandsneak-win-without-being-detected-freshcarrot").
 * - `condition`: Method 셀 raw 텍스트 (SCHEMA 의 `condition` 컬럼).
 * - `rewardType`: 'item'.
 * - `itemSlug` / `itemNameEn`: loader 가 item FK 해소 → rewardRefId (non-null).
 * - `quantity`: Quantity 셀 정수.
 * - `imageUrl`: items/<slug>.png 절대 URL.
 */
export const HideAndSneakRewardSchema = z
  .object({
    slug: z.string().min(1),
    condition: z.string().min(1),
    rewardType: MinigameRewardTypeEnum,
    itemSlug: z.string().min(1),
    itemNameEn: z.string().min(1),
    quantity: z.number().int().positive(),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type HideAndSneakRewardInput = z.infer<typeof HideAndSneakRewardSchema>;
