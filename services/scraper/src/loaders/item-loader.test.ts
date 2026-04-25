/**
 * ItemLoader 단위 테스트 — Phase 9 선결 코드, Batch C.
 */

import { describe, expect, it } from 'vitest';

import type { ItemInput, LocationInput } from '@pokopia-wiki/shared';

import { loadItem, lookupItemIds } from './item-loader.js';
import { loadLocation } from './location-loader.js';

class InMemoryItemModel {
  rows = new Map<
    string,
    {
      id: number;
      sourceSlug: string;
      contentHash: string;
      category: ItemInput['category'];
    }
  >();
  private nextId = 1;

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: {
    data: {
      category: ItemInput['category'];
      isPaintable: boolean;
      isPatternable: boolean;
      isMagnetRiseOnly: boolean;
      sourceUrl: string;
      scrapedAt: Date;
      sourceSlug: string;
      contentHash: string;
    };
  }): Promise<unknown> {
    const id = this.nextId++;
    this.rows.set(args.data.sourceSlug, {
      id,
      sourceSlug: args.data.sourceSlug,
      contentHash: args.data.contentHash,
      category: args.data.category,
    });
    return { id };
  }

  async update(args: {
    where: { sourceSlug: string };
    data: { contentHash: string };
  }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, { ...existing, contentHash: args.data.contentHash });
    return existing;
  }

  async findMany(args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }): Promise<ReadonlyArray<{ id: number; sourceSlug: string }>> {
    return [...this.rows.values()]
      .filter((row) => args.where.sourceSlug.in.includes(row.sourceSlug))
      .map((row) => ({ id: row.id, sourceSlug: row.sourceSlug }));
  }
}

class InMemoryItemTagModel {
  rows: Array<{ itemId: number; tag: string }> = [];

  async deleteMany(args: { where: { itemId: number } }): Promise<{ count: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.itemId !== args.where.itemId);
    return { count: before - this.rows.length };
  }

  async createMany(args: {
    data: ReadonlyArray<{ itemId: number; tag: string }>;
    skipDuplicates?: boolean;
  }): Promise<{ count: number }> {
    for (const row of args.data) this.rows.push({ ...row });
    return { count: args.data.length };
  }
}

class InMemoryItemLocationModel {
  rows: Array<{
    itemId: number;
    locationId: number | null;
    method: string;
    detail: string | null;
    sourceSlug: string;
  }> = [];

  async deleteMany(args: { where: { itemId: number } }): Promise<{ count: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.itemId !== args.where.itemId);
    return { count: before - this.rows.length };
  }

  async createMany(args: {
    data: ReadonlyArray<{
      itemId: number;
      locationId: number | null;
      method: string;
      detail: string | null;
      sourceSlug: string;
    }>;
    skipDuplicates?: boolean;
  }): Promise<{ count: number }> {
    for (const row of args.data) {
      this.rows.push({
        itemId: row.itemId,
        locationId: row.locationId,
        method: row.method,
        detail: row.detail,
        sourceSlug: row.sourceSlug,
      });
    }
    return { count: args.data.length };
  }
}

class InMemoryLocationModel {
  rows = new Map<string, { id: number; sourceSlug: string; contentHash: string }>();
  private nextId = 1;

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: { data: { sourceSlug: string; contentHash: string } }): Promise<unknown> {
    const id = this.nextId++;
    this.rows.set(args.data.sourceSlug, {
      id,
      sourceSlug: args.data.sourceSlug,
      contentHash: args.data.contentHash,
    });
    return { id };
  }

  async update(args: {
    where: { sourceSlug: string };
    data: { contentHash?: string; parentId?: number };
  }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, {
      ...existing,
      ...(args.data.contentHash !== undefined ? { contentHash: args.data.contentHash } : {}),
    });
    return existing;
  }

  async findMany(args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }): Promise<ReadonlyArray<{ id: number; sourceSlug: string }>> {
    return [...this.rows.values()]
      .filter((row) => args.where.sourceSlug.in.includes(row.sourceSlug))
      .map((row) => ({ id: row.id, sourceSlug: row.sourceSlug }));
  }
}

