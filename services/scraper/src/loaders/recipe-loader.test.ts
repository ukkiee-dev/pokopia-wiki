/**
 * RecipeLoader 단위 테스트 — Phase 9 선결 코드, Batch C-3.
 */

import { describe, expect, it } from 'vitest';

import type { CookingRecipeInput, CraftingRecipeInput } from '@pokopia-wiki/shared';

import { loadCookingRecipe, loadCraftingRecipe } from './recipe-loader.js';

class InMemoryItemModel {
  rows = new Map<string, { id: number; sourceSlug: string }>();
  private nextId = 1;
  add(slug: string): number {
    const id = this.nextId++;
    this.rows.set(slug, { id, sourceSlug: slug });
    return id;
  }
  async findMany(args: { where: { sourceSlug: { in: string[] } }; select: { id: true; sourceSlug: true } }): Promise<ReadonlyArray<{ id: number; sourceSlug: string }>> {
    return [...this.rows.values()].filter((row) => args.where.sourceSlug.in.includes(row.sourceSlug));
  }
}

class InMemorySpecialtyModel {
  rows = new Map<string, { id: number; sourceSlug: string }>();
  private nextId = 1;
  add(slug: string): number {
    const id = this.nextId++;
    this.rows.set(slug, { id, sourceSlug: slug });
    return id;
  }
  async findMany(args: { where: { sourceSlug: { in: string[] } }; select: { id: true; sourceSlug: true } }): Promise<ReadonlyArray<{ id: number; sourceSlug: string }>> {
    return [...this.rows.values()].filter((row) => args.where.sourceSlug.in.includes(row.sourceSlug));
  }
}

class InMemoryRecipeModel {
  rows = new Map<string, { id: number; sourceSlug: string; contentHash: string; resultItemId: number; bonusSpecialtyId: number | null }>();
  private nextId = 1;
  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }
  async create(args: { data: { sourceSlug: string; contentHash: string; resultItemId: number; bonusSpecialtyId?: number | null } }): Promise<unknown> {
    const id = this.nextId++;
    this.rows.set(args.data.sourceSlug, {
      id,
      sourceSlug: args.data.sourceSlug,
      contentHash: args.data.contentHash,
      resultItemId: args.data.resultItemId,
      bonusSpecialtyId: args.data.bonusSpecialtyId ?? null,
    });
    return { id };
  }
  async update(args: { where: { sourceSlug: string }; data: { contentHash: string } }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, { ...existing, contentHash: args.data.contentHash });
    return existing;
  }
  async findMany(args: { where: { sourceSlug: { in: string[] } }; select: { id: true; sourceSlug: true } }): Promise<ReadonlyArray<{ id: number; sourceSlug: string }>> {
    return [...this.rows.values()].filter((row) => args.where.sourceSlug.in.includes(row.sourceSlug));
  }
}

class InMemoryIngredientModel {
  rows: Array<{ recipeId: number; itemId: number; quantity: number; role?: string }> = [];
  async deleteMany(args: { where: { recipeId: number } }): Promise<{ count: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.recipeId !== args.where.recipeId);
    return { count: before - this.rows.length };
  }
  async createMany(args: { data: ReadonlyArray<{ recipeId: number; itemId: number; quantity: number; role?: string }>; skipDuplicates?: boolean }): Promise<{ count: number }> {
    for (const row of args.data) this.rows.push({ ...row });
    return { count: args.data.length };
  }
}

const META = {
  sourceSite: 'serebii' as const,
  sourceUrl: 'https://www.serebii.net/pokemonpokopia/cooking/',
  scrapedAt: '2026-04-25T03:00:00.000Z',
  license: 'Test',
  copyrightHolder: 'Test',
  attribution: 'Test',
};

describe('loadCookingRecipe', () => {
  it('item + specialty FK 매핑 후 ingredients replace', async () => {
    const cookingRecipe = new InMemoryRecipeModel();
    const cookingIngredient = new InMemoryIngredientModel();
    const item = new InMemoryItemModel();
    const specialty = new InMemorySpecialtyModel();
    const appleId = item.add('apple');
    const leekId = item.add('leek');
    const saladId = item.add('applesalad');
    const grassId = specialty.add('grow');

    const inputs: CookingRecipeInput[] = [
      {
        resultItemSlug: 'applesalad',
        resultItemNameEn: 'Apple Salad',
        mealCategory: 'Salad',
        bonusSpecialtyNameEn: 'Grow',
        ingredients: [
          { itemSlug: 'apple', itemNameEn: 'Apple', quantity: 2, role: 'main' },
          { itemSlug: 'leek', itemNameEn: 'Leek', quantity: 1, role: 'sub' },
        ],
        ...META,
      },
    ];
    const result = await loadCookingRecipe(
      { cookingRecipe, cookingIngredient, item, specialty } as never,
      inputs,
    );
    expect(result.stats.inserted).toBe(1);
    const recipe = cookingRecipe.rows.get('cooking-applesalad');
    expect(recipe?.resultItemId).toBe(saladId);
    expect(recipe?.bonusSpecialtyId).toBe(grassId);
    expect(cookingIngredient.rows.filter((row) => row.recipeId === recipe?.id)).toHaveLength(2);
    expect(cookingIngredient.rows.some((row) => row.itemId === appleId && row.role === 'main')).toBe(true);
    expect(cookingIngredient.rows.some((row) => row.itemId === leekId && row.role === 'sub')).toBe(true);
  });

  it('result item 미발견 → failures (Recipe 자체 미생성)', async () => {
    const cookingRecipe = new InMemoryRecipeModel();
    const cookingIngredient = new InMemoryIngredientModel();
    const item = new InMemoryItemModel();
    const specialty = new InMemorySpecialtyModel();

    const inputs: CookingRecipeInput[] = [
      {
        resultItemSlug: 'unknown',
        resultItemNameEn: 'Unknown',
        mealCategory: 'Salad',
        ingredients: [],
        ...META,
      },
    ];
    const result = await loadCookingRecipe(
      { cookingRecipe, cookingIngredient, item, specialty } as never,
      inputs,
    );
    expect(result.stats.inserted).toBe(0);
    expect(result.stats.failed).toBe(1);
  });
});

describe('loadCraftingRecipe', () => {
  it('item FK 매핑 + ingredients replace', async () => {
    const craftingRecipe = new InMemoryRecipeModel();
    const craftingIngredient = new InMemoryIngredientModel();
    const item = new InMemoryItemModel();
    item.add('wood');
    const tableId = item.add('woodentable');

    const inputs: CraftingRecipeInput[] = [
      {
        resultItemSlug: 'woodentable',
        resultItemNameEn: 'Wooden Table',
        resultQuantity: 1,
        unlockMethod: 'Default',
        ingredients: [{ itemSlug: 'wood', itemNameEn: 'Wood', quantity: 3 }],
        ...META,
      },
    ];
    const result = await loadCraftingRecipe(
      { craftingRecipe, craftingIngredient, item } as never,
      inputs,
    );
    expect(result.stats.inserted).toBe(1);
    const recipe = craftingRecipe.rows.get('crafting-woodentable');
    expect(recipe?.resultItemId).toBe(tableId);
    expect(craftingIngredient.rows.filter((row) => row.recipeId === recipe?.id)).toHaveLength(1);
  });
});
