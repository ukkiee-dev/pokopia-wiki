/**
 * Mosslax 부스트 도메인 스크래퍼 입력 스키마 (SCHEMA §2.23 mosslax_boost).
 *
 * - MosslaxBoostSchema: `/mosslaxboosts.shtml` 의 두 dextable 을 Cartesian
 *   합성한 (flavor × level) 결과 (Phase 8 단계 19)
 *
 * 페이지 구조:
 *   1. "Effect Strength" 표 — Weakest/Standard/Strongest (level 1~3) ↔ food group
 *   2. "List of Boosts" 표 — flavor 6 행 ("Generic Flavor Meals" + 5 ENUM flavor)
 *      → effect description
 *
 * SCHEMA §2.23 와의 매핑:
 *   - mosslax_boost.flavor: ENUM(Bitter, Dry, Sour, Spicy, Sweet) - 5 값
 *   - mosslax_boost.level: INT (1~3)
 *   - UNIQUE (flavor, level) - 5 × 3 = 15 행
 *   - i18n.description: flavor 별 effect text (level 무관, 모든 level 동일)
 *
 *   "Generic Flavor Meals" 행은 SCHEMA ENUM 에 없어 본 스키마에서 미포함
 *   (genericEffectEn 메타 필드로 별도 보존하지 않음 — 향후 운영 메타 또는 i18n
 *   description prefix 로 보강 가능).
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * SCHEMA §2.23 `mosslax_boost.flavor` ENUM — Prisma `FlavorType` 와 값 일치
 * (None 은 본 도메인에서 배제, 5 값만).
 *
 * TypeScript 타입 재export 금지: Prisma `FlavorType` 과 충돌 회피
 * (geography.ts LocationType 동일 정책). `MosslaxBoostInput['flavor']` 로 파생.
 */
export const MosslaxFlavorEnum = z.enum(['Bitter', 'Dry', 'Sour', 'Spicy', 'Sweet']);

/**
 * MosslaxBoost 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `mosslax-<flavor-lowercase>-lv<level>` (예: "mosslax-bitter-lv1").
 * - `flavor`: 'Bitter' | 'Dry' | 'Sour' | 'Spicy' | 'Sweet'.
 * - `level`: 1 (Weakest) | 2 (Standard) | 3 (Strongest).
 * - `effectEn`: 해당 flavor 의 raw effect 텍스트 (level 과 무관, 동일 flavor 내
 *   3 level 이 같은 effect 공유). loader 가 mosslax_boost_i18n.description 으로 분리.
 * - `foodGroupEn`: 해당 level 의 음식 그룹 (예: "Berries / Drinks / Vegetables")
 *   — 페이지 "Effect Strength" 표의 음식 라인을 ` / ` 로 join. 운영 보조 메타.
 */
export const MosslaxBoostSchema = z
  .object({
    slug: z.string().min(1),
    flavor: MosslaxFlavorEnum,
    level: z.number().int().min(1).max(3),
    effectEn: z.string().min(1),
    foodGroupEn: z.string().min(1),
  })
  .extend(SourceMetadataSchema.shape);

export type MosslaxBoostInput = z.infer<typeof MosslaxBoostSchema>;
