/**
 * SpecialtyLoader — Phase 9 선결 코드.
 *
 * SpecialtyInput (파서 출력) → Prisma Specialty model 매핑 + 멱등 upsert.
 * Pokemon loader 와 다르게 sourceSlug 가 input.slug 에 이미 명시적으로 있어
 * URL 추출 fallback 불필요 (대부분의 entity 가 이 패턴 — input.slug 직접 사용).
 *
 * Specialty 의 i18n (SpecialtyI18n.name 영문) 은 별도 loader 가 처리. 본 모듈은
 * Specialty 본 entity 만 upsert (감사 컬럼 + sourceUrl/scrapedAt).
 */

import type { SpecialtyInput } from '@pokopia-wiki/shared';

import {
  upsertBySourceSlug,
  type SourceSlugKeyedModel,
  type UpsertResult,
} from './upsert-loader.js';

/**
 * Prisma Specialty model 의 create/update payload.
 *
 * Specialty model 은 SCHEMA §2.1 에서 id PK + 감사 컬럼만 보유 (다른 도메인
 * 컬럼 없음 — 이름/아이콘은 i18n 별도 매핑). 따라서 payload 는 sourceUrl/
 * scrapedAt 만.
 */
type SpecialtyUpsertPayload = {
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * Specialty entity 들을 input.slug 기준으로 upsert.
 *
 * @param model Prisma `specialty` model (`prisma.specialty`).
 * @param inputs SpecialtyInput 배열.
 *
 * 동작:
 *   - 각 input 의 slug 를 그대로 sourceSlug 로 사용 (대부분의 entity 패턴).
 *   - sourceUrl/scrapedAt 만 payload 로 매핑.
 *   - 부분 실패 허용.
 *
 * Specialty.iconUrl 같은 EntityImage polymorphic 컬럼은 본 단계에서 미반영 —
 * 향후 EntityImage loader 가 별도 처리.
 */
export async function loadSpecialty(
  model: SourceSlugKeyedModel<SpecialtyUpsertPayload>,
  inputs: ReadonlyArray<SpecialtyInput>,
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
