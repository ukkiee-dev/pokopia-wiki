/* eslint-disable no-await-in-loop -- 의도적 순차 upsert: 각 entity 가 독립적이라
   부분 실패 추적이 핵심. Promise.all 은 첫 reject 에서 다른 inflight 결과를
   놓칠 수 있어 batch upsert 의 멱등성/회복 탄력성을 깨뜨림. */
/**
 * UpsertLoader — Phase 8 Task 8.4 / Phase 9 선결 코드.
 *
 * 모든 Serebii/PokopiaGuide/... 파서 산출 entity 를 멱등(idempotent) 하게 DB 에
 * upsert 하는 generic helper. CRAWLING_STRATEGY §20.2 정책 준수:
 *   - 모든 DB 작업 upsert (sourceSlug 기준)
 *   - content_hash 변경 시만 updatedAt 갱신 (불필요한 mutation 방지)
 *   - 부분 실패 허용 (한 entity 실패가 batch 중단으로 번지지 않음)
 *
 * 본 모듈은 Prisma 모델 의존 없이 generic upsert pattern 만 제공한다. 각 entity
 * 별 loader (pokemon-loader.ts 등) 가 본 헬퍼를 호출해 도메인-특수 매핑을 처리.
 *
 * 책임 경계:
 *   - 본 모듈: content_hash 계산, 이전 hash 와 비교, upsert 실행/측정,
 *     멱등성 보장
 *   - 호출자(entity loader): Prisma model 선택, sourceSlug 매핑, FK 해소,
 *     candidate payload 빌드
 */

import { createHash } from 'node:crypto';

import type { SourceMetadata } from '@pokopia-wiki/shared';

/**
 * 한 entity 의 upsert 결과 통계.
 *
 * - `inserted`: DB 에 새로 생성된 행 수
 * - `updated`: content_hash 변경으로 갱신된 행 수
 * - `unchanged`: content_hash 동일로 skip 된 행 수 (sourceSlug 일치 + hash 일치)
 * - `failed`: Prisma 예외로 실패한 행 수 (issues 에 상세 기록)
 */
export type UpsertStats = {
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
};

/** Loader 호출 결과 — entity 별 통계 + 실패한 entity 의 sourceSlug + 에러 메시지. */
export type UpsertResult = {
  stats: UpsertStats;
  failures: ReadonlyArray<{
    sourceSlug: string;
    error: string;
  }>;
};

/**
 * 한 entity 의 upsert 단위 작업 정의.
 *
 * - `sourceSlug`: DB row 의 자연키 (`@unique @map("source_slug")`).
 * - `payload`: Prisma `update` / `create` 양쪽에 사용될 데이터. 호출자가 도메인
 *   특수 필드(FK, ENUM 등) 해소까지 마친 상태로 전달.
 * - `metadata`: SourceMetadata (sourceUrl/scrapedAt/attribution 등). content_hash
 *   는 metadata.contentHash 가 있으면 그것을 우선 사용하고, 없으면 payload 직렬화로 계산.
 */
export type UpsertItem<TPayload extends object> = {
  sourceSlug: string;
  payload: TPayload;
  metadata: SourceMetadata;
};

/**
 * Prisma 모델의 sourceSlug-keyed CRUD 인터페이스 (model-agnostic).
 *
 * 각 Prisma model 의 `findUnique` / `create` / `update` 시그니처가 정확히 이 형태에
 * 부합한다. `executeRaw` 우회 없이 표준 Prisma API 만 사용해 타입 안전성 확보.
 */
export type SourceSlugKeyedModel<TPayload extends object> = {
  findUnique: (args: {
    where: { sourceSlug: string };
    select?: { contentHash: true };
  }) => Promise<{ contentHash: string } | null>;
  create: (args: { data: TPayload & { sourceSlug: string; contentHash: string } }) => Promise<unknown>;
  update: (args: {
    where: { sourceSlug: string };
    data: TPayload & { contentHash: string; updatedAt?: Date };
  }) => Promise<unknown>;
};

/**
 * Items 를 sourceSlug 별로 upsert.
 *
 * 알고리즘:
 *   1. 각 item 의 contentHash 계산 (metadata.contentHash 우선, 없으면 payload 직렬화)
 *   2. DB 에서 sourceSlug 로 기존 row 조회
 *   3. 없으면 → create (inserted++)
 *      있으면 → contentHash 비교
 *        - 동일 → skip (unchanged++)
 *        - 다름 → update (updated++)
 *   4. Prisma 예외는 catch 후 failures 에 기록 (failed++), 다음 item 으로 진행
 *
 * 본 함수는 트랜잭션을 열지 않는다 — 각 item 이 독립적이라 부분 실패 허용
 * (CRAWLING_STRATEGY §20.2). 호출자가 트랜잭션을 원하면 wrapping.
 */
export async function upsertBySourceSlug<TPayload extends object>(
  model: SourceSlugKeyedModel<TPayload>,
  items: ReadonlyArray<UpsertItem<TPayload>>,
): Promise<UpsertResult> {
  const stats: UpsertStats = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const item of items) {
    try {
      const contentHash = computeContentHash(item.payload, item.metadata);
      const existing = await model.findUnique({
        where: { sourceSlug: item.sourceSlug },
        select: { contentHash: true },
      });

      if (existing === null) {
        await model.create({
          data: {
            ...item.payload,
            sourceSlug: item.sourceSlug,
            contentHash,
          },
        });
        stats.inserted += 1;
        continue;
      }

      if (existing.contentHash === contentHash) {
        stats.unchanged += 1;
        continue;
      }

      await model.update({
        where: { sourceSlug: item.sourceSlug },
        data: {
          ...item.payload,
          contentHash,
          updatedAt: new Date(),
        },
      });
      stats.updated += 1;
    } catch (error: unknown) {
      stats.failed += 1;
      failures.push({
        sourceSlug: item.sourceSlug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { stats, failures };
}

/**
 * payload 의 content hash 계산. metadata 에 contentHash 가 이미 있으면 그것을 우선
 * (fixture/cache 단계에서 이미 계산된 값을 신뢰).
 *
 * 직접 계산 시 SHA-256 of JSON.stringify(payload) — 키 순서 안정성을 위해 알파벳
 * 정렬 후 직렬화. metadata 자체는 hash 에서 제외 (sourceUrl/scrapedAt 변경이
 * content 변경으로 오인되는 것 방지 — content 는 payload 만).
 */
function computeContentHash<TPayload extends object>(
  payload: TPayload,
  metadata: SourceMetadata,
): string {
  // SourceMetadata 에 사전 계산된 contentHash 가 있으면 사용 (감사 일관성).
  const meta = metadata as { contentHash?: string };
  if (typeof meta.contentHash === 'string' && meta.contentHash.length > 0) {
    return meta.contentHash;
  }
  const sorted = stableStringify(payload);
  return createHash('sha256').update(sorted).digest('hex');
}

/**
 * 객체를 키 알파벳 정렬한 JSON 문자열로 직렬화. 동일 내용 → 동일 hash 보장.
 * 중첩 객체/배열 모두 재귀.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).toSorted();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${entries.join(',')}}`;
}
