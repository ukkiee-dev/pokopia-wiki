/**
 * 전설/환상 포켓몬 획득 도메인 스크래퍼 입력 스키마 (SCHEMA §2.1
 * legendary_acquisition).
 *
 * - LegendaryAcquisitionSchema: `/legendary.shtml` 의 11 legendary 획득 정보
 *   (Phase 8 단계 25)
 *
 * SCHEMA §2.1 와의 매핑:
 *   - LegendaryAcquisition.pokemonId (FK UNIQUE) ← pokemonSlug → loader FK 해소.
 *   - LegendaryAcquisition.unlockCondition (TEXT) ← 섹션 본문 paragraphs join.
 *   - LegendaryAcquisition.locationId (FK nullable) ← locationSlug → loader 매핑.
 *   - LegendaryAcquisition.effect (TEXT) ← 본 페이지에 명시 별도 표 없어 raw
 *     unlockCondition 안에 포함. SCHEMA non-null 이지만 본 파서는 optional 로
 *     두고 loader 가 placeholder 또는 unlockCondition 의 일부로 추출.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * LegendaryAcquisition 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `legendary-<pokemonSlug>` (예: "legendary-articuno", "legendary-ho-oh").
 *   pokemon_id UNIQUE 1:1 매핑 자연 키.
 * - `pokemonSlug`: 영문 포켓몬 이름 lowercase + 공백/하이픈 정규화 (예: "ho-oh",
 *   "mewtwo"). loader 가 pokemon FK 해소.
 * - `pokemonNameEn`: 원본 영문명 (Ho-Oh, Mewtwo, Articuno).
 * - `unlockConditionEn`: 해당 legendary 가 등장하는 섹션의 paragraphs join.
 *   loader 가 i18n.unlockCondition 으로 분리.
 * - `effectEn`: 본 페이지에는 별도 효과 표가 없어 미산출 (optional). loader 가
 *   prose 추출 또는 placeholder 처리.
 * - `locationSlug`: 본문에서 알려진 location 키워드 매칭 (optional —
 *   Dream Islands 같은 비-region 표현은 매치 안 됨).
 * - `sourceSectionEn`: 페이지의 h2 섹션 제목 (감사용).
 */
export const LegendaryAcquisitionSchema = z
  .object({
    slug: z.string().min(1),
    pokemonSlug: z.string().min(1),
    pokemonNameEn: z.string().min(1),
    unlockConditionEn: z.string().min(1),
    effectEn: z.string().min(1).optional(),
    locationSlug: z.string().min(1).optional(),
    sourceSectionEn: z.string().min(1),
  })
  .extend(SourceMetadataSchema.shape);

export type LegendaryAcquisitionInput = z.infer<typeof LegendaryAcquisitionSchema>;
