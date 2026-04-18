/**
 * Item Zod 스키마 스모크 테스트 (Task 2.2).
 *
 * - runtime: safeParse 성공/실패 동작 확인 + `.default('')` 적용 확인
 * - compile-time: z.infer 결과의 category / boolean 플래그가 Prisma.ItemCreateInput 과
 *   할당 호환임을 expectTypeOf 로 검증
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Prisma } from '../../prisma-client';
import { ItemSchema, type ItemInput } from './item';

/** 모든 safeParse 테스트가 공유하는 SourceMetadata 페이로드 (fixture). */
const SOURCE_META = {
  sourceSite: 'serebii' as const,
  sourceUrl: 'https://www.serebii.net/pokemonpokopia/items/',
  scrapedAt: '2026-04-19T00:00:00.000Z',
  license: 'Fan-use (non-commercial).',
  copyrightHolder: '© The Pokémon Company.',
  attribution: 'Data from Serebii.net',
};

describe('ItemSchema.safeParse()', () => {
  it('accepts a valid Serebii parse result and preserves all 7 SourceMetadata fields', () => {
    const result = ItemSchema.safeParse({
      nameEn: 'Apple',
      description: 'A sweet red fruit.',
      category: 'Food',
      tags: ['Food'],
      locations: [{ method: 'Natural', locationName: 'Grassland' }],
      imageUrl: 'https://www.serebii.net/pokemonpokopia/items/apple.png',
      ...SOURCE_META,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sourceSite).toBe('serebii');
    expect(result.data.attribution).toBe('Data from Serebii.net');
    expect(result.data.derivedFrom).toBeUndefined();
    expect(result.data.isPaintable).toBe(false);
    expect(result.data.tags).toEqual(['Food']);
  });

  it('fills `description` from `.default("")` when omitted', () => {
    const result = ItemSchema.safeParse({
      nameEn: 'Wood',
      category: 'Materials',
      ...SOURCE_META,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.description).toBe('');
    expect(result.data.tags).toEqual([]);
    expect(result.data.locations).toEqual([]);
  });

  it('rejects an unknown ItemCategory literal', () => {
    const result = ItemSchema.safeParse({
      nameEn: 'Mystery',
      category: 'NotAnItemCategory',
      ...SOURCE_META,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.includes('category'))).toBe(true);
  });
});

describe('ItemInput — Prisma type compatibility', () => {
  it('ItemInput.category is assignable to Prisma.ItemCreateInput.category', () => {
    // Prisma `category: $Enums.ItemCategory` ⇐ 상수 문자열 유니언.
    // Zod `z.enum([...])` 출력도 동일 리터럴 유니언이므로 구조적으로 일치.
    expectTypeOf<ItemInput['category']>().toExtend<Prisma.ItemCreateInput['category']>();
  });

  it('ItemInput boolean flags are assignable to matching Prisma.ItemCreateInput fields', () => {
    expectTypeOf<ItemInput['isPaintable']>().toExtend<NonNullable<Prisma.ItemCreateInput['isPaintable']>>();
    expectTypeOf<ItemInput['isPatternable']>().toExtend<NonNullable<Prisma.ItemCreateInput['isPatternable']>>();
    expectTypeOf<ItemInput['isMagnetRiseOnly']>().toExtend<NonNullable<Prisma.ItemCreateInput['isMagnetRiseOnly']>>();
  });
});
