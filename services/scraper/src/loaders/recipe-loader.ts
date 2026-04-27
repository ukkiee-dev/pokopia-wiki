/**
 * RecipeLoader — CookingRecipe / CraftingRecipe + ingredients (item FK).
 * (Phase 9 선결 코드, Batch C-3)
 *
 * SCHEMA §2.3 매핑:
 *   - CookingRecipe: id + resultItemId FK + mealCategory + bonusSpecialtyId(nullable)
 *     + 감사. ingredients (CookingIngredient: recipeId + itemId + quantity + role)
 *     composite PK.
 *   - CraftingRecipe: id + resultItemId FK + resultQuantity + unlockMethod + 감사.
 *     ingredients (CraftingIngredient: recipeId + itemId + quantity) composite PK.
 *
 * 처리 단계 (3-pass):
 *   1. 모든 itemSlug (result + ingredients) 룩업 → item FK 매핑
 *   2. (CookingRecipe 만) bonusSpecialtyNameEn → Specialty.sourceSlug 룩업
 *   3. Recipe 본 entity upsert + ingredients deleteMany/createMany replace
 */

import type {
  CookingRecipeInput,
  CraftingRecipeInput,
  PrismaClient,
} from '@pokopia-wiki/shared';

import { lookupItemIds } from './item-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type SpecialtyLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type RecipeLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type CookingIngredientModel = {
  deleteMany: (args: { where: { recipeId: number } }) => Promise<{ count: number }>;
  createMany: (args: {
    data: ReadonlyArray<{ recipeId: number; itemId: number; quantity: number; role: string }>;
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
};

type CraftingIngredientModel = {
  deleteMany: (args: { where: { recipeId: number } }) => Promise<{ count: number }>;
  createMany: (args: {
    data: ReadonlyArray<{ recipeId: number; itemId: number; quantity: number }>;
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
};

type CookingRecipePayload = {
  resultItemId: number;
  mealCategory: CookingRecipeInput['mealCategory'];
  bonusSpecialtyId: number | null;
  sourceUrl: string;
  scrapedAt: Date;
};

type CraftingRecipePayload = {
  resultItemId: number;
  resultQuantity: number;
  unlockMethod: string;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * CookingRecipe + CookingIngredient 일괄 처리.
 *
 * Recipe 의 sourceSlug 자연키: parser 가 명시 (예: "cooking-applesalad").
 * Phase 8 단계 8 commit 에서 슬러그 필드 추가됨.
 */
export async function loadCookingRecipe(
  prisma: Pick<PrismaClient, 'cookingRecipe' | 'cookingIngredient' | 'item' | 'specialty'>,
  inputs: ReadonlyArray<CookingRecipeInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  // (1) Item 룩업
  const itemSlugs = [
    ...inputs.map((input) => input.resultItemSlug),
    ...inputs.flatMap((input) => input.ingredients.map((ing) => ing.itemSlug)),
  ];
  const itemIds = await lookupItemIds(prisma, itemSlugs);

  // (2) Specialty 룩업 (bonusSpecialtyNameEn → slug 정규화 후 lookup)
  const specialtySlugs = inputs
    .map((input) => input.bonusSpecialtyNameEn)
    .filter((name): name is string => name !== undefined)
    .map((name) => normalizeSpecialtySlug(name));
  const specialtyRows = specialtySlugs.length > 0
    ? await (prisma.specialty as unknown as SpecialtyLookupModel).findMany({
      where: { sourceSlug: { in: [...new Set(specialtySlugs)] } },
      select: { id: true, sourceSlug: true },
    })
    : [];
  const specialtySlugToId = new Map(specialtyRows.map((row) => [row.sourceSlug, row.id]));

  // (3) Recipe 본 entity upsert
  const items: Array<{
    sourceSlug: string;
    payload: CookingRecipePayload;
    metadata: CookingRecipeInput;
  }> = [];
  const failures: Array<{ sourceSlug: string; error: string }> = [];
  // Recipe slug 결정: resultItemSlug 기반 (예: "cooking-applesalad")
  const recipeSlugMap = new Map<string, CookingRecipeInput>();

  for (const input of inputs) {
    const resultItemId = itemIds.get(input.resultItemSlug);
    if (resultItemId === undefined) {
      failures.push({
        sourceSlug: `cooking-${input.resultItemSlug}`,
        error: `result Item "${input.resultItemSlug}" 미발견 — Recipe 건너뜀`,
      });
      continue;
    }
    const bonusSpecialtyId =
      input.bonusSpecialtyNameEn !== undefined
        ? specialtySlugToId.get(normalizeSpecialtySlug(input.bonusSpecialtyNameEn)) ?? null
        : null;
    const sourceSlug = `cooking-${input.resultItemSlug}`;
    recipeSlugMap.set(sourceSlug, input);
    items.push({
      sourceSlug,
      payload: {
        resultItemId,
        mealCategory: input.mealCategory,
        bonusSpecialtyId,
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
      },
      metadata: input,
    });
  }

  const baseResult = await upsertBySourceSlug(prisma.cookingRecipe as never, items);

  // (4) Recipe ID 룩업 → ingredients replace
  const recipeRows = await (
    prisma.cookingRecipe as unknown as RecipeLookupModel
  ).findMany({
    where: { sourceSlug: { in: [...recipeSlugMap.keys()] } },
    select: { id: true, sourceSlug: true },
  });
  const recipeSlugToId = new Map(recipeRows.map((row) => [row.sourceSlug, row.id]));

  for (const [sourceSlug, input] of recipeSlugMap) {
    const recipeId = recipeSlugToId.get(sourceSlug);
    if (recipeId === undefined) continue;
    const ingredientRows: Array<{ recipeId: number; itemId: number; quantity: number; role: string }> = [];
    for (const ing of input.ingredients) {
      const itemId = itemIds.get(ing.itemSlug);
      if (itemId === undefined) {
        failures.push({
          sourceSlug,
          error: `ingredient "${ing.itemSlug}" 미발견 — 건너뜀`,
        });
        continue;
      }
      ingredientRows.push({
        recipeId,
        itemId,
        quantity: ing.quantity,
        role: ing.role,
      });
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await (prisma.cookingIngredient as unknown as CookingIngredientModel).deleteMany({
        where: { recipeId },
      });
      if (ingredientRows.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await (prisma.cookingIngredient as unknown as CookingIngredientModel).createMany({
          data: ingredientRows,
          skipDuplicates: true,
        });
      }
    } catch (error: unknown) {
      failures.push({
        sourceSlug,
        error: `CookingIngredient replace 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    stats: { ...baseResult.stats, failed: baseResult.stats.failed + failures.length },
    failures: [...baseResult.failures, ...failures],
  };
}

/**
 * CraftingRecipe + CraftingIngredient 일괄 처리.
 */
export async function loadCraftingRecipe(
  prisma: Pick<PrismaClient, 'craftingRecipe' | 'craftingIngredient' | 'item'>,
  inputs: ReadonlyArray<CraftingRecipeInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const itemSlugs = [
    ...inputs.map((input) => input.resultItemSlug),
    ...inputs.flatMap((input) => input.ingredients.map((ing) => ing.itemSlug)),
  ];
  const itemIds = await lookupItemIds(prisma, itemSlugs);

  const items: Array<{
    sourceSlug: string;
    payload: CraftingRecipePayload;
    metadata: CraftingRecipeInput;
  }> = [];
  const failures: Array<{ sourceSlug: string; error: string }> = [];
  const recipeSlugMap = new Map<string, CraftingRecipeInput>();

  for (const input of inputs) {
    const resultItemId = itemIds.get(input.resultItemSlug);
    if (resultItemId === undefined) {
      failures.push({
        sourceSlug: `crafting-${input.resultItemSlug}`,
        error: `result Item "${input.resultItemSlug}" 미발견 — Recipe 건너뜀`,
      });
      continue;
    }
    const sourceSlug = `crafting-${input.resultItemSlug}`;
    recipeSlugMap.set(sourceSlug, input);
    items.push({
      sourceSlug,
      payload: {
        resultItemId,
        resultQuantity: input.resultQuantity,
        unlockMethod: input.unlockMethod,
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
      },
      metadata: input,
    });
  }

  const baseResult = await upsertBySourceSlug(prisma.craftingRecipe as never, items);

  const recipeRows = await (
    prisma.craftingRecipe as unknown as RecipeLookupModel
  ).findMany({
    where: { sourceSlug: { in: [...recipeSlugMap.keys()] } },
    select: { id: true, sourceSlug: true },
  });
  const recipeSlugToId = new Map(recipeRows.map((row) => [row.sourceSlug, row.id]));

  for (const [sourceSlug, input] of recipeSlugMap) {
    const recipeId = recipeSlugToId.get(sourceSlug);
    if (recipeId === undefined) continue;
    const ingredientRows: Array<{ recipeId: number; itemId: number; quantity: number }> = [];
    for (const ing of input.ingredients) {
      const itemId = itemIds.get(ing.itemSlug);
      if (itemId === undefined) {
        failures.push({
          sourceSlug,
          error: `ingredient "${ing.itemSlug}" 미발견 — 건너뜀`,
        });
        continue;
      }
      ingredientRows.push({ recipeId, itemId, quantity: ing.quantity });
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await (prisma.craftingIngredient as unknown as CraftingIngredientModel).deleteMany({
        where: { recipeId },
      });
      if (ingredientRows.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await (prisma.craftingIngredient as unknown as CraftingIngredientModel).createMany({
          data: ingredientRows,
          skipDuplicates: true,
        });
      }
    } catch (error: unknown) {
      failures.push({
        sourceSlug,
        error: `CraftingIngredient replace 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    stats: { ...baseResult.stats, failed: baseResult.stats.failed + failures.length },
    failures: [...baseResult.failures, ...failures],
  };
}

function normalizeSpecialtySlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/gu, '-');
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
