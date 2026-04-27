/**
 * Pokemon-FK 의존 loader 단위 테스트 (Batch C-5 통합).
 *
 * Habitat / LegendaryAcquisition / UniquePokemonPatch / MagnetRise / Event /
 * PokemonLitterReward / DittoAbility 의 핵심 FK 매핑 동작을 in-memory mock 으로
 * 검증.
 */

import { describe, expect, it } from 'vitest';

import type {
  EventInput,
  EventPokemonInput,
  HabitatInput,
  LegendaryAcquisitionInput,
  MagnetRiseItemInput,
  PokemonLitterRewardInput,
  UniquePokemonPatchInput,
} from '@pokopia-wiki/shared';

import { loadEvent, loadEventPokemon } from './event-loader.js';
import { loadHabitat } from './habitat-loader.js';
import { loadLegendaryAcquisition } from './legendary-loader.js';
import { loadPokemonLitterReward } from './litter-loader.js';
import { loadMagnetRise } from './magnet-rise-loader.js';
import { loadUniquePokemonPatch } from './unique-pokemon-loader.js';

class InMemoryLookupModel {
  rows = new Map<string, { id: number; sourceSlug: string }>();
  private nextId = 1;
  add(slug: string): number {
    const id = this.nextId++;
    this.rows.set(slug, { id, sourceSlug: slug });
    return id;
  }
  async findMany(args: { where: { sourceSlug: { in: string[] } }; select: { id: true; sourceSlug: true } }): Promise<ReadonlyArray<{ id: number; sourceSlug: string }>> {
    return [...this.rows.values()].filter((row) => args.where.sourceSlug.in.includes(row.sourceSlug));
  }
}

class InMemoryUpsertModel {
  rows = new Map<string, { id: number; sourceSlug: string; contentHash: string; payload: Record<string, unknown> }>();
  private nextId = 1;
  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }
  async create(args: { data: Record<string, unknown> & { sourceSlug: string; contentHash: string } }): Promise<unknown> {
    const id = this.nextId++;
    this.rows.set(args.data.sourceSlug, { id, sourceSlug: args.data.sourceSlug, contentHash: args.data.contentHash, payload: { ...args.data } });
    return { id };
  }
  async update(args: { where: { sourceSlug: string }; data: Record<string, unknown> & { contentHash: string } }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, { ...existing, contentHash: args.data.contentHash, payload: { ...existing.payload, ...args.data } });
    return existing;
  }
  async findMany(args: { where: { sourceSlug: { in: string[] } }; select: { id: true; sourceSlug: true } }): Promise<ReadonlyArray<{ id: number; sourceSlug: string }>> {
    return [...this.rows.values()].filter((row) => args.where.sourceSlug.in.includes(row.sourceSlug));
  }
}

class InMemoryNestedModel {
  rows: Array<Record<string, unknown>> = [];
  async deleteMany(args: { where: Record<string, number> }): Promise<{ count: number }> {
    const key = Object.keys(args.where)[0]!;
    const value = args.where[key];
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row[key] !== value);
    return { count: before - this.rows.length };
  }
  async createMany(args: { data: ReadonlyArray<Record<string, unknown>>; skipDuplicates?: boolean }): Promise<{ count: number }> {
    for (const row of args.data) this.rows.push({ ...row });
    return { count: args.data.length };
  }
}

