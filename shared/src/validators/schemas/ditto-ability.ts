/**
 * DittoAbility 도메인 스크래퍼 입력 스키마 (SCHEMA §2.9 디토 능력).
 *
 * - DittoAbilitySchema: `/abilities.shtml` 디토 무브 목록 (Phase 8 단계 12)
 *
 * Serebii `/abilities.shtml` 은 단일 dextable 안에 카테고리 헤더 행(`Primary Moves`
 * / `Secondary Moves`) 으로 구획된 4-컬럼(Picture/Move/Effect/Location) 평면
 * 구조이다. 본 스키마는 파싱 시점에 알 수 있는 raw 자연키 + 영문 텍스트만
 * 보존한다. SCHEMA §2.9 의 `unlock_pokemon_id` / `unlock_location_id` FK 해소는
 * loader 가 별도 매핑 단계에서 수행 (예: "Befriend Zorua in Bleak Beach" →
 * pokemon=zorua, location=bleakbeach). 본 파서는 분해 책임을 지지 않고 raw
 * 텍스트를 그대로 `unlockTextEn` 에 보존한다.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * SCHEMA §2.9 `ditto_ability.type` ENUM — Prisma `DittoAbilityType` 과 값 일치.
 *
 * TypeScript 타입 재export 금지: Prisma client 가 이미 같은 이름으로
 * `DittoAbilityType` 을 최상위 barrel 로 내보낸다. 중복 export 충돌 회피를 위해
 * Zod 쪽은 enum 스키마로만 제공하고, 타입은 `DittoAbilityInput['type']` 로 파생해
 * 사용한다 (geography.ts 의 LocationType 과 동일 정책).
 */
export const DittoAbilityTypeEnum = z.enum(['Primary', 'Secondary']);

/**
 * DittoAbility 파서 출력 스키마.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: Primary 는 `<img src="ditto/<slug>.png">` 의 파일명 토큰. Secondary 는
 *   이미지 셀이 비어있어 `nameEn` 의 lowercase + 공백→하이픈 으로 fallback. loader
 *   가 `source_slug` 로 그대로 주입하는 natural key.
 * - `type`: 카테고리 헤더 행(`<td colspan="4">Primary Moves</td>` 등)에서 누적된
 *   컨텍스트.
 * - `nameEn`: Move 셀 텍스트 (예: "Camouflage", "Stockpile Water", "Magnet Rise").
 * - `effectEn`: Effect 셀 raw 텍스트. multi-line 은 `<br>` → 공백 정규화.
 * - `unlockTextEn`: Location 셀 raw 텍스트 (예: "Befriend Zorua in Bleak Beach").
 *   loader 가 포켓몬/장소 키워드를 추출해 FK 로 매핑한다.
 * - `imageUrl`: `<img src>` 절대 URL. Secondary 는 셀이 비어있어 undefined.
 */
export const DittoAbilitySchema = z
  .object({
    slug: z.string().min(1),
    type: DittoAbilityTypeEnum,
    nameEn: z.string().min(1),
    effectEn: z.string().min(1).optional(),
    unlockTextEn: z.string().min(1).optional(),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type DittoAbilityInput = z.infer<typeof DittoAbilitySchema>;
