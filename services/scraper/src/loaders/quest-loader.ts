/**
 * QuestLoader — Quest (location FK only; requirements 본 페이지 미산출).
 * (Phase 9 선결 코드, Batch C-4)
 *
 * SCHEMA §2.12 매핑:
 *   - Quest: id + locationId FK + sortOrder + prerequisiteQuestId(nullable, 미사용)
 *     + 감사 + i18n(name/objective/walkthrough).
 *
 * QuestRequirement 는 본 페이지(/importantrequests.shtml) 의 prose 안에 산재되어
 * parser 가 산출하지 않음 → 본 loader 도 처리하지 않음 (향후 외부 매핑).
 */

import type { PrismaClient, QuestInput } from '@pokopia-wiki/shared';

import { lookupLocationIds } from './location-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type QuestPayload = {
  locationId: number;
  sortOrder: number;
  sourceUrl: string;
  scrapedAt: Date;
};

export async function loadQuest(
  prisma: Pick<PrismaClient, 'quest' | 'location'>,
  inputs: ReadonlyArray<QuestInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const locationSlugs = inputs.map((input) => input.locationSlug);
  const locationIds = await lookupLocationIds(prisma, locationSlugs);

  const items: Array<{ sourceSlug: string; payload: QuestPayload; metadata: QuestInput }> = [];
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    const locationId = locationIds.get(input.locationSlug);
    if (locationId === undefined) {
      failures.push({
        sourceSlug: input.slug,
        error: `Location "${input.locationSlug}" 미발견 — Quest 건너뜀`,
      });
      continue;
    }
    items.push({
      sourceSlug: input.slug,
      payload: {
        locationId,
        sortOrder: input.sortOrder,
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
      },
      metadata: input,
    });
  }

  const result = await upsertBySourceSlug(prisma.quest as never, items);
  return {
    stats: { ...result.stats, failed: result.stats.failed + failures.length },
    failures: [...result.failures, ...failures],
  };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
