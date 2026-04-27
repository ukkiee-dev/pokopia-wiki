/**
 * HumanRecordLoader — location FK + reward polymorphic (item/cd/customization/none).
 * (Phase 9 선결 코드, Batch C-4)
 *
 * SCHEMA §2.17 매핑:
 *   - HumanRecord: id + category + locationId FK(NOT NULL) + rewardType + rewardRefId(nullable) + 감사
 *
 * rewardType=item 인 경우 rewardRefSlug → Item.id 매핑.
 * rewardType=cd 인 경우 rewardRefSlug → Cd.sourceSlug 룩업.
 * rewardType=customization 인 경우 매핑 어려움 (CustomizationItem 자연키가
 *   복합) → NULL 주입.
 * rewardType=none 인 경우 NULL 주입.
 *
 * locationSlug 미발견 row 는 Location FK NOT NULL 위반 → failures 격리.
 */

import type { HumanRecordInput, PrismaClient } from '@pokopia-wiki/shared';

import { lookupItemIds } from './item-loader.js';
import { lookupLocationIds } from './location-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type CdLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type HumanRecordPayload = {
  category: HumanRecordInput['category'];
  locationId: number;
  rewardType: HumanRecordInput['rewardType'];
  rewardRefId: number | null;
  sourceUrl: string;
  scrapedAt: Date;
};

export async function loadHumanRecord(
  prisma: Pick<PrismaClient, 'humanRecord' | 'location' | 'item' | 'cd'>,
  inputs: ReadonlyArray<HumanRecordInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const locationSlugs = inputs
    .map((input) => input.locationSlug)
    .filter((slug): slug is string => slug !== undefined);
  const locationIds = await lookupLocationIds(prisma, locationSlugs);

  const itemSlugs = inputs
    .filter((input) => input.rewardType === 'item' && input.rewardRefSlug !== undefined)
    .map((input) => input.rewardRefSlug as string);
  const itemIds = await lookupItemIds(prisma, itemSlugs);

  const cdSlugs = inputs
    .filter((input) => input.rewardType === 'cd' && input.rewardRefSlug !== undefined)
    .map((input) => input.rewardRefSlug as string);
  const cdRows = cdSlugs.length > 0
    ? await (prisma.cd as unknown as CdLookupModel).findMany({
      where: { sourceSlug: { in: [...new Set(cdSlugs)] } },
      select: { id: true, sourceSlug: true },
    })
    : [];
  const cdSlugToId = new Map(cdRows.map((row) => [row.sourceSlug, row.id]));

  const items: Array<{
    sourceSlug: string;
    payload: HumanRecordPayload;
    metadata: HumanRecordInput;
  }> = [];
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    if (input.locationSlug === undefined) {
      failures.push({
        sourceSlug: input.slug,
        error: 'locationSlug 부재 — HumanRecord.locationId NOT NULL 위반, 건너뜀',
      });
      continue;
    }
    const locationId = locationIds.get(input.locationSlug);
    if (locationId === undefined) {
      failures.push({
        sourceSlug: input.slug,
        error: `Location "${input.locationSlug}" 미발견`,
      });
      continue;
    }
    let rewardRefId: number | null = null;
    if (input.rewardType === 'item' && input.rewardRefSlug !== undefined) {
      rewardRefId = itemIds.get(input.rewardRefSlug) ?? null;
    } else if (input.rewardType === 'cd' && input.rewardRefSlug !== undefined) {
      rewardRefId = cdSlugToId.get(input.rewardRefSlug) ?? null;
    }
    items.push({
      sourceSlug: input.slug,
      payload: {
        category: input.category,
        locationId,
        rewardType: input.rewardType,
        rewardRefId,
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
      },
      metadata: input,
    });
  }

  const result = await upsertBySourceSlug(prisma.humanRecord as never, items);
  return {
    stats: { ...result.stats, failed: result.stats.failed + failures.length },
    failures: [...result.failures, ...failures],
  };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
