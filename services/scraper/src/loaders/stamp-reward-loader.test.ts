/**
 * StampRewardLoader 단위 테스트 — Phase 9 선결 코드, Batch C-2.
 */

import { describe, expect, it } from 'vitest';

import type { StampRewardInput } from '@pokopia-wiki/shared';

import { loadStampReward } from './stamp-reward-loader.js';

class InMemoryStampCardModel {
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

class InMemoryStampRewardModel {
  rows = new Map<string, { sourceSlug: string; contentHash: string; cardId: number; tier: number }>();

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: {
    data: { sourceSlug: string; contentHash: string; cardId: number; tier: number };
  }): Promise<unknown> {
    this.rows.set(args.data.sourceSlug, {
      sourceSlug: args.data.sourceSlug,
      contentHash: args.data.contentHash,
      cardId: args.data.cardId,
      tier: args.data.tier,
    });
    return args.data;
  }

  async update(args: {
    where: { sourceSlug: string };
    data: { contentHash: string; cardId: number; tier: number };
  }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, {
      ...existing,
      contentHash: args.data.contentHash,
      cardId: args.data.cardId,
      tier: args.data.tier,
    });
    return args.data;
  }
}

const META = {
  sourceSite: 'serebii' as const,
  sourceUrl: 'https://www.serebii.net/pokemonpokopia/stampcard.shtml',
  scrapedAt: '2026-04-25T03:00:00.000Z',
  license: 'Test',
  copyrightHolder: 'Test',
  attribution: 'Test',
};

describe('loadStampReward', () => {
  it('cardSlug → cardId 매핑 후 upsert', async () => {
    const stampCard = new InMemoryStampCardModel();
    const stampReward = new InMemoryStampRewardModel();
    const cardId = stampCard.add('weekly-stamp-card');

    const inputs: StampRewardInput[] = [
      {
        slug: 'stamp-reward-tier1-basic',
        cardSlug: 'weekly-stamp-card',
        tier: 1,
        stampNameEn: 'Basic',
        requiredStamps: 1,
        coinAmount: 50,
        ...META,
      },
    ];
    const result = await loadStampReward({ stampCard, stampReward } as never, inputs);
    expect(result.stats.inserted).toBe(1);
    expect(stampReward.rows.get('stamp-reward-tier1-basic')?.cardId).toBe(cardId);
  });

  it('cardSlug 미발견 → failures', async () => {
    const stampCard = new InMemoryStampCardModel();
    const stampReward = new InMemoryStampRewardModel();
    const inputs: StampRewardInput[] = [
      {
        slug: 'stamp-reward-tier1-basic',
        cardSlug: 'nonexistent',
        tier: 1,
        stampNameEn: 'Basic',
        requiredStamps: 1,
        coinAmount: 50,
        ...META,
      },
    ];
    const result = await loadStampReward({ stampCard, stampReward } as never, inputs);
    expect(result.stats.failed).toBe(1);
    expect(result.failures[0]?.error).toContain('nonexistent');
  });
});
