/**
 * Habitat(서식지) 스크래퍼 입력 스키마 (SCHEMA §2.5).
 *
 * Serebii `/habitats/` 목록과 각 서식지 상세 페이지에서 파싱 가능한 필드만 계약.
 * i18n(HabitatI18n)과 복합 PK 조인(HabitatPokemon)은 별도 단계에서 처리.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * Habitat 파서 출력 스키마.
 *
 * - `habitatNo`: #001~#209. 이벤트 서식지는 null (SCHEMA §2.5)
 * - `nameEn`: Serebii 영문 원본명. i18n 으로 확장
 * - `isEvent`: 이벤트 전용 서식지 여부
 * - `pokemonSlugs`: 해당 서식지에 등장하는 포켓몬 식별 키 목록. loader 가
 *   pokemon 테이블과 조인해 HabitatPokemon 레코드로 확장
 *
 * 사용 예:
 *
 * ```ts
 * const habitat = HabitatSchema.parse({
 *   habitatNo: 1,
 *   nameEn: 'Grassland',
 *   isEvent: false,
 *   pokemonSlugs: ['pikachu', 'bulbasaur'],
 *   imageUrl: 'https://www.serebii.net/pokemonpokopia/habitats/001.png',
 *   ...buildSourceMetadata({
 *     sourceSite: 'serebii',
 *     sourceUrl: 'https://www.serebii.net/pokemonpokopia/habitat/001.shtml',
 *   }),
 * });
 * ```
 */
export const HabitatSchema = z
  .object({
    habitatNo: z.number().int().positive().nullable(),
    nameEn: z.string().min(1),
    isEvent: z.boolean().default(false),
    pokemonSlugs: z.array(z.string().min(1)).default([]),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type HabitatInput = z.infer<typeof HabitatSchema>;
