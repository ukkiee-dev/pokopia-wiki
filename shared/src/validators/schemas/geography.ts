/**
 * Geography 도메인 스크래퍼 입력 스키마 (SCHEMA §2.4 / §2.5).
 *
 * - HabitatSchema : `/habitats/` 목록 + 각 서식지 상세 페이지
 * - LocationSchema: `/locations.shtml` 루트 + 각 지역 상세 페이지 (Phase 8 단계 3)
 *
 * i18n(*I18n) 분리 적재와 복합 PK 조인은 loader 의 책임. 본 파일은 파서가 출력하는
 * "스크래퍼 입력 계약" 만 정의한다.
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
    slug: z.string().min(1),
    habitatNo: z.number().int().positive().nullable(),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
    isEvent: z.boolean().default(false),
    pokemonSlugs: z.array(z.string().min(1)).default([]),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type HabitatInput = z.infer<typeof HabitatSchema>;

/**
 * Location 타입 ENUM — Prisma `LocationType` 과 값 일치.
 *
 * `Dream Island` / `Cloud Island` 는 공백 포함 — Prisma 의 `@map("Dream Island")`
 * 로 DB 저장값과 일치. TypeScript enum 토큰(`Dream_Island`) 이 아니라 **DB 값**을
 * 쓰는 이유: parser → loader 경로에서 추가 변환을 피하기 위해.
 *
 * TypeScript 타입 재export 금지: Prisma client 가 이미 같은 이름으로 `LocationType`
 * 을 최상위 barrel 로 내보낸다. 중복 export 충돌 회피를 위해 Zod 쪽은 enum 스키마
 * 로만 제공하고, 타입은 `LocationInput['type']` 로 파생해 사용한다.
 */
export const LocationTypeEnum = z.enum(['Main', 'Dream Island', 'Cloud Island', 'Sub']);

/**
 * Location 파서 출력 스키마 (SCHEMA §2.4).
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: Serebii URL 토큰 (`witheredwastelands`, `cloudisland`). loader 가
 *   Prisma `Location.sourceSlug` 에 1:1 주입하는 natural key.
 * - `nameEn`: Serebii 영문 원본명. loader 가 `location_i18n(locale='en')` 로 분리.
 * - `type`: Main / Dream Island / Cloud Island / Sub — 로드맵 Phase 8 Task 8.7
 *   (Dream/Cloud Island 전용 페이지) 와 본 단계(주요 지역)가 동일 스키마를 공유.
 * - `descriptionEn`: 지역 설명. 루트 페이지에는 없고 상세 페이지에서만 채워짐.
 * - `imageUrl`: Serebii 지역 아이콘 URL. EntityImage polymorphic 로 분리 적재.
 * - `parentSlug`: Sub 타입 전용. 상위 지역 slug. loader 가 `parentId` 로 해소.
 *
 * 사용 예:
 *
 * ```ts
 * const location = LocationSchema.parse({
 *   slug: 'witheredwastelands',
 *   nameEn: 'Withered Wastelands',
 *   type: 'Main',
 *   imageUrl: 'https://www.serebii.net/pokemonpokopia/locations/witheredwastelands.png',
 *   ...buildSourceMetadata({
 *     sourceSite: 'serebii',
 *     sourceUrl: 'https://www.serebii.net/pokemonpokopia/locations.shtml',
 *   }),
 * });
 * ```
 */
export const LocationSchema = z
  .object({
    slug: z.string().min(1),
    nameEn: z.string().min(1),
    type: LocationTypeEnum,
    descriptionEn: z.string().min(1).optional(),
    imageUrl: z.url().optional(),
    parentSlug: z.string().min(1).optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type LocationInput = z.infer<typeof LocationSchema>;
