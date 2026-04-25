/**
 * Building 도메인 스크래퍼 입력 스키마 (SCHEMA §2.6 건축).
 *
 * - BuildingKitSchema: `/building.shtml` 루트 빌딩 키트 목록 (Phase 8 단계 11)
 *
 * Serebii 루트 페이지(`/building.shtml`)는 키트 목록(slug + name + description +
 * 이미지) 만 보여준다. 카테고리(Residential/Infrastructure/Decorative/Venue/
 * Special), pokemon_capacity, building_points, width, depth 와 building_kit_material
 * 매핑은 각 키트의 `/build/<slug>.shtml` 상세 페이지에서 추출 — 본 스키마 범위 밖
 * (후속 배치). 따라서 SCHEMA §2.6 의 building_kit 필수 컬럼 다수가 본 파서 시점엔
 * 미확보이며, loader 가 detail 파서 결과와 합쳐 최종 레코드를 구성한다.
 */

import { z } from 'zod';

import { SourceMetadataSchema } from './_base';

/**
 * BuildingKit 파서 출력 스키마 (목록 페이지 한정).
 *
 * 파싱 시점 SSoT 필드
 * - `slug`: `<a href="build/<slug>.shtml">` 에서 추출한 Serebii URL 토큰. loader 가
 *   `source_slug` 로 그대로 주입하는 natural key.
 * - `nameEn`: 영문 키트 이름 (`<u>` 안 텍스트). `Pok&eacute;` 같은 HTML 엔티티는
 *   cheerio 가 자동 디코딩해 UTF-8 으로 보존된다.
 * - `descriptionEn`: 키트 설명 텍스트. 일부 행은 비어 있을 수 있어 optional.
 * - `imageUrl`: `<img src="items/<slug>.png">` 를 sourceUrl 기준으로 절대 URL 로 변환.
 */
export const BuildingKitSchema = z
  .object({
    slug: z.string().min(1),
    nameEn: z.string().min(1),
    descriptionEn: z.string().min(1).optional(),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape);

export type BuildingKitInput = z.infer<typeof BuildingKitSchema>;
