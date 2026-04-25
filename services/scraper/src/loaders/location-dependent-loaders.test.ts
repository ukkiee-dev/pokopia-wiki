/**
 * Location-dependent loaders 단위 테스트 (Batch C-4 통합).
 *
 * EnvironmentReward / PokemonCenter / Quest / HumanRecord / IslandVariant 의 핵심
 * FK 매핑 동작을 in-memory mock 으로 검증.
 */

import { describe, expect, it } from 'vitest';

import type {
  EnvironmentRewardInput,
  HumanRecordInput,
  IslandVariantInput,
  PokemonCenterInput,
  QuestInput,
} from '@pokopia-wiki/shared';

import { loadEnvironmentReward } from './environment-reward-loader.js';
import { loadHumanRecord } from './human-record-loader.js';
import { loadIslandVariant } from './island-variant-loader.js';
import { loadPokemonCenter } from './pokemon-center-loader.js';
import { loadQuest } from './quest-loader.js';

class InMemoryLookupModel {
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

class InMemoryUpsertModel {
  rows = new Map<string, { id: number; sourceSlug: string; contentHash: string; payload: Record<string, unknown> }>();
  private nextId = 1;
  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }
  async create(args: { data: Record<string, unknown> & { sourceSlug: string; contentHash: string } }): Promise<unknown> {
    const id = this.nextId++;
    this.rows.set(args.data.sourceSlug, {
      id,
      sourceSlug: args.data.sourceSlug,
      contentHash: args.data.contentHash,
      payload: { ...args.data },
    });
    return { id };
  }
  async update(args: { where: { sourceSlug: string }; data: Record<string, unknown> & { contentHash: string } }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, {
      ...existing,
      contentHash: args.data.contentHash,
      payload: { ...existing.payload, ...args.data },
    });
    return existing;
  }
  async findMany(args: { where: { sourceSlug: { in: string[] } }; select: { id: true; sourceSlug: true } }): Promise<ReadonlyArray<{ id: number; sourceSlug: string }>> {
    return [...this.rows.values()].filter((row) => args.where.sourceSlug.in.includes(row.sourceSlug));
  }
}

class InMemoryNestedModel {
  rows: Array<Record<string, unknown>> = [];
  async deleteMany(args: { where: Record<string, number> }): Promise<{ count: number }> {
    const key = Object.keys(args.where)[0]!;
    const value = args.where[key];
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row[key] !== value);
    return { count: before - this.rows.length };
  }
  async createMany(args: { data: ReadonlyArray<Record<string, unknown>>; skipDuplicates?: boolean }): Promise<{ count: number }> {
    for (const row of args.data) this.rows.push({ ...row });
    return { count: args.data.length };
  }
}

const META = {
  sourceSite: 'serebii' as const,
  sourceUrl: 'https://www.serebii.net/pokemonpokopia/test.shtml',
  scrapedAt: '2026-04-25T03:00:00.000Z',
  license: 'Test',
  copyrightHolder: 'Test',
  attribution: 'Test',
};

describe('loadEnvironmentReward', () => {
  it('rewardType=item → Item.id 매핑', async () => {
    const environmentReward = new InMemoryUpsertModel();
    const location = new InMemoryLookupModel();
    const item = new InMemoryLookupModel();
    const craftingRecipe = new InMemoryLookupModel();
    const locId = location.add('witheredwastelands');
    const itemId = item.add('gardenbench');

    const inputs: EnvironmentRewardInput[] = [
      {
        slug: 'witheredwastelands-lv2-item-gardenbench',
        locationSlug: 'witheredwastelands',
        level: 2,
        rewardType: 'item',
        itemSlug: 'gardenbench',
        nameEn: 'Garden Bench',
        ...META,
      },
    ];
    const result = await loadEnvironmentReward(
      { environmentReward, location, item, craftingRecipe } as never,
      inputs,
    );
    expect(result.stats.inserted).toBe(1);
    const row = environmentReward.rows.get('witheredwastelands-lv2-item-gardenbench');
    expect(row?.payload.locationId).toBe(locId);
    expect(row?.payload.rewardRefId).toBe(itemId);
  });

  it('rewardType=recipe → "crafting-<slug>" 매핑', async () => {
    const environmentReward = new InMemoryUpsertModel();
    const location = new InMemoryLookupModel();
    const item = new InMemoryLookupModel();
    const craftingRecipe = new InMemoryLookupModel();
    location.add('witheredwastelands');
    const recipeId = craftingRecipe.add('crafting-workbench');

    const inputs: EnvironmentRewardInput[] = [
      {
        slug: 'witheredwastelands-lv2-recipe-workbench',
        locationSlug: 'witheredwastelands',
        level: 2,
        rewardType: 'recipe',
        itemSlug: 'workbench',
        nameEn: 'Workbench Recipe',
        ...META,
      },
    ];
    await loadEnvironmentReward({ environmentReward, location, item, craftingRecipe } as never, inputs);
    expect(environmentReward.rows.get(inputs[0]!.slug)?.payload.rewardRefId).toBe(recipeId);
  });

  it('Location 미발견 → failures', async () => {
    const environmentReward = new InMemoryUpsertModel();
    const location = new InMemoryLookupModel();
    const item = new InMemoryLookupModel();
    const craftingRecipe = new InMemoryLookupModel();
    const inputs: EnvironmentRewardInput[] = [
      {
        slug: 'unknown-lv1-item-x',
        locationSlug: 'unknown',
        level: 1,
        rewardType: 'item',
        itemSlug: 'x',
        nameEn: 'X',
        ...META,
      },
    ];
    const result = await loadEnvironmentReward({ environmentReward, location, item, craftingRecipe } as never, inputs);
    expect(result.stats.failed).toBe(1);
  });
});

