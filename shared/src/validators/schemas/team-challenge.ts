/**
 * 팀 입회 챌린지 도메인 스크래퍼 입력 스키마 (SCHEMA §2.12 스토리 & 퀘스트).
 *
 * - TeamChallengeSchema: `/teaminitiationchallenge.shtml` 의 9 챌린지 단계
 *   (Phase 8 단계 24)
 *
 * SCHEMA §2.12 와의 매핑:
 *   - TeamChallenge.stage (INT 1~9 UNIQUE) ← Challenge Number 셀
 *   - TeamChallenge.badgeName (TEXT) ← Reward 셀. Stage 9 는 fixture 에서 빈
 *     reward 라 optional 로 두고 loader 가 placeholder 처리.
 *   - TeamChallengeRequirement (challengeId FK, itemId FK, quantity INT)
 *     ← Item Requirements 셀의 `<br />` 분리 라인 → loader 가 item FK 해소.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * 챌린지 요구사항 힌트.
 * Item Requirements 셀의 라인 ("5 Leppa Berry") 또는 수량 없는 ("Washing Machine")
 * 둘 다 처리. quantity 미기재 시 default 1.
 */
const TeamChallengeRequirementHintSchema = z.object({
  itemNameEn: z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

export type TeamChallengeRequirementHint = z.infer<typeof TeamChallengeRequirementHintSchema>;

/**
 * TeamChallenge 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `team-challenge-stage<n>` (예: "team-challenge-stage1").
 * - `stage`: 1~9 정수.
 * - `badgeName`: Reward 셀 텍스트. Stage 9 는 fixture 빈 셀이라 optional.
 * - `notesEn`: Notes 셀 raw 텍스트 (multi-line `<br />` join). 빈 셀은 undefined.
 * - `requirements`: Item Requirements 셀 라인 배열.
 */
export const TeamChallengeSchema = z
  .object({
    slug: z.string().min(1),
    stage: z.number().int().min(1).max(9),
    badgeName: z.string().min(1).optional(),
    notesEn: z.string().min(1).optional(),
    requirements: z.array(TeamChallengeRequirementHintSchema).default([]),
  })
  .extend(SourceMetadataSchema.shape);

export type TeamChallengeInput = z.infer<typeof TeamChallengeSchema>;
