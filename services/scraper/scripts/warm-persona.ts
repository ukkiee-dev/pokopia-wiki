/**
 * `pnpm --filter @pokopia-wiki/scraper warm:persona <persona-id>`
 *
 * 1회 워밍 세션을 실행한다. Task 5.7 의 "1일 3회 × 20~40분" 운용은 이 스크립트를
 * 크론 또는 수동으로 반복해서 달성한다. 병렬 실행 금지 — persistent profile lock
 * 이 충돌한다.
 *
 * Usage:
 *   pnpm --filter @pokopia-wiki/scraper warm:persona korean-pokemon-fan
 *   pnpm --filter @pokopia-wiki/scraper warm:persona namuwiki-researcher
 */

import { PERSONAS } from '../src/persona/definitions.js';
import { PersonaManager } from '../src/persona/manager.js';
import { ProfileWarmer } from '../src/persona/warmer.js';

async function main(): Promise<void> {
  const id = process.argv[2];
  if (id === undefined || id.length === 0) {
    console.error('Usage: tsx scripts/warm-persona.ts <persona-id>');
    console.error(`Known personas: ${PERSONAS.map((p) => p.id).join(', ')}`);
    process.exit(1);
  }

  const persona = PERSONAS.find((p) => p.id === id);
  if (!persona) {
    console.error(`Unknown persona: ${id}`);
    console.error(`Known personas: ${PERSONAS.map((p) => p.id).join(', ')}`);
    process.exit(1);
  }

  const manager = new PersonaManager();
  const warmer = new ProfileWarmer(manager);

  const startedAt = Date.now();
  console.log(`[warm-persona] start "${id}" profilePath=${persona.profilePath ?? '(none)'}`);
  try {
    await warmer.warm(persona);
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    const state = await manager.getState(id);
    console.log(
      `[warm-persona] done "${id}" in ${elapsedSec}s — warmedUp=${state.warmedUp} healthScore=${state.healthScore}`,
    );
  } catch (err) {
    console.error(`[warm-persona] failed "${id}":`, err);
    process.exit(1);
  }
}

await main();
