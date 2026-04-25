/**
 * DittoAbilityLoader — DittoAbility (unlockPokemon FK NOT NULL).
 * (Phase 9 선결 코드, Batch C-5)
 *
 * SCHEMA §2.9 매핑:
 *   - DittoAbility: id + type + unlockPokemonId NOT NULL + unlockLocationId(nullable)
 *     + 감사 + i18n.
 *
 * 본 페이지 (`/abilities.shtml`) 의 unlockTextEn 은 자유 텍스트 (예: "Befriend
 * Zorua in Bleak Beach") 라 pokemon/location slug 추출이 비단순. 본 1차 구현은
 * 단순 휴리스틱:
 *   - 텍스트에서 known pokemon nameEn 패턴 매칭 (Pokemon DB 의 모든 sourceSlug 와
 *     비교)
 *   - 텍스트에서 known location nameEn 매칭 (Location DB)
 *
 * 매칭 실패 시 entity 자체 skip → failures 격리. 향후 dedicated NLP 또는 운영 매핑
 * 으로 보강.
 */

import type { DittoAbilityInput, PrismaClient } from '@pokopia-wiki/shared';

import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type PokemonAllModel = {
  findMany: (args: {
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type LocationAllModel = {
  findMany: (args: {
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type DittoAbilityPayload = {
  type: DittoAbilityInput['type'];
  unlockPokemonId: number;
  unlockLocationId: number | null;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * unlockTextEn 에서 첫 번째 매칭되는 pokemon slug 찾기. 단순 indexOf — 정확도
 * 낮지만 첫 PR 의 best-effort.
 */
function extractPokemonSlug(text: string, allSlugs: ReadonlyArray<string>): string | null {
  const lower = text.toLowerCase();
  for (const slug of allSlugs) {
    if (lower.includes(slug)) return slug;
  }
  return null;
}

function extractLocationSlug(text: string, allSlugs: ReadonlyArray<string>): string | null {
  const lower = text.toLowerCase().replace(/\s+/gu, '');
  for (const slug of allSlugs) {
    if (lower.includes(slug)) return slug;
  }
  return null;
}

export async function loadDittoAbility(
  prisma: Pick<PrismaClient, 'dittoAbility' | 'pokemon' | 'location'>,
  inputs: ReadonlyArray<DittoAbilityInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  // 모든 Pokemon / Location slug 사전 로드 (best-effort 매칭용)
  const pokemonRows = await (prisma.pokemon as unknown as PokemonAllModel).findMany({
    select: { id: true, sourceSlug: true },
  });
  const locationRows = await (prisma.location as unknown as LocationAllModel).findMany({
    select: { id: true, sourceSlug: true },
  });
  const pokemonSlugs = pokemonRows.map((row) => row.sourceSlug);
  const locationSlugs = locationRows.map((row) => row.sourceSlug);
  const pokemonSlugToId = new Map(pokemonRows.map((row) => [row.sourceSlug, row.id]));
  const locationSlugToId = new Map(locationRows.map((row) => [row.sourceSlug, row.id]));

  const items: Array<{
    sourceSlug: string;
    payload: DittoAbilityPayload;
    metadata: DittoAbilityInput;
  }> = [];
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    if (input.unlockTextEn === undefined) {
      failures.push({
        sourceSlug: input.slug,
        error: 'unlockTextEn 부재 — DittoAbility 건너뜀 (unlockPokemonId NOT NULL)',
      });
      continue;
    }
    const pokemonSlug = extractPokemonSlug(input.unlockTextEn, pokemonSlugs);
    if (pokemonSlug === null) {
      failures.push({
        sourceSlug: input.slug,
        error: `unlockTextEn "${input.unlockTextEn}" 에서 pokemon 매칭 실패`,
      });
      continue;
    }
    const unlockPokemonId = pokemonSlugToId.get(pokemonSlug);
    if (unlockPokemonId === undefined) continue;

    const locationSlug = extractLocationSlug(input.unlockTextEn, locationSlugs);
    const unlockLocationId =
      locationSlug !== null ? locationSlugToId.get(locationSlug) ?? null : null;

    items.push({
      sourceSlug: input.slug,
      payload: {
        type: input.type,
        unlockPokemonId,
        unlockLocationId,
        sourceUrl: input.sourceUrl,
        scrapedAt: new Date(input.scrapedAt),
      },
      metadata: input,
    });
  }

  const result = await upsertBySourceSlug(prisma.dittoAbility as never, items);
  return {
    stats: { ...result.stats, failed: result.stats.failed + failures.length },
    failures: [...result.failures, ...failures],
  };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
