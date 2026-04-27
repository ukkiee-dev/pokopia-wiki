/**
 * PokemonCenterLoader — location FK + materials Item FK.
 * (Phase 9 선결 코드, Batch C-4)
 *
 * SCHEMA §2.13 매핑:
 *   - PokemonCenter: id + locationId FK + requiredEnvLevel + requiredPokemonCount + 감사
 *   - PokemonCenterMaterial: composite PK (centerId, itemId) + quantity
 *
 * materials.itemNameEn 정규화 후 item slug 룩업.
 */

import type { PokemonCenterInput, PrismaClient } from '@pokopia-wiki/shared';

import { lookupItemIds } from './item-loader.js';
import { lookupLocationIds } from './location-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type PokemonCenterLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type PokemonCenterMaterialModel = {
  deleteMany: (args: { where: { centerId: number } }) => Promise<{ count: number }>;
  createMany: (args: {
    data: ReadonlyArray<{ centerId: number; itemId: number; quantity: number }>;
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
};

type PokemonCenterPayload = {
  locationId: number;
  requiredEnvLevel: number;
  requiredPokemonCount: number;
  sourceUrl: string;
  scrapedAt: Date;
};

function normalizeItemSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/gu, '');
}

export async function loadPokemonCenter(
  prisma: Pick<PrismaClient, 'pokemonCenter' | 'pokemonCenterMaterial' | 'location' | 'item'>,
  inputs: ReadonlyArray<PokemonCenterInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const locationSlugs = inputs.map((input) => input.locationSlug);
  const locationIds = await lookupLocationIds(prisma, locationSlugs);

  const itemSlugs = [
    ...new Set(
      inputs.flatMap((input) => input.materials.map((m) => normalizeItemSlug(m.itemNameEn))),
    ),
  ];
  const itemIds = await lookupItemIds(prisma, itemSlugs);

  const items: Array<{
    sourceSlug: string;
    payload: PokemonCenterPayload;
    metadata: PokemonCenterInput;
  }> = [];
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    const locationId = locationIds.get(input.locationSlug);
    if (locationId === undefined) {
      failures.push({
        sourceSlug: input.slug,
        error: `Location "${input.locationSlug}" 미발견 — PokemonCenter 건너뜀`,
      });
      continue;
    }
    items.push({
      sourceSlug: input.slug,
      payload: {
        locationId,
        requiredEnvLevel: input.requiredEnvLevel,
        requiredPokemonCount: input.requiredPokemonCount,
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
      },
      metadata: input,
    });
  }

  const baseResult = await upsertBySourceSlug(prisma.pokemonCenter as never, items);

  // PokemonCenter ID 룩업 → materials replace
  const centerRows = await (
    prisma.pokemonCenter as unknown as PokemonCenterLookupModel
  ).findMany({
    where: { sourceSlug: { in: items.map((it) => it.sourceSlug) } },
    select: { id: true, sourceSlug: true },
  });
  const centerSlugToId = new Map(centerRows.map((row) => [row.sourceSlug, row.id]));

  for (const input of inputs) {
    const centerId = centerSlugToId.get(input.slug);
    if (centerId === undefined) continue;

    const materialRows: Array<{ centerId: number; itemId: number; quantity: number }> = [];
    for (const m of input.materials) {
      const itemId = itemIds.get(normalizeItemSlug(m.itemNameEn));
      if (itemId === undefined) {
        failures.push({
          sourceSlug: input.slug,
          error: `material "${m.itemNameEn}" → item slug 미발견 — 건너뜀`,
        });
        continue;
      }
      materialRows.push({ centerId, itemId, quantity: m.quantity });
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await (
        prisma.pokemonCenterMaterial as unknown as PokemonCenterMaterialModel
      ).deleteMany({ where: { centerId } });
      if (materialRows.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await (
          prisma.pokemonCenterMaterial as unknown as PokemonCenterMaterialModel
        ).createMany({ data: materialRows, skipDuplicates: true });
      }
    } catch (error: unknown) {
      failures.push({
        sourceSlug: input.slug,
        error: `PokemonCenterMaterial replace 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    stats: { ...baseResult.stats, failed: baseResult.stats.failed + failures.length },
    failures: [...baseResult.failures, ...failures],
  };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
