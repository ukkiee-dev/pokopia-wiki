/**
 * LegendaryAcquisitionLoader — Pokemon FK + Location FK(nullable).
 * (Phase 9 선결 코드, Batch C-5)
 *
 * SCHEMA §2.1 매핑:
 *   - LegendaryAcquisition: id + pokemonId UNIQUE + unlockCondition + locationId(nullable)
 *     + effect + 감사.
 *
 * pokemonSlug NOT NULL UNIQUE → pokemon 매핑 실패 시 건너뜀.
 * locationSlug nullable → 미발견 시 NULL.
 * effect 는 SCHEMA NOT NULL 이지만 input optional → unlockCondition 의 일부를 placeholder.
 */

import type { LegendaryAcquisitionInput, PrismaClient } from '@pokopia-wiki/shared';

import { lookupLocationIds } from './location-loader.js';
import { lookupPokemonIds } from './pokemon-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type LegendaryAcquisitionPayload = {
  pokemonId: number;
  unlockCondition: string;
  locationId: number | null;
  effect: string;
  sourceUrl: string;
  scrapedAt: Date;
};

export async function loadLegendaryAcquisition(
  prisma: Pick<PrismaClient, 'legendaryAcquisition' | 'pokemon' | 'location'>,
  inputs: ReadonlyArray<LegendaryAcquisitionInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const pokemonSlugs = inputs.map((input) => input.pokemonSlug);
  const pokemonIds = await lookupPokemonIds(prisma, pokemonSlugs);

  const locationSlugs = inputs
    .map((input) => input.locationSlug)
    .filter((slug): slug is string => slug !== undefined);
  const locationIds = await lookupLocationIds(prisma, locationSlugs);

  const items: Array<{
    sourceSlug: string;
    payload: LegendaryAcquisitionPayload;
    metadata: LegendaryAcquisitionInput;
  }> = [];
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    const pokemonId = pokemonIds.get(input.pokemonSlug);
    if (pokemonId === undefined) {
      failures.push({
        sourceSlug: input.slug,
        error: `Pokemon "${input.pokemonSlug}" 미발견 — LegendaryAcquisition 건너뜀`,
      });
      continue;
    }
    const locationId =
      input.locationSlug !== undefined ? locationIds.get(input.locationSlug) ?? null : null;
    items.push({
      sourceSlug: input.slug,
      payload: {
        pokemonId,
        unlockCondition: input.unlockConditionEn,
        locationId,
        effect: input.effectEn ?? input.unlockConditionEn.slice(0, 200),
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
      },
      metadata: input,
    });
  }

  const result = await upsertBySourceSlug(prisma.legendaryAcquisition as never, items);
  return {
    stats: { ...result.stats, failed: result.stats.failed + failures.length },
    failures: [...result.failures, ...failures],
  };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
