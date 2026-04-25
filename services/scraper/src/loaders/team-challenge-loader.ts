/**
 * TeamChallengeLoader — TeamChallenge + TeamChallengeRequirement (item FK).
 * (Phase 9 선결 코드, Batch C-3)
 *
 * SCHEMA §2.12 매핑:
 *   - TeamChallenge: id + stage(unique) + badgeName + 감사.
 *   - TeamChallengeRequirement: composite PK (challengeId, itemId) + quantity.
 *
 * itemNameEn 정규화 후 item slug 룩업. 미발견 requirement 는 건너뛰기.
 */

import type { PrismaClient, TeamChallengeInput } from '@pokopia-wiki/shared';

import { lookupItemIds } from './item-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type TeamChallengeLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type TeamChallengeRequirementModel = {
  deleteMany: (args: { where: { challengeId: number } }) => Promise<{ count: number }>;
  createMany: (args: {
    data: ReadonlyArray<{ challengeId: number; itemId: number; quantity: number }>;
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
};

function normalizeItemSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/gu, '');
}

export async function loadTeamChallenge(
  prisma: Pick<PrismaClient, 'teamChallenge' | 'teamChallengeRequirement' | 'item'>,
  inputs: ReadonlyArray<TeamChallengeInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  // (1) Item 룩업
  const itemSlugs = [
    ...new Set(
      inputs.flatMap((input) => input.requirements.map((req) => normalizeItemSlug(req.itemNameEn))),
    ),
  ];
  const itemIds = await lookupItemIds(prisma, itemSlugs);

  // (2) TeamChallenge 본 entity upsert
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      stage: input.stage,
      badgeName: input.badgeName ?? '(empty)',
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  const baseResult = await upsertBySourceSlug(prisma.teamChallenge as never, items);

  // (3) TeamChallenge ID 룩업
  const challengeRows = await (
    prisma.teamChallenge as unknown as TeamChallengeLookupModel
  ).findMany({
    where: { sourceSlug: { in: inputs.map((input) => input.slug) } },
    select: { id: true, sourceSlug: true },
  });
  const challengeSlugToId = new Map(challengeRows.map((row) => [row.sourceSlug, row.id]));

  // (4) Requirements replace
  const failures: Array<{ sourceSlug: string; error: string }> = [];
  for (const input of inputs) {
    const challengeId = challengeSlugToId.get(input.slug);
    if (challengeId === undefined) continue;

    const reqRows: Array<{ challengeId: number; itemId: number; quantity: number }> = [];
    for (const req of input.requirements) {
      const itemId = itemIds.get(normalizeItemSlug(req.itemNameEn));
      if (itemId === undefined) {
        failures.push({
          sourceSlug: input.slug,
          error: `requirement "${req.itemNameEn}" → item slug 미발견 — 건너뜀`,
        });
        continue;
      }
      reqRows.push({ challengeId, itemId, quantity: req.quantity });
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await (
        prisma.teamChallengeRequirement as unknown as TeamChallengeRequirementModel
      ).deleteMany({ where: { challengeId } });
      if (reqRows.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await (
          prisma.teamChallengeRequirement as unknown as TeamChallengeRequirementModel
        ).createMany({ data: reqRows, skipDuplicates: true });
      }
    } catch (error: unknown) {
      failures.push({
        sourceSlug: input.slug,
        error: `TeamChallengeRequirement replace 실패: ${error instanceof Error ? error.message : String(error)}`,
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
