/**
 * SimpleLoaders — 단일 파일에 모은 simple entity loader 모음 (Phase 9 선결 코드).
 *
 * 본 모듈은 다음 조건을 만족하는 entity 만 담는다:
 *   - parser output 의 모든 필드가 Prisma model 컬럼과 1:1 매핑 가능
 *   - FK 해소 불필요 (다른 entity ID 조회 없음) 또는 nullable FK 만
 *   - nested array 매핑 불필요
 *
 * 위 조건에 맞지 않는 복잡 entity (Item/Habitat/Recipe/PaintColor/Cd 등) 는
 * 별도 loader 파일로 분리되며, 의존 entity 먼저 upsert + ID 조회 + 본 entity
 * upsert 의 2-pass 패턴으로 작성. loaders/README.md 의 우선순위 표 참고.
 *
 * 본 commit 시점 simple entity:
 *   - MosslaxBoost (flavor + level Cartesian, FK 없음)
 *   - StampCard (weekGoal 단일 필드, FK 없음)
 */

import type { MosslaxBoostInput, StampCardInput } from '@pokopia-wiki/shared';

import {
  upsertBySourceSlug,
  type SourceSlugKeyedModel,
  type UpsertResult,
} from './upsert-loader.js';

/* ───────────────── MosslaxBoost ───────────────── */

type MosslaxBoostPayload = {
  flavor: MosslaxBoostInput['flavor'];
  level: number;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * MosslaxBoost upsert. Prisma `mosslax_boost` 모델은 flavor(ENUM) + level(1~3) +
 * 감사 컬럼만 보유 (effect 텍스트는 mosslax_boost_i18n 별도). FK 없어 1-pass 처리.
 */
export async function loadMosslaxBoost(
  model: SourceSlugKeyedModel<MosslaxBoostPayload>,
  inputs: ReadonlyArray<MosslaxBoostInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      flavor: input.flavor,
      level: input.level,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(model, items);
}

/* ───────────────── StampCard ───────────────── */

type StampCardPayload = {
  weekGoal: number;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * StampCard upsert. Prisma `stamp_card` 모델은 weekGoal + 감사 컬럼만 보유.
 * StampReward 는 별도 loader (cardId FK 해소 필요).
 */
export async function loadStampCard(
  model: SourceSlugKeyedModel<StampCardPayload>,
  inputs: ReadonlyArray<StampCardInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      weekGoal: input.weekGoal,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(model, items);
}