describe('loadPokemonCenter', () => {
  it('location FK + materials replace', async () => {
    const pokemonCenter = new InMemoryUpsertModel();
    const pokemonCenterMaterial = new InMemoryNestedModel();
    const location = new InMemoryLookupModel();
    const item = new InMemoryLookupModel();
    location.add('witheredwastelands');
    const lumberId = item.add('lumber');

    const inputs: PokemonCenterInput[] = [
      {
        slug: 'pokemon-center-witheredwastelands',
        locationSlug: 'witheredwastelands',
        locationNameEn: 'Withered Wastelands',
        requiredEnvLevel: 3,
        requiredPokemonCount: 5,
        materials: [{ itemNameEn: 'Lumber', quantity: 10 }],
        ...META,
      },
    ];
    const result = await loadPokemonCenter(
      { pokemonCenter, pokemonCenterMaterial, location, item } as never,
      inputs,
    );
    expect(result.stats.inserted).toBe(1);
    const center = pokemonCenter.rows.get('pokemon-center-witheredwastelands');
    expect(pokemonCenterMaterial.rows).toContainEqual(
      expect.objectContaining({ centerId: center?.id, itemId: lumberId, quantity: 10 }),
    );
  });
});

describe('loadQuest', () => {
  it('location FK 매핑', async () => {
    const quest = new InMemoryUpsertModel();
    const location = new InMemoryLookupModel();
    const locId = location.add('witheredwastelands');

    const inputs: QuestInput[] = [
      {
        slug: 'quest-yawn-up-a-storm',
        nameEn: 'Yawn Up A Storm',
        locationSlug: 'witheredwastelands',
        sortOrder: 1,
        ...META,
      },
    ];
    const result = await loadQuest({ quest, location } as never, inputs);
    expect(result.stats.inserted).toBe(1);
    expect(quest.rows.get('quest-yawn-up-a-storm')?.payload.locationId).toBe(locId);
  });
});

describe('loadHumanRecord', () => {
  it('rewardType=item + locationSlug 정상 매핑', async () => {
    const humanRecord = new InMemoryUpsertModel();
    const location = new InMemoryLookupModel();
    const item = new InMemoryLookupModel();
    const cd = new InMemoryLookupModel();
    location.add('witheredwastelands');
    const itemId = item.add('newspaper-x');

    const inputs: HumanRecordInput[] = [
      {
        slug: 'human-record-newspaper-x',
        category: 'Newspaper',
        nameEn: 'X News',
        locationSlug: 'witheredwastelands',
        rewardType: 'item',
        rewardRefSlug: 'newspaper-x',
        ...META,
      },
    ];
    const result = await loadHumanRecord({ humanRecord, location, item, cd } as never, inputs);
    expect(result.stats.inserted).toBe(1);
    expect(humanRecord.rows.get(inputs[0]!.slug)?.payload.rewardRefId).toBe(itemId);
  });

  it('locationSlug 부재 → failures', async () => {
    const humanRecord = new InMemoryUpsertModel();
    const location = new InMemoryLookupModel();
    const item = new InMemoryLookupModel();
    const cd = new InMemoryLookupModel();
    const inputs: HumanRecordInput[] = [
      {
        slug: 'human-record-x',
        category: 'Newspaper',
        nameEn: 'X',
        rewardType: 'none',
        ...META,
      },
    ];
    const result = await loadHumanRecord({ humanRecord, location, item, cd } as never, inputs);
    expect(result.stats.failed).toBe(1);
    expect(result.failures[0]?.error).toContain('locationSlug');
  });
});

describe('loadIslandVariant', () => {
  it('Location FK + nested rewards (item) 매핑', async () => {
    const islandVariant = new InMemoryUpsertModel();
    const islandReward = new InMemoryNestedModel();
    const location = new InMemoryLookupModel();
    const item = new InMemoryLookupModel();
    const cd = new InMemoryLookupModel();
    const craftingRecipe = new InMemoryLookupModel();
    location.add('dreamisland');
    const focusId = item.add('focusitem');

    const inputs: IslandVariantInput[] = [
      {
        slug: 'island-variant-dreamisland-pikachudoll',
        locationSlug: 'dreamisland',
        variantKey: 'pikachudoll',
        nameEn: 'Pikachu Doll',
        rewards: [{ rewardType: 'item', itemSlug: 'focusitem', itemNameEn: 'Focus Item', dropRate: 0.5 }],
        ...META,
      },
    ];
    const result = await loadIslandVariant(
      { islandVariant, islandReward, location, item, cd, craftingRecipe } as never,
      inputs,
    );
    expect(result.stats.inserted).toBe(1);
    const variant = islandVariant.rows.get(inputs[0]!.slug);
    expect(islandReward.rows).toContainEqual(
      expect.objectContaining({ islandVariantId: variant?.id, rewardRefId: focusId, dropRate: 0.5 }),
    );
  });
});
