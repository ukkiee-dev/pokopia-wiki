/**
 * 디토 커스터마이징 도메인 스크래퍼 입력 스키마 (SCHEMA §2.15 customization_item).
 *
 * - CustomizationItemSchema: `/customisation.shtml` 의 7 카테고리 × N 행 = 177
 *   customization item (Phase 8 단계 30)
 *
 * SCHEMA §2.15 와의 매핑:
 *   - CustomizationItem.category ENUM(Hair, Outfit, Top, Pants, Hat, Bag, Shoes)
 *     ← 페이지 h3 헤더 → 단수형 매핑 (Tops → Top, Bags → Bag).
 *   - CustomizationItem.unlockMethod (TEXT) ← Location 셀 raw 텍스트.
 *   - CustomizationItem.unlockLocationId (FK nullable) ← Location 셀의 알려진
 *     location 키워드 매칭 → loader FK 해소.
 *   - i18n.name ← Name 셀 영문명.
 *   - i18n.description ← Style 셀 (선택적 부가 정보).
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/** SCHEMA §2.15 `customization_item.category` ENUM. */
export const CustomizationCategoryEnum = z.enum([
  'Hair',
  'Outfit',
  'Top',
  'Pants',
  'Hat',
  'Bag',
  'Shoes',
]);

/**
 * CustomizationItem 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `customization-<categorySlug>-<imageId>` (예: "customization-outfit-1").
 *   Serebii 의 custom/th/<id>.jpg 이미지 ID 가 카테고리 내에서 unique 자연키.
 * - `category`: SCHEMA ENUM 단수형 (Outfit/Hair/Top/Pants/Hat/Bag/Shoes).
 * - `nameEn`: Name 셀 영문명 (예: "Familiar Outfit 1", "Team Rocket Outfit").
 * - `styleEn`: Style 셀 부가 정보 (대부분 빈 값).
 * - `unlockMethodEn`: Location 셀 raw 텍스트 (예: "Beginning",
 *   "Sparkling Skylands - Northwest Island").
 * - `unlockLocationSlug`: Location 셀의 알려진 location 키워드 매칭.
 * - `imageUrl`: Picture 셀 img src 절대 URL (`custom/th/<id>.jpg`).
 */
export const CustomizationItemSchema = z
  .object({
    slug: z.string().min(1),
    category: CustomizationCategoryEnum,
    nameEn: z.string().min(1),
    styleEn: z.string().min(1).optional(),
    unlockMethodEn: z.string().min(1),
    unlockLocationSlug: z.string().min(1).optional(),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type CustomizationItemInput = z.infer<typeof CustomizationItemSchema>;
