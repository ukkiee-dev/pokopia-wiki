/**
 * SimpleLoaders — 단일 파일에 모은 simple entity loader 모음 (Phase 9 선결 코드).
 *
 * 본 모듈은 다음 조건을 만족하는 entity 만 담는다:
 *   - parser output 의 모든 필드가 Prisma model 컬럼과 1:1 매핑 가능
 *   - FK 해소 불필요 (다른 entity ID 조회 없음) 또는 nullable FK 만
 *   - nested array 매핑 불필요 (Plant.variants 처럼 빈 배열로 두는 경우는 허용)
 *
 * 위 조건에 맞지 않는 복잡 entity (Item/Habitat/Recipe/PaintColor/Cd 등) 는
 * 별도 loader 파일로 분리되며, 의존 entity 먼저 upsert + ID 조회 + 본 entity
 * upsert 의 2-pass 패턴으로 작성. loaders/README.md 의 우선순위 표 참고.
 *
 * 본 commit 시점 simple entity (10 종):
 *   - FavoriteCategory   — id + 감사 only
 *   - FriendshipTier     — tier(unique) + requiredPoints
 *   - Generator          — outputUnits + outputUnitsAlt + isRenewable
 *   - WaterType          — spreadRadius + trenchDistance + hydrates (NOT NULL 보강 default 0)
 *   - PaintPattern       — id + 감사 only
 *   - CustomizationItem  — category + unlockMethod + unlockLocationId(nullable, 미해소 NULL)
 *   - Plant              — type + growthDays + growthDaysWithGrow + requiresHydration
 *   - JumpropeTier       — tier + requiredJumps + rewardType + rewardRefId(nullable)
 *   - MosslaxBoost       — flavor(ENUM) + level
 *   - StampCard          — weekGoal
 *
 * polymorphic reward NOT NULL FK (HideAndSneakReward.rewardRefId,
 * PokedexMilestone.rewardRefId) 는 본 모듈에서 제외 — Item/Recipe loader 가
 * 먼저 필요. 별도 loader 파일에서 2-pass 처리.
 */

import type {
  CustomizationItemInput,
  FavoriteCategoryInput,
  FriendshipTierInput,
  GeneratorInput,
  JumpropeTierInput,
  MosslaxBoostInput,
  PaintPatternInput,
  PlantInput,
  StampCardInput,
  WaterTypeInput,
} from '@pokopia-wiki/shared';

import {
  upsertBySourceSlug,
  type SourceSlugKeyedModel,
  type UpsertResult,
} from './upsert-loader.js';

/* ───────────────── FavoriteCategory ───────────────── */

