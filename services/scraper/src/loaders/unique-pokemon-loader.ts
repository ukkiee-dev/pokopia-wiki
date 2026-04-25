/**
 * UniquePokemonPatchLoader — Pokemon update only (isUniqueCharacter 마킹).
 * (Phase 9 선결 코드, Batch C-5)
 *
 * SCHEMA §2.1 매핑: 기존 Pokemon 의 isUniqueCharacter=true 보강 + description 보강
 * (PokemonI18n 별도, 본 loader 는 base table 만).
 *
 * 본 loader 는 sourceSlug 매칭만 사용 — Pokemon entity 가 미리 upsert 되어 있어야
 * 하며 (available-pokemon loader 가 우선 실행), 매핑 실패 slug 는 failures.
 */

import type { PrismaClient, UniquePokemonPatchInput } from '@pokopia-wiki/shared';

import type { UpsertResult, UpsertStats } from './upsert-loader.js';

type PokemonUpdateModel = {
  update: (args: {
    where: { sourceSlug: string };
    data: { isUniqueCharacter: boolean };
  }) => Promise<unknown>;
};

export async function loadUniquePokemonPatch(
  prisma: Pick<PrismaClient, 'pokemon'>,
  inputs: ReadonlyArray<UniquePokemonPatchInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const stats: UpsertStats = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  for (const input of inputs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await (prisma.pokemon as unknown as PokemonUpdateModel).update({
        where: { sourceSlug: input.slug },
        data: { isUniqueCharacter: true },
      });
      stats.updated += 1;
    } catch (error: unknown) {
      stats.failed += 1;
      failures.push({
        sourceSlug: input.slug,
        error: `Pokemon "${input.slug}" 미발견 또는 update 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { stats, failures };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
