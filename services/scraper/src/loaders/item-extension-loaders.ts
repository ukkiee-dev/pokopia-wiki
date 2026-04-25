/**
 * Item 1:1 확장 entity loader (Food / LostRelic / TradeValuation).
 * (Phase 9 선결 코드, Batch C-2)
 *
 * 세 entity 모두 SCHEMA 상 `item` 1:1 확장:
 *   - Food: itemId PK + flavor + ppRestore + moveBoost
 *   - LostRelic: itemId PK + sizeClass + isAppraisedForm + appraisalResultItemId(nullable)
 *   - TradeValuation: itemId PK + baseValue + favoriteBonusMultiplier
 *
 * 본 모듈은 Prisma 의 일반 `findUnique({ where: { itemId } })` / `create` /
 * `update` 패턴을 직접 사용 (sourceSlug-keyed 가 아니라 itemId-keyed). 따라서
 * upsertBySourceSlug helper 가 적용되지 않고 자체 idempotent 로직 작성.
 *
 * 모두 item FK 해소가 1차 단계: lookupItemIds 로 itemSlug → id 매핑 후 미발견 시
 * failures 격리.
 */

import type {
  FoodInput,
  LostRelicInput,
  PrismaClient,
  TradeValuationInput,
} from '@pokopia-wiki/shared';

import { lookupItemIds } from './item-loader.js';
import type { UpsertResult, UpsertStats } from './upsert-loader.js';

/* ───────────────── Food ───────────────── */

type FoodModel = {
  findUnique: (args: { where: { itemId: number } }) => Promise<{ flavor: string } | null>;
  create: (args: {
    data: {
      itemId: number;
      flavor: FoodInput['flavor'];
      ppRestore: FoodInput['ppRestore'] | null;
      moveBoost: FoodInput['moveBoost'] | null;
    };
  }) => Promise<unknown>;
  update: (args: {
    where: { itemId: number };
    data: {
      flavor: FoodInput['flavor'];
      ppRestore: FoodInput['ppRestore'] | null;
      moveBoost: FoodInput['moveBoost'] | null;
    };
  }) => Promise<unknown>;
};

/**
 * Food upsert. Prisma `food` 모델은 itemId 가 PK + FK. SCHEMA §2.8 의 ppRestore
 * 는 NOT NULL 이지만 음료/소스 류는 부재라 본 loader 는 null 주입 → DB 제약
 * 위반 가능성. 호출자 (qa-analyst) 가 사전 검증 또는 schema relaxation 결정.
 */
