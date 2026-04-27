/**
 * CdLoader — Cd + SourceGame + CdLocation 일괄 처리 (Phase 9 선결 코드, Batch B).
 *
 * SCHEMA §2.16 매핑:
 *   - SourceGame: code(unique) + generation + 감사. CdInput.sourceGame nested.
 *   - Cd: sourceGameId FK + 감사 + i18n. parser sourceSlug(itemSlug) 직접 주입.
 *   - CdLocation: cdId FK + locationId(nullable) FK + method 텍스트. parser
 *     locations[].locationSlug 가 있으면 location FK 해소 시도, 없으면 NULL.
 *
 * 처리 순서 (멱등성 보장):
 *   1. 모든 CdInput.sourceGame 을 SourceGame 으로 upsert (code 기준 dedupe)
 *      → sourceGameId 매핑 테이블 구축
 *   2. 각 Cd 를 sourceGameId 주입 후 upsert
 *   3. CdLocation: 본 1차 구현은 deleteMany(cd_id) + createMany 의 replace 전략.
 *      재호출 시 cd_id 별 location 셋이 그대로면 hash 비교 단계 없이 무동작 보장
 *      불가 → idempotent 손해 감수 (locations 가 안정 적음). location FK 해소는
 *      향후 Location loader 후 update.
 */

import type {
  CdInput,
  CdLocationHint,
  PrismaClient,
  SourceGameHint,
} from '@pokopia-wiki/shared';

import {
  upsertBySourceSlug,
  type SourceSlugKeyedModel,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type SourceGamePayload = {
  code: string;
  generation: number;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * SourceGame 전용 upsert. SourceGameHint 만 받아 dedupe + upsert. 내부 사용
 * 위주이지만 CDS 페이지 외 entity (예: 향후 게임 메타 페이지) 에서도 재사용 가능.
 *
 * sourceSlug = code. parser 가 매번 동일 code 를 보내면 content_hash 동일 →
 * unchanged 반환.
 */
export async function loadSourceGames(
  model: SourceSlugKeyedModel<SourceGamePayload>,
  hints: ReadonlyArray<SourceGameHint>,
  defaultMeta: { sourceUrl: string; scrapedAt: string },
): Promise<UpsertResult> {
  const seen = new Map<string, SourceGameHint>();
  for (const hint of hints) {
    if (!seen.has(hint.code)) seen.set(hint.code, hint);
  }
  const items = [...seen.values()].map((hint) => ({
    sourceSlug: hint.code,
    payload: {
      code: hint.code,
      generation: hint.generation,
      sourceUrl: defaultMeta.sourceUrl,
      scrapedAt: new Date(defaultMeta.scrapedAt),
    },
    metadata: {
      sourceSite: 'serebii' as const,
      sourceUrl: defaultMeta.sourceUrl,
      scrapedAt: defaultMeta.scrapedAt,
      license: 'derived',
      copyrightHolder: 'Nintendo',
      attribution: 'derived from cd parser',
    },
  }));
  return upsertBySourceSlug(model, items);
}

/**
 * Prisma SourceGame 모델 형태 (id 조회용 — sourceSlug → id 룩업).
 */
type SourceGameLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

/**
 * Cd 본 entity loader. 내부에서 SourceGame upsert 후 sourceGameId 매핑을 주입.
 * CdLocation 매핑은 본 함수에서 처리하지 않음 (별도 후속 단계 — location FK
 * 해소가 Location loader 의존).
 *
 * 처리 단계:
 *   1. SourceGame upsert (code dedupe)
 *   2. SourceGame ID 룩업 (code → id 매핑)
 *   3. CdInput → CdPayload 변환 (sourceGameId 주입) → upsert
 *
 * sourceGame 매핑이 누락된 entity 는 failures 로 격리 (loader 결과의 failures
 * 배열에 sourceSlug + 명시 메시지).
 */
export async function loadCd(
  prisma: Pick<PrismaClient, 'sourceGame' | 'cd'>,
  inputs: ReadonlyArray<CdInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  // (1) SourceGame upsert
  const firstInput = inputs[0]!;
  const sourceGameResult = await loadSourceGames(
    prisma.sourceGame as never,
    inputs.map((input) => input.sourceGame),
    { sourceUrl: firstInput.sourceUrl, scrapedAt: firstInput.scrapedAt },
  );

  // (2) SourceGame ID 룩업
  const codes = [...new Set(inputs.map((input) => input.sourceGame.code))];
  const sourceGameRows = await (prisma.sourceGame as unknown as SourceGameLookupModel).findMany({
    where: { sourceSlug: { in: codes } },
    select: { id: true, sourceSlug: true },
  });
  const codeToId = new Map(sourceGameRows.map((row) => [row.sourceSlug, row.id]));

  // (3) Cd upsert
  const cdItems = inputs
    .map((input) => {
      const sourceGameId = codeToId.get(input.sourceGame.code);
      if (sourceGameId === undefined) return null;
      return {
        sourceSlug: input.slug,
        payload: {
          sourceGameId,
          sourceUrl: input.sourceUrl,
          scrapedAt: new Date(input.scrapedAt),
        },
        metadata: input,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const failures: Array<{ sourceSlug: string; error: string }> = [];
  for (const input of inputs) {
    if (codeToId.get(input.sourceGame.code) === undefined) {
      failures.push({
        sourceSlug: input.slug,
        error: `SourceGame upsert/lookup 실패: code=${input.sourceGame.code}`,
      });
    }
  }

  const cdResult = await upsertBySourceSlug(prisma.cd as never, cdItems);

  // SourceGame 통계는 cd 결과와 별개로 합산 표기 — 호출자가 stats 합본을 원하면
  // 직접 더한다. 본 반환은 cd 본 entity 통계 + cd 자체 failures + sourceGame
  // 누락 격리만 포함.
  return {
    stats: {
      inserted: cdResult.stats.inserted + sourceGameResult.stats.inserted,
      updated: cdResult.stats.updated + sourceGameResult.stats.updated,
      unchanged: cdResult.stats.unchanged + sourceGameResult.stats.unchanged,
      failed: cdResult.stats.failed + sourceGameResult.stats.failed + failures.length,
    },
    failures: [...cdResult.failures, ...sourceGameResult.failures, ...failures],
  };
}

/**
 * CdLocation 처리 — 본 단계에서는 호출하지 않음 (Location loader 의존).
 * 향후 Location upsert 후 별도 호출. signature 만 export 해 두면 호출자 인터페이스
 * 안정성 확보.
 */
export type CdLocationItem = {
  cdSlug: string;
  hint: CdLocationHint;
};

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
