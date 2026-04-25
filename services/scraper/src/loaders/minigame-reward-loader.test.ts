/**
 * MinigameRewardLoader 단위 테스트 — Phase 9 선결 코드, Batch C-2.
 */

import { describe, expect, it } from 'vitest';

import type { HideAndSneakRewardInput, JumpropeTierInput } from '@pokopia-wiki/shared';

import {
  backfillJumpropeTierRewards,
  loadHideAndSneakReward,
} from './minigame-reward-loader.js';

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

class InMemoryHideAndSneakRewardModel {
  rows = new Map<string, { sourceSlug: string; contentHash: string; rewardRefId: number }>();

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: { data: { sourceSlug: string; contentHash: string; rewardRefId: number } }): Promise<unknown> {
    this.rows.set(args.data.sourceSlug, {
      sourceSlug: args.data.sourceSlug,
      contentHash: args.data.contentHash,
      rewardRefId: args.data.rewardRefId,
    });
    return args.data;
  }

  async update(args: {
    where: { sourceSlug: string };
    data: { contentHash: string; rewardRefId: number };
  }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, {
      ...existing,
      contentHash: args.data.contentHash,
      rewardRefId: args.data.rewardRefId,
    });
    return args.data;
  }
}

class InMemoryJumpropeTierModel {
  rows = new Map<string, { sourceSlug: string; rewardRefId: number | null }>();

  add(slug: string): void {
    this.rows.set(slug, { sourceSlug: slug, rewardRefId: null });
  }

  async update(args: { where: { sourceSlug: string }; data: { rewardRefId: number } }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, { ...existing, rewardRefId: args.data.rewardRefId });
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

describe('loadHideAndSneakReward', () => {
  it('itemSlug → itemId 매핑 후 rewardRefId 주입', async () => {
    const hideAndSneakReward = new InMemoryHideAndSneakRewardModel();
    const item = new InMemoryItemModel();
    const carrotId = item.add('freshcarrot');

    const inputs: HideAndSneakRewardInput[] = [
      {
        slug: 'hideandsneak-win-without-being-detected-freshcarrot',
        condition: 'Win without being detected',
        rewardType: 'item',
        itemSlug: 'freshcarrot',
        itemNameEn: 'Fresh Carrot',
        quantity: 1,
        ...META,
      },
    ];
    const result = await loadHideAndSneakReward({ hideAndSneakReward, item } as never, inputs);
    expect(result.stats.inserted).toBe(1);
    expect(hideAndSneakReward.rows.get(inputs[0]!.slug)?.rewardRefId).toBe(carrotId);
  });

  it('itemSlug 미발견 → failures', async () => {
    const hideAndSneakReward = new InMemoryHideAndSneakRewardModel();
    const item = new InMemoryItemModel();
    const inputs: HideAndSneakRewardInput[] = [
      {
        slug: 'hideandsneak-x-y',
        condition: 'X',
        rewardType: 'item',
        itemSlug: 'unknown',
        itemNameEn: 'Unknown',
        quantity: 1,
        ...META,
      },
    ];
    const result = await loadHideAndSneakReward({ hideAndSneakReward, item } as never, inputs);
    expect(result.stats.failed).toBe(1);
  });
});

describe('backfillJumpropeTierRewards', () => {
  it('itemSlug → itemId 매핑 후 rewardRefId update', async () => {
    const jumpropeTier = new InMemoryJumpropeTierModel();
    const item = new InMemoryItemModel();
    jumpropeTier.add('jumprope-tier1-copperore');
    const oreId = item.add('copperore');

    const inputs: JumpropeTierInput[] = [
      {
        slug: 'jumprope-tier1-copperore',
        tier: 1,
        requiredJumps: 0,
        rewardType: 'item',
        itemSlug: 'copperore',
        itemNameEn: 'Copper Ore',
        quantity: 1,
        methodEn: '0-49',
        ...META,
      },
    ];
    const result = await backfillJumpropeTierRewards({ jumpropeTier, item } as never, inputs);
    expect(result.stats.updated).toBe(1);
    expect(jumpropeTier.rows.get('jumprope-tier1-copperore')?.rewardRefId).toBe(oreId);
  });
});
