/**
 * Paint 도메인 스크래퍼 입력 스키마 (SCHEMA §2.11 도색).
 *
 * - PaintColorSchema: `/paint.shtml` 의 "Colours" 표 (18 색)
 * - PaintPatternSchema: `/paint.shtml` 의 "Patterns" 표 (Dream Islands·Vespiquen 등)
 *
 * 두 스키마 모두 cost 정보를 nested `ingredients` 로 보존한다 (recipe.ts 의
 * IngredientHintSchema 와 동일 패턴). loader 가 raw paint item 명 → paint_color
 * FK 매핑으로 SCHEMA §2.11 의 paint_recipe(`result_color_id` / `ingredient_color_id`
 * / `quantity`) 를 구성한다. Pattern 의 cost 는 SCHEMA 에 별도 테이블이 없어
 * loader 가 i18n description 등에 활용하거나 무시할 수 있다.
 *
 * SCHEMA §2.11 와의 매핑:
 *   - PaintColor.sourceSlug ← nameEn.slugify() (예: "white", "aquamarine")
 *     ※ Serebii 가 paint/<id>.png 같은 이미지 ID 만 제공하고 별도 URL 토큰이 없어
 *       영문 색상명을 natural key 로 채택. 18 색 모두 unique.
 *   - PaintPattern.sourceSlug ← `pattern-<imageToken>` (예: "pattern-1", "pattern-pk6")
 *     ※ Serebii 패턴은 별도 이름이 없고 location 텍스트가 여러 패턴에 공유되므로
 *       이미지 ID 를 안정 자연키로 채택.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * 공통 paint 재료 힌트.
 * 파서는 cost 셀의 raw paint item 텍스트(예: "Red Paint") 와 수량을 추출한다.
 * loader 가 PaintColor 의 natural key 매핑(예: "Red Paint" → color slug "red") 또는
 * Item 본 엔티티 매핑으로 ingredient_color_id 를 해소.
 */
const PaintIngredientHintSchema = z.object({
  itemNameEn: z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

export type PaintIngredientHint = z.infer<typeof PaintIngredientHintSchema>;

/**
 * PaintColor 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: nameEn 의 lowercase + 공백→하이픈 (예: "aquamarine"). loader 의
 *   paint_color.source_slug 로 1:1 주입.
 * - `nameEn`: Colour 셀 텍스트 (예: "White", "Aquamarine"). loader 가
 *   paint_color_i18n(locale='en') 로 분리.
 * - `imageUrl`: `paint/<id>.png` 절대 URL.
 * - `ingredients`: cost 셀 inner table 의 각 행. raw paint item 명 + 수량.
 *   loader 가 paint_recipe 로 변환.
 */
export const PaintColorSchema = z
  .object({
    slug: z.string().min(1),
    nameEn: z.string().min(1),
    imageUrl: z.url().optional(),
    ingredients: z.array(PaintIngredientHintSchema).default([]),
  })
  .extend(SourceMetadataSchema.shape);

export type PaintColorInput = z.infer<typeof PaintColorSchema>;

/**
 * PaintPattern 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `pattern-<imageToken>` (예: "pattern-1", "pattern-pk6"). 이미지 ID 가
 *   유일한 안정 자연키.
 * - `locationEn`: Location 셀 텍스트 (예: "Beginning", "On item given by Vespiquen").
 *   패턴 자체에 별도 이름이 없으므로 loader 가 paint_pattern_i18n.name 으로 활용.
 * - `imageUrl`: `pattern/<id>.png` 절대 URL.
 * - `ingredients`: cost 셀 inner table 의 raw paint item 명 + 수량. SCHEMA 에
 *   별도 paint_pattern_recipe 가 없어 loader 가 i18n description 또는 별도 운영
 *   메타로 활용 (현 시점 보존만).
 */
export const PaintPatternSchema = z
  .object({
    slug: z.string().min(1),
    locationEn: z.string().min(1),
    imageUrl: z.url().optional(),
    ingredients: z.array(PaintIngredientHintSchema).default([]),
  })
  .extend(SourceMetadataSchema.shape);

export type PaintPatternInput = z.infer<typeof PaintPatternSchema>;
