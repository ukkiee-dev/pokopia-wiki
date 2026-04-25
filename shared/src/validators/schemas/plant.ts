/**
 * 식물 도메인 스크래퍼 입력 스키마 (SCHEMA §2.19 plant + plant_variant).
 *
 * - PlantSchema: `/flowers.shtml` + `/vegetables.shtml` 의 17 base plant
 *   (Phase 8 단계 31)
 *
 * SCHEMA §2.19 와의 매핑:
 *   - Plant.type ENUM(BerryTree, Wildflower, SeashorFlower, MountainFlower,
 *     SkylandFlower, DecorativeFlower, Hedge, Vegetable) ← nameEn 기반 추론.
 *   - Plant.growthDays / growthDaysWithGrow / requiresHydration: 본 페이지에는
 *     row-level 명시 없음 (페이지 산문에 일부 정보). Zod 에서 default 값으로 두고
 *     loader 가 외부 데이터(공식 가이드/운영 매핑)로 보강.
 *   - PlantVariant: 본 단계에서는 nested variants 빈 배열 (다른 표/색상 데이터는
 *     별도 단계 또는 loader 처리).
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/** SCHEMA §2.19 `plant.type` ENUM. */
export const PlantTypeEnum = z.enum([
  'BerryTree',
  'Wildflower',
  'SeashorFlower',
  'MountainFlower',
  'SkylandFlower',
  'DecorativeFlower',
  'Hedge',
  'Vegetable',
]);

/**
 * PlantVariant 힌트 — plant_variant 매핑용 (color/stage).
 * 본 단계에서는 빈 배열 default; 향후 단계에서 색상/stage 데이터 추가.
 */
const PlantVariantHintSchema = z.object({
  variantSlug: z.string().min(1),
  color: z.string().min(1),
  imageUrl: z.url().optional(),
});

export type PlantVariantHint = z.infer<typeof PlantVariantHintSchema>;

/**
 * Plant 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: items/<slug>.png 토큰 (예: "leppatree", "wildflowers", "bean").
 *   loader 의 plant.source_slug 1:1 주입.
 * - `nameEn`: Name 셀 영문명 (예: "Leppa tree", "Wildflowers").
 * - `type`: SCHEMA ENUM. nameEn 기반 추론 (X tree → BerryTree, X hedge → Hedge,
 *   Wildflowers → Wildflower 등).
 * - `growthDays` / `growthDaysWithGrow` / `requiresHydration`: 본 페이지에 명시
 *   없음, Zod default. loader 가 보강.
 * - `imageUrl`: items/<slug>.png 절대 URL.
 * - `variants`: 본 단계 빈 배열, 향후 보강.
 */
export const PlantSchema = z
  .object({
    slug: z.string().min(1),
    nameEn: z.string().min(1),
    type: PlantTypeEnum,
    growthDays: z.number().int().positive().default(1),
    growthDaysWithGrow: z.number().int().positive().default(1),
    requiresHydration: z.boolean().default(false),
    variants: z.array(PlantVariantHintSchema).default([]),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type PlantInput = z.infer<typeof PlantSchema>;
