/**
 * MagnetRiseLoader — Item.isMagnetRiseOnly 플래그 보강.
 * (Phase 9 선결 코드, Batch C-5)
 *
 * SCHEMA §2.2 매핑: 기존 Item 의 isMagnetRiseOnly=true 보강 (새 entity 아님).
 * Item 본 entity 가 미리 upsert 되어 있어야 하며 (items loader 우선), 매핑 실패
 * slug 는 failures 격리.
 */

import type { MagnetRiseItemInput, PrismaClient } from '@pokopia-wiki/shared';

import type { UpsertResult, UpsertStats } from './upsert-loader.js';

type ItemUpdateModel = {
  update: (args: {
    where: { sourceSlug: string };
    data: { isMagnetRiseOnly: boolean };
  }) => Promise<unknown>;
};

export async function loadMagnetRise(
  prisma: Pick<PrismaClient, 'item'>,
  inputs: ReadonlyArray<MagnetRiseItemInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const stats: UpsertStats = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await (prisma.item as unknown as ItemUpdateModel).update({
        where: { sourceSlug: input.slug },
        data: { isMagnetRiseOnly: true },
      });
      stats.updated += 1;
    } catch (error: unknown) {
      stats.failed += 1;
      failures.push({
        sourceSlug: input.slug,
        error: `Item "${input.slug}" 미발견 또는 update 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { stats, failures };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
