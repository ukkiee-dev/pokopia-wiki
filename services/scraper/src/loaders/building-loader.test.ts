/**
 * BuildingKitLoader 단위 테스트 — Phase 9 선결 코드, Batch C-2.
 */

import { describe, expect, it } from 'vitest';

import type { BuildingKitInput } from '@pokopia-wiki/shared';

import { loadBuildingKit } from './building-loader.js';
import type { SourceSlugKeyedModel } from './upsert-loader.js';

class InMemoryBuildingKitModel implements SourceSlugKeyedModel<{
  category: string;
  pokemonCapacity: number;
  buildingPoints: number;
  width: number;
  depth: number;
  sourceUrl: string;
  scrapedAt: Date;
}> {
  rows = new Map<string, { sourceSlug: string; contentHash: string; category: string }>();

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: { data: { category: string; sourceSlug: string; contentHash: string } }): Promise<unknown> {
    this.rows.set(args.data.sourceSlug, {
      sourceSlug: args.data.sourceSlug,
      contentHash: args.data.contentHash,
      category: args.data.category,
    });
    return args.data;
  }

  async update(args: {
    where: { sourceSlug: string };
    data: { category: string; contentHash: string };
  }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, {
      ...existing,
      contentHash: args.data.contentHash,
      category: args.data.category,
    });
    return args.data;
  }
}

const META = {
  sourceSite: 'serebii' as const,
  sourceUrl: 'https://www.serebii.net/pokemonpokopia/building.shtml',
  scrapedAt: '2026-04-25T03:00:00.000Z',
  license: 'Test',
  copyrightHolder: 'Test',
  attribution: 'Test',
};

describe('loadBuildingKit', () => {
  it('목록 페이지만 — category default Decorative', async () => {
    const buildingKit = new InMemoryBuildingKitModel();
    const inputs: BuildingKitInput[] = [
      { slug: 'house', nameEn: 'House', ...META },
      { slug: 'fountain', nameEn: 'Fountain', ...META },
    ];
    const result = await loadBuildingKit({ buildingKit } as never, inputs);
    expect(result.stats.inserted).toBe(2);
    expect(buildingKit.rows.get('house')?.category).toBe('Decorative');
  });
});
