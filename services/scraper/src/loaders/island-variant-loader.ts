/**
 * IslandVariantLoader — IslandVariant + nested IslandReward.
 * (Phase 9 선결 코드, Batch C-4)
 *
 * SCHEMA §2.24 매핑:
 *   - IslandVariant: id + locationId FK + difficulty(nullable) +
 *     guaranteedLegendaryId(nullable, Pokemon FK) + 감사 + i18n + rewards.
 *   - IslandReward: id + islandVariantId FK + rewardType + rewardRefId(NOT NULL) + dropRate.
 *
 * guaranteedLegendaryId 는 Pokemon FK 매핑 어려움 (Pokemon source_slug 형태
 * 미정) → 항상 NULL 주입 후 보강.
 *
 * IslandReward 의 rewardType=item 만 매핑 시도, cd/recipe 는 매핑 후처리.
 * IslandReward 는 별도 sourceSlug 가 있어야 upsertBySourceSlug 사용 가능 (자연키:
 * variant slug + reward type + ref slug 합성).
 */

import type { IslandVariantInput, PrismaClient } from '@pokopia-wiki/shared';

import { lookupItemIds } from './item-loader.js';
import { lookupLocationIds } from './location-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type IslandVariantLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type CdLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type CraftingRecipeLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type IslandRewardModel = {
  deleteMany: (args: { where: { islandVariantId: number } }) => Promise<{ count: number }>;
  createMany: (args: {
    data: ReadonlyArray<{
      islandVariantId: number;
      rewardType: string;
      rewardRefId: number;
      dropRate: number | null;
      sourceSlug: string;
      sourceUrl: string;
      scrapedAt: Date;
      contentHash: string;
    }>;
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
};

type IslandVariantPayload = {
  locationId: number;
  difficulty: number | null;
  guaranteedLegendaryId: number | null;
  sourceUrl: string;
  scrapedAt: Date;
};

export async function loadIslandVariant(
  prisma: Pick<
    PrismaClient,
    'islandVariant' | 'islandReward' | 'location' | 'item' | 'cd' | 'craftingRecipe'
  >,
  inputs: ReadonlyArray<IslandVariantInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const locationSlugs = inputs.map((input) => input.locationSlug);
  const locationIds = await lookupLocationIds(prisma, locationSlugs);

  // Reward 매핑 준비
  const itemRewardSlugs = inputs.flatMap((input) =>
    input.rewards.filter((r) => r.rewardType === 'item').map((r) => r.itemSlug),
  );
  const itemIds = await lookupItemIds(prisma, itemRewardSlugs);

  const cdRewardSlugs = inputs.flatMap((input) =>
    input.rewards.filter((r) => r.rewardType === 'cd').map((r) => r.itemSlug),
  );
  const cdRows = cdRewardSlugs.length > 0
    ? await (prisma.cd as unknown as CdLookupModel).findMany({
      where: { sourceSlug: { in: [...new Set(cdRewardSlugs)] } },
      select: { id: true, sourceSlug: true },
    })
    : [];
  const cdSlugToId = new Map(cdRows.map((row) => [row.sourceSlug, row.id]));

  const recipeRewardSlugs = inputs.flatMap((input) =>
    input.rewards.filter((r) => r.rewardType === 'recipe').map((r) => `crafting-${r.itemSlug}`),
  );
  const recipeRows = recipeRewardSlugs.length > 0
    ? await (prisma.craftingRecipe as unknown as CraftingRecipeLookupModel).findMany({
      where: { sourceSlug: { in: [...new Set(recipeRewardSlugs)] } },
      select: { id: true, sourceSlug: true },
    })
    : [];
  const recipeSlugToId = new Map(recipeRows.map((row) => [row.sourceSlug, row.id]));

  // (1) IslandVariant 본 entity upsert
  const items: Array<{
    sourceSlug: string;
    payload: IslandVariantPayload;
    metadata: IslandVariantInput;
  }> = [];
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    const locationId = locationIds.get(input.locationSlug);
    if (locationId === undefined) {
      failures.push({
        sourceSlug: input.slug,
        error: `Location "${input.locationSlug}" 미발견 — IslandVariant 건너뜀`,
      });
      continue;
    }
    items.push({
      sourceSlug: input.slug,
      payload: {
        locationId,
        difficulty: null,
        guaranteedLegendaryId: null,
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
      },
      metadata: input,
    });
  }

  const baseResult = await upsertBySourceSlug(prisma.islandVariant as never, items);

  // (2) IslandVariant ID 룩업
  const variantRows = await (
    prisma.islandVariant as unknown as IslandVariantLookupModel
  ).findMany({
    where: { sourceSlug: { in: items.map((it) => it.sourceSlug) } },
    select: { id: true, sourceSlug: true },
  });
  const variantSlugToId = new Map(variantRows.map((row) => [row.sourceSlug, row.id]));

  // (3) IslandReward replace
  for (const input of inputs) {
    const variantId = variantSlugToId.get(input.slug);
    if (variantId === undefined) continue;

    const rewardRows: Array<{
      islandVariantId: number;
      rewardType: string;
      rewardRefId: number;
      dropRate: number | null;
      sourceSlug: string;
      sourceUrl: string;
      scrapedAt: Date;
      contentHash: string;
    }> = [];
    for (const [index, reward] of input.rewards.entries()) {
      let refId: number | null = null;
      if (reward.rewardType === 'item') {
        refId = itemIds.get(reward.itemSlug) ?? null;
      } else if (reward.rewardType === 'cd') {
        refId = cdSlugToId.get(reward.itemSlug) ?? null;
      } else if (reward.rewardType === 'recipe') {
        refId = recipeSlugToId.get(`crafting-${reward.itemSlug}`) ?? null;
      }
      if (refId === null) {
        failures.push({
          sourceSlug: input.slug,
          error: `reward "${reward.itemSlug}" (${reward.rewardType}) 미발견 — 건너뜀`,
        });
        continue;
      }
      const sourceSlug = `${input.slug}__reward__${String(index)}`;
      rewardRows.push({
        islandVariantId: variantId,
        rewardType: reward.rewardType,
        rewardRefId: refId,
        dropRate: reward.dropRate ?? null,
        sourceSlug,
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
        contentHash: `${reward.rewardType}:${String(refId)}:${String(reward.dropRate ?? 'null')}`,
      });
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await (prisma.islandReward as unknown as IslandRewardModel).deleteMany({
        where: { islandVariantId: variantId },
      });
      if (rewardRows.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await (prisma.islandReward as unknown as IslandRewardModel).createMany({
          data: rewardRows,
          skipDuplicates: true,
        });
      }
    } catch (error: unknown) {
      failures.push({
        sourceSlug: input.slug,
        error: `IslandReward replace 실패: ${error instanceof Error ? error.message : String(error)}`,
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
