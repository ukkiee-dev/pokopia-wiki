/**
 * 유니크 포켓몬 보강 스키마 (SCHEMA §2.1 pokemon 의 unique-variant 보강).
 *
 * - UniquePokemonPatchSchema: `/uniquepokemon.shtml` 의 4 unique pokemon
 *   (Professor Tangrowth/Peakychu/Mosslax/Smearguru) 을 위한 슬림 입력
 *   (Phase 8 단계 26)
 *
 * 본 스키마는 새 엔티티가 아니라 기존 `pokemon` 의 description / image / unique
 * 마킹을 보강하는 magnet-rise 단계와 동일 패턴이다. loader 가 본 파서가 산출한
 * slug 목록으로 `pokemon.sourceSlug` 매칭 → description/image 보강 + 별도 unique
 * 플래그 컬럼이 있다면 true 마킹.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * UniquePokemonPatch 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `<name>.png` 의 파일명 토큰 (예: "peakychu", "mosslax",
 *   "professortangrowth"). loader 가 pokemon 본 entity 와 1:1 매칭.
 * - `nameEn`: 섹션 h2 텍스트 (예: "Peakychu", "Mosslax").
 * - `descriptionEn`: 섹션 본문 단락들의 join. variantOf 정보(예: "variant of
 *   the Pokémon Snorlax")가 산문 안에 포함되어 있어 loader 가 이후 추출 가능.
 * - `imageUrl`: 섹션의 picturetd img src 절대 URL.
 */
export const UniquePokemonPatchSchema = z
  .object({
    slug: z.string().min(1),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type UniquePokemonPatchInput = z.infer<typeof UniquePokemonPatchSchema>;
