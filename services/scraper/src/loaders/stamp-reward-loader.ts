/**
 * StampRewardLoader — StampReward (cardId FK) (Phase 9 선결 코드, Batch C-2).
 *
 * SCHEMA §2.22 매핑:
 *   - StampReward: id + cardId FK + tier + requiredStamps + coinAmount + 감사.
 *   - StampCard 는 simple-loaders.ts 의 loadStampCard 가 처리.
 *
 * 처리 단계 (2-pass):
 *   1. cardSlug → cardId 룩업 (StampCard 가 이미 upsert 되었다고 가정)
 *   2. StampReward upsert (cardId 주입)
 */

import type { PrismaClient, StampRewardInput } from '@pokopia-wiki/shared';

import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type StampCardLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type StampRewardPayload = {
  cardId: number;
  tier: number;
  requiredStamps: number;
  coinAmount: number;
  sourceUrl: string;
  scrapedAt: Date;
};

export async function loadStampReward(
  prisma: Pick<PrismaClient, 'stampCard' | 'stampReward'>,
  inputs: ReadonlyArray<StampRewardInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const cardSlugs = [...new Set(inputs.map((input) => input.cardSlug))];
  const cardRows = await (prisma.stampCard as unknown as StampCardLookupModel).findMany({
    where: { sourceSlug: { in: cardSlugs } },
    select: { id: true, sourceSlug: true },
  });
  const cardSlugToId = new Map(cardRows.map((row) => [row.sourceSlug, row.id]));

  const items: Array<{
    sourceSlug: string;
    payload: StampRewardPayload;
    metadata: StampRewardInput;
  }> = [];
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    const cardId = cardSlugToId.get(input.cardSlug);
    if (cardId === undefined) {
      failures.push({
        sourceSlug: input.slug,
        error: `StampCard "${input.cardSlug}" 미발견 — StampCard loader 먼저 실행 필요`,
      });
      continue;
    }
    items.push({
      sourceSlug: input.slug,
      payload: {
        cardId,
        tier: input.tier,
        requiredStamps: input.requiredStamps,
        coinAmount: input.coinAmount,
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
      },
      metadata: input,
    });
  }

  const result = await upsertBySourceSlug(prisma.stampReward as never, items);
  return {
    stats: { ...result.stats, failed: result.stats.failed + failures.length },
    failures: [...result.failures, ...failures],
  };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
