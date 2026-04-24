/**
 * Food 스크래퍼 입력 스키마 (SCHEMA §2.8 음식 & 맛).
 *
 * Serebii `/flavors.shtml` 파서가 HTML 에서 추출하는 "파싱 시점 엔티티" 계약.
 * Prisma `Food` 모델은 `item` 1:1 확장이므로 loader 가 `itemSlug` 로 item FK 를
 * 해소한 뒤 `food` 레코드를 생성한다.
 *
 * 파싱 시점 SSoT 필드
 * - `itemSlug`: `<img src="items/<slug>.png">` 에서 추출한 Serebii URL 토큰.
 *   loader 가 item 테이블과의 조인 natural key 로 사용 — Item 파서와 동일 slug.
 * - `itemNameEn`: Name 컬럼 영문명. 감사·크로스체크용 (item.nameEn 과 일치해야 함).
 * - `flavor`: `<h3>` 카테고리 헤더에서 추출. "No Flavor" 는 ENUM `None` 으로 정규화.
 * - `ppRestore`: Description 텍스트 heuristic — `a bit of PP`/`some PP`/`a lot of PP`.
 *   특수 음식(음료·소스 류) 은 PP 복원 문구가 없어 undefined.
 * - `moveBoost`: Description 텍스트 heuristic — `Powers up <move>`.
 *   복원-type 음식(생재료/베리) 은 boost 가 없어 undefined.
 *
 * 왜 ppRestore 와 moveBoost 가 모두 optional 인가:
 *   SCHEMA §2.8 은 `pp_restore` 필수·`move_boost` nullable 로 정의하지만, 실제
 *   /flavors.shtml 에는 둘 다 가지지 않는 특수 음식(Fresh Water/Roserade Tea/
 *   Soda Pop/Chili sauce/Moomoo Milk Coffee/Curry and rice) 이 존재한다. 파서는
 *   실측 현실을 우선하고, loader 가 Prisma 제약 위반 여부를 결정(예: pp_restore
 *   = null 허용으로 스키마 완화, 또는 특수 음식 별도 테이블 분리).
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/** SCHEMA §2.8 `flavor` ENUM. "No Flavor" h3 → `None` 으로 매핑. */
const FlavorEnum = z.enum(['None', 'Bitter', 'Dry', 'Sour', 'Spicy', 'Sweet']);

/** SCHEMA §2.8 `pp_restore` ENUM. Description 텍스트에서 heuristic 추출. */
const PpRestoreEnum = z.enum(['little', 'some', 'lot']);

/**
 * SCHEMA §2.8 `move_boost` ENUM. Prisma `@map("Water Gun")` 규칙 대비 코드 값은
 * 언더스코어 사용(ItemCategory `Key_Items` 와 동일 정책).
 */
const MoveBoostEnum = z.enum(['Leafage', 'Water_Gun', 'Cut', 'Rock_Smash']);

/**
 * Food 파서 출력 스키마.
 *
 * 사용 예:
 *
 * ```ts
 * const food = FoodSchema.parse({
 *   itemSlug: 'simplesalad',
 *   itemNameEn: 'Simple salad',
 *   flavor: 'None',
 *   moveBoost: 'Leafage',
 *   ...buildSourceMetadata({
 *     sourceSite: 'serebii',
 *     sourceUrl: 'https://www.serebii.net/pokemonpokopia/flavors.shtml',
 *   }),
 * });
 * ```
 */
export const FoodSchema = z
  .object({
    itemSlug: z.string().min(1),
    itemNameEn: z.string().min(1),
    flavor: FlavorEnum,
    ppRestore: PpRestoreEnum.optional(),
    moveBoost: MoveBoostEnum.optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type FoodInput = z.infer<typeof FoodSchema>;
