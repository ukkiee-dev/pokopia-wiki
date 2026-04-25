/**
 * SimpleLoaders 단위 테스트 — Phase 9 선결 코드.
 *
 * Prisma in-memory mock 으로 MosslaxBoost / StampCard loader 동작 검증.
 */

import { describe, expect, it } from 'vitest';

import type { MosslaxBoostInput, StampCardInput } from '@pokopia-wiki/shared';

import { loadMosslaxBoost, loadStampCard } from './simple-loaders.js';
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
