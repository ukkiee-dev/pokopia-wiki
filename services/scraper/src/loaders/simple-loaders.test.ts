/**
 * SimpleLoaders 단위 테스트 — Phase 9 선결 코드.
 *
 * 10 종 simple entity loader (FK 없음 또는 nullable FK 만) 의 idempotent upsert
 * 동작을 in-memory Prisma mock 으로 검증.
 *
 * 검증 패턴 (entity 별 공통):
 *   - 신규 input → inserted
 *   - 동일 input 재호출 → unchanged (content_hash 일치)
 *   - 핵심 도메인 필드가 row 에 그대로 반영
 */

import { describe, expect, it } from 'vitest';

import type {
  CustomizationItemInput,
  FavoriteCategoryInput,
  FriendshipTierInput,
  GeneratorInput,
  JumpropeTierInput,
  MosslaxBoostInput,
  PaintPatternInput,
  PlantInput,
  StampCardInput,
  WaterTypeInput,
} from '@pokopia-wiki/shared';

import {
  loadCustomizationItem,
  loadFavoriteCategory,
  loadFriendshipTier,
  loadGenerator,
  loadJumpropeTier,
  loadMosslaxBoost,
  loadPaintPattern,
  loadPlant,
  loadStampCard,
  loadWaterType,
} from './simple-loaders.js';
import type { SourceSlugKeyedModel } from './upsert-loader.js';

class InMemoryModel<TPayload extends object> implements SourceSlugKeyedModel<TPayload> {
  rows = new Map<string, TPayload & { sourceSlug: string; contentHash: string; updatedAt?: Date }>();

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: { data: TPayload & { sourceSlug: string; contentHash: string } }): Promise<unknown> {
    this.rows.set(args.data.sourceSlug, { ...args.data });
    return args.data;
  }

  async update(args: {
    where: { sourceSlug: string };
    data: TPayload & { contentHash: string; updatedAt?: Date };
  }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, { ...existing, ...args.data });
    return args.data;
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

/* ───────────────── MosslaxBoost ───────────────── */

describe('MosslaxBoostLoader', () => {
  it('flavor + level upsert', async () => {
    const model = new InMemoryModel<{
      flavor: MosslaxBoostInput['flavor'];
      level: number;
      sourceUrl: string;
      scrapedAt: Date;
    }>();
    const input: MosslaxBoostInput = {
      slug: 'mosslax-bitter-lv1',
      flavor: 'Bitter',
      level: 1,
      effectEn: 'Increased chance of finding rare items',
      foodGroupEn: 'Berries / Drinks / Vegetables',
      ...META,
    };
    const result = await loadMosslaxBoost(model, [input]);
    expect(result.stats.inserted).toBe(1);
    const row = model.rows.get('mosslax-bitter-lv1');
    expect(row?.flavor).toBe('Bitter');
    expect(row?.level).toBe(1);
  });

  it('15 entity Cartesian — 5 flavor × 3 level 모두 unique', async () => {
    const model = new InMemoryModel<{
      flavor: MosslaxBoostInput['flavor'];
      level: number;
      sourceUrl: string;
      scrapedAt: Date;
    }>();
    const flavors = ['Bitter', 'Dry', 'Sour', 'Spicy', 'Sweet'] as const;
    const inputs: MosslaxBoostInput[] = [];
    for (const flavor of flavors) {
      for (const level of [1, 2, 3] as const) {
        inputs.push({
          slug: `mosslax-${flavor.toLowerCase()}-lv${level}`,
          flavor,
          level,
          effectEn: `${flavor} effect`,
          foodGroupEn: `Lv${level} food`,
          ...META,
        });
      }
    }
    const result = await loadMosslaxBoost(model, inputs);
    expect(result.stats.inserted).toBe(15);
    expect(model.rows.size).toBe(15);
  });
});

/* ───────────────── StampCard ───────────────── */

