/**
 * Social 도메인 스크래퍼 입력 스키마 (SCHEMA §2.7 선호도 & 우정).
 *
 * - FavoriteCategorySchema: `/favorites.shtml` 루트 카테고리 목록 (Phase 8 단계 7)
 *
 * pokemon_favorite / item_favorite_tag 매핑은 본 스키마 범위 밖 — 각 카테고리의
 * `/favorites/<slug>.shtml` 상세 페이지 파서(후속 배치) 가 다룬다.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * FavoriteCategory 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: Serebii URL 토큰 (`blockystuff`, `cleanliness`). Prisma `source_slug`.
 * - `nameEn`: 카테고리 영문명 (`Blocky stuff`, `Cleanliness`).
 * - `descriptionEn`: 선호 카테고리 설명 — 루트 페이지에는 없고 상세 페이지에서 후속 주입 가능.
 */
export const FavoriteCategorySchema = z
  .object({
    slug: z.string().min(1),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type FavoriteCategoryInput = z.infer<typeof FavoriteCategorySchema>;
