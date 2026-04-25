/**
 * MagnetRise 도메인 스크래퍼 입력 스키마 (SCHEMA §2.2 item.is_magnet_rise_only).
 *
 * - MagnetRiseItemSchema: `/magnetrise.shtml` 의 "List of Items only able to be
 *   picked up via Magnet Rise" 표 (Phase 8 단계 13)
 *
 * 본 스키마는 새 엔티티가 아니라 **기존 `item` 의 `is_magnet_rise_only` 플래그
 * 보강** 을 위한 슬림 출력이다. loader 는 본 파서가 산출한 slug 목록을 가지고
 * `item.sourceSlug` 매칭으로 `is_magnet_rise_only = true` 마킹한다. nameEn /
 * descriptionEn / imageUrl 은 items.shtml 본 파서에서 누락/오타가 있을 경우의
 * 보강 데이터로도 활용 가능하지만, **충돌 시 items.shtml 이 우선** 한다 (그쪽이
 * 카테고리·태그·위치 등 풍부한 SSoT 를 갖춘 1차 소스).
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * MagnetRiseItem 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `<a href="items/<slug>.shtml">` 의 URL 토큰. items.ts 와 동일한
 *   natural key 이므로 loader 가 `item.sourceSlug` 1:1 매칭으로 플래그 보강.
 *   slug 에 `(`/`)`/`-` 같은 문자 허용 (예: `nonburnablegarbage(outdoor)`,
 *   `yellow-greenshoots`).
 * - `nameEn`: Name 셀 `<u>` 안 텍스트. cheerio 가 `&eacute;` 등 자동 디코딩.
 * - `descriptionEn`: Description 셀 raw 텍스트. 일부 행은 비어있을 수 있어 optional.
 * - `imageUrl`: `<img src="items/<slug>.png">` 절대 URL. items.ts 동일 전략.
 */
export const MagnetRiseItemSchema = z
  .object({
    slug: z.string().min(1),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type MagnetRiseItemInput = z.infer<typeof MagnetRiseItemSchema>;