describe('StampCardLoader', () => {
  it('weekGoal=5 upsert', async () => {
    const model = new InMemoryModel<{
      weekGoal: number;
      sourceUrl: string;
      scrapedAt: Date;
    }>();
    const input: StampCardInput = {
      slug: 'weekly-stamp-card',
      weekGoal: 5,
      ...META,
    };
    const result = await loadStampCard(model, [input]);
    expect(result.stats.inserted).toBe(1);
    expect(model.rows.get('weekly-stamp-card')?.weekGoal).toBe(5);
  });

  it('재호출 unchanged', async () => {
    const model = new InMemoryModel<{
      weekGoal: number;
      sourceUrl: string;
      scrapedAt: Date;
    }>();
    const input: StampCardInput = { slug: 'weekly-stamp-card', weekGoal: 5, ...META };
    await loadStampCard(model, [input]);
    const second = await loadStampCard(model, [input]);
    expect(second.stats.unchanged).toBe(1);
  });
});

/* ───────────────── FavoriteCategory ───────────────── */

describe('FavoriteCategoryLoader', () => {
  it('id + 감사 only — slug 직접 사용', async () => {
    const model = new InMemoryModel<{ sourceUrl: string; scrapedAt: Date }>();
    const inputs: FavoriteCategoryInput[] = [
      { slug: 'blockystuff', nameEn: 'Blocky stuff', ...META },
      { slug: 'cleanliness', nameEn: 'Cleanliness', ...META },
    ];
    const result = await loadFavoriteCategory(model, inputs);
    expect(result.stats.inserted).toBe(2);
    expect(model.rows.has('blockystuff')).toBe(true);
    expect(model.rows.has('cleanliness')).toBe(true);
  });
});

/* ───────────────── FriendshipTier ───────────────── */

describe('FriendshipTierLoader', () => {
  it('tier + requiredPoints upsert', async () => {
    const model = new InMemoryModel<{
      tier: number;
      requiredPoints: number;
      sourceUrl: string;
      scrapedAt: Date;
    }>();
    const input: FriendshipTierInput = {
      slug: 'friendship-tier-3',
      tier: 3,
      requiredPoints: 1500,
      nameEn: 'Best Friends',
      isMaxTier: false,
      ...META,
    };
    const result = await loadFriendshipTier(model, [input]);
    expect(result.stats.inserted).toBe(1);
    const row = model.rows.get('friendship-tier-3');
    expect(row?.tier).toBe(3);
    expect(row?.requiredPoints).toBe(1500);
  });
});

/* ───────────────── Generator ───────────────── */

describe('GeneratorLoader', () => {
  it('outputUnits + outputUnitsAlt + isRenewable', async () => {
    const model = new InMemoryModel<{
      outputUnits: number;
      outputUnitsAlt: number | null;
      isRenewable: boolean;
      sourceUrl: string;
      scrapedAt: Date;
    }>();
    const inputs: GeneratorInput[] = [
      {
        slug: 'minigenerator',
        nameEn: 'Mini generator',
        outputUnits: 10,
        isRenewable: false,
        ...META,
      },
      {
        slug: 'windmillkit',
        nameEn: 'Windmill kit',
        outputUnits: 15,
        outputUnitsAlt: 20,
        outputUnitsLabel: 'standard',
        outputUnitsAltLabel: 'high-altitude',
        isRenewable: true,
        ...META,
      },
    ];
    const result = await loadGenerator(model, inputs);
    expect(result.stats.inserted).toBe(2);
    expect(model.rows.get('minigenerator')?.outputUnitsAlt).toBeNull();
    expect(model.rows.get('windmillkit')?.outputUnitsAlt).toBe(20);
    expect(model.rows.get('windmillkit')?.isRenewable).toBe(true);
  });
});

/* ───────────────── WaterType ───────────────── */

describe('WaterTypeLoader', () => {
  it('hydrates + spreadRadius/trenchDistance default 0', async () => {
    const model = new InMemoryModel<{
      spreadRadius: number;
      trenchDistance: number;
      hydrates: boolean;
      sourceUrl: string;
      scrapedAt: Date;
    }>();
    const input: WaterTypeInput = {
      slug: 'water',
      nameEn: 'Water',
      hydrates: true,
      ...META,
    };
    const result = await loadWaterType(model, [input]);
    expect(result.stats.inserted).toBe(1);
    const row = model.rows.get('water');
    expect(row?.hydrates).toBe(true);
    expect(row?.spreadRadius).toBe(0);
    expect(row?.trenchDistance).toBe(0);
  });

  it('Lava hydrates=false', async () => {
    const model = new InMemoryModel<{
      spreadRadius: number;
      trenchDistance: number;
      hydrates: boolean;
      sourceUrl: string;
      scrapedAt: Date;
    }>();
    const input: WaterTypeInput = {
      slug: 'lava',
      nameEn: 'Lava',
      descriptionEn: 'Does not hydrate plants.',
      hydrates: false,
      ...META,
    };
    await loadWaterType(model, [input]);
    expect(model.rows.get('lava')?.hydrates).toBe(false);
  });
});

