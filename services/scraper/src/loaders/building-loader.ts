/**
 * BuildingKitLoader — 목록 페이지 한정 (Phase 9 선결 코드, Batch C-2).
 *
 * SCHEMA §2.6 매핑:
 *   - BuildingKit: id + category + pokemonCapacity + buildingPoints + width + depth
 *     + 감사 + i18n + materials nested.
 *
 * Serebii `/building.shtml` 루트는 slug + nameEn + descriptionEn + imageUrl 만
 * 제공. 카테고리/capacity/buildingPoints/width/depth/materials 는 각 키트의
 * detail 페이지에서 추출하므로 본 loader 는 SCHEMA NOT NULL 필드를 default 값으로
 * 보강 (운영 단계에서 detail 파서 결과로 update).
 *
 * default 값:
 *   - category: 'Decorative' (가장 일반적이고 안전한 기본)
 *   - pokemonCapacity / buildingPoints / width / depth: 0 (placeholder)
 *
 * detail 페이지 구현 후 별도 update 함수 제공 예정 (본 PR 범위 밖).
 */

import type { BuildingKitInput, PrismaClient } from '@pokopia-wiki/shared';

import { upsertBySourceSlug, type UpsertResult } from './upsert-loader.js';

type BuildingKitPayload = {
  category: string;
  pokemonCapacity: number;
  buildingPoints: number;
  width: number;
  depth: number;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * BuildingKit upsert (목록 페이지 데이터만). detail 페이지 데이터는 후속 단계에서
 * 별도 update.
 */
export async function loadBuildingKit(
  prisma: Pick<PrismaClient, 'buildingKit'>,
  inputs: ReadonlyArray<BuildingKitInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      category: 'Decorative',
      pokemonCapacity: 0,
      buildingPoints: 0,
      width: 0,
      depth: 0,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(prisma.buildingKit as never, items);
}
