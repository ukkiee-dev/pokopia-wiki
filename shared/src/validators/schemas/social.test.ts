/**
 * Social 도메인 Zod 스키마 스모크 테스트 (Phase 8 단계 7).
 *
 * 현재 커버: `FavoriteCategorySchema`.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Prisma } from '../../prisma-client';
import { FavoriteCategorySchema, type FavoriteCategoryInput } from './social';

const SOURCE_META = {
  sourceSite: 'serebii' as const,
  scrapedAt: '2026-04-25T00:00:00.000Z',
  license: 'Fan-use (non-commercial).',
  copyrightHolder: '© The Pokémon Company.',
  attribution: 'Data from Serebii.net',
};

const SOURCE_URL = 'https://www.serebii.net/pokemonpokopia/favorites.shtml';

describe('FavoriteCategorySchema.safeParse()', () => {
  it('accepts a valid favorite category (slug + nameEn)', () => {
    const result = FavoriteCategorySchema.safeParse({
      slug: 'blockystuff',
      nameEn: 'Blocky stuff',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.slug).toBe('blockystuff');
    expect(result.data.descriptionEn).toBeUndefined();
  });

  it('rejects missing slug', () => {
    const result = FavoriteCategorySchema.safeParse({
      nameEn: 'Blocky stuff',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path.includes('slug'))).toBe(true);
  });

  it('rejects missing nameEn', () => {
    const result = FavoriteCategorySchema.safeParse({
      slug: 'blockystuff',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path.includes('nameEn'))).toBe(true);
  });
});

describe('FavoriteCategoryInput — Prisma type compatibility', () => {
  it('FavoriteCategoryInput.slug is assignable to Prisma.FavoriteCategoryCreateInput.sourceSlug', () => {
    expectTypeOf<FavoriteCategoryInput['slug']>().toExtend<
      Prisma.FavoriteCategoryCreateInput['sourceSlug']
    >();
  });
});
