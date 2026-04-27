/**
 * PokemonLoader — 첫 entity 별 loader 예시 (Phase 9 선결 코드).
 *
 * 책임:
 *   1. PokemonInput (스크래퍼 입력 계약) → Prisma Pokemon model 의 create/update
 *      payload 매핑 (sourceSlug 결정, 감사 컬럼 주입).
 *   2. UpsertLoader generic helper 호출로 멱등 upsert.
 *
 * SCHEMA §2.1 매핑 정책:
 *   - `sourceSlug`: PokemonInput.sourceUrl 의 마지막 path segment 또는 nameEn
 *     슬러그화. 본 loader 는 sourceUrl 우선 (예: "pokedex/pikachu" → "pikachu").
 *   - `pokedexNo` / `nameEn` / `isEvent` / 등 1:1 매핑.
 *   - `specialties`: PokemonSpecialty M:N 매핑 — 본 loader 가 별도 처리 (loader
 *     함수 인자로 specialty FK 주입). 본 단계는 Pokemon 본체만 upsert, M:N 매핑은
 *     상위 orchestrator 책임.
 *   - `imageUrl`: SCHEMA §2.25 EntityImage polymorphic 이지만 본 단계는 미반영.
 *
 * 본 모듈은 Phase 9 의 첫 entity loader 예시. 다른 entity (Item/Habitat/Specialty/...)
 * 들도 동일 패턴(Input → payload 매핑 + upsertBySourceSlug 호출) 으로 추가.
 */

import type { PokemonInput } from '@pokopia-wiki/shared';

import {
  upsertBySourceSlug,
  type SourceSlugKeyedModel,
  type UpsertResult,
} from './upsert-loader.js';

/**
 * Prisma Pokemon model 에 매핑되는 create/update payload (sourceSlug + contentHash
 * 제외, UpsertLoader 가 주입).
 *
 * Prisma model 의 nullable / default 필드는 optional 처리. M:N relation 은 본
 * payload 에 미포함 (loader 호출자가 별도 처리).
 */
type PokemonUpsertPayload = {
  pokedexNo: number | null;
  isEvent: boolean;
  isUniqueCharacter: boolean;
  isLegendary: boolean;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * Pokemon entity 들을 sourceSlug 기준으로 upsert.
 *
 * @param model Prisma `pokemon` model (`prisma.pokemon`).
 * @param inputs PokemonInput 배열 (파서 출력).
 *
 * @returns UpsertResult — inserted/updated/unchanged/failed 통계 + 실패 목록.
 *
 * 동작:
 *   - 각 input 의 sourceUrl 로부터 sourceSlug 추출 (예:
 *     "https://.../pokedex/pikachu.shtml" → "pikachu").
 *   - scrapedAt 은 ISO string → Date 변환.
 *   - upsertBySourceSlug 호출로 멱등 upsert.
 *
 * 부분 실패 (한 entity Prisma 예외) 는 batch 중단 없이 다음 entity 로 진행.
 * 호출자가 result.failures 를 검사해 invalid-isolator 로 격리할 수 있다.
 */
export async function loadPokemon(
  model: SourceSlugKeyedModel<PokemonUpsertPayload>,
  inputs: ReadonlyArray<PokemonInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => {
    const sourceSlug = extractSlugFromUrl(input.sourceUrl);
    const payload: PokemonUpsertPayload = {
      pokedexNo: input.pokedexNo,
      isEvent: input.isEvent,
      isUniqueCharacter: input.isUniqueCharacter,
      isLegendary: input.isLegendary,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    };
    return {
      sourceSlug,
      payload,
      metadata: input,
    };
  });

  return upsertBySourceSlug(model, items);
}

/**
 * URL 의 마지막 path segment 추출 후 확장자 제거. Pokemon sourceUrl 패턴:
 *   - `https://.../pokedex/pikachu.shtml` → "pikachu"
 *   - `https://.../pokedex/ho-oh.shtml` → "ho-oh"
 *
 * URL 파싱 실패 시 nameEn slugify fallback (호출자가 이미 PokemonInput 의 nameEn
 * 을 검증했으므로 항상 valid).
 */
function extractSlugFromUrl(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const lastSegment = url.pathname.split('/').findLast((s) => s.length > 0) ?? '';
    return lastSegment.replace(/\.[^.]+$/, '').toLowerCase();
  } catch {
    return sourceUrl.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }
}

type PokemonLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

/**
 * Slug → Pokemon ID 룩업 helper (다른 loader 가 pokemon FK 해소 시 재사용).
 *
 * 매핑 가정: Pokemon.sourceSlug 는 영문명 lowercase + hyphen 패턴 (예: "pikachu",
 * "ho-oh", "mewtwo"). 호출자 (LegendaryAcquisition, Habitat 등) 의 pokemonSlug 도
 * 동일 패턴이라 단순 매칭 가능. 매핑 실패 slug 는 Map 에 부재.
 */
export async function lookupPokemonIds(
  prisma: { pokemon: unknown },
  slugs: ReadonlyArray<string>,
): Promise<Map<string, number>> {
  if (slugs.length === 0) return new Map();
  const rows = await (prisma.pokemon as PokemonLookupModel).findMany({
    where: { sourceSlug: { in: [...new Set(slugs)] } },
    select: { id: true, sourceSlug: true },
  });
  return new Map(rows.map((row) => [row.sourceSlug, row.id]));
}
