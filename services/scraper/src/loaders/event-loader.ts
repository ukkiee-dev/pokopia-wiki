/**
 * EventLoader — Event + EventPokemon (composite key).
 * (Phase 9 선결 코드, Batch C-5)
 *
 * SCHEMA §2.21 매핑:
 *   - Event: id + startAt(nullable) + endAt(nullable) + isRecurring + 감사 + i18n.
 *   - EventPokemon: composite PK (eventId, pokemonId).
 *   - EventHabitat / EventItem: 본 commit 미포함 (parser 가 entities 0 placeholder).
 *
 * Event 자체는 sourceSlug 직접 (placeholder default), EventPokemon 은 (eventId,
 * pokemonId) replace. parser 의 EventPokemonInput 가 eventSlug + pokemonSlug
 * 명시.
 */

import type { EventInput, EventPokemonInput, PrismaClient } from '@pokopia-wiki/shared';

import { lookupPokemonIds } from './pokemon-loader.js';
import {
  upsertBySourceSlug,
  type UpsertResult,
  type UpsertStats,
} from './upsert-loader.js';

type EventLookupModel = {
  findMany: (args: {
    where: { sourceSlug: { in: string[] } };
    select: { id: true; sourceSlug: true };
  }) => Promise<ReadonlyArray<{ id: number; sourceSlug: string }>>;
};

type EventPokemonModel = {
  deleteMany: (args: { where: { eventId: number } }) => Promise<{ count: number }>;
  createMany: (args: {
    data: ReadonlyArray<{ eventId: number; pokemonId: number }>;
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
};

type EventPayload = {
  startAt: Date | null;
  endAt: Date | null;
  isRecurring: boolean;
  sourceUrl: string;
  scrapedAt: Date;
};

/**
 * Event 본 entity upsert (placeholder). 실제 페이지가 entities 1 placeholder
 * (event-eventpokedex-default) 만 산출.
 */
export async function loadEvent(
  prisma: Pick<PrismaClient, 'event'>,
  inputs: ReadonlyArray<EventInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      startAt: input.startAt !== undefined ? new Date(input.startAt) : null,
      endAt: input.endAt !== undefined ? new Date(input.endAt) : null,
      isRecurring: input.isRecurring,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(prisma.event as never, items);
}

/**
 * EventPokemon — Event 와 Pokemon 모두 미리 upsert 되었다고 가정 후 composite
 * key replace. parser 가 동시에 Event 와 EventPokemon 을 출력하지 않음 → CLI
 * 통합 단계에서 두 loader 를 순차 호출해야 함.
 *
 * 본 commit 의 한계: parser 출력은 EventPokemonInput 만, Event 자체는 별도
 * placeholder upsert 가 필요. 본 loader 는 eventSlug 룩업 후 매핑.
 */
export async function loadEventPokemon(
  prisma: Pick<PrismaClient, 'event' | 'eventPokemon' | 'pokemon'>,
  inputs: ReadonlyArray<EventPokemonInput>,
): Promise<UpsertResult> {
  if (inputs.length === 0) return { stats: emptyStats(), failures: [] };

  const eventSlugs = [...new Set(inputs.map((input) => input.eventSlug))];
  const eventRows = await (prisma.event as unknown as EventLookupModel).findMany({
    where: { sourceSlug: { in: eventSlugs } },
    select: { id: true, sourceSlug: true },
  });
  const eventSlugToId = new Map(eventRows.map((row) => [row.sourceSlug, row.id]));

  const pokemonSlugs = [...new Set(inputs.map((input) => input.pokemonSlug))];
  const pokemonIds = await lookupPokemonIds(prisma, pokemonSlugs);

  const stats: UpsertStats = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  const failures: Array<{ sourceSlug: string; error: string }> = [];

  // Group by eventId for replace
  const rowsByEvent = new Map<number, Array<{ eventId: number; pokemonId: number }>>();
  for (const input of inputs) {
    const eventId = eventSlugToId.get(input.eventSlug);
    const pokemonId = pokemonIds.get(input.pokemonSlug);
    if (eventId === undefined || pokemonId === undefined) {
      stats.failed += 1;
      failures.push({
        sourceSlug: input.slug,
        error: `Event "${input.eventSlug}" 또는 Pokemon "${input.pokemonSlug}" 미발견`,
      });
      continue;
    }
    const list = rowsByEvent.get(eventId) ?? [];
    list.push({ eventId, pokemonId });
    rowsByEvent.set(eventId, list);
  }

  for (const [eventId, rows] of rowsByEvent) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await (prisma.eventPokemon as unknown as EventPokemonModel).deleteMany({
        where: { eventId },
      });
      // eslint-disable-next-line no-await-in-loop
      await (prisma.eventPokemon as unknown as EventPokemonModel).createMany({
        data: rows,
        skipDuplicates: true,
      });
      stats.inserted += rows.length;
    } catch (error: unknown) {
      stats.failed += rows.length;
      failures.push({
        sourceSlug: `event-${String(eventId)}`,
        error: `EventPokemon replace 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { stats, failures };
}

function emptyStats(): UpsertStats {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
}
