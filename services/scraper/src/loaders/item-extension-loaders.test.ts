/**
 * Item 1:1 확장 entity loader 단위 테스트 — Phase 9 선결 코드, Batch C-2.
 */

import { describe, expect, it } from 'vitest';

import type {
  FoodInput,
  LostRelicInput,
  TradeValuationInput,
} from '@pokopia-wiki/shared';

import { loadFood, loadLostRelic, loadTradeValuation } from './item-extension-loaders.js';

class InMemoryItemModel {
  rows = new Map<string, { id: number; sourceSlug: string }>();
  private nextId = 1;

  add(slug: string): number {
    const id = this.nextId++;
    this.rows.set(slug, { id, sourceSlug: slug });
    return id;
  }

  async findMany(args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }): Promise<ReadonlyArray<{ id: number; sourceSlug: string }>> {
    return [...this.rows.values()].filter((row) => args.where.sourceSlug.in.includes(row.sourceSlug));
  }
}

class InMemoryFoodModel {
  rows = new Map<number, { itemId: number; flavor: string; ppRestore: string | null; moveBoost: string | null }>();

  async findUnique(args: { where: { itemId: number } }): Promise<{ flavor: string } | null> {
    const row = this.rows.get(args.where.itemId);
    return row !== undefined ? { flavor: row.flavor } : null;
  }

  async create(args: { data: { itemId: number; flavor: string; ppRestore: string | null; moveBoost: string | null } }): Promise<unknown> {
    this.rows.set(args.data.itemId, { ...args.data });
    return args.data;
  }

  async update(args: { where: { itemId: number }; data: { flavor: string; ppRestore: string | null; moveBoost: string | null } }): Promise<unknown> {
    const existing = this.rows.get(args.where.itemId);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.itemId, { ...existing, ...args.data });
    return args.data;
  }
}

class InMemoryLostRelicModel {
  rows = new Map<number, { itemId: number; sizeClass: string; isAppraisedForm: boolean; appraisalResultItemId: number | null; appraisalCost: number | null }>();

  async findUnique(args: { where: { itemId: number } }): Promise<{ sizeClass: string } | null> {
    const row = this.rows.get(args.where.itemId);
    return row !== undefined ? { sizeClass: row.sizeClass } : null;
  }

  async create(args: { data: { itemId: number; sizeClass: string; isAppraisedForm: boolean; appraisalResultItemId: number | null; appraisalCost: number | null } }): Promise<unknown> {
    this.rows.set(args.data.itemId, { ...args.data });
    return args.data;
  }

  async update(args: { where: { itemId: number }; data: { sizeClass: string; isAppraisedForm: boolean; appraisalResultItemId: number | null; appraisalCost: number | null } }): Promise<unknown> {
    const existing = this.rows.get(args.where.itemId);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.itemId, { ...existing, ...args.data });
    return args.data;
  }
}

class InMemoryTradeValuationModel {
  rows = new Map<number, { itemId: number; baseValue: number; favoriteBonusMultiplier: number }>();

  async findUnique(args: { where: { itemId: number } }): Promise<{ baseValue: number } | null> {
    const row = this.rows.get(args.where.itemId);
    return row !== undefined ? { baseValue: row.baseValue } : null;
  }

  async create(args: { data: { itemId: number; baseValue: number; favoriteBonusMultiplier: number } }): Promise<unknown> {
    this.rows.set(args.data.itemId, { ...args.data });
    return args.data;
  }

  async update(args: { where: { itemId: number }; data: { baseValue: number; favoriteBonusMultiplier: number } }): Promise<unknown> {
    const existing = this.rows.get(args.where.itemId);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.itemId, { ...existing, ...args.data });
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

describe('loadFood', () => {
  it('item FK 매핑 후 upsert', async () => {
    const food = new InMemoryFoodModel();
    const item = new InMemoryItemModel();
    const appleId = item.add('apple');
    const inputs: FoodInput[] = [
      { itemSlug: 'apple', itemNameEn: 'Apple', flavor: 'Sweet', ppRestore: 'little', ...META },
    ];
    const result = await loadFood({ food, item } as never, inputs);
    expect(result.stats.inserted).toBe(1);
    expect(food.rows.get(appleId)?.flavor).toBe('Sweet');
  });

  it('Item 미발견 → failures 격리', async () => {
    const food = new InMemoryFoodModel();
    const item = new InMemoryItemModel();
    const inputs: FoodInput[] = [
      { itemSlug: 'unknown', itemNameEn: 'Unknown', flavor: 'None', ...META },
    ];
    const result = await loadFood({ food, item } as never, inputs);
    expect(result.stats.failed).toBe(1);
    expect(result.failures[0]?.error).toContain('미발견');
  });
});

describe('loadLostRelic', () => {
  it('itemSlug + appraisalResultItemSlug FK 매핑', async () => {
    const lostRelic = new InMemoryLostRelicModel();
    const item = new InMemoryItemModel();
    const relicId = item.add('lostpolygonalshelf');
    const resultId = item.add('polygonalshelf');
    const inputs: LostRelicInput[] = [
      {
        slug: 'lost-relic-lostpolygonalshelf',
        itemSlug: 'lostpolygonalshelf',
        nameEn: 'Lost Polygonal Shelf',
        sizeClass: 'L',
        isAppraisedForm: false,
        appraisalResultItemSlug: 'polygonalshelf',
        appraisalCost: 500,
        ...META,
      },
    ];
    const result = await loadLostRelic({ lostRelic, item } as never, inputs);
    expect(result.stats.inserted).toBe(1);
    const row = lostRelic.rows.get(relicId);
    expect(row?.sizeClass).toBe('L');
    expect(row?.appraisalResultItemId).toBe(resultId);
  });
});

describe('loadTradeValuation', () => {
  it('item FK 매핑 후 upsert + favoriteBonusMultiplier', async () => {
    const tradeValuation = new InMemoryTradeValuationModel();
    const item = new InMemoryItemModel();
    const eeveeId = item.add('eeveedoll');
    const inputs: TradeValuationInput[] = [
      {
        slug: 'trade-valuation-eeveedoll',
        itemSlug: 'eeveedoll',
        baseValue: 1000,
        favoriteBonusMultiplier: 1.5,
        ...META,
      },
    ];
    const result = await loadTradeValuation({ tradeValuation, item } as never, inputs);
    expect(result.stats.inserted).toBe(1);
    const row = tradeValuation.rows.get(eeveeId);
    expect(row?.baseValue).toBe(1000);
    expect(row?.favoriteBonusMultiplier).toBe(1.5);
  });

  it('빈 inputs → no-op', async () => {
    const tradeValuation = new InMemoryTradeValuationModel();
    const item = new InMemoryItemModel();
    const result = await loadTradeValuation({ tradeValuation, item } as never, []);
    expect(result.stats.inserted).toBe(0);
  });
});
