/**
 * PaintColorLoader 단위 테스트 — Phase 9 선결 코드, Batch B.
 *
 * recipe self-ref (paint_recipe) replace 전략 검증 + ingredient name 정규화.
 */

import { describe, expect, it } from 'vitest';

import type { PaintColorInput } from '@pokopia-wiki/shared';

import { loadPaintColor } from './paint-color-loader.js';
import type { SourceSlugKeyedModel } from './upsert-loader.js';

type PaintColorRow = {
  id: number;
  sourceSlug: string;
  contentHash: string;
};

class InMemoryPaintColorModel implements SourceSlugKeyedModel<{ sourceUrl: string; scrapedAt: Date }> {
  rows = new Map<string, PaintColorRow>();
  private nextId = 1;

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: {
    data: { sourceUrl: string; scrapedAt: Date; sourceSlug: string; contentHash: string };
  }): Promise<unknown> {
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
    data: { sourceUrl: string; scrapedAt: Date; contentHash: string };
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

class InMemoryPaintRecipeModel {
  rows: Array<{ resultColorId: number; ingredientColorId: number; quantity: number }> = [];

  async deleteMany(args: { where: { resultColorId: number } }): Promise<{ count: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.resultColorId !== args.where.resultColorId);
    return { count: before - this.rows.length };
  }

  async createMany(args: {
    data: ReadonlyArray<{ resultColorId: number; ingredientColorId: number; quantity: number }>;
    skipDuplicates?: boolean;
  }): Promise<{ count: number }> {
    for (const row of args.data) this.rows.push({ ...row });
    return { count: args.data.length };
  }
}

const META = {
  sourceSite: 'serebii' as const,
  sourceUrl: 'https://www.serebii.net/pokemonpokopia/paint.shtml',
  scrapedAt: '2026-04-25T03:00:00.000Z',
  license: 'Test',
  copyrightHolder: 'Test',
  attribution: 'Test',
};

function buildColor(slug: string, nameEn: string, ingredients: Array<{ itemNameEn: string; quantity: number }> = []): PaintColorInput {
  return { slug, nameEn, ingredients, ...META };
}

describe('PaintColorLoader', () => {
  it('PaintColor 18 종 + paint_recipe replace 동작', async () => {
    const paintColor = new InMemoryPaintColorModel();
    const paintRecipe = new InMemoryPaintRecipeModel();
    const inputs: PaintColorInput[] = [
      buildColor('red', 'Red'),
      buildColor('blue', 'Blue'),
      buildColor('purple', 'Purple', [
        { itemNameEn: 'Red Paint', quantity: 1 },
        { itemNameEn: 'Blue Paint', quantity: 1 },
      ]),
    ];
    const result = await loadPaintColor({ paintColor, paintRecipe } as never, inputs);
    expect(result.stats.inserted).toBe(3);
    expect(paintColor.rows.size).toBe(3);
    // purple = red + blue
    const purpleId = paintColor.rows.get('purple')?.id;
    const redId = paintColor.rows.get('red')?.id;
    const blueId = paintColor.rows.get('blue')?.id;
    expect(purpleId).toBeDefined();
    expect(paintRecipe.rows.filter((row) => row.resultColorId === purpleId)).toHaveLength(2);
    expect(
      paintRecipe.rows.some(
        (row) => row.resultColorId === purpleId && row.ingredientColorId === redId,
      ),
    ).toBe(true);
    expect(
      paintRecipe.rows.some(
        (row) => row.resultColorId === purpleId && row.ingredientColorId === blueId,
      ),
    ).toBe(true);
  });

  it('재호출 시 PaintColor unchanged + recipe replace 후 동일 셋', async () => {
    const paintColor = new InMemoryPaintColorModel();
    const paintRecipe = new InMemoryPaintRecipeModel();
    const inputs: PaintColorInput[] = [
      buildColor('red', 'Red'),
      buildColor('blue', 'Blue'),
      buildColor('purple', 'Purple', [
        { itemNameEn: 'Red Paint', quantity: 1 },
        { itemNameEn: 'Blue Paint', quantity: 1 },
      ]),
    ];
    await loadPaintColor({ paintColor, paintRecipe } as never, inputs);
    const second = await loadPaintColor({ paintColor, paintRecipe } as never, inputs);
    expect(second.stats.unchanged).toBe(3);
    // recipe 셋 동일 (replace 후 재생성)
    const purpleId = paintColor.rows.get('purple')?.id;
    expect(paintRecipe.rows.filter((row) => row.resultColorId === purpleId)).toHaveLength(2);
  });

  it('알 수 없는 ingredient 는 failures 에 기록 (PaintColor 자체는 정상 upsert)', async () => {
    const paintColor = new InMemoryPaintColorModel();
    const paintRecipe = new InMemoryPaintRecipeModel();
    const inputs: PaintColorInput[] = [
      buildColor('red', 'Red'),
      buildColor('mystery', 'Mystery', [
        { itemNameEn: 'Unknown Paint', quantity: 1 },
      ]),
    ];
    const result = await loadPaintColor({ paintColor, paintRecipe } as never, inputs);
    expect(result.stats.inserted).toBe(2);
    expect(result.stats.failed).toBeGreaterThan(0);
    expect(result.failures.some((f) => f.error.includes('Unknown Paint'))).toBe(true);
    expect(paintRecipe.rows.filter((row) => row.resultColorId === 2)).toHaveLength(0);
  });

  it('빈 inputs → no-op', async () => {
    const paintColor = new InMemoryPaintColorModel();
    const paintRecipe = new InMemoryPaintRecipeModel();
    const result = await loadPaintColor({ paintColor, paintRecipe } as never, []);
    expect(result.stats.inserted).toBe(0);
    expect(paintColor.rows.size).toBe(0);
    expect(paintRecipe.rows).toHaveLength(0);
  });
});
