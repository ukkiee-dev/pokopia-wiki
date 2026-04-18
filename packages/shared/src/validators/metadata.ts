/**
 * 출처 메타데이터 주입 헬퍼 (CRAWLING_STRATEGY §27.4).
 *
 * 파서는 엔티티 객체를 조립할 때 본 함수 결과를 spread 하여
 * `scrapedAt` / `license` / `copyrightHolder` / `attribution` 필드를 자동 주입한다.
 * 이후 엔티티 스키마의 `.safeParse()` 가 `SourceMetadataSchema` 제약을 검증.
 *
 * 사용 예:
 *
 * ```ts
 * const pokemon = PokemonSchema.parse({
 *   pokedexNo: 25,
 *   nameEn: 'Pikachu',
 *   imageUrl: 'https://www.serebii.net/pokemonpokopia/pokemon/025.png',
 *   ...buildSourceMetadata({
 *     sourceSite: 'serebii',
 *     sourceUrl: 'https://www.serebii.net/pokemonpokopia/pokemon/025.shtml',
 *   }),
 * });
 * ```
 */

import { SOURCE_DEFAULTS } from '../config/source-metadata';
import type { SourceMetadata, SourceSite } from './schemas/_base';

/**
 * `sourceSite` 별 기본 라이선스/저작권/attribution 을 주입한
 * `SourceMetadata` 객체를 조립한다.
 *
 * - `scrapedAt` 은 호출 시점 UTC ISO 문자열로 자동 설정
 * - 한국어 매핑 등 다른 소스에서 파생된 엔티티는 `derivedFrom` 을 명시할 것
 *   (§27.1 주석 — 한국어 매핑 스키마는 `derivedFrom` 의무)
 */
export function buildSourceMetadata(args: {
  sourceSite: SourceSite;
  sourceUrl: string;
  derivedFrom?: SourceMetadata['derivedFrom'];
}): SourceMetadata {
  const defaults = SOURCE_DEFAULTS[args.sourceSite];
  return {
    sourceSite: args.sourceSite,
    sourceUrl: args.sourceUrl,
    scrapedAt: new Date().toISOString(),
    license: defaults.license,
    copyrightHolder: defaults.copyrightHolder,
    attribution: defaults.attribution,
    ...(args.derivedFrom ? { derivedFrom: args.derivedFrom } : {}),
  };
}
