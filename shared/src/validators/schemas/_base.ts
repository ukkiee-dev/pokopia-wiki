/**
 * 공통 출처 메타데이터 스키마 (CRAWLING_STRATEGY §27.1)
 *
 * 모든 엔티티 Zod 스키마는 본 모듈의 `SourceMetadataSchema` 를
 * `.extend(SourceMetadataSchema.shape)` 패턴으로 합성해야 한다.
 *
 * 예시(Task 2.2 담당 에이전트용 가이드):
 *
 * ```ts
 * import { z } from 'zod';
 * import { SourceMetadataSchema } from './_base';
 *
 * export const PokemonSchema = z
 *   .object({
 *     pokedexNo: z.number().int().positive(),
 *     nameEn: z.string().min(1),
 *     imageUrl: z.url(),
 *   })
 *   .extend(SourceMetadataSchema.shape);
 * ```
 *
 * 주의: zod 4.3.6 에서 `.merge()` 는 deprecated 이므로 `.extend(B.shape)` 를 사용.
 * 또한 `z.string().url()` / `z.string().datetime()` 도 deprecated —
 * `z.url()` / `z.iso.datetime()` 을 사용한다.
 */

import { z } from 'zod';

/**
 * 4개 수집 소스의 고정 식별자.
 * `Source` 타입 SSoT (CRAWLING_STRATEGY 문서 상단 §10 각주 및 §27.1).
 */
export const SourceSiteEnum = z.enum(['serebii', 'pokopiaGuide', 'pokopoko', 'namuwiki']);

export type SourceSite = z.infer<typeof SourceSiteEnum>;

/**
 * 출처 메타데이터 공통 스키마.
 * - 7개 필수 필드(sourceSite / sourceUrl / scrapedAt / license / copyrightHolder / attribution) + optional derivedFrom
 * - `derivedFrom` 은 한국어 매핑 등 "다른 소스에서 파생된" 엔티티가 원본 추적용으로 채움
 *   (e.g. pokopiaGuide 의 한글명을 serebii 영문명과 연결할 때).
 */
export const SourceMetadataSchema = z.object({
  sourceSite: SourceSiteEnum,
  sourceUrl: z.url(),
  scrapedAt: z.iso.datetime(),
  license: z.string().min(1),
  copyrightHolder: z.string().min(1),
  attribution: z.string().min(1),
  derivedFrom: z
    .object({
      sourceSite: SourceSiteEnum,
      sourceUrl: z.url(),
    })
    .optional(),
});

export type SourceMetadata = z.infer<typeof SourceMetadataSchema>;
