/**
 * LocationLoader — Location entity (parent self-ref nullable).
 * (Phase 9 선결 코드, Batch C)
 *
 * SCHEMA §2.4 매핑:
 *   - Location: id + type ENUM + parentId(nullable self-ref) + 감사 + i18n.
 *   - location_i18n.name 은 별도 단계 (Phase 11+ 한국어 매핑).
 *
 * 처리 단계 (2-pass):
 *   1. 모든 Location 을 parentId=null 로 upsert
 *   2. parentSlug 가 있는 Location 만 다시 update (parentSlug → ID 매핑 후 주입)
 *
 * parentSlug 매핑 실패 시 parentId 는 그대로 NULL 로 남고 failures 에 기록.
 *
 * Location 은 다른 다수 entity (Item.locations, Quest, EnvironmentReward,
 * ShopItem, PokemonCenter, CdLocation, HumanRecord, IslandVariant,
 * CustomizationItem, LegendaryAcquisition 등) 의 의존성이라 본 loader 가 먼저
 * 실행되어야 한다.
 */

import type { LocationInput, PrismaClient } from '@pokopia-wiki/shared';

import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type LocationLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type LocationUpdateModel = {
  update: (args: {
    where: { sourceSlug: string };
    data: { parentId: number };
  }) => Promise<unknown>;
};

/**
 * Location upsert + parentId self-ref 해소.
 *
 * pass 1: 모든 location 을 parentId=null 로 upsert (content_hash 는 type +
 * parentId 기준이라 pass 2 의 update 가 hash 변경을 유발하지만 본 단계는
 * 무시 — pass 2 는 parentId 만 update 하고 hash 재계산 안 함).
 *
 * 본 단순화의 trade-off: 매번 호출 시 parentId 가 있는 row 는 update 가 무의미하게
 * 발생할 수 있음. 향후 hash 에 parentId 포함하도록 리팩터링 가능.
 */
export async function loadLocation(
  prisma: Pick<PrismaClient, 'location'>,
  inputs: ReadonlyArray<LocationInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  // (1) Location upsert (parentId=null 로 일단 모두)
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      type: input.type,
      parentId: null,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  const baseResult = await upsertBySourceSlug(
    prisma.location as never,
    items,
  );

  // (2) parentSlug 해소 후 update
  const slugs = inputs.map((input) => input.slug);
  const rows = await (prisma.location as unknown as LocationLookupModel).findMany({
    where: { sourceSlug: { in: slugs } },
    select: { id: true, sourceSlug: true },
  });
  const slugToId = new Map(rows.map((row) => [row.sourceSlug, row.id]));

  const parentFailures: Array<{ sourceSlug: string; error: string }> = [];
  for (const input of inputs) {
    if (input.parentSlug === undefined) continue;
    const parentId = slugToId.get(input.parentSlug);
    if (parentId === undefined) {
      parentFailures.push({
        sourceSlug: input.slug,
        error: `parentSlug "${input.parentSlug}" Location 미발견 — parentId NULL 유지`,
      });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop -- 순차 update: 각 row 독립
      await (prisma.location as unknown as LocationUpdateModel).update({
        where: { sourceSlug: input.slug },
        data: { parentId },
      });
    } catch (error: unknown) {
      parentFailures.push({
        sourceSlug: input.slug,
        error: `parentId 주입 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    stats: {
      ...baseResult.stats,
      failed: baseResult.stats.failed + parentFailures.length,
    },
    failures: [...baseResult.failures, ...parentFailures],
  };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}

/**
 * Slug → ID 룩업 helper (다른 loader 에서 location FK 해소 시 재사용).
 *
 * 주어진 slug 셋에 대해 location_id 매핑 Map 을 반환. 미발견 slug 는 Map 에 부재.
 */
export async function lookupLocationIds(
  prisma: Pick<PrismaClient, 'location'>,
  slugs: ReadonlyArray<string>,
): Promise<Map<string, number>> {
  if (slugs.length === 0) return new Map();
  const rows = await (prisma.location as unknown as LocationLookupModel).findMany({
    where: { sourceSlug: { in: [...new Set(slugs)] } },
    select: { id: true, sourceSlug: true },
  });
  return new Map(rows.map((row) => [row.sourceSlug, row.id]));
}
