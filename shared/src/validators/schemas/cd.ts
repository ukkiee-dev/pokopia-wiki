/**
 * CD / 음악 도메인 스크래퍼 입력 스키마 (SCHEMA §2.16).
 *
 * - CdSchema: `/cds.shtml` 의 43 music CD (Phase 8 단계 27)
 *   각 CD 안에 source game 메타 + cd_location 매핑을 nested 로 보존.
 *
 * SCHEMA §2.16 와의 매핑:
 *   - Cd.sourceGameId ← `sourceGameCode` (예: "rg") → loader 가 SourceGame upsert
 *     + FK 해소.
 *   - SourceGame.code ← raw 게임명 정규화 ("Pokémon Red/Green" → "rg").
 *   - SourceGame.generation ← 게임 세대 정수 (rg=1 / gs=2 / ... / sv=9).
 *   - CdLocation.method ← Locations 셀 `<br />` 분리 라인 (예: "In glowing terrain",
 *     "In Pewter Museum in Rocky Ridges").
 *   - CdLocation.locationId ← 라인에서 알려진 location 키워드 매칭 → loader FK 해소.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * CD 획득 위치 한 개 (cd_location 매핑용).
 * Locations 셀의 `<br />` 분리 라인 한 줄당 한 개.
 */
const CdLocationHintSchema = z.object({
  methodEn: z.string().min(1),
  locationSlug: z.string().min(1).optional(),
});

export type CdLocationHint = z.infer<typeof CdLocationHintSchema>;

/**
 * Source game 메타 (cd.sourceGameId FK 해소용).
 * `code` 는 SCHEMA §2.16 ENUM 가이드(`rgby/gs/rs/dp/bw/xy/sm/sv 등`)와 일관.
 */
const SourceGameHintSchema = z.object({
  code: z.string().min(1),
  nameEn: z.string().min(1),
  generation: z.number().int().min(1).max(9),
});

export type SourceGameHint = z.infer<typeof SourceGameHintSchema>;

/**
 * Cd 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: items/<slug>.png 토큰 (예: "titlescreen", "pallettown"). loader 의
 *   cd.source_slug 1:1 주입.
 * - `cdNumber`: Description 셀 "Music CD #N" 정규식의 N 정수. 페이지 정렬 키
 *   외 운영 메타로 활용.
 * - `nameEn`: Name 셀 (예: "Title Screen", "Pewter City Theme").
 * - `descriptionEn`: Description 셀 raw 텍스트.
 * - `imageUrl`: Picture 셀 img src 절대 URL.
 * - `sourceGame`: 게임 메타 nested (loader 가 source_game upsert + FK 해소).
 * - `locations`: cd_location 힌트 배열.
 */
export const CdSchema = z
  .object({
    slug: z.string().min(1),
    cdNumber: z.number().int().positive().optional(),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
    imageUrl: z.url().optional(),
    sourceGame: SourceGameHintSchema,
    locations: z.array(CdLocationHintSchema).default([]),
  })
  .extend(SourceMetadataSchema.shape);

export type CdInput = z.infer<typeof CdSchema>;
