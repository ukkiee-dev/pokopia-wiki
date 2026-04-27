/**
 * HabitatLoader — Habitat + HabitatPokemon nested.
 * (Phase 9 선결 코드, Batch C-5)
 *
 * SCHEMA §2.5 매핑:
 *   - Habitat: id + habitatNo(nullable, unique) + isEvent + 감사 + i18n.
 *   - HabitatPokemon: composite PK (habitatId, pokemonId, timeCondition,
 *     weatherCondition). time/weather 본 페이지 부재 → default 'Any', 'Any'.
 *
 * pokemonSlugs → Pokemon.id 매핑 (lookupPokemonIds). 미발견 pokemon 은 skip.
 */

import type { HabitatInput, PrismaClient } from '@pokopia-wiki/shared';

import { lookupPokemonIds } from './pokemon-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type HabitatLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type HabitatPokemonModel = {
  deleteMany: (args: { where: { habitatId: number } }) => Promise<{ count: number }>;
  createMany: (args: {
    data: ReadonlyArray<{
      habitatId: number;
      pokemonId: number;
      timeCondition: string;
      weatherCondition: string;
    }>;
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
};

export async function loadHabitat(
  prisma: Pick<PrismaClient, 'habitat' | 'habitatPokemon' | 'pokemon'>,
  inputs: ReadonlyArray<HabitatInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  // (1) Pokemon 룩업 (모든 habitat 의 pokemonSlugs 합)
  const allPokemonSlugs = [...new Set(inputs.flatMap((input) => input.pokemonSlugs))];
  const pokemonIds = await lookupPokemonIds(prisma, allPokemonSlugs);

  // (2) Habitat 본 entity upsert
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      habitatNo: input.habitatNo,
      isEvent: input.isEvent,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  const baseResult = await upsertBySourceSlug(prisma.habitat as never, items);

  // (3) Habitat ID 룩업
  const habitatRows = await (prisma.habitat as unknown as HabitatLookupModel).findMany({
    where: { sourceSlug: { in: items.map((it) => it.sourceSlug) } },
    select: { id: true, sourceSlug: true },
  });
  const habitatSlugToId = new Map(habitatRows.map((row) => [row.sourceSlug, row.id]));

  // (4) HabitatPokemon replace
  const failures: Array<{ sourceSlug: string; error: string }> = [];
  for (const input of inputs) {
    const habitatId = habitatSlugToId.get(input.slug);
    if (habitatId === undefined) continue;

    const habitatPokemonRows: Array<{
      habitatId: number;
      pokemonId: number;
      timeCondition: string;
      weatherCondition: string;
    }> = [];
    for (const pokemonSlug of input.pokemonSlugs) {
      const pokemonId = pokemonIds.get(pokemonSlug);
      if (pokemonId === undefined) {
        failures.push({
          sourceSlug: input.slug,
          error: `pokemon "${pokemonSlug}" 미발견 — HabitatPokemon 건너뜀`,
        });
        continue;
      }
      habitatPokemonRows.push({
        habitatId,
        pokemonId,
        timeCondition: 'Any',
        weatherCondition: 'Any',
      });
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await (prisma.habitatPokemon as unknown as HabitatPokemonModel).deleteMany({
        where: { habitatId },
      });
      if (habitatPokemonRows.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await (prisma.habitatPokemon as unknown as HabitatPokemonModel).createMany({
          data: habitatPokemonRows,
          skipDuplicates: true,
        });
      }
    } catch (error: unknown) {
      failures.push({
        sourceSlug: input.slug,
        error: `HabitatPokemon replace 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    stats: { ...baseResult.stats, failed: baseResult.stats.failed + failures.length },
    failures: [...baseResult.failures, ...failures],
  };
}

/**
 * Habitat ID 룩업 helper (다른 loader 의 habitat FK 해소 시 재사용).
 */
export async function lookupHabitatIds(
  prisma: Pick<PrismaClient, 'habitat'>,
  slugs: ReadonlyArray<string>,
): Promise<Map<string, number>> {
  if (slugs.length === 0) return new Map();
  const rows = await (prisma.habitat as unknown as HabitatLookupModel).findMany({
    where: { sourceSlug: { in: [...new Set(slugs)] } },
    select: { id: true, sourceSlug: true },
  });
  return new Map(rows.map((row) => [row.sourceSlug, row.id]));
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
