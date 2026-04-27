/**
 * 포켓몬 센터 도메인 스크래퍼 입력 스키마 (SCHEMA §2.13).
 *
 * - PokemonCenterSchema: `/pokemoncenter.shtml` 의 area-별 재건 요구 표
 *   (Phase 8 단계 17)
 *
 * SCHEMA §2.13 와의 매핑:
 *   - PokemonCenter.locationId ← parser 의 locationSlug → loader FK 해소.
 *   - PokemonCenter.requiredEnvLevel ← 페이지 산문 "Environment Level 3" (모든
 *     행 동일). 본 파서는 prose 추출 또는 default 값으로 주입.
 *   - PokemonCenter.requiredPokemonCount ← "Pokémon Required" 셀 정수.
 *   - PokemonCenterMaterial ← Requirements 셀의 `<br>` 분리 라인. loader 가 item
 *     FK + (centerId, itemId) 복합 PK 로 매핑.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * Pokémon Center material 힌트.
 * Requirements 셀 라인 "10 Lumber" 같은 형식에서 추출.
 */
const PokemonCenterMaterialSchema = z.object({
  itemNameEn: z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

export type PokemonCenterMaterialHint = z.infer<typeof PokemonCenterMaterialSchema>;

/**
 * PokemonCenter 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `pokemon-center-<locationSlug>` (예: "pokemon-center-witheredwastelands").
 * - `locationSlug`: Area 셀 텍스트 slugify (예: "Withered Wastelands" →
 *   "witheredwastelands"). loader 가 location FK 해소.
 * - `locationNameEn`: Area 셀 raw 텍스트 (감사용).
 * - `requiredEnvLevel`: 페이지 산문 "Environment Level 3" 에서 추출, 기본 3
 *   (모든 area 동일). loader 가 area-별 차이 발견 시 보강.
 * - `requiredPokemonCount`: Pokémon Required 셀 정수.
 * - `materials`: Requirements 셀의 `<br>` 분리 라인 → `<qty> <itemNameEn>` 정규식.
 */
export const PokemonCenterSchema = z
  .object({
    slug: z.string().min(1),
    locationSlug: z.string().min(1),
    locationNameEn: z.string().min(1),
    requiredEnvLevel: z.number().int().min(1).max(10),
    requiredPokemonCount: z.number().int().positive(),
    materials: z.array(PokemonCenterMaterialSchema).default([]),
  })
  .extend(SourceMetadataSchema.shape);

export type PokemonCenterInput = z.infer<typeof PokemonCenterSchema>;
