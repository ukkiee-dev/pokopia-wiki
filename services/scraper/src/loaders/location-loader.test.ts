/**
 * LocationLoader 단위 테스트 — Phase 9 선결 코드, Batch C.
 */

import { describe, expect, it } from 'vitest';

import type { LocationInput } from '@pokopia-wiki/shared';

import { loadLocation, lookupLocationIds } from './location-loader.js';

type LocationRow = {
  id: number;
  sourceSlug: string;
  contentHash: string;
  type: LocationInput['type'];
  parentId: number | null;
};

class InMemoryLocationModel {
  rows = new Map<string, LocationRow>();
  private nextId = 1;

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: {
    data: {
      type: LocationInput['type'];
      parentId: number | null;
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
      type: args.data.type,
      parentId: args.data.parentId,
    });
    return { id };
  }

  async update(args: {
    where: { sourceSlug: string };
    data: {
      type?: LocationInput['type'];
      parentId?: number | null;
      sourceUrl?: string;
      scrapedAt?: Date;
      contentHash?: string;
    };
  }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, {
      ...existing,
      ...(args.data.type !== undefined ? { type: args.data.type } : {}),
      ...(args.data.parentId !== undefined ? { parentId: args.data.parentId } : {}),
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
  sourceUrl: 'https://www.serebii.net/pokemonpokopia/locations.shtml',
  scrapedAt: '2026-04-25T03:00:00.000Z',
  license: 'Test',
  copyrightHolder: 'Test',
  attribution: 'Test',
};

function buildLoc(slug: string, type: LocationInput['type'], parentSlug?: string): LocationInput {
  return { slug, nameEn: slug, type, parentSlug, ...META };
}

describe('LocationLoader', () => {
  it('parentSlug self-ref 해소 (2-pass)', async () => {
    const location = new InMemoryLocationModel();
    const inputs: LocationInput[] = [
      buildLoc('palettetown', 'Main'),
      buildLoc('palettetown-shop', 'Sub', 'palettetown'),
    ];
    const result = await loadLocation({ location } as never, inputs);
    expect(result.stats.inserted).toBe(2);
    const palette = location.rows.get('palettetown');
    const subShop = location.rows.get('palettetown-shop');
    expect(palette).toBeDefined();
    expect(subShop?.parentId).toBe(palette?.id);
  });

  it('parentSlug 미발견 → failure 로 기록 (parentId NULL)', async () => {
    const location = new InMemoryLocationModel();
    const inputs: LocationInput[] = [
      buildLoc('orphan', 'Sub', 'doesnotexist'),
    ];
    const result = await loadLocation({ location } as never, inputs);
    expect(result.stats.inserted).toBe(1);
    expect(result.failures.some((f) => f.error.includes('doesnotexist'))).toBe(true);
    expect(location.rows.get('orphan')?.parentId).toBeNull();
  });

  it('lookupLocationIds — 정상 매핑', async () => {
    const location = new InMemoryLocationModel();
    await loadLocation({ location } as never, [
      buildLoc('palettetown', 'Main'),
      buildLoc('rockyridges', 'Main'),
    ]);
    const result = await lookupLocationIds({ location } as never, ['palettetown', 'unknown']);
    expect(result.get('palettetown')).toBeDefined();
    expect(result.has('unknown')).toBe(false);
  });

  it('빈 inputs → no-op', async () => {
    const location = new InMemoryLocationModel();
    const result = await loadLocation({ location } as never, []);
    expect(result.stats.inserted).toBe(0);
    expect(location.rows.size).toBe(0);
  });
});
