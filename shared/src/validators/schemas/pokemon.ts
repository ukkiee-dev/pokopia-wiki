/**
 * Pokemon 스크래퍼 입력 스키마 (CRAWLING_STRATEGY §27.1 / SCHEMA §2.1).
 *
 * 본 스키마는 파서가 HTML 파싱 직후 조립하는 "스크래퍼 입력 계약"을 정의한다.
 * Prisma `Pokemon` 모델의 감사 컬럼(id / contentHash / createdAt / updatedAt / sourceSlug)
 * 과 loader 단계에서 결정되는 FK(basedOnSpeciesId)는 본 스키마의 책임이 아니다.
 *
 * 파싱 시점 SSoT 필드
 * - `pokedexNo`: #001~#199+. 이벤트/고유 캐릭터는 null (SCHEMA §2.1)
 * - `nameEn`: Serebii 영문 원본명. i18n(PokemonI18n)으로 확장 적재
 * - `imageUrl`: Serebii 이미지 URL (entity_image 통합 전 파싱 시점 원본 보존)
 * - `specialties`: 스페셜티 이름 배열 (loader 가 name→id 해소)
 * - `isEvent` / `isUniqueCharacter` / `isLegendary`: Serebii 리스트/상세 플래그
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * Pokemon 파서 출력 스키마.
 *
 * 사용 예 (§27.1):
 *
 * ```ts
 * const pokemon = PokemonSchema.parse({
 *   pokedexNo: 25,
 *   nameEn: 'Pikachu',
 *   imageUrl: 'https://www.serebii.net/pokemonpokopia/pokemon/025.png',
 *   specialties: ['Electric'],
 *   ...buildSourceMetadata({
 *     sourceSite: 'serebii',
 *     sourceUrl: 'https://www.serebii.net/pokemonpokopia/pokemon/025.shtml',
 *   }),
 * });
 * ```
 */
export const PokemonSchema = z
  .object({
    pokedexNo: z.number().int().positive().nullable(),
    nameEn: z.string().min(1),
    imageUrl: z.url().optional(),
    specialties: z.array(z.string().min(1)).default([]),
    isEvent: z.boolean().default(false),
    isUniqueCharacter: z.boolean().default(false),
    isLegendary: z.boolean().default(false),
  })
  .extend(SourceMetadataSchema.shape);

export type PokemonInput = z.infer<typeof PokemonSchema>;
