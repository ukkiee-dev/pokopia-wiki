/**
 * Item 스크래퍼 입력 스키마 (CRAWLING_STRATEGY §27.1 / SCHEMA §2.2).
 *
 * Prisma `Item` 모델 중 파싱 시점에 수집 가능한 필드만 계약한다.
 * i18n(ItemI18n), 1:1 확장(Food / LostRelic / TradeValuation), 획득처(ItemLocation)는
 * 별도 파서/loader 단계에서 다루므로 본 스키마는 아이템 본체 + 가벼운 `locations`/`tags`
 * 힌트 배열만 허용한다.
 *
 * `category` / `tags` / `locations.method` 는 Prisma $Enums 와 동일 상수 문자열을 사용.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * Prisma `ItemCategory` 와 동일한 리터럴 집합.
 * $Enums.ItemCategory 상수는 schema.prisma 의 `@map("Key Items")` 대신 코드 값
 * `Key_Items`(언더스코어)를 노출하므로 본 스키마도 동일 토큰을 사용한다.
 */
const ItemCategoryEnum = z.enum([
  'Materials',
  'Food',
  'Furniture',
  'Misc',
  'Outdoor',
  'Utilities',
  'Nature',
  'Buildings',
  'Blocks',
  'Kits',
  'Key_Items',
]);

/** Prisma `ItemTagName` 동기. SCHEMA §2.2 */
const ItemTagEnum = z.enum(['Decoration', 'Food', 'Relaxation', 'Road', 'Toy']);

/** Prisma `ItemLocationMethod` 동기. SCHEMA §2.2 */
const ItemLocationMethodEnum = z.enum([
  'Natural',
  'Craft',
  'Shop',
  'Trade',
  'Dream_Island',
  'Build_Kit',
  'Relic_Appraisal',
  'Pokemon_Center',
  'Litter',
]);

/**
 * ItemLocation 힌트. Prisma `ItemLocation` 모델과 달리 `locationId` FK 대신
 * 파싱 시점의 지역 이름(`locationName`)을 보존한다 — loader 가 name→id 해소.
 */
const ItemLocationHintSchema = z.object({
  method: ItemLocationMethodEnum,
  locationName: z.string().min(1).optional(),
  detail: z.string().optional(),
});

/**
 * Item 파서 출력 스키마.
 *
 * 사용 예 (§27.1):
 *
 * ```ts
 * const item = ItemSchema.parse({
 *   nameEn: 'Apple',
 *   description: 'A sweet red fruit.',
 *   category: 'Food',
 *   tags: ['Food'],
 *   locations: [{ method: 'Natural', locationName: 'Grassland' }],
 *   imageUrl: 'https://www.serebii.net/pokemonpokopia/items/apple.png',
 *   ...buildSourceMetadata({
 *     sourceSite: 'serebii',
 *     sourceUrl: 'https://www.serebii.net/pokemonpokopia/items/',
 *   }),
 * });
 * ```
 */
export const ItemSchema = z
  .object({
    nameEn: z.string().min(1),
    description: z.string().default(''),
    category: ItemCategoryEnum,
    tags: z.array(ItemTagEnum).default([]),
    locations: z.array(ItemLocationHintSchema).default([]),
    imageUrl: z.url().optional(),
    isPaintable: z.boolean().default(false),
    isPatternable: z.boolean().default(false),
    isMagnetRiseOnly: z.boolean().default(false),
  })
  .extend(SourceMetadataSchema.shape);

export type ItemInput = z.infer<typeof ItemSchema>;
