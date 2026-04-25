/**
 * PaintColorLoader — PaintColor + paint_recipe (self-ref) 처리.
 * (Phase 9 선결 코드, Batch B)
 *
 * SCHEMA §2.11 매핑:
 *   - PaintColor: id + 감사 + i18n. parser slug 직접 주입.
 *   - PaintRecipe: composite PK (result_color_id, ingredient_color_id) + quantity.
 *     parser 의 ingredients[].itemNameEn 을 PaintColor.slug 로 매핑 후 FK 해소.
 *
 * 처리 단계 (2-pass):
 *   1. 모든 PaintColor upsert (slug 기준)
 *   2. PaintColor ID 룩업 + nameEn → slug 정규화 매핑 구축
 *   3. 각 result color 별 deleteMany resultColorId + createMany (replace)
 *      - paint_recipe 는 (resultColorId, ingredientColorId) PK 라 단순 upsert 가
 *        없어 replace 전략. 호출 횟수가 낮고 ingredient 셋이 작아 성능 영향 미미.
 *
 * itemNameEn → slug 변환 규칙:
 *   - "Red Paint" → "red"
 *   - "Aquamarine Paint" → "aquamarine"
 *   - "Paint" 접미사 (case-insensitive) 제거 + 공백 trim + lowercase + space→hyphen
 *
 * 매핑 실패 (itemNameEn 이 PaintColor.slug 에 없음) 시 해당 ingredient 건너뛰고
 * failures 에 기록.
 */

import type { PaintColorInput, PrismaClient } from '@pokopia-wiki/shared';

import {
  upsertBySourceSlug,
  type SourceSlugKeyedModel,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type PaintColorPayload = {
  sourceUrl: string;
  scrapedAt: Date;
};

type PaintColorLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type PaintRecipeModel = {
  deleteMany: (args: { where: { resultColorId: number } }) => Promise<{ count: number }>;
  createMany: (args: {
    data: ReadonlyArray<{ resultColorId: number; ingredientColorId: number; quantity: number }>;
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
};

/**
 * PaintColor + paint_recipe 일괄 upsert.
 *
 * 통계는 PaintColor 본 entity 기준 (recipe 는 replace 라 별도 카운트하지 않음).
 * ingredient 매핑 실패는 failures 에 기록 (sourceSlug = result color slug).
 */
export async function loadPaintColor(
  prisma: Pick<PrismaClient, 'paintColor' | 'paintRecipe'>,
  inputs: ReadonlyArray<PaintColorInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  // (1) PaintColor upsert
  const colorItems = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  const colorResult = await upsertBySourceSlug(
    prisma.paintColor as never,
    colorItems,
  );

  // (2) PaintColor ID 룩업
  const slugs = inputs.map((input) => input.slug);
  const rows = await (prisma.paintColor as unknown as PaintColorLookupModel).findMany({
    where: { sourceSlug: { in: slugs } },
    select: { id: true, sourceSlug: true },
  });
  const slugToId = new Map(rows.map((row) => [row.sourceSlug, row.id]));

  // nameEn → slug 매핑 (ingredient lookup 용). 본 batch 외 PaintColor 에 대해서도
  // 동작하도록 모든 row 로부터 nameEn 룩업이 가능해야 하지만, paint_color 모델이
  // i18n 분리 구조라 base table 에 nameEn 이 없음. 본 단계에선 input 에 등장한
  // PaintColor 만 매핑하므로 batch 안에서 ingredient 가 batch 외 color 를
  // 참조하면 매핑 실패. 정상 케이스 (Serebii paint.shtml 18 색 한꺼번에 처리)
  // 에서는 문제 없음.
  const nameToSlug = new Map<string, string>();
  for (const input of inputs) {
    nameToSlug.set(normalizePaintName(input.nameEn), input.slug);
  }

  // (3) 각 result color 별 paint_recipe replace
  const recipeFailures: Array<{ sourceSlug: string; error: string }> = [];
  for (const input of inputs) {
    const resultColorId = slugToId.get(input.slug);
    if (resultColorId === undefined) {
      recipeFailures.push({
        sourceSlug: input.slug,
        error: 'PaintColor ID 룩업 실패',
      });
      continue;
    }

    const recipeRows: Array<{
      resultColorId: number;
      ingredientColorId: number;
      quantity: number;
    }> = [];
    for (const ing of input.ingredients) {
      const ingSlug = nameToSlug.get(normalizePaintName(ing.itemNameEn));
      if (ingSlug === undefined) {
        recipeFailures.push({
          sourceSlug: input.slug,
          error: `ingredient "${ing.itemNameEn}" 매핑 실패 (PaintColor 미발견)`,
        });
        continue;
      }
      const ingredientColorId = slugToId.get(ingSlug);
      if (ingredientColorId === undefined) {
        recipeFailures.push({
          sourceSlug: input.slug,
          error: `ingredient slug "${ingSlug}" ID 룩업 실패`,
        });
        continue;
      }
      recipeRows.push({
        resultColorId,
        ingredientColorId,
        quantity: ing.quantity,
      });
    }

    try {
      // eslint-disable-next-line no-await-in-loop -- 순차 처리: 각 color 의 recipe replace 가 독립
      await (prisma.paintRecipe as unknown as PaintRecipeModel).deleteMany({
        where: { resultColorId },
      });
      if (recipeRows.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await (prisma.paintRecipe as unknown as PaintRecipeModel).createMany({
          data: recipeRows,
          skipDuplicates: true,
        });
      }
    } catch (error: unknown) {
      recipeFailures.push({
        sourceSlug: input.slug,
        error: `paint_recipe replace 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    stats: {
      ...colorResult.stats,
      failed: colorResult.stats.failed + recipeFailures.length,
    },
    failures: [...colorResult.failures, ...recipeFailures],
  };
}

/**
 * Paint name 정규화: "Red Paint" / "RED PAINT" / "  Red  Paint  " → "red".
 *
 * PaintColor.nameEn 은 "Red" / "Aquamarine" 등 단어 단독, ingredient.itemNameEn
 * 은 "Red Paint" / "Aquamarine Paint" 등 "Paint" 접미사 형태. 통합 키를 위해
 * 양쪽 모두 lowercase + 공백 정규화 + " paint" 접미사 제거 + 공백 → hyphen.
 */
function normalizePaintName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+paint$/u, '')
    .replace(/\s+/gu, '-');
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