class InMemoryUpdateModel {
  rows = new Map<string, { sourceSlug: string; isUniqueCharacter?: boolean; isMagnetRiseOnly?: boolean }>();
  add(slug: string): void {
    this.rows.set(slug, { sourceSlug: slug, isUniqueCharacter: false, isMagnetRiseOnly: false });
  }
  async update(args: { where: { sourceSlug: string }; data: { isUniqueCharacter?: boolean; isMagnetRiseOnly?: boolean } }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, { ...existing, ...args.data });
    return existing;
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

describe('loadHabitat', () => {
  it('Pokemon FK 매핑 + HabitatPokemon replace', async () => {
    const habitat = new InMemoryUpsertModel();
    const habitatPokemon = new InMemoryNestedModel();
    const pokemon = new InMemoryLookupModel();
    const pikaId = pokemon.add('pikachu');
    pokemon.add('bulbasaur');

    const inputs: HabitatInput[] = [
      {
        slug: 'grassland',
        habitatNo: 1,
        nameEn: 'Grassland',
        isEvent: false,
        pokemonSlugs: ['pikachu', 'bulbasaur'],
        ...META,
      },
    ];
    const result = await loadHabitat(
      { habitat, habitatPokemon, pokemon } as never,
      inputs,
    );
    expect(result.stats.inserted).toBe(1);
    const hab = habitat.rows.get('grassland');
    expect(habitatPokemon.rows).toHaveLength(2);
    expect(habitatPokemon.rows.some((row) => row.habitatId === hab?.id && row.pokemonId === pikaId)).toBe(true);
  });

  it('Pokemon 미발견 → failures (habitat 자체는 정상 upsert)', async () => {
    const habitat = new InMemoryUpsertModel();
    const habitatPokemon = new InMemoryNestedModel();
    const pokemon = new InMemoryLookupModel();
    pokemon.add('pikachu');
    const inputs: HabitatInput[] = [
      { slug: 'h', habitatNo: 1, nameEn: 'H', isEvent: false, pokemonSlugs: ['pikachu', 'unknown'], ...META },
    ];
    const result = await loadHabitat({ habitat, habitatPokemon, pokemon } as never, inputs);
    expect(result.stats.inserted).toBe(1);
    expect(result.stats.failed).toBeGreaterThan(0);
    expect(habitatPokemon.rows).toHaveLength(1); // 미발견 unknown 만 skip
  });
});

describe('loadLegendaryAcquisition', () => {
  it('Pokemon FK + Location FK(nullable) 매핑', async () => {
    const legendaryAcquisition = new InMemoryUpsertModel();
    const pokemon = new InMemoryLookupModel();
    const location = new InMemoryLookupModel();
    const articunoId = pokemon.add('articuno');
    const dreamId = location.add('dreamisland');

    const inputs: LegendaryAcquisitionInput[] = [
      {
        slug: 'legendary-articuno',
        pokemonSlug: 'articuno',
        pokemonNameEn: 'Articuno',
        unlockConditionEn: 'Find in Dream Islands',
        locationSlug: 'dreamisland',
        sourceSectionEn: 'Articuno',
        ...META,
      },
    ];
    const result = await loadLegendaryAcquisition(
      { legendaryAcquisition, pokemon, location } as never,
      inputs,
    );
    expect(result.stats.inserted).toBe(1);
    const row = legendaryAcquisition.rows.get('legendary-articuno');
    expect(row?.payload.pokemonId).toBe(articunoId);
    expect(row?.payload.locationId).toBe(dreamId);
  });
});

describe('loadUniquePokemonPatch', () => {
  it('isUniqueCharacter=true 마킹', async () => {
    const pokemon = new InMemoryUpdateModel();
    pokemon.add('mosslax');
    const inputs: UniquePokemonPatchInput[] = [
      { slug: 'mosslax', nameEn: 'Mosslax', ...META },
    ];
    const result = await loadUniquePokemonPatch({ pokemon } as never, inputs);
    expect(result.stats.updated).toBe(1);
    expect(pokemon.rows.get('mosslax')?.isUniqueCharacter).toBe(true);
  });

  it('Pokemon 미발견 → failures', async () => {
    const pokemon = new InMemoryUpdateModel();
    const inputs: UniquePokemonPatchInput[] = [{ slug: 'unknown', nameEn: 'Unknown', ...META }];
    const result = await loadUniquePokemonPatch({ pokemon } as never, inputs);
    expect(result.stats.failed).toBe(1);
  });
});

describe('loadMagnetRise', () => {
  it('isMagnetRiseOnly=true 마킹', async () => {
    const item = new InMemoryUpdateModel();
    item.add('pokeballrock');
    const inputs: MagnetRiseItemInput[] = [
      { slug: 'pokeballrock', nameEn: 'Pokeball Rock', ...META },
    ];
    const result = await loadMagnetRise({ item } as never, inputs);
    expect(result.stats.updated).toBe(1);
    expect(item.rows.get('pokeballrock')?.isMagnetRiseOnly).toBe(true);
  });
});

describe('loadEvent + loadEventPokemon', () => {
  it('Event placeholder 1 + EventPokemon 매핑', async () => {
    const event = new InMemoryUpsertModel();
    const eventPokemon = new InMemoryNestedModel();
    const pokemon = new InMemoryLookupModel();
    const hoppipId = pokemon.add('hoppip');

    const eventInputs: EventInput[] = [
      {
        slug: 'event-eventpokedex-default',
        nameEn: 'Default Event',
        isRecurring: false,
        ...META,
      },
    ];
    await loadEvent({ event } as never, eventInputs);
    const eventId = event.rows.get('event-eventpokedex-default')?.id;
    expect(eventId).toBeDefined();

    const eventPokemonInputs: EventPokemonInput[] = [
      {
        slug: 'event-pokemon-eventpokedex-default-hoppip',
        eventSlug: 'event-eventpokedex-default',
        pokemonSlug: 'hoppip',
        pokemonNameEn: 'Hoppip',
        eventPokedexNo: 1,
        ...META,
      },
    ];
    const result = await loadEventPokemon(
      { event, eventPokemon, pokemon } as never,
      eventPokemonInputs,
    );
    expect(result.stats.inserted).toBe(1);
    expect(eventPokemon.rows).toContainEqual({ eventId, pokemonId: hoppipId });
  });
});

describe('loadPokemonLitterReward', () => {
  it('pokemon + item FK 매핑 + replace', async () => {
    const pokemonLitterReward = new InMemoryNestedModel();
    const pokemon = new InMemoryLookupModel();
    const item = new InMemoryLookupModel();
    const habitat = new InMemoryLookupModel();
    const pikaId = pokemon.add('pikachu');
    const leafId = item.add('leaf');

    const inputs: PokemonLitterRewardInput[] = [
      {
        slug: 'litter-reward-pikachu-leaf',
        pokemonSlug: 'pikachu',
        pokemonNameEn: 'Pikachu',
        pokedexNo: 25,
        itemSlug: 'leaf',
        itemNameEn: 'Leaf',
        ...META,
      },
    ];
    const result = await loadPokemonLitterReward(
      { pokemonLitterReward, pokemon, item, habitat } as never,
      inputs,
    );
    expect(result.stats.inserted).toBe(1);
    expect(pokemonLitterReward.rows).toContainEqual({
      pokemonId: pikaId,
      itemId: leafId,
      habitatId: null,
      dropRate: null,
    });
  });
});
