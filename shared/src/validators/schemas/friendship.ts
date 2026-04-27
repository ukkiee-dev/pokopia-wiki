/**
 * 우정 도메인 스크래퍼 입력 스키마 (SCHEMA §2.7 friendship_tier).
 *
 * - FriendshipTierSchema: 향후 데이터 소스를 위한 스키마 정의 (Phase 8 단계 18)
 *
 * Serebii `/friendship.shtml` 에는 row-level tier 표가 존재하지 않는다 (페이지가
 * prose 만 제공: 친밀도 시스템 개요, "Games" 미니게임 섹션, "Best Friends"
 * 최대 단계 마크 설명). FriendshipTier 의 tier(INT UNIQUE) + requiredPoints
 * 데이터는 본 단계에서 산출 불가하며, 단계 16 ShopItem/Currency 와 동일하게
 * 스키마만 정의해 두고 향후 외부 데이터(Bulbapedia, gamepress, 운영 매핑) 로
 * 보강한다.
 *
 * SCHEMA §2.7 와의 매핑 (FriendshipTier):
 *   - `tier`: 단계 순서 (INT UNIQUE).
 *   - `requiredPoints`: 필요 우정 포인트.
 *   - i18n: nameEn / descriptionEn (해금 기능 설명).
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * FriendshipTier 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드 (현재 Serebii 본 페이지에는 row-level 데이터 없음 — 향후
 * 외부 데이터 소스가 본 형식의 입력을 제공할 때 활용)
 * - `slug`: `friendship-tier-<n>` 합성 (예: "friendship-tier-1", "friendship-tier-5").
 * - `tier`: 단계 순서 정수 (1~N).
 * - `requiredPoints`: 누적 우정 포인트.
 * - `nameEn`: 단계 영문명 (예: "Best Friends" 최대 단계).
 * - `descriptionEn`: 해금 기능 설명 (예: "Pokémon will start calling you by name").
 * - `isMaxTier`: 최대 단계 여부. Serebii 의 "Best Friends" 마크 단계 식별.
 */
export const FriendshipTierSchema = z
  .object({
    slug: z.string().min(1),
    tier: z.number().int().positive(),
    requiredPoints: z.number().int().nonnegative(),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
    isMaxTier: z.boolean().default(false),
  })
  .extend(SourceMetadataSchema.shape);

export type FriendshipTierInput = z.infer<typeof FriendshipTierSchema>;
