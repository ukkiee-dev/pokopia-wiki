/**
 * PokedexMilestoneLoader — PokedexMilestone (item/recipe FK polymorphic, NOT NULL).
 * (Phase 9 선결 코드, Batch C-2)
 *
 * SCHEMA §2.18 매핑:
 *   - PokedexMilestone: id + requiredCount + rewardType ENUM(item/recipe/feature_unlock)
 *     + rewardRefId(NOT NULL) + note + 감사.
 *
 * rewardType=item 인 경우 rewardItemNameEn → item slug 정규화 후 lookupItemIds.
 * rewardType=recipe 인 경우 본 단계에선 미해소 (Recipe loader 후 별도 update).
 * rewardType=feature_unlock 인 경우 rewardRefId 가 의미 없음 (제도 placeholder).
 *
 * 본 loader 는 최선 노력 (best-effort): item 으로 매핑 가능한 row 만 upsert,
 * recipe/feature_unlock 은 failures 격리. 향후 별도 update.
 */

import type { PokedexMilestoneInput, PrismaClient } from '@pokopia-wiki/shared';

import { lookupItemIds } from './item-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type PokedexMilestonePayload = {
  requiredCount: number;
  rewardType: PokedexMilestoneInput['rewardType'];
  rewardRefId: number;
  note: string | null;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * rewardItemNameEn → item slug 정규화. Serebii 의 reward 셀은 "Storage Box recipe"
 * 같은 형태인데, item slug 는 "storagebox" 또는 "storage-box" 패턴. 본 단계에선
 * 단순화: lowercase + 공백 제거 + " recipe" 접미사 제거.
 */
function normalizeRewardSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+recipe$/u, '')
    .replace(/\s+/gu, '');
}

export async function loadPokedexMilestone(
  prisma: Pick<PrismaClient, 'pokedexMilestone' | 'item'>,
  inputs: ReadonlyArray<PokedexMilestoneInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  // item 매핑 시도 — rewardType=item 만 (recipe/feature_unlock 은 별도 처리)
  const itemSlugs = inputs
    .filter((input) => input.rewardType === 'item' || input.rewardType === 'recipe')
    .map((input) => normalizeRewardSlug(input.rewardItemNameEn));
  const itemIds = await lookupItemIds(prisma, itemSlugs);

  const items: Array<{
    sourceSlug: string;
    payload: PokedexMilestonePayload;
    metadata: PokedexMilestoneInput;
  }> = [];
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    if (input.rewardType === 'feature_unlock') {
      failures.push({
        sourceSlug: input.slug,
        error: 'rewardType=feature_unlock — rewardRefId 매핑 불가, 본 loader 미지원',
      });
      continue;
    }
    const slug = normalizeRewardSlug(input.rewardItemNameEn);
    const refId = itemIds.get(slug);
    if (refId === undefined) {
      failures.push({
        sourceSlug: input.slug,
        error: `reward "${input.rewardItemNameEn}" → slug "${slug}" 미발견 (Item/Recipe loader 보강 필요)`,
      });
      continue;
    }
    items.push({
      sourceSlug: input.slug,
      payload: {
        requiredCount: input.requiredCount,
        rewardType: input.rewardType,
        rewardRefId: refId,
        note: input.note ?? null,
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
      },
      metadata: input,
    });
  }

  const result = await upsertBySourceSlug(prisma.pokedexMilestone as never, items);
  return {
    stats: { ...result.stats, failed: result.stats.failed + failures.length },
    failures: [...result.failures, ...failures],
  };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