/* ───────────────── PaintPattern ───────────────── */

describe('PaintPatternLoader', () => {
  it('id + 감사 only', async () => {
    const model = new InMemoryModel<{ sourceUrl: string; scrapedAt: Date }>();
    const inputs: PaintPatternInput[] = [
      { slug: 'pattern-1', locationEn: 'Beginning', ingredients: [], ...META },
      { slug: 'pattern-pk6', locationEn: 'On item given by Vespiquen', ingredients: [], ...META },
    ];
    const result = await loadPaintPattern(model, inputs);
    expect(result.stats.inserted).toBe(2);
    expect(model.rows.size).toBe(2);
  });
});

/* ───────────────── CustomizationItem ───────────────── */

describe('CustomizationItemLoader', () => {
  it('category + unlockMethod, unlockLocationId 항상 null (1-pass)', async () => {
    const model = new InMemoryModel<{
      category: CustomizationItemInput['category'];
      unlockMethod: string;
      unlockLocationId: number | null;
      sourceUrl: string;
      scrapedAt: Date;
    }>();
    const input: CustomizationItemInput = {
      slug: 'customization-outfit-1',
      category: 'Outfit',
      nameEn: 'Familiar Outfit 1',
      unlockMethodEn: 'Beginning',
      ...META,
    };
    const result = await loadCustomizationItem(model, [input]);
    expect(result.stats.inserted).toBe(1);
    const row = model.rows.get('customization-outfit-1');
    expect(row?.category).toBe('Outfit');
    expect(row?.unlockMethod).toBe('Beginning');
    expect(row?.unlockLocationId).toBeNull();
  });
});

/* ───────────────── Plant ───────────────── */

describe('PlantLoader', () => {
  it('type + growthDays defaults', async () => {
    const model = new InMemoryModel<{
      type: PlantInput['type'];
      growthDays: number;
      growthDaysWithGrow: number;
      requiresHydration: boolean;
      sourceUrl: string;
      scrapedAt: Date;
    }>();
    const input: PlantInput = {
      slug: 'leppatree',
      nameEn: 'Leppa tree',
      type: 'BerryTree',
      growthDays: 1,
      growthDaysWithGrow: 1,
      requiresHydration: false,
      variants: [],
      ...META,
    };
    const result = await loadPlant(model, [input]);
    expect(result.stats.inserted).toBe(1);
    expect(model.rows.get('leppatree')?.type).toBe('BerryTree');
  });
});

/* ───────────────── JumpropeTier ───────────────── */

describe('JumpropeTierLoader', () => {
  it('tier + requiredJumps + rewardType, rewardRefId 항상 null (Item loader 후 보강)', async () => {
    const model = new InMemoryModel<{
      tier: number;
      requiredJumps: number;
      rewardType: JumpropeTierInput['rewardType'];
      rewardRefId: number | null;
      sourceUrl: string;
      scrapedAt: Date;
    }>();
    const input: JumpropeTierInput = {
      slug: 'jumprope-tier1-copperore',
      tier: 1,
      requiredJumps: 0,
      rewardType: 'item',
      itemSlug: 'copperore',
      itemNameEn: 'Copper Ore',
      quantity: 1,
      methodEn: '0-49',
      ...META,
    };
    const result = await loadJumpropeTier(model, [input]);
    expect(result.stats.inserted).toBe(1);
    const row = model.rows.get('jumprope-tier1-copperore');
    expect(row?.tier).toBe(1);
    expect(row?.rewardType).toBe('item');
    expect(row?.rewardRefId).toBeNull();
  });
});