const META = {
  sourceSite: 'serebii' as const,
  sourceUrl: 'https://www.serebii.net/pokemonpokopia/items.shtml',
  scrapedAt: '2026-04-25T03:00:00.000Z',
  license: 'Test',
  copyrightHolder: 'Test',
  attribution: 'Test',
};

function buildItem(slug: string, category: ItemInput['category'], overrides: Partial<ItemInput> = {}): ItemInput {
  return {
    slug,
    nameEn: slug,
    description: '',
    category,
    tags: [],
    locations: [],
    isPaintable: false,
    isPatternable: false,
    isMagnetRiseOnly: false,
    ...META,
    ...overrides,
  };
}

describe('ItemLoader', () => {
  it('Item upsert + tags replace', async () => {
    const item = new InMemoryItemModel();
    const itemTag = new InMemoryItemTagModel();
    const itemLocation = new InMemoryItemLocationModel();
    const location = new InMemoryLocationModel();

    const inputs: ItemInput[] = [
      buildItem('apple', 'Food', { tags: ['Food'] }),
      buildItem('couch', 'Furniture', { tags: ['Decoration', 'Relaxation'] }),
    ];
    const result = await loadItem(
      { item, itemTag, itemLocation, location } as never,
      inputs,
    );
    expect(result.stats.inserted).toBe(2);
    const appleId = item.rows.get('apple')?.id;
    const couchId = item.rows.get('couch')?.id;
    expect(itemTag.rows.filter((row) => row.itemId === appleId)).toHaveLength(1);
    expect(itemTag.rows.filter((row) => row.itemId === couchId)).toHaveLength(2);
  });

  it('ItemLocation 매핑 — locationName 정규화 후 location FK 해소', async () => {
    const item = new InMemoryItemModel();
    const itemTag = new InMemoryItemTagModel();
    const itemLocation = new InMemoryItemLocationModel();
    const location = new InMemoryLocationModel();

    const locInputs: LocationInput[] = [
      { slug: 'palette-town', nameEn: 'Palette Town', type: 'Main', ...META },
    ];
    await loadLocation({ location } as never, locInputs);

    const inputs: ItemInput[] = [
      buildItem('apple', 'Food', {
        locations: [{ method: 'Natural', locationName: 'Palette Town', detail: 'Field' }],
      }),
    ];
    await loadItem({ item, itemTag, itemLocation, location } as never, inputs);
    const paletteId = location.rows.get('palette-town')?.id;
    const appleId = item.rows.get('apple')?.id;
    const itemLoc = itemLocation.rows.find((row) => row.itemId === appleId);
    expect(itemLoc?.locationId).toBe(paletteId);
    expect(itemLoc?.method).toBe('Natural');
  });

  it('ItemLocation locationName 미매핑 → locationId NULL 보존', async () => {
    const item = new InMemoryItemModel();
    const itemTag = new InMemoryItemTagModel();
    const itemLocation = new InMemoryItemLocationModel();
    const location = new InMemoryLocationModel();

    const inputs: ItemInput[] = [
      buildItem('apple', 'Food', {
        locations: [{ method: 'Natural', locationName: 'Unknown Place' }],
      }),
    ];
    await loadItem({ item, itemTag, itemLocation, location } as never, inputs);
    const appleId = item.rows.get('apple')?.id;
    const itemLoc = itemLocation.rows.find((row) => row.itemId === appleId);
    expect(itemLoc?.locationId).toBeNull();
  });

  it('lookupItemIds — 정상 매핑', async () => {
    const item = new InMemoryItemModel();
    const itemTag = new InMemoryItemTagModel();
    const itemLocation = new InMemoryItemLocationModel();
    const location = new InMemoryLocationModel();
    await loadItem(
      { item, itemTag, itemLocation, location } as never,
      [buildItem('apple', 'Food'), buildItem('couch', 'Furniture')],
    );
    const ids = await lookupItemIds({ item } as never, ['apple', 'unknown']);
    expect(ids.get('apple')).toBeDefined();
    expect(ids.has('unknown')).toBe(false);
  });
});
