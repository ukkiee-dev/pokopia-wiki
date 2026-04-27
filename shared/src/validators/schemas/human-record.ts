/**
 * 인간 기록 도메인 스크래퍼 입력 스키마 (SCHEMA §2.17 human_record).
 *
 * - HumanRecordSchema: `/humanrecords.shtml` 의 126 human record (Phase 8 단계 29)
 *
 * SCHEMA §2.17 와의 매핑:
 *   - HumanRecord.category ENUM(Newspaper, Diary, Magazine, Note, Letter, Paper, Photo)
 *     ← 카테고리 헤더 영문명 → 단수형 매핑.
 *   - HumanRecord.locationId (FK) ← Locations 셀 텍스트에서 알려진 location 키워드
 *     매칭 → loader FK 해소.
 *   - HumanRecord.rewardType ENUM(customization, item, cd, none) ← Rewards 셀
 *     키워드 분석 — 빈 값 → 'none', outfit/clothing → 'customization', CD →
 *     'cd', 그 외 → 'item'.
 *   - HumanRecord.rewardRefId ← rawRewardEn 보존 → loader 가 키워드로 FK 해소.
 *   - HumanRecordI18n.name / description / content ← 본 파서가 raw 텍스트로 보존.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/** SCHEMA §2.17 `human_record.category` ENUM. */
export const HumanRecordCategoryEnum = z.enum([
  'Newspaper',
  'Diary',
  'Magazine',
  'Note',
  'Letter',
  'Paper',
  'Photo',
]);

/** SCHEMA §2.17 `human_record.reward_type` ENUM. */
export const HumanRecordRewardTypeEnum = z.enum([
  'customization',
  'item',
  'cd',
  'none',
]);

/**
 * HumanRecord 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `human-record-<categorySlug>-<nameSlug>` (예: "human-record-newspaper-
 *   road-closure-announcement"). category + name 조합으로 unique 보장.
 * - `category`: 단수형 SCHEMA ENUM 값 (Newspaper/Diary/Magazine/Note/Letter/Paper/Photo).
 * - `nameEn`: Name 셀 영문 제목.
 * - `descriptionEn`: Description 셀 raw 텍스트 (위치/맥락). 빈 값 가능.
 * - `locationSlug`: Locations 셀의 알려진 location 키워드 매칭 (예:
 *   "Withered Wastelands" → "witheredwastelands"). 단수/복수 변형 허용
 *   ("Withered Wasteland" / "Wastelands" 둘 다).
 * - `rawLocationEn`: Locations 셀 raw 텍스트 (loader 보강용 감사 메타).
 * - `rewardType`: Rewards 셀 키워드 분류.
 * - `rewardRefSlug`: Rewards 셀 텍스트 → loader 가 customization/item/cd FK 해소.
 *   raw 텍스트 보존.
 * - `imageUrl`: Picture 셀 img src 절대 URL. 빈 src (items/.png) 는 undefined.
 */
export const HumanRecordSchema = z
  .object({
    slug: z.string().min(1),
    category: HumanRecordCategoryEnum,
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
    locationSlug: z.string().min(1).optional(),
    rawLocationEn: z.string().min(1).optional(),
    rewardType: HumanRecordRewardTypeEnum,
    rewardRefSlug: z.string().min(1).optional(),
    rawRewardEn: z.string().min(1).optional(),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type HumanRecordInput = z.infer<typeof HumanRecordSchema>;
