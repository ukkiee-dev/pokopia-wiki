/**
 * 퀘스트 도메인 스크래퍼 입력 스키마 (SCHEMA §2.12 스토리 & 퀘스트).
 *
 * - QuestSchema: `/importantrequests.shtml` 의 5 Important Request 섹션
 *   (Phase 8 단계 23)
 * - QuestRequirementSchema: 본 페이지에는 prose 안에 산재된 요구사항만 있어
 *   파서가 산출하지 않음. 스키마만 정의 (향후 단계 또는 외부 매핑 보강).
 *
 * SCHEMA §2.12 와의 매핑:
 *   - Quest.locationId ← parser 의 locationSlug → loader FK 해소.
 *   - Quest.sortOrder ← h2 등장 순서 (1~N).
 *   - Quest.prerequisiteQuestId ← 본 페이지에는 명시 안 됨 (선행 퀘스트 체인은
 *     별도 매핑). 본 파서 미산출.
 *   - QuestI18n.name ← h2 텍스트
 *   - QuestI18n.objective ← h2 다음 첫 단락 (요약)
 *   - QuestI18n.walkthrough ← 모든 단락을 줄바꿈으로 join (Markdown-friendly)
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * Quest 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `quest-<nameSlug>` (예: "quest-yawn-up-a-storm").
 * - `nameEn`: h2 텍스트 (예: "Yawn Up A Storm", "Rebuild the Huge Building").
 * - `locationSlug`: 본문에서 알려진 location 키워드(Withered Wastelands /
 *   Bleak Beach / Rocky Ridges / Sparkling Skylands / Palette Town /
 *   Cloud Island) 매칭 → slug 변환.
 * - `sortOrder`: h2 등장 순서 (1~5 fixture 기준).
 * - `objectiveEn`: h2 다음 첫 단락 (요약 한 줄).
 * - `walkthroughEn`: 섹션의 모든 단락을 줄바꿈으로 join (전체 walkthrough).
 * - `imageUrl`: 같은 tr 의 picturetd 안 img src 절대 URL.
 */
export const QuestSchema = z
  .object({
    slug: z.string().min(1),
    nameEn: z.string().min(1),
    locationSlug: z.string().min(1),
    sortOrder: z.number().int().positive(),
    objectiveEn: z.string().min(1).optional(),
    walkthroughEn: z.string().min(1).optional(),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type QuestInput = z.infer<typeof QuestSchema>;

/**
 * QuestRequirement 파서 출력 스키마.
 *
 * 단계 23 페이지에는 명시적 row-level requirement 표가 없고 prose 안에 산재된
 * "25 Concrete, 10 Glass" 같은 요구사항만 존재. 본 파서는 산출하지 않으나
 * 향후 외부 매핑 또는 별도 추출 단계가 본 형식의 입력을 제공할 때를 위한 정의.
 */
export const QuestRequirementSchema = z
  .object({
    slug: z.string().min(1),
    questSlug: z.string().min(1),
    itemSlug: z.string().min(1).optional(),
    pokemonSlug: z.string().min(1).optional(),
    quantity: z.number().int().positive().default(1),
    descriptionEn: z.string().min(1).optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type QuestRequirementInput = z.infer<typeof QuestRequirementSchema>;
