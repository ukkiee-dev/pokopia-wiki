/**
 * PokedexMilestoneLoader 단위 테스트 — Phase 9 선결 코드, Batch C-2.
 */

import { describe, expect, it } from 'vitest';

import type { PokedexMilestoneInput } from '@pokopia-wiki/shared';

import { loadPokedexMilestone } from './pokedex-milestone-loader.js';

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

class InMemoryPokedexMilestoneModel {
  rows = new Map<string, { sourceSlug: string; contentHash: string; rewardType: string; rewardRefId: number }>();

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: { data: { sourceSlug: string; contentHash: string; rewardType: string; rewardRefId: number } }): Promise<unknown> {
    this.rows.set(args.data.sourceSlug, {
      sourceSlug: args.data.sourceSlug,
      contentHash: args.data.contentHash,
      rewardType: args.data.rewardType,
      rewardRefId: args.data.rewardRefId,
    });
    return args.data;
  }

  async update(args: { where: { sourceSlug: string }; data: { contentHash: string; rewardType: string; rewardRefId: number } }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, {
      ...existing,
      contentHash: args.data.contentHash,
      rewardType: args.data.rewardType,
      rewardRefId: args.data.rewardRefId,
    });
    return args.data;
  }
}

const META = {
  sourceSite: 'serebii' as const,
  sourceUrl: 'https://www.serebii.net/pokemonpokopia/pokedexcompletion.shtml',
  scrapedAt: '2026-04-25T03:00:00.000Z',
  license: 'Test',
  copyrightHolder: 'Test',
  attribution: 'Test',
};

describe('loadPokedexMilestone', () => {
  it('rewardItemNameEn 정규화 후 item slug 매핑', async () => {
    const pokedexMilestone = new InMemoryPokedexMilestoneModel();
    const item = new InMemoryItemModel();
    const storageId = item.add('storagebox');

    const inputs: PokedexMilestoneInput[] = [
      {
        slug: 'pokedex-milestone-6',
        requiredCount: 6,
        rewardType: 'recipe',
        rewardItemNameEn: 'Storage Box recipe',
        ...META,
      },
    ];
    const result = await loadPokedexMilestone({ pokedexMilestone, item } as never, inputs);
    expect(result.stats.inserted).toBe(1);
    expect(pokedexMilestone.rows.get('pokedex-milestone-6')?.rewardRefId).toBe(storageId);
  });

  it('feature_unlock 은 본 loader 에서 미지원 → failures', async () => {
    const pokedexMilestone = new InMemoryPokedexMilestoneModel();
    const item = new InMemoryItemModel();
    const inputs: PokedexMilestoneInput[] = [
      {
        slug: 'pokedex-milestone-100',
        requiredCount: 100,
        rewardType: 'feature_unlock',
        rewardItemNameEn: 'New Area',
        ...META,
      },
    ];
    const result = await loadPokedexMilestone({ pokedexMilestone, item } as never, inputs);
    expect(result.stats.failed).toBe(1);
    expect(result.failures[0]?.error).toContain('feature_unlock');
  });
});
