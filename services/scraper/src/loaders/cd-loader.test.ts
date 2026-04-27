/**
 * CdLoader 단위 테스트 — Phase 9 선결 코드, Batch B.
 *
 * 2-pass 패턴 (SourceGame upsert → ID 룩업 → Cd upsert) 의 핵심 동작을 in-memory
 * Prisma mock 으로 검증.
 */

import { describe, expect, it } from 'vitest';

import type { CdInput } from '@pokopia-wiki/shared';

import { loadCd, loadSourceGames } from './cd-loader.js';
import type { SourceSlugKeyedModel } from './upsert-loader.js';

type SourceGameRow = {
  id: number;
  sourceSlug: string;
  contentHash: string;
  code: string;
  generation: number;
};

type CdRow = {
  id: number;
  sourceSlug: string;
  contentHash: string;
  sourceGameId: number;
};

class InMemorySourceGameModel implements SourceSlugKeyedModel<{
  code: string;
  generation: number;
  sourceUrl: string;
  scrapedAt: Date;
}> {
  rows = new Map<string, SourceGameRow>();
  private nextId = 1;

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: {
    data: {
      code: string;
      generation: number;
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
      code: args.data.code,
      generation: args.data.generation,
    });
    return { id };
  }

  async update(args: {
    where: { sourceSlug: string };
    data: {
      code: string;
      generation: number;
      sourceUrl: string;
      scrapedAt: Date;
      contentHash: string;
    };
  }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, {
      ...existing,
      contentHash: args.data.contentHash,
      code: args.data.code,
      generation: args.data.generation,
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

class InMemoryCdModel implements SourceSlugKeyedModel<{
  sourceGameId: number;
  sourceUrl: string;
  scrapedAt: Date;
}> {
  rows = new Map<string, CdRow>();
  private nextId = 1;

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: {
    data: {
      sourceGameId: number;
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
      sourceGameId: args.data.sourceGameId,
    });
    return { id };
  }

  async update(args: {
    where: { sourceSlug: string };
    data: {
      sourceGameId: number;
      sourceUrl: string;
      scrapedAt: Date;
      contentHash: string;
    };
  }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, {
      ...existing,
      contentHash: args.data.contentHash,
      sourceGameId: args.data.sourceGameId,
    });
    return existing;
  }
}

const META = {
  sourceSite: 'serebii' as const,
  sourceUrl: 'https://www.serebii.net/pokemonpokopia/cds.shtml',
  scrapedAt: '2026-04-25T03:00:00.000Z',
  license: 'Test',
  copyrightHolder: 'Test',
  attribution: 'Test',
};

function buildCd(slug: string, code: string, generation: number, nameEn: string): CdInput {
  return {
    slug,
    cdNumber: 1,
    nameEn,
    sourceGame: { code, nameEn: `Pokémon ${code.toUpperCase()}`, generation },
    locations: [],
    ...META,
  };
}

describe('SourceGameLoader', () => {
  it('동일 code dedupe — 5 entity 입력에 code 2종이면 SourceGame 2개만 생성', async () => {
    const model = new InMemorySourceGameModel();
    const hints = [
      { code: 'rg', nameEn: 'R/G', generation: 1 },
      { code: 'rg', nameEn: 'R/G', generation: 1 },
      { code: 'gs', nameEn: 'G/S', generation: 2 },
      { code: 'gs', nameEn: 'G/S', generation: 2 },
      { code: 'rg', nameEn: 'R/G', generation: 1 },
    ];
    const result = await loadSourceGames(model, hints, {
      sourceUrl: 'https://test/cds.shtml',
      scrapedAt: '2026-04-25T03:00:00.000Z',
    });
    expect(result.stats.inserted).toBe(2);
    expect(model.rows.size).toBe(2);
    expect(model.rows.get('rg')?.code).toBe('rg');
    expect(model.rows.get('gs')?.generation).toBe(2);
  });
});

describe('CdLoader', () => {
  it('SourceGame 매핑 후 Cd 의 sourceGameId FK 주입', async () => {
    const sourceGame = new InMemorySourceGameModel();
    const cd = new InMemoryCdModel();
    const inputs: CdInput[] = [
      buildCd('titlescreen', 'rg', 1, 'Title Screen'),
      buildCd('pallettown', 'rg', 1, 'Pallet Town Theme'),
      buildCd('newbarktown', 'gs', 2, 'New Bark Town Theme'),
    ];
    const result = await loadCd({ sourceGame, cd } as never, inputs);
    // 2 sourceGame insert + 3 cd insert = 5 inserted
    expect(result.stats.inserted).toBe(5);
    expect(cd.rows.size).toBe(3);
    const rgId = sourceGame.rows.get('rg')?.id;
    const gsId = sourceGame.rows.get('gs')?.id;
    expect(rgId).toBeDefined();
    expect(gsId).toBeDefined();
    expect(cd.rows.get('titlescreen')?.sourceGameId).toBe(rgId);
    expect(cd.rows.get('newbarktown')?.sourceGameId).toBe(gsId);
  });

  it('재호출 시 모두 unchanged', async () => {
    const sourceGame = new InMemorySourceGameModel();
    const cd = new InMemoryCdModel();
    const inputs: CdInput[] = [buildCd('titlescreen', 'rg', 1, 'Title Screen')];
    await loadCd({ sourceGame, cd } as never, inputs);
    const second = await loadCd({ sourceGame, cd } as never, inputs);
    // 1 sourceGame unchanged + 1 cd unchanged = 2
    expect(second.stats.unchanged).toBe(2);
    expect(second.stats.inserted).toBe(0);
  });

  it('빈 inputs → no-op (stats 모두 0)', async () => {
    const sourceGame = new InMemorySourceGameModel();
    const cd = new InMemoryCdModel();
    const result = await loadCd({ sourceGame, cd } as never, []);
    expect(result.stats.inserted).toBe(0);
    expect(result.stats.failed).toBe(0);
    expect(sourceGame.rows.size).toBe(0);
    expect(cd.rows.size).toBe(0);
  });
});