type FavoriteCategoryPayload = {
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * FavoriteCategory upsert. Prisma `favorite_category` 모델은 id + 감사 컬럼만
 * 보유 (nameEn/descriptionEn 은 favorite_category_i18n). FK 없어 1-pass.
 */
export async function loadFavoriteCategory(
  model: SourceSlugKeyedModel<FavoriteCategoryPayload>,
  inputs: ReadonlyArray<FavoriteCategoryInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(model, items);
}

/* ───────────────── FriendshipTier ───────────────── */

type FriendshipTierPayload = {
  tier: number;
  requiredPoints: number;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * FriendshipTier upsert. tier(INT UNIQUE) + requiredPoints + 감사 컬럼.
 * nameEn/descriptionEn 은 friendship_tier_i18n 별도. FK 없어 1-pass.
 *
 * 주의: Serebii `/friendship.shtml` 에는 row-level 데이터가 없어 본 loader 는
 * 외부 데이터(Bulbapedia 등) 입력을 가정. Phase 9 단계에서 빈 input 만 들어와도
 * 무동작이 정상.
 */
export async function loadFriendshipTier(
  model: SourceSlugKeyedModel<FriendshipTierPayload>,
  inputs: ReadonlyArray<FriendshipTierInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      tier: input.tier,
      requiredPoints: input.requiredPoints,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(model, items);
}

/* ───────────────── Generator ───────────────── */

type GeneratorPayload = {
  outputUnits: number;
  outputUnitsAlt: number | null;
  isRenewable: boolean;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * Generator upsert. outputUnits(NOT NULL) + outputUnitsAlt(nullable) +
 * isRenewable + 감사. nameEn/descriptionEn 은 generator_i18n 별도. FK 없어 1-pass.
 */
export async function loadGenerator(
  model: SourceSlugKeyedModel<GeneratorPayload>,
  inputs: ReadonlyArray<GeneratorInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      outputUnits: input.outputUnits,
      outputUnitsAlt: input.outputUnitsAlt ?? null,
      isRenewable: input.isRenewable,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(model, items);
}

/* ───────────────── WaterType ───────────────── */

type WaterTypePayload = {
  spreadRadius: number;
  trenchDistance: number;
  hydrates: boolean;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * WaterType upsert. SCHEMA non-null spreadRadius/trenchDistance 는 Serebii
 * row-level 데이터에 부재 — 본 loader 는 미산출 시 0 주입 후 향후 운영 보강
 * (외부 데이터로 update). hydrates 는 page row 에서 추출 가능.
 *
 * loader 가 row 자체를 skip 하지 않는 이유: WaterType 5종 자체는 안정적이라
 * placeholder 행을 두는 것이 데이터 부재(완전 누락) 보다 검증·관측에 유리.
 */
export async function loadWaterType(
  model: SourceSlugKeyedModel<WaterTypePayload>,
  inputs: ReadonlyArray<WaterTypeInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      spreadRadius: input.spreadRadius ?? 0,
      trenchDistance: input.trenchDistance ?? 0,
      hydrates: input.hydrates,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(model, items);
}

/* ───────────────── PaintPattern ───────────────── */

type PaintPatternPayload = {
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * PaintPattern upsert. Prisma `paint_pattern` 모델은 id + 감사 only.
 * locationEn 은 paint_pattern_i18n.name 또는 description 으로 활용 (loader
 * 본 모듈에서는 base table 만; i18n 은 Phase 11+ 한국어 매핑 단계).
 *
 * PaintColor 는 recipe self-ref 가 있어 별도 loader (paint-color-loader.ts).
 */
export async function loadPaintPattern(
  model: SourceSlugKeyedModel<PaintPatternPayload>,
  inputs: ReadonlyArray<PaintPatternInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(model, items);
}

/* ───────────────── CustomizationItem ───────────────── */

type CustomizationItemPayload = {
  category: CustomizationItemInput['category'];
  unlockMethod: string;
  unlockLocationId: number | null;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * CustomizationItem upsert. unlockLocationId 는 nullable FK — 본 1-pass 단계에서는
 * 항상 null 주입 (location 매핑은 Phase 11+ 또는 별도 후속 loader). i18n 분리.
 *
 * 향후 location FK 해소가 필요하면 본 loader 를 2-pass 로 확장하거나 별도
 * customization-loader.ts 로 분리.
 */
export async function loadCustomizationItem(
  model: SourceSlugKeyedModel<CustomizationItemPayload>,
  inputs: ReadonlyArray<CustomizationItemInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      category: input.category,
      unlockMethod: input.unlockMethodEn,
      unlockLocationId: null,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(model, items);
}

/* ───────────────── Plant ───────────────── */

type PlantPayload = {
  type: PlantInput['type'];
  growthDays: number;
  growthDaysWithGrow: number;
  requiresHydration: boolean;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * Plant upsert. growthDays/growthDaysWithGrow/requiresHydration 은 SCHEMA
 * NOT NULL 이지만 Serebii row 에 부재 — Zod default(1, 1, false) 로 보강 후
 * 본 loader 는 그대로 주입. 운영 단계에서 외부 데이터로 update 예정.
 *
 * PlantVariant nested 는 본 단계 빈 배열 (Phase 11+ 색상/stage 데이터 추가 시
 * 별도 plant-variant-loader.ts 또는 본 loader 의 nested upsert 로 확장).
 */
export async function loadPlant(
  model: SourceSlugKeyedModel<PlantPayload>,
  inputs: ReadonlyArray<PlantInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      type: input.type,
      growthDays: input.growthDays,
      growthDaysWithGrow: input.growthDaysWithGrow,
      requiresHydration: input.requiresHydration,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(model, items);
}

/* ───────────────── JumpropeTier ───────────────── */

type JumpropeTierPayload = {
  tier: number;
  requiredJumps: number;
  rewardType: JumpropeTierInput['rewardType'];
  rewardRefId: number | null;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * JumpropeTier upsert. rewardRefId 는 nullable polymorphic FK — itemSlug 의 Item
 * FK 해소가 본 1-pass 에선 불가 (Item loader 가 먼저 필요). 따라서 항상 null
 * 주입 후 후속 단계에서 update (Item upsert 후 itemSlug → id 매핑 별도 작업).
 *
 * 본 loader 는 tier/requiredJumps/rewardType 만 안정적으로 채움.
 */
export async function loadJumpropeTier(
  model: SourceSlugKeyedModel<JumpropeTierPayload>,
  inputs: ReadonlyArray<JumpropeTierInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      tier: input.tier,
      requiredJumps: input.requiredJumps,
      rewardType: input.rewardType,
      rewardRefId: null,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(model, items);
}

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
