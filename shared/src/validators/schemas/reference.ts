/**
 * 참조(reference) 도메인 스크래퍼 입력 스키마.
 *
 * - GameplayReferenceSchema: `/gameplay.shtml` 의 게임플레이 메커니즘 개요
 *   (Phase 8 단계 22 — DB 비대상)
 *
 * SCHEMA 와 무관하게 `data/parsed/reference/<slug>.json` 으로 저장될 참조 문서를
 * 위한 스키마 그룹. DB 적재 대상이 아니지만 Zod 검증 + SourceMetadata 부착으로
 * attribution / fixture content_hash 추적 채널을 일관 유지.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * GameplayReference 안의 섹션 한 개 (h2 제목 + 본문 단락 배열).
 */
const GameplayReferenceSectionSchema = z.object({
  headingEn: z.string().min(1),
  paragraphsEn: z.array(z.string().min(1)).default([]),
});

export type GameplayReferenceSectionHint = z.infer<typeof GameplayReferenceSectionSchema>;

/**
 * GameplayReference 파서 출력 스키마 — 페이지 전체를 단일 reference document
 * 로 캡처.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: "gameplay-mechanics" 고정 — DB 비대상이지만 향후 `data/parsed/
 *   reference/gameplay-mechanics.json` 파일명 자연키.
 * - `titleEn`: 페이지 h1 제목 (예: "Pokémon Pokopia Gameplay Mechanics").
 * - `introEn`: h1 직후 본문 단락 (1 개).
 * - `sections`: h2 + 그 아래 본문 단락 배열의 시퀀스 (현 fixture 기준 3 개:
 *   Create Habitats / Crafting / Use Pokémon).
 */
export const GameplayReferenceSchema = z
  .object({
    slug: z.literal('gameplay-mechanics'),
    titleEn: z.string().min(1),
    introEn: z.string().min(1).optional(),
    sections: z.array(GameplayReferenceSectionSchema).default([]),
  })
  .extend(SourceMetadataSchema.shape);

export type GameplayReferenceInput = z.infer<typeof GameplayReferenceSchema>;
