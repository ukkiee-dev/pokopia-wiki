/**
 * ItemLoader — Item + ItemTag (M:N) + ItemLocation (FK 해소).
 * (Phase 9 선결 코드, Batch C)
 *
 * SCHEMA §2.2 매핑:
 *   - Item: id + category + isPaintable/isPatternable/isMagnetRiseOnly + 감사 + i18n
 *   - ItemTag: composite PK (item_id, tag) — replace 전략
 *   - ItemLocation: id + item_id FK + location_id(nullable) FK + method + 감사
 *
 * 처리 단계 (3-pass):
 *   1. Item 본 entity upsert (slug 직접) — categoryEnum + flags 주입
 *   2. Item ID 룩업
 *   3. 각 item 별 ItemTag/ItemLocation replace (deleteMany itemId + createMany)
 *      - ItemLocation.locationId 는 lookupLocationIds 를 통해 매핑 (location-loader.ts)
 *      - location 미발견 시 NULL 로 두고 detail 만 보존
 *
 * Item 은 다수 entity 의 의존성이라 본 loader 가 Location 다음으로 우선.
 *
 * favorites 매핑 (ItemFavoriteTag) 은 본 loader 범위 밖 — favorites 페이지 파서가
 * 별도 출력하며 후속 loader 에서 처리.
 */

import type { ItemInput, PrismaClient } from '@pokopia-wiki/shared';

import { lookupLocationIds } from './location-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type ItemLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type ItemTagModel = {
  deleteMany: (args: { where: { itemId: number } }) => Promise<{ count: number }>;
  createMany: (args: {
    data: ReadonlyArray<{ itemId: number; tag: string }>;
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
};

type ItemLocationModel = {
  deleteMany: (args: { where: { itemId: number } }) => Promise<{ count: number }>;
  createMany: (args: {
    data: ReadonlyArray<{
      itemId: number;
      locationId: number | null;
      method: string;
      detail: string | null;
      sourceSlug: string;
      sourceUrl: string;
      scrapedAt: Date;
      contentHash: string;
    }>;
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
};

/**
 * Item upsert + tags/locations replace.
 *
 * ItemLocation 의 sourceSlug 자연키: `<item-slug>__loc__<index>` (item 당 다수
 * location 일 수 있어 index 부여). content_hash 는 method+location_id+detail
 * 조합으로 안정.
 */
export async function loadItem(
  prisma: Pick<PrismaClient, 'item' | 'itemTag' | 'itemLocation' | 'location'>,
  inputs: ReadonlyArray<ItemInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  // (1) Item 본 entity upsert
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      category: input.category,
      isPaintable: input.isPaintable,
      isPatternable: input.isPatternable,
      isMagnetRiseOnly: input.isMagnetRiseOnly,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  const baseResult = await upsertBySourceSlug(prisma.item as never, items);

  // (2) Item ID 룩업
  const slugs = inputs.map((input) => input.slug);
  const itemRows = await (prisma.item as unknown as ItemLookupModel).findMany({
    where: { sourceSlug: { in: slugs } },
    select: { id: true, sourceSlug: true },
  });
  const slugToId = new Map(itemRows.map((row) => [row.sourceSlug, row.id]));

  // (3a) Location 명 → ID 매핑 (모든 input 의 locationName 모음)
  const locationNames = [
    ...new Set(
      inputs
        .flatMap((input) => input.locations)
        .map((loc) => loc.locationName)
        .filter((name): name is string => name !== undefined),
    ),
  ];
  // locationName 은 영문 nameEn 이지 slug 가 아니라 매핑이 어렵다. 본 단계에서는
  // 단순화: locationName 을 lowercase + space→hyphen 으로 normalize 후 slug 룩업
  // 시도. Serebii 의 location slug 가 대부분 lowercase 단순 문자라 적중률 보통.
  // 미발견 시 NULL.
  const normalizedLocSlugs = locationNames.map((name) => normalizeLocationSlug(name));
  const locSlugToId = await lookupLocationIds(prisma, normalizedLocSlugs);

  // (3b) 각 item 별 ItemTag + ItemLocation replace
  const replaceFailures: Array<{ sourceSlug: string; error: string }> = [];
  for (const input of inputs) {
    const itemId = slugToId.get(input.slug);
    if (itemId === undefined) {
      replaceFailures.push({
        sourceSlug: input.slug,
        error: 'Item ID 룩업 실패 — tags/locations replace 건너뜀',
      });
      continue;
    }

    // ItemTag replace
    try {
      // eslint-disable-next-line no-await-in-loop
      await (prisma.itemTag as unknown as ItemTagModel).deleteMany({ where: { itemId } });
      if (input.tags.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await (prisma.itemTag as unknown as ItemTagModel).createMany({
          data: input.tags.map((tag) => ({ itemId, tag })),
          skipDuplicates: true,
        });
      }
    } catch (error: unknown) {
      replaceFailures.push({
        sourceSlug: input.slug,
        error: `ItemTag replace 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    // ItemLocation replace (sourceSlug 자연키: <item-slug>__loc__<index>)
    try {
      // eslint-disable-next-line no-await-in-loop
      await (prisma.itemLocation as unknown as ItemLocationModel).deleteMany({
        where: { itemId },
      });
      if (input.locations.length > 0) {
        const itemLocationRows = input.locations.map((loc, index) => {
          const locationId = loc.locationName !== undefined
            ? locSlugToId.get(normalizeLocationSlug(loc.locationName)) ?? null
            : null;
          const sourceSlug = `${input.slug}__loc__${String(index)}`;
          const contentHash = `${loc.method}:${String(locationId ?? 'null')}:${loc.detail ?? ''}`;
          return {
            itemId,
            locationId,
            method: loc.method,
            detail: loc.detail ?? null,
            sourceSlug,
            sourceUrl: input.sourceUrl,
            scrapedAt: new Date(input.scrapedAt),
            contentHash,
          };
        });
        // eslint-disable-next-line no-await-in-loop
        await (prisma.itemLocation as unknown as ItemLocationModel).createMany({
          data: itemLocationRows,
          skipDuplicates: true,
        });
      }
    } catch (error: unknown) {
      replaceFailures.push({
        sourceSlug: input.slug,
        error: `ItemLocation replace 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    stats: {
      ...baseResult.stats,
      failed: baseResult.stats.failed + replaceFailures.length,
    },
    failures: [...baseResult.failures, ...replaceFailures],
  };
}

/**
 * Item ID 룩업 helper (다른 loader 에서 item FK 해소 시 재사용).
 */
export async function lookupItemIds(
  prisma: Pick<PrismaClient, 'item'>,
  slugs: ReadonlyArray<string>,
): Promise<Map<string, number>> {
  if (slugs.length === 0) return new Map();
  const rows = await (prisma.item as unknown as ItemLookupModel).findMany({
    where: { sourceSlug: { in: [...new Set(slugs)] } },
    select: { id: true, sourceSlug: true },
  });
  return new Map(rows.map((row) => [row.sourceSlug, row.id]));
}

function normalizeLocationSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/gu, '-');
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
