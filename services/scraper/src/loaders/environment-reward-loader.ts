/**
 * EnvironmentRewardLoader — location FK + reward polymorphic (item/recipe).
 * (Phase 9 선결 코드, Batch C-4)
 *
 * SCHEMA §2.10 매핑:
 *   - EnvironmentReward: id + locationId FK + level + rewardType + rewardRefId(nullable)
 *     + note + 감사.
 *
 * rewardType=item 인 경우 itemSlug → Item.id 매핑.
 * rewardType=recipe 인 경우 itemSlug → "crafting-<slug>" sourceSlug 형태로 변환
 *   후 CraftingRecipe.id 매핑 (parser 출력의 itemSlug 가 결과 item slug 라고
 *   가정 — environment 페이지의 "X Recipe" 분석 결과).
 * rewardType=feature_unlock / shop_unlock 은 본 페이지 범위 외 (parser 미산출).
 */

import type { EnvironmentRewardInput, PrismaClient } from '@pokopia-wiki/shared';

import { lookupItemIds } from './item-loader.js';
import { lookupLocationIds } from './location-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type CraftingRecipeLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type EnvironmentRewardPayload = {
  locationId: number;
  level: number;
  rewardType: EnvironmentRewardInput['rewardType'];
  rewardRefId: number | null;
  note: string | null;
  sourceUrl: string;
  scrapedAt: Date;
};

export async function loadEnvironmentReward(
  prisma: Pick<
    PrismaClient,
    'environmentReward' | 'location' | 'item' | 'craftingRecipe'
  >,
  inputs: ReadonlyArray<EnvironmentRewardInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  // (1) Location 룩업
  const locationSlugs = inputs.map((input) => input.locationSlug);
  const locationIds = await lookupLocationIds(prisma, locationSlugs);

  // (2) Item 룩업 (rewardType=item)
  const itemSlugs = inputs
    .filter((input) => input.rewardType === 'item')
    .map((input) => input.itemSlug);
  const itemIds = await lookupItemIds(prisma, itemSlugs);

  // (3) Recipe 룩업 (rewardType=recipe → "crafting-<slug>")
  const recipeSlugs = inputs
    .filter((input) => input.rewardType === 'recipe')
    .map((input) => `crafting-${input.itemSlug}`);
  const recipeRows = recipeSlugs.length > 0
    ? await (prisma.craftingRecipe as unknown as CraftingRecipeLookupModel).findMany({
      where: { sourceSlug: { in: [...new Set(recipeSlugs)] } },
      select: { id: true, sourceSlug: true },
    })
    : [];
  const recipeSlugToId = new Map(recipeRows.map((row) => [row.sourceSlug, row.id]));

  // (4) EnvironmentReward upsert
  const items: Array<{
    sourceSlug: string;
    payload: EnvironmentRewardPayload;
    metadata: EnvironmentRewardInput;
  }> = [];
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    const locationId = locationIds.get(input.locationSlug);
    if (locationId === undefined) {
      failures.push({
        sourceSlug: input.slug,
        error: `Location "${input.locationSlug}" 미발견 — EnvironmentReward 건너뜀`,
      });
      continue;
    }
    let rewardRefId: number | null = null;
    if (input.rewardType === 'item') {
      rewardRefId = itemIds.get(input.itemSlug) ?? null;
    } else if (input.rewardType === 'recipe') {
      rewardRefId = recipeSlugToId.get(`crafting-${input.itemSlug}`) ?? null;
    }
    items.push({
      sourceSlug: input.slug,
      payload: {
        locationId,
        level: input.level,
        rewardType: input.rewardType,
        rewardRefId,
        note: null,
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
      },
      metadata: input,
    });
  }

  const result = await upsertBySourceSlug(prisma.environmentReward as never, items);
  return {
    stats: { ...result.stats, failed: result.stats.failed + failures.length },
    failures: [...result.failures, ...failures],
  };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
