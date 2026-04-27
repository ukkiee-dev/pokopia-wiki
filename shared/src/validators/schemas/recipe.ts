/**
 * 레시피(요리/제작) 스크래퍼 입력 스키마 (SCHEMA §2.3).
 *
 * `CookingRecipe` 와 `CraftingRecipe` 는 테이블·FK가 분리되어 있으나 수집 출처가
 * 동일(Serebii `/cooking/` / `/crafting/`)하고 파서 구조도 유사하므로 한 파일에
 * 묶는다. 어느 쪽이든 결과 아이템은 파싱 시점에는 영문 이름만 확보 가능하므로
 * `resultItemNameEn` 으로 느슨히 유지 — loader 가 item 조회 후 FK 해소.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/** Prisma `MealCategory` 동기. SCHEMA §2.3 */
const MealCategoryEnum = z.enum(['Salad', 'Soup', 'Bread', 'Steak']);

/** Prisma `CookingRole` 동기. SCHEMA §2.3 */
const CookingRoleEnum = z.enum(['main', 'sub']);

/**
 * 공통 재료 힌트.
 * 파서는 재료 아이템의 URL slug 와 영문명을 함께 제공한다. slug 는 loader 의
 * item FK 해소에 1:1 natural key 로 쓰이고, nameEn 은 감사/번역 추적용.
 */
const IngredientHintSchema = z.object({
  itemSlug: z.string().min(1),
  itemNameEn: z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

/** 요리 재료 — `role`(main/sub) 구분 추가 */
const CookingIngredientHintSchema = IngredientHintSchema.extend({
  role: CookingRoleEnum,
});

/**
 * CookingRecipe 파서 출력 스키마.
 *
 * 사용 예:
 *
 * ```ts
 * const recipe = CookingRecipeSchema.parse({
 *   resultItemNameEn: 'Apple Salad',
 *   mealCategory: 'Salad',
 *   bonusSpecialtyNameEn: 'Grass',
 *   ingredients: [
 *     { itemNameEn: 'Apple', quantity: 2, role: 'main' },
 *     { itemNameEn: 'Leek', quantity: 1, role: 'sub' },
 *   ],
 *   ...buildSourceMetadata({
 *     sourceSite: 'serebii',
 *     sourceUrl: 'https://www.serebii.net/pokemonpokopia/cooking/',
 *   }),
 * });
 * ```
 */
export const CookingRecipeSchema = z
  .object({
    resultItemSlug: z.string().min(1),
    resultItemNameEn: z.string().min(1),
    mealCategory: MealCategoryEnum,
    bonusSpecialtyNameEn: z.string().min(1).optional(),
    ingredients: z.array(CookingIngredientHintSchema).default([]),
  })
  .extend(SourceMetadataSchema.shape);

export type CookingRecipeInput = z.infer<typeof CookingRecipeSchema>;

/**
 * CraftingRecipe 파서 출력 스키마.
 *
 * 사용 예:
 *
 * ```ts
 * const recipe = CraftingRecipeSchema.parse({
 *   resultItemNameEn: 'Wooden Table',
 *   resultQuantity: 1,
 *   unlockMethod: 'Default',
 *   ingredients: [{ itemNameEn: 'Wood', quantity: 3 }],
 *   ...buildSourceMetadata({
 *     sourceSite: 'serebii',
 *     sourceUrl: 'https://www.serebii.net/pokemonpokopia/crafting/',
 *   }),
 * });
 * ```
 */
export const CraftingRecipeSchema = z
  .object({
    resultItemSlug: z.string().min(1),
    resultItemNameEn: z.string().min(1),
    resultQuantity: z.number().int().positive().default(1),
    unlockMethod: z.string().min(1),
    ingredients: z.array(IngredientHintSchema).default([]),
  })
  .extend(SourceMetadataSchema.shape);

export type CraftingRecipeInput = z.infer<typeof CraftingRecipeSchema>;
