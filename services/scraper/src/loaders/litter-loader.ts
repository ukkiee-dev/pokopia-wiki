/**
 * PokemonLitterRewardLoader — Pokemon FK + Item FK + Habitat FK(nullable).
 * (Phase 9 선결 코드, Batch C-5)
 *
 * SCHEMA §2.27 매핑:
 *   - PokemonLitterReward: id + pokemonId FK + itemId FK + habitatId(nullable) FK +
 *     dropRate(nullable). composite UNIQUE (pokemonId, itemId, habitatId).
 *
 * 본 loader 는 sourceSlug 가 없는 entity (composite UNIQUE 만) 라 upsertBySourceSlug
 * 미적용. deleteMany pokemonId + createMany 의 replace 전략 (한 pokemon 의 모든
 * litter reward 셋을 한꺼번에 교체).
 */

import type { PokemonLitterRewardInput, PrismaClient } from '@pokopia-wiki/shared';

import { lookupHabitatIds } from './habitat-loader.js';
import { lookupItemIds } from './item-loader.js';
import { lookupPokemonIds } from './pokemon-loader.js';
import type { UpsertResult, UpsertStats } from './upsert-loader.js';

type PokemonLitterRewardModel = {
  deleteMany: (args: { where: { pokemonId: number } }) => Promise<{ count: number }>;
  createMany: (args: {
    data: ReadonlyArray<{
      pokemonId: number;
      itemId: number;
      habitatId: number | null;
      dropRate: number | null;
    }>;
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
};

export async function loadPokemonLitterReward(
  prisma: Pick<PrismaClient, 'pokemonLitterReward' | 'pokemon' | 'item' | 'habitat'>,
  inputs: ReadonlyArray<PokemonLitterRewardInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const pokemonSlugs = [...new Set(inputs.map((input) => input.pokemonSlug))];
  const pokemonIds = await lookupPokemonIds(prisma, pokemonSlugs);

  const itemSlugs = [...new Set(inputs.map((input) => input.itemSlug))];
  const itemIds = await lookupItemIds(prisma, itemSlugs);

  const habitatSlugs = inputs
    .map((input) => input.habitatSlug)
    .filter((slug): slug is string => slug !== undefined);
  const habitatIds = await lookupHabitatIds(prisma, habitatSlugs);

  const stats: UpsertStats = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  // Group rewards by pokemonId for replace 전략
  const rowsByPokemon = new Map<
    number,
    Array<{ pokemonId: number; itemId: number; habitatId: number | null; dropRate: number | null }>
  >();
  for (const input of inputs) {
    const pokemonId = pokemonIds.get(input.pokemonSlug);
    const itemId = itemIds.get(input.itemSlug);
    if (pokemonId === undefined) {
      stats.failed += 1;
      failures.push({ sourceSlug: input.pokemonSlug, error: `Pokemon "${input.pokemonSlug}" 미발견` });
      continue;
    }
    if (itemId === undefined) {
      stats.failed += 1;
      failures.push({ sourceSlug: input.pokemonSlug, error: `Item "${input.itemSlug}" 미발견` });
      continue;
    }
    const habitatId =
      input.habitatSlug !== undefined ? habitatIds.get(input.habitatSlug) ?? null : null;
    const list = rowsByPokemon.get(pokemonId) ?? [];
    list.push({ pokemonId, itemId, habitatId, dropRate: input.dropRate ?? null });
    rowsByPokemon.set(pokemonId, list);
  }

  for (const [pokemonId, rows] of rowsByPokemon) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await (prisma.pokemonLitterReward as unknown as PokemonLitterRewardModel).deleteMany({
        where: { pokemonId },
      });
      // eslint-disable-next-line no-await-in-loop
      await (prisma.pokemonLitterReward as unknown as PokemonLitterRewardModel).createMany({
        data: rows,
        skipDuplicates: true,
      });
      stats.inserted += rows.length;
    } catch (error: unknown) {
      stats.failed += rows.length;
      failures.push({
        sourceSlug: `pokemon-${String(pokemonId)}`,
        error: `PokemonLitterReward replace 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { stats, failures };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
