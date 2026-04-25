/**
 * 쓰레기 보상 도메인 스크래퍼 입력 스키마 (SCHEMA §2.27 pokemon_litter_reward).
 *
 * - PokemonLitterRewardSchema: `/litter.shtml` 의 34 reward (Phase 8 단계 35)
 *
 * SCHEMA §2.27 와의 매핑:
 *   - PokemonLitterReward.pokemonId (FK) ← pokemonSlug → loader 가 pokemon FK 해소.
 *   - PokemonLitterReward.itemId (FK) ← itemSlug → loader.
 *   - PokemonLitterReward.habitatId (FK nullable) ← 본 페이지에 habitat 정보
 *     없음, null (= 모든 서식지 공통).
 *   - PokemonLitterReward.dropRate (FLOAT nullable) ← 본 페이지에 명시 없음, null.
 *   - PK: (pokemonId, itemId, habitatId) — Prisma 는 autoincrement id +
 *     @@unique 로 구현 (habitat_id nullable 제약).
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * PokemonLitterReward 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `litter-reward-<pokemonSlug>-<itemSlug>` (예:
 *   "litter-reward-venusaur-leaf"). pokemon + item 조합으로 unique
 *   (페이지에 habitat 미명시 → null 단일 공간).
 * - `pokemonSlug`: pokedex/<slug>.shtml href 토큰 (예: "venusaur").
 * - `pokemonNameEn`: 영문 포켓몬명.
 * - `pokedexNo`: "#NNN" 정수 (포코피아 도감 번호).
 * - `itemSlug`: items/<slug>.png 토큰 (예: "leaf", "vinerope").
 * - `itemNameEn`: Item 셀 영문명 (img alt + br + 텍스트).
 * - `habitatSlug`: 본 페이지에 row-level habitat 정보 없어 optional (null = 공통).
 * - `dropRate`: 본 페이지에 명시 없음 (loader 보강).
 */
export const PokemonLitterRewardSchema = z
  .object({
    slug: z.string().min(1),
    pokemonSlug: z.string().min(1),
    pokemonNameEn: z.string().min(1),
    pokedexNo: z.number().int().positive(),
    itemSlug: z.string().min(1),
    itemNameEn: z.string().min(1),
    habitatSlug: z.string().min(1).optional(),
    dropRate: z.number().min(0).max(1).optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type PokemonLitterRewardInput = z.infer<typeof PokemonLitterRewardSchema>;
