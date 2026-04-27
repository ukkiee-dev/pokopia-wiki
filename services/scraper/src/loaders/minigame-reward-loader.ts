/**
 * MinigameRewardLoader — HideAndSneakReward (item FK NOT NULL) +
 * JumpropeTier rewardRefId 보강 update.
 * (Phase 9 선결 코드, Batch C-2)
 *
 * SCHEMA §2.22:
 *   - HideAndSneakReward: id + condition + rewardType + rewardRefId(NOT NULL,
 *     polymorphic — 본 페이지는 'item' 만) + 감사. itemSlug → item id 매핑.
 *   - JumpropeTier: simple-loaders 의 loadJumpropeTier 가 rewardRefId=null 로
 *     1차 upsert. 본 모듈의 backfillJumpropeTierRewards 가 itemSlug → item id
 *     매핑 후 update.
 */

import type {
  HideAndSneakRewardInput,
  JumpropeTierInput,
  PrismaClient,
} from '@pokopia-wiki/shared';

import { lookupItemIds } from './item-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type HideAndSneakRewardPayload = {
  condition: string;
  rewardType: HideAndSneakRewardInput['rewardType'];
  rewardRefId: number;
  sourceUrl: string;
  scrapedAt: Date;
};

export async function loadHideAndSneakReward(
  prisma: Pick<PrismaClient, 'hideAndSneakReward' | 'item'>,
  inputs: ReadonlyArray<HideAndSneakRewardInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const itemSlugs = inputs.map((input) => input.itemSlug);
  const itemIds = await lookupItemIds(prisma, itemSlugs);

  const items: Array<{
    sourceSlug: string;
    payload: HideAndSneakRewardPayload;
    metadata: HideAndSneakRewardInput;
  }> = [];
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    const itemId = itemIds.get(input.itemSlug);
    if (itemId === undefined) {
      failures.push({
        sourceSlug: input.slug,
        error: `Item "${input.itemSlug}" 미발견 — HideAndSneakReward 건너뜀`,
      });
      continue;
    }
    items.push({
      sourceSlug: input.slug,
      payload: {
        condition: input.condition,
        rewardType: input.rewardType,
        rewardRefId: itemId,
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
      },
      metadata: input,
    });
  }

  const result = await upsertBySourceSlug(prisma.hideAndSneakReward as never, items);
  return {
    stats: { ...result.stats, failed: result.stats.failed + failures.length },
    failures: [...result.failures, ...failures],
  };
}

/* ───────────────── JumpropeTier rewardRefId backfill ───────────────── */

type JumpropeUpdateModel = {
  update: (args: {
    where: { sourceSlug: string };
    data: { rewardRefId: number };
  }) => Promise<unknown>;
};

/**
 * JumpropeTier 의 rewardRefId 보강. simple-loaders.loadJumpropeTier 가 1차
 * upsert (rewardRefId=null) 후 본 함수가 itemSlug 룩업 + update.
 *
 * Item loader 가 본 함수보다 먼저 실행되어야 함. 본 함수는 통계만 반환하고
 * UpsertResult 형식으로 호출자 일관 처리.
 */
export async function backfillJumpropeTierRewards(
  prisma: Pick<PrismaClient, 'jumpropeTier' | 'item'>,
  inputs: ReadonlyArray<JumpropeTierInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const itemSlugs = inputs.map((input) => input.itemSlug);
  const itemIds = await lookupItemIds(prisma, itemSlugs);

  const stats: UpsertStats = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    const itemId = itemIds.get(input.itemSlug);
    if (itemId === undefined) {
      stats.failed += 1;
      failures.push({
        sourceSlug: input.slug,
        error: `Item "${input.itemSlug}" 미발견 — JumpropeTier rewardRefId 미설정`,
      });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await (prisma.jumpropeTier as unknown as JumpropeUpdateModel).update({
        where: { sourceSlug: input.slug },
        data: { rewardRefId: itemId },
      });
      stats.updated += 1;
    } catch (error: unknown) {
      stats.failed += 1;
      failures.push({
        sourceSlug: input.slug,
        error: `JumpropeTier rewardRefId update 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { stats, failures };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