export async function loadFood(
  prisma: Pick<PrismaClient, 'food' | 'item'>,
  inputs: ReadonlyArray<FoodInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const itemSlugs = inputs.map((input) => input.itemSlug);
  const itemIds = await lookupItemIds(prisma, itemSlugs);

  const stats: UpsertStats = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    const itemId = itemIds.get(input.itemSlug);
    if (itemId === undefined) {
      stats.failed += 1;
      failures.push({
        sourceSlug: input.itemSlug,
        error: `Item "${input.itemSlug}" 미발견 — Food upsert 건너뜀 (Item loader 먼저 실행)`,
      });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const existing = await (prisma.food as unknown as FoodModel).findUnique({
        where: { itemId },
      });
      const data = {
        itemId,
        flavor: input.flavor,
        ppRestore: input.ppRestore ?? null,
        moveBoost: input.moveBoost ?? null,
      };
      if (existing === null) {
        // eslint-disable-next-line no-await-in-loop
        await (prisma.food as unknown as FoodModel).create({ data });
        stats.inserted += 1;
      } else if (existing.flavor === data.flavor) {
        stats.unchanged += 1;
      } else {
        // eslint-disable-next-line no-await-in-loop
        await (prisma.food as unknown as FoodModel).update({
          where: { itemId },
          data: {
            flavor: data.flavor,
            ppRestore: data.ppRestore,
            moveBoost: data.moveBoost,
          },
        });
        stats.updated += 1;
      }
    } catch (error: unknown) {
      stats.failed += 1;
      failures.push({
        sourceSlug: input.itemSlug,
        error: `Food upsert 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { stats, failures };
}

/* ───────────────── LostRelic ───────────────── */

type LostRelicModel = {
  findUnique: (args: { where: { itemId: number } }) => Promise<{ sizeClass: string } | null>;
  create: (args: {
    data: {
      itemId: number;
      sizeClass: LostRelicInput['sizeClass'];
      isAppraisedForm: boolean;
      appraisalResultItemId: number | null;
      appraisalCost: number | null;
    };
  }) => Promise<unknown>;
  update: (args: {
    where: { itemId: number };
    data: {
      sizeClass: LostRelicInput['sizeClass'];
      isAppraisedForm: boolean;
      appraisalResultItemId: number | null;
      appraisalCost: number | null;
    };
  }) => Promise<unknown>;
};

/**
 * LostRelic upsert. itemId PK + sizeClass + isAppraisedForm + appraisalResultItemId
 * (nullable, appraisal 후 형태 item 매핑) + appraisalCost(nullable).
 */
export async function loadLostRelic(
  prisma: Pick<PrismaClient, 'lostRelic' | 'item'>,
  inputs: ReadonlyArray<LostRelicInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const allSlugs = [
    ...inputs.map((input) => input.itemSlug),
    ...inputs
      .map((input) => input.appraisalResultItemSlug)
      .filter((slug): slug is string => slug !== undefined),
  ];
  const itemIds = await lookupItemIds(prisma, allSlugs);

  const stats: UpsertStats = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    const itemId = itemIds.get(input.itemSlug);
    if (itemId === undefined) {
      stats.failed += 1;
      failures.push({
        sourceSlug: input.slug,
        error: `Item "${input.itemSlug}" 미발견 — LostRelic 건너뜀`,
      });
      continue;
    }
    const appraisalResultItemId =
      input.appraisalResultItemSlug !== undefined
        ? itemIds.get(input.appraisalResultItemSlug) ?? null
        : null;
    try {
      // eslint-disable-next-line no-await-in-loop
      const existing = await (prisma.lostRelic as unknown as LostRelicModel).findUnique({
        where: { itemId },
      });
      const data = {
        itemId,
        sizeClass: input.sizeClass,
        isAppraisedForm: input.isAppraisedForm,
        appraisalResultItemId,
        appraisalCost: input.appraisalCost ?? null,
      };
      if (existing === null) {
        // eslint-disable-next-line no-await-in-loop
        await (prisma.lostRelic as unknown as LostRelicModel).create({ data });
        stats.inserted += 1;
      } else if (existing.sizeClass === data.sizeClass) {
        // sizeClass 가 같으면 보강 데이터(appraisal*) 만 갱신될 수 있음 — update 호출
        // eslint-disable-next-line no-await-in-loop
        await (prisma.lostRelic as unknown as LostRelicModel).update({
          where: { itemId },
          data: {
            sizeClass: data.sizeClass,
            isAppraisedForm: data.isAppraisedForm,
            appraisalResultItemId: data.appraisalResultItemId,
            appraisalCost: data.appraisalCost,
          },
        });
        stats.unchanged += 1;
      } else {
        // eslint-disable-next-line no-await-in-loop
        await (prisma.lostRelic as unknown as LostRelicModel).update({
          where: { itemId },
          data: {
            sizeClass: data.sizeClass,
            isAppraisedForm: data.isAppraisedForm,
            appraisalResultItemId: data.appraisalResultItemId,
            appraisalCost: data.appraisalCost,
          },
        });
        stats.updated += 1;
      }
    } catch (error: unknown) {
      stats.failed += 1;
      failures.push({
        sourceSlug: input.slug,
        error: `LostRelic upsert 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { stats, failures };
}

/* ───────────────── TradeValuation ───────────────── */

type TradeValuationModel = {
  findUnique: (args: { where: { itemId: number } }) => Promise<{ baseValue: number } | null>;
  create: (args: {
    data: { itemId: number; baseValue: number; favoriteBonusMultiplier: number };
  }) => Promise<unknown>;
  update: (args: {
    where: { itemId: number };
    data: { baseValue: number; favoriteBonusMultiplier: number };
  }) => Promise<unknown>;
};

/**
 * TradeValuation upsert. itemId PK + baseValue + favoriteBonusMultiplier (default
 * 1.5). Serebii 본 페이지에 row 부재 → 빈 input 정상 케이스.
 */
export async function loadTradeValuation(
  prisma: Pick<PrismaClient, 'tradeValuation' | 'item'>,
  inputs: ReadonlyArray<TradeValuationInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const itemSlugs = inputs.map((input) => input.itemSlug);
  const itemIds = await lookupItemIds(prisma, itemSlugs);

  const stats: UpsertStats = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    const itemId = itemIds.get(input.itemSlug);
    if (itemId === undefined) {
      stats.failed += 1;
      failures.push({
        sourceSlug: input.slug,
        error: `Item "${input.itemSlug}" 미발견 — TradeValuation 건너뜀`,
      });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const existing = await (
        prisma.tradeValuation as unknown as TradeValuationModel
      ).findUnique({ where: { itemId } });
      if (existing === null) {
        // eslint-disable-next-line no-await-in-loop
        await (prisma.tradeValuation as unknown as TradeValuationModel).create({
          data: {
            itemId,
            baseValue: input.baseValue,
            favoriteBonusMultiplier: input.favoriteBonusMultiplier,
          },
        });
        stats.inserted += 1;
      } else if (existing.baseValue === input.baseValue) {
        stats.unchanged += 1;
      } else {
        // eslint-disable-next-line no-await-in-loop
        await (prisma.tradeValuation as unknown as TradeValuationModel).update({
          where: { itemId },
          data: {
            baseValue: input.baseValue,
            favoriteBonusMultiplier: input.favoriteBonusMultiplier,
          },
        });
        stats.updated += 1;
      }
    } catch (error: unknown) {
      stats.failed += 1;
      failures.push({
        sourceSlug: input.slug,
        error: `TradeValuation upsert 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { stats, failures };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
