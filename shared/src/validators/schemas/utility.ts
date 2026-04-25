/**
 * 전기/물 도메인 스크래퍼 입력 스키마 (SCHEMA §2.14 전기 & 물).
 *
 * - GeneratorSchema: `/electricity.shtml` 의 "items that generate electricity" 표
 *   (Phase 8 단계 15)
 * - WaterTypeSchema: `/water.shtml` 의 "List of types of Water" 표 (Phase 8 단계 15)
 *
 * SCHEMA §2.14 의 Generator/WaterType 모델은 generator/water_type 테이블 + 각각
 * i18n 테이블 한 쌍. Prisma 의 non-null 컬럼 중 row-level 텍스트로 추출 불가능한
 * 항목(WaterType.spreadRadius / trenchDistance) 은 본 스키마에서 optional 로 두고
 * loader 가 페이지 산문(prose) 또는 별도 데이터로 보강한다.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * Generator 파서 출력 스키마 (SCHEMA §2.14 generator).
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: items/<slug>.png 또는 build/<slug>.shtml 의 URL 토큰. Mini generator
 *   는 items/ 단독, Windmill/Waterwheel/Furnace kit 은 build/ 상세 페이지를 함께
 *   가진다 (단계 11 BuildingKit 과 자연 키 공유; loader 가 두 엔티티에 동시 upsert).
 * - `nameEn`: Name 셀 (예: "Mini generator", "Windmill kit").
 * - `descriptionEn`: Description 셀 raw 텍스트.
 * - `outputUnits`: "Units of Electricity Generated" 셀의 첫 번째 정수. SCHEMA non-null.
 * - `outputUnitsAlt`: 동일 셀에 "20 high-altitude" 처럼 부가 조건으로 추가 정수가
 *   있을 때 그 두 번째 정수 (예: Windmill kit). 단일 정수 셀은 undefined.
 * - `outputUnitsLabel` / `outputUnitsAltLabel`: 정수 옆 라벨 ("standard" /
 *   "high-altitude"). loader 가 i18n description 등에 활용 가능 (보존만).
 * - `isRenewable`: "Renewed?" 셀 텍스트로 결정. "Automatic" → true, "Requires
 *   Renewing" → false. SCHEMA non-null.
 * - `imageUrl`: Picture 셀 img src 절대 URL.
 */
export const GeneratorSchema = z
  .object({
    slug: z.string().min(1),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
    outputUnits: z.number().int().positive(),
    outputUnitsAlt: z.number().int().positive().optional(),
    outputUnitsLabel: z.string().min(1).optional(),
    outputUnitsAltLabel: z.string().min(1).optional(),
    isRenewable: z.boolean(),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type GeneratorInput = z.infer<typeof GeneratorSchema>;

/**
 * WaterType 파서 출력 스키마 (SCHEMA §2.14 water_type).
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: nameEn 의 lowercase + 공백→하이픈 (예: "water", "ocean-water"). Serebii
 *   가 row 별 별도 URL 토큰을 제공하지 않아 영문명을 자연키로 채택. 5 종 모두 unique.
 * - `nameEn`: Name 셀 (예: "Water", "Ocean Water", "Hot Spring Water", "Lava").
 * - `descriptionEn`: Description 셀 raw 텍스트.
 * - `hydrates`: description 에 "Does not hydrate" 포함 시 false, 그 외 true.
 *   SCHEMA non-null.
 * - `imageUrl`: Picture 셀 img src 절대 URL.
 * - `sourceItemSlug` / `sourceItemNameEn`: Item 셀 의 음료 아이템 (예: Fresh Water
 *   드링크 → Water type 생성). loader 가 item FK 매핑 또는 운영 메타로 활용.
 *
 * SCHEMA non-null 필드 중 row-level 추출 불가:
 *   - `spreadRadius`, `trenchDistance` 는 페이지 산문(prose) 에만 명시되어 본 파서
 *     출력에 미포함 (optional). loader 가 별도 추출 또는 외부 데이터로 보강.
 */
export const WaterTypeSchema = z
  .object({
    slug: z.string().min(1),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
    hydrates: z.boolean(),
    imageUrl: z.url().optional(),
    sourceItemSlug: z.string().min(1).optional(),
    sourceItemNameEn: z.string().min(1).optional(),
    spreadRadius: z.number().int().positive().optional(),
    trenchDistance: z.number().int().positive().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type WaterTypeInput = z.infer<typeof WaterTypeSchema>;
