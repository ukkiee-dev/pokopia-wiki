/**
 * PokemonLoader 단위 테스트 — Phase 9 선결 코드.
 *
 * Prisma model in-memory mock 으로 PokemonInput → upsert payload 매핑 + sourceSlug
 * 추출 검증.
 */

import { describe, expect, it } from 'vitest';

import type { PokemonInput } from '@pokopia-wiki/shared';

import { loadPokemon } from './pokemon-loader.js';
import type { SourceSlugKeyedModel } from './upsert-loader.js';

type PokemonPayload = {
  pokedexNo: number | null;
  isEvent: boolean;
  isUniqueCharacter: boolean;
  isLegendary: boolean;
  sourceUrl: string;
  scrapedAt: Date;
};

class InMemoryPokemonModel implements SourceSlugKeyedModel<PokemonPayload> {
  rows = new Map<
    string,
    PokemonPayload & { sourceSlug: string; contentHash: string; updatedAt?: Date }
  >();

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: { data: PokemonPayload & { sourceSlug: string; contentHash: string } }): Promise<unknown> {
    this.rows.set(args.data.sourceSlug, { ...args.data });
    return args.data;
  }

  async update(args: {
    where: { sourceSlug: string };
    data: PokemonPayload & { contentHash: string; updatedAt?: Date };
  }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, { ...existing, ...args.data });
    return args.data;
  }
}

function buildInput(overrides: Partial<PokemonInput> = {}): PokemonInput {
  return {
    pokedexNo: 25,
    nameEn: 'Pikachu',
    isEvent: false,
    isUniqueCharacter: false,
    isLegendary: false,
    specialties: [],
    sourceSite: 'serebii',
    sourceUrl: 'https://www.serebii.net/pokemonpokopia/pokedex/pikachu.shtml',
    scrapedAt: '2026-04-25T03:00:00.000Z',
    license: 'Test',
    copyrightHolder: 'Test',
    attribution: 'Test',
    ...overrides,
  } as PokemonInput;
}

describe('PokemonLoader', () => {
  it('단일 input → sourceSlug=pikachu 추출 + insert', async () => {
    const model = new InMemoryPokemonModel();
    const result = await loadPokemon(model, [buildInput()]);
    expect(result.stats.inserted).toBe(1);
    const row = model.rows.get('pikachu');
    expect(row?.pokedexNo).toBe(25);
    expect(row?.sourceUrl).toBe('https://www.serebii.net/pokemonpokopia/pokedex/pikachu.shtml');
  });

  it('하이픈 포함 slug — Ho-Oh', async () => {
    const model = new InMemoryPokemonModel();
    await loadPokemon(model, [
      buildInput({
        nameEn: 'Ho-Oh',
        sourceUrl: 'https://www.serebii.net/pokemonpokopia/pokedex/ho-oh.shtml',
        isLegendary: true,
      }),
    ]);
    expect(model.rows.has('ho-oh')).toBe(true);
    expect(model.rows.get('ho-oh')?.isLegendary).toBe(true);
  });

  it('null pokedexNo (이벤트/유니크 케이스) 허용', async () => {
    const model = new InMemoryPokemonModel();
    await loadPokemon(model, [
      buildInput({
        pokedexNo: null,
        nameEn: 'Mosslax',
        sourceUrl: 'https://www.serebii.net/pokemonpokopia/pokedex/mosslax.shtml',
        isUniqueCharacter: true,
      }),
    ]);
    expect(model.rows.get('mosslax')?.pokedexNo).toBeNull();
    expect(model.rows.get('mosslax')?.isUniqueCharacter).toBe(true);
  });

  it('scrapedAt ISO string → Date 변환', async () => {
    const model = new InMemoryPokemonModel();
    await loadPokemon(model, [buildInput()]);
    const row = model.rows.get('pikachu');
    expect(row?.scrapedAt).toBeInstanceOf(Date);
    expect(row?.scrapedAt.toISOString()).toBe('2026-04-25T03:00:00.000Z');
  });

  it('동일 input 두 번 — 한 번 inserted, 한 번 unchanged', async () => {
    const model = new InMemoryPokemonModel();
    const input = buildInput();
    await loadPokemon(model, [input]);
    const second = await loadPokemon(model, [input]);
    expect(second.stats.unchanged).toBe(1);
    expect(second.stats.inserted).toBe(0);
  });
});
