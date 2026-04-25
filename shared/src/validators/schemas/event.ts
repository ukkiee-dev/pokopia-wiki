/**
 * 이벤트 도메인 스크래퍼 입력 스키마 (SCHEMA §2.21 event + event_pokemon).
 *
 * - EventSchema: event 메타 (Phase 8 단계 36, placeholder default)
 * - EventPokemonSchema: `/eventpokedex.shtml` 의 4 event pokemon (Phase 8 단계 36)
 * - EventHabitat / EventItem: 별도 단계(37/38) 또는 다른 페이지에서 채움.
 *
 * SCHEMA §2.21 와의 매핑:
 *   - Event: id PK + startAt/endAt DATE nullable + isRecurring BOOL.
 *   - EventPokemon: (eventId, pokemonId) M:N 복합 PK.
 *   - 페이지에는 event 메타(날짜/recurring) 정보 없음 — loader 가 외부 보강.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * Event 파서 출력 스키마 (placeholder 형태).
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: event 자연키 (예: "event-pokopia-launch", "event-eventpokedex-default").
 *   페이지 단위 단일 이벤트인 경우 페이지 슬러그 기반.
 * - `nameEn`: 이벤트 영문명 (페이지 h1/h2 또는 외부 보강).
 * - `startAt` / `endAt`: ISO date (optional, 본 페이지에 명시 없음).
 * - `isRecurring`: 반복 여부 (default false).
 */
export const EventSchema = z
  .object({
    slug: z.string().min(1),
    nameEn: z.string().min(1),
    startAt: z.iso.date().optional(),
    endAt: z.iso.date().optional(),
    isRecurring: z.boolean().default(false),
  })
  .extend(SourceMetadataSchema.shape);

export type EventInput = z.infer<typeof EventSchema>;

/**
 * EventPokemon 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `event-pokemon-<eventSlug>-<pokemonSlug>` (예:
 *   "event-pokemon-eventpokedex-hoppip"). loader 가 (eventId, pokemonId) FK 해소.
 * - `eventSlug`: 소속 Event 의 slug (loader 가 event FK).
 * - `pokemonSlug`: pokedex/<slug>.shtml 토큰 (예: "hoppip").
 * - `pokemonNameEn`: 영문 포켓몬명.
 * - `eventPokedexNo`: "#NNN" 정수 (이벤트 도감 번호; 페이지 정렬 키).
 */
export const EventPokemonSchema = z
  .object({
    slug: z.string().min(1),
    eventSlug: z.string().min(1),
    pokemonSlug: z.string().min(1),
    pokemonNameEn: z.string().min(1),
    eventPokedexNo: z.number().int().positive(),
  })
  .extend(SourceMetadataSchema.shape);

export type EventPokemonInput = z.infer<typeof EventPokemonSchema>;
