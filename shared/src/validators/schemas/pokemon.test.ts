/**
 * Pokemon Zod 스키마 스모크 테스트 (Task 2.2).
 *
 * - runtime: safeParse 성공/실패 동작 확인
 * - compile-time: z.infer 결과와 Prisma.PokemonCreateInput 의 공통 필드가 할당 가능한지
 *   expectTypeOf 로 검증 (loader 단계에서 Zod 출력을 Prisma create 인자로 재가공할 수 있음을 보장)
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Prisma } from '../../prisma-client';
import { PokemonSchema, type PokemonInput } from './pokemon';

/** 모든 safeParse 테스트가 공유하는 SourceMetadata 페이로드 (fixture). */
const SOURCE_META = {
  sourceSite: 'serebii' as const,
  scrapedAt: '2026-04-19T00:00:00.000Z',
  license: 'Fan-use (non-commercial).',
  copyrightHolder: '© The Pokémon Company.',
  attribution: 'Data from Serebii.net',
};

describe('PokemonSchema.safeParse()', () => {
  it('accepts a valid Serebii parse result and preserves all 7 SourceMetadata fields', () => {
    const result = PokemonSchema.safeParse({
      pokedexNo: 25,
      nameEn: 'Pikachu',
      imageUrl: 'https://www.serebii.net/pokemonpokopia/pokemon/025.png',
      specialties: ['Electric'],
      sourceUrl: 'https://www.serebii.net/pokemonpokopia/pokemon/025.shtml',
      ...SOURCE_META,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.sourceSite).toBe('serebii');
    expect(result.data.license).toBe('Fan-use (non-commercial).');
    expect(result.data.derivedFrom).toBeUndefined();
    expect(result.data.isEvent).toBe(false);
    expect(result.data.isUniqueCharacter).toBe(false);
    expect(result.data.isLegendary).toBe(false);
  });

  it('rejects input missing required nameEn', () => {
    const result = PokemonSchema.safeParse({
      pokedexNo: 25,
      sourceUrl: 'https://www.serebii.net/pokemonpokopia/pokemon/025.shtml',
      ...SOURCE_META,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.includes('nameEn'))).toBe(true);
  });

  it('accepts null pokedexNo (event / unique character per SCHEMA §2.1)', () => {
    const result = PokemonSchema.safeParse({
      pokedexNo: null,
      nameEn: 'Peakychu',
      isUniqueCharacter: true,
      sourceUrl: 'https://www.serebii.net/pokemonpokopia/pokemon/peakychu.shtml',
      ...SOURCE_META,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.pokedexNo).toBeNull();
    expect(result.data.isUniqueCharacter).toBe(true);
  });
});

describe('PokemonInput — Prisma type compatibility', () => {
  it('PokemonInput.pokedexNo is assignable to Prisma.PokemonCreateInput.pokedexNo', () => {
    // Prisma: `pokedexNo?: number | null`  ← optional + nullable
    // Zod:   `pokedexNo:  number | null`   ← required but nullable
    // (number | null) extends (number | null | undefined) ⇒ true
    expectTypeOf<PokemonInput['pokedexNo']>().toExtend<Prisma.PokemonCreateInput['pokedexNo']>();
  });

  it('PokemonInput boolean flags are assignable to matching Prisma.PokemonCreateInput fields', () => {
    expectTypeOf<PokemonInput['isEvent']>().toExtend<NonNullable<Prisma.PokemonCreateInput['isEvent']>>();
    expectTypeOf<PokemonInput['isUniqueCharacter']>().toExtend<
      NonNullable<Prisma.PokemonCreateInput['isUniqueCharacter']>
    >();
    expectTypeOf<PokemonInput['isLegendary']>().toExtend<NonNullable<Prisma.PokemonCreateInput['isLegendary']>>();
  });
});
