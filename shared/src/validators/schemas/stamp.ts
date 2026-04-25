/**
 * 스탬프 카드 도메인 스크래퍼 입력 스키마 (SCHEMA §2.22 미니게임 & 주간 콘텐츠).
 *
 * - StampCardSchema: `/stampcard.shtml` 의 weekly stamp card 메타 (Phase 8 단계 20)
 * - StampRewardSchema: 동일 페이지의 stamp 종류 4 행 (tier 1~4) + tier 5 보너스
 *
 * SCHEMA §2.22 와의 매핑:
 *   - stamp_card: weekGoal INT (주간 stamp 목표 — prose "all 5 stamps filled" 에서 5)
 *   - stamp_reward: tier + requiredStamps + coinAmount (4 stamp 종류 × tier + 보너스)
 *
 * 본 페이지는 1 weekly card 만 명시 — multi-card 확장 시 cardSlug 로 FK 매핑.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * StampCard 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: "weekly-stamp-card" (단일 카드 fixture; 다중 카드 시 식별자 변경).
 * - `weekGoal`: 주간 stamp 목표 정수. prose "all 5 stamps filled on the card" 에서
 *   추출 또는 fallback 5.
 */
export const StampCardSchema = z
  .object({
    slug: z.string().min(1),
    weekGoal: z.number().int().positive(),
  })
  .extend(SourceMetadataSchema.shape);

export type StampCardInput = z.infer<typeof StampCardSchema>;

/**
 * StampReward 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `stamp-reward-tier<n>-<stampNameSlug>` (예: "stamp-reward-tier1-basic").
 *   카드가 단일이라 cardSlug 접두사는 생략.
 * - `cardSlug`: 소속 StampCard 의 slug ("weekly-stamp-card"). loader 가 FK 해소.
 * - `tier`: 표 행 순서 정수 (1=Basic, 2=Evolved, 3=Legendary, 4=Mew). 보너스
 *   행은 tier 5 로 부여.
 * - `stampNameEn`: Stamp 셀 영문명 (예: "Basic Pokémon"). loader 가 운영 메타
 *   또는 별도 i18n 테이블 추가 시 활용.
 * - `requiredStamps`: 1 (개별 stamp 1 개당 reward) 또는 5 (보너스 — 카드 전체 채움).
 * - `coinAmount`: Coins 셀 정수 (50/100/200/1000) 또는 보너스 1500.
 * - `imageUrl`: stamps/<slug>.png 절대 URL.
 */
export const StampRewardSchema = z
  .object({
    slug: z.string().min(1),
    cardSlug: z.string().min(1),
    tier: z.number().int().positive(),
    stampNameEn: z.string().min(1),
    requiredStamps: z.number().int().positive(),
    coinAmount: z.number().int().positive(),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type StampRewardInput = z.infer<typeof StampRewardSchema>;
