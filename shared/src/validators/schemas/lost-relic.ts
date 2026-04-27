/**
 * 유물 도메인 스크래퍼 입력 스키마 (SCHEMA §2.20 lost_relic).
 *
 * - LostRelicSchema: `/lostrelics.shtml` 의 88 lost relic (Phase 8 단계 28)
 *   - Large (L): ~42 행
 *   - Small (S): ~46 행
 *
 * SCHEMA §2.20 와의 매핑:
 *   - LostRelic.itemId (FK/PK 1:1) ← itemSlug → loader 가 item 매칭 후 FK 해소.
 *   - LostRelic.sizeClass ENUM(L, S) ← 카테고리 헤더 `<a name="large|small">`.
 *   - LostRelic.isAppraisedForm (BOOL) ← 본 페이지에 row-level 명시 없음.
 *     기본값 false (감정 전 형태) 로 산출, loader 가 별도 매핑으로 감정 후 형태
 *     쌍을 식별.
 *   - LostRelic.appraisalResultItemId / appraisalCost ← 본 페이지에 명시 없음.
 *     Zod optional, loader 가 외부 매핑 보강.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * SCHEMA §2.20 `lost_relic.size_class` ENUM (L/S) — Prisma `LostRelicSize` 와
 * 값 일치.
 *
 * TypeScript 타입 재export 금지: Prisma client 가 동명 export
 * (geography.ts LocationType / mosslax.ts FlavorType 동일 정책). 본 파일은
 * `LostRelicInput['sizeClass']` 로 파생해 사용.
 */
export const LostRelicSizeEnum = z.enum(['L', 'S']);

/**
 * LostRelic 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `lost-relic-<itemSlug>` (예: "lost-relic-polygonalshelf",
 *   "lost-relic-nugget"). lost_relic 은 item 1:1 확장이지만 source_slug
 *   네임스페이스 분리 위해 접두사 부여.
 * - `itemSlug`: items/<slug>.png 토큰. loader 가 item.sourceSlug 와 1:1 매칭.
 * - `nameEn`: Name 셀 영문명.
 * - `descriptionEn`: Description 셀 raw 텍스트.
 * - `sizeClass`: 'L' (Large) | 'S' (Small) — 카테고리 헤더에서 누적.
 * - `isAppraisedForm`: false default (페이지가 감정 전 형태 목록). loader 가 외부
 *   매핑으로 감정 후 형태 쌍을 식별 시 true 마킹.
 * - `imageUrl`: Picture 셀 img src 절대 URL.
 */
export const LostRelicSchema = z
  .object({
    slug: z.string().min(1),
    itemSlug: z.string().min(1),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
    sizeClass: LostRelicSizeEnum,
    isAppraisedForm: z.boolean().default(false),
    appraisalResultItemSlug: z.string().min(1).optional(),
    appraisalCost: z.number().int().nonnegative().optional(),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type LostRelicInput = z.infer<typeof LostRelicSchema>;
