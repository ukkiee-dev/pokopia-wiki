/* eslint-disable no-console, unicorn/prefer-top-level-await, max-lines-per-function, no-await-in-loop */
/**
 * CLI 상태 대시보드 — Phase 7 Task 7.5.
 *
 * 실행:
 *   pnpm --filter @pokopia-wiki/scraper status
 *
 * 출력 예:
 *   === Pokopia Scraper Status ===
 *   Phase: 6
 *   Active persona: korean-pokemon-fan (healthScore: 88)
 *   Today requests: 45 (세션당 누적)
 *   Today blocks: 0 / captcha: 0 / sessions: 2
 *   Cooldowns: pokopoko until 2026-04-24T12:00:00Z
 *   Last session: 2026-04-24T07:49:01Z (requestCount: 1)
 *   Failed pages: 3
 *   Invalid parses (24h): 0
 *
 * 데이터 소스:
 *   - `data/state/crawl.json` — phase/persona/session/cooldowns/healthScores
 *   - `data/state/persona-<id>.json` — 페르소나별 healthScore (crawlState 에 mirror 되지만
 *     persona 파일이 더 정확하므로 우선)
 *   - `data/logs/events.jsonl` — 오늘 block/captcha/session 카운트
 *   - `data/invalid/` 디렉토리 — 24h 이내 파싱 실패 건수
 *
 * no-console / top-level-await / max-lines-per-function 는 CLI 엔트리 관례 disable.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { collectStats } from '#daily-summary';
import { loadNotifierConfig } from '#notifier/config';
import { Notifier } from '#notifier/index';
import { repoPath } from '#paths';
import { CrawlState } from '#state/crawl-state';

const INVALID_DIR = repoPath('data', 'invalid');
const PERSONAS_DIR = repoPath('data', 'state');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function countRecentInvalid(baseDir: string, cutoffMs: number): Promise<number> {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // 소스별 디렉토리(serebii/pokopiaGuide/...) → 날짜 디렉토리 → 파일
      const sourceDir = path.join(baseDir, entry.name);
      const dateDirs = await readdir(sourceDir, { withFileTypes: true }).catch(() => []);
      for (const dateDir of dateDirs) {
        if (!dateDir.isDirectory()) continue;
        const dirPath = path.join(sourceDir, dateDir.name);
        const info = await stat(dirPath).catch(() => null);
        if (info === null) continue;
        if (info.mtimeMs < cutoffMs) continue;
        const files = await readdir(dirPath).catch(() => []);
        count += files.length;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function collectPersonaHealth(): Promise<Record<string, { healthScore: number; cooldownUntil: string | null; retired: boolean }>> {
  try {
    const entries = await readdir(PERSONAS_DIR, { withFileTypes: true });
    const result: Record<string, { healthScore: number; cooldownUntil: string | null; retired: boolean }> = {};
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith('persona-') || !entry.name.endsWith('.json')) continue;
      const id = entry.name.slice('persona-'.length, -'.json'.length);
      const raw = await readFile(path.join(PERSONAS_DIR, entry.name), 'utf8').catch(() => null);
      if (raw === null) continue;
      try {
        const parsed = JSON.parse(raw) as {
          healthScore?: number;
          cooldownUntil?: string | null;
          retired?: { at: string; reason: string } | null;
        };
        result[id] = {
          healthScore: typeof parsed.healthScore === 'number' ? parsed.healthScore : 100,
          cooldownUntil: typeof parsed.cooldownUntil === 'string' ? parsed.cooldownUntil : null,
          retired: parsed.retired !== null && parsed.retired !== undefined,
        };
      } catch {
        /* skip */
      }
    }
    return result;
  } catch {
    return {};
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours >= 1) return `${String(hours)}h${String(minutes % 60)}m`;
  if (minutes >= 1) return `${String(minutes)}m${String(seconds % 60)}s`;
  return `${String(seconds)}s`;
}

async function main(): Promise<void> {
  const now = new Date();
  const crawlState = new CrawlState();
  const notifier = new Notifier(loadNotifierConfig());

  const state = await crawlState.read();
  const stats = await collectStats({ notifier, crawlState, now: () => now });
  const personas = await collectPersonaHealth();
  const invalidCount = await countRecentInvalid(INVALID_DIR, now.getTime() - ONE_DAY_MS);

  const lines: string[] = [];
  lines.push('=== Pokopia Scraper Status ===');
  lines.push(`Phase: ${state.phase === null ? '-' : String(state.phase)}`);
  lines.push(`Active persona: ${state.persona ?? '-'}`);

  lines.push('');
  lines.push('-- Personas --');
  for (const [id, p] of Object.entries(personas)) {
    const mark = p.retired ? ' [retired]' : p.cooldownUntil !== null && new Date(p.cooldownUntil).getTime() > now.getTime() ? ` [cooldown until ${p.cooldownUntil}]` : '';
    lines.push(`  ${id}: healthScore=${String(p.healthScore)}${mark}`);
  }
  if (Object.keys(personas).length === 0) lines.push('  (none)');

  lines.push('');
  lines.push('-- Today (KST) --');
  lines.push(`  requests: ${String(stats.requests)} (현재 세션 누적)`);
  lines.push(`  blocks: ${String(stats.blocks)} / captcha: ${String(stats.captcha)} / sessions: ${String(stats.sessions)}`);
  lines.push(`  failedPages 누적: ${String(stats.failedPages)}`);
  lines.push(`  invalid parses (24h): ${String(invalidCount)}`);

  lines.push('');
  lines.push('-- Cooldowns --');
  if (stats.cooldownSources.length === 0) {
    lines.push('  (none)');
  } else {
    for (const source of stats.cooldownSources) {
      const until = state.cooldowns[source as keyof typeof state.cooldowns];
      const active = until !== undefined && new Date(until).getTime() > now.getTime();
      lines.push(`  ${source}: ${active ? `until ${until ?? '-'}` : 'expired'}`);
    }
  }

  lines.push('');
  lines.push('-- Last session --');
  if (state.session === null) {
    lines.push('  (no active session — session.json null)');
  } else {
    const startedAt = new Date(state.session.startedAt);
    lines.push(`  startedAt: ${state.session.startedAt}`);
    lines.push(`  elapsed: ${formatDuration(now.getTime() - startedAt.getTime())}`);
    lines.push(`  planned: ${formatDuration(state.session.plannedDuration)}`);
    lines.push(`  requestCount: ${String(state.session.requestCount)}`);
  }

  console.log(lines.join('\n'));
  process.exit(0);
}

await main().catch((err: unknown) => {
  const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[status] fatal: ${reason}`);
  process.exit(1);
});
