/**
 * Specialty 스크래퍼 입력 스키마 (CRAWLING_STRATEGY §27.1 / SCHEMA §2.1.specialty).
 *
 * Serebii `/specialty.shtml` 파서가 HTML 에서 추출하는 "파싱 시점 엔티티" 계약.
 * Prisma `Specialty` 모델의 `id` / audit 컬럼과, `specialty_i18n` 의 locale 차원은
 * loader 가 해소한다 — 본 스키마는 영문 원본 (en) 1 건만을 담는다.
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: Serebii URL 의 식별 토큰 (예: `appraise`, `gatherhoney`).
 *   loader 가 Prisma `source_slug` 로 그대로 주입하는 natural key.
 * - `nameEn`: Serebii 영문 원본명. loader 가 `specialty_i18n(locale='en')` 로 분리.
 * - `descriptionEn`: 설명 텍스트. optional — 향후 페이지 레이아웃 변경으로 누락될
 *   가능성 고려 (missing-section 이슈로 승격 여부는 loader 판단).
 * - `imageUrl`: Serebii 아이콘 URL. `EntityImage` polymorphic 테이블로 분리 적재.
 *
 * 이미지 필드가 스키마에 직접 있는 이유 (Pokemon 스키마와 동일 패턴):
 *   파서 출력 시점에는 entity_id 가 아직 없어 EntityImage 레코드를 만들 수 없다.
 *   파서는 원본 URL 만 보존하고, loader 가 upsert 후 `entityId` 를 확보해
 *   `entity_image` 행을 생성한다.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * Specialty 파서 출력 스키마.
 *
 * 사용 예 (§27.1):
 *
 * ```ts
 * const specialty = SpecialtySchema.parse({
 *   slug: 'appraise',
 *   nameEn: 'Appraise',
 *   descriptionEn: 'You can show lost relics ...',
 *   imageUrl: 'https://www.serebii.net/pokemonpokopia/pokedex/specialty/appraise.png',
 *   ...buildSourceMetadata({
 *     sourceSite: 'serebii',
 *     sourceUrl: 'https://www.serebii.net/pokemonpokopia/specialty.shtml',
 *   }),
 * });
 * ```
 */
export const SpecialtySchema = z
  .object({
    slug: z.string().min(1),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type SpecialtyInput = z.infer<typeof SpecialtySchema>;
