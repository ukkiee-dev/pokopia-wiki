/* eslint-disable no-console, unicorn/prefer-top-level-await, max-lines-per-function */
/**
 * Phase 6 Dry Session — SessionManager 라이프사이클 완주 검증.
 *
 * 실행:
 *   pnpm --filter @pokopia-wiki/scraper exec tsx scripts/dry-session.ts \
 *     --source serebii --page availablepokemon
 *
 * 동작:
 *   - 실제 의존성(ConcurrencyGuard / CrawlState / Notifier / KyFetcher) wiring.
 *   - 세션 시작 → 단일 페이지 fetch → 세션 종료 frame 완주 확인.
 *   - status / 응답 byte / 캐시 hit 여부를 stdout 로 출력.
 *
 * Phase 6 완료 조건 1번:
 *   "드라이런 1회가 세션 시작 → 페이지 네비 → 세션 종료 경로를 완주" — 본 스크립트가
 *   exit 0 으로 끝나면 통과.
 *
 * 제한:
 *   - T0 (serebii) 만 1차 검증 — T1+ 는 persona 워밍·playwright 의존이라 별도
 *     스크립트로 분리 (Phase 6 후속).
 *   - 실제 네트워크 요청 — robots.txt 수신을 위해 1 회 외부 호출.
 *
 * exit code:
 *   - 0: outcome.kind === 'completed'
 *   - 1: skipped / aborted / error.
 *
 * no-console / top-level-await / max-lines-per-function 는 CLI 엔트리 관례로
 * 의도적 disable.
 */

import { parseArgs } from 'node:util';

import type { SourceSite } from '@pokopia-wiki/shared';

import { onSessionStart } from '#browser/chrome-version';
import { HtmlCache } from '#cache/html-cache';
import { ErrorReaction } from '#error/reaction';
import { createFetcher } from '#fetchers/factory';
import { resetCachedUserAgent } from '#fetchers/ky-fetcher';
import { loadNotifierConfig } from '#notifier/config';
import { Notifier } from '#notifier/index';
import { RobotsChecker } from '#robots/checker';
import { initGuard } from '#scheduler/guard-instance';
import { SessionManager } from '#scheduler/session-manager';
import { CrawlState } from '#state/crawl-state';

type ParsedArgs = { source: SourceSite; page: string };

const SUPPORTED_SOURCES: ReadonlySet<SourceSite> = new Set(['serebii', 'pokopiaGuide', 'pokopoko', 'namuwiki']);

function isSourceSite(value: string | undefined): value is SourceSite {
  return value !== undefined && SUPPORTED_SOURCES.has(value as SourceSite);
}

function parseCli(): ParsedArgs {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      page: { type: 'string' },
    },
  });
  if (!isSourceSite(values.source) || values.page === undefined) {
    console.error('Usage: tsx scripts/dry-session.ts --source <serebii|pokopiaGuide|pokopoko|namuwiki> --page <slug>');
    process.exit(1);
  }
  return { source: values.source, page: values.page };
}

const SOURCE_BASE_URL: Record<SourceSite, string> = {
  serebii: 'https://www.serebii.net/pokemonpokopia',
  pokopiaGuide: 'https://pokopiaguide.com',
  pokopoko: 'https://pokopoko.kr',
  namuwiki: 'https://namu.wiki/w',
};

function pageToUrl(source: SourceSite, page: string): string {
  if (source === 'serebii') {
    return `${SOURCE_BASE_URL[source]}/${page}.shtml`;
  }
  return `${SOURCE_BASE_URL[source]}/${page}`;
}

function tierFor(source: SourceSite): 0 | 1 | 2 | 3 {
  switch (source) {
    case 'serebii':
      return 0;
    case 'pokopiaGuide':
      return 1;
    case 'pokopoko':
      return 2;
    case 'namuwiki':
      return 3;
  }
}

async function main(): Promise<void> {
  const args = parseCli();
  const url = pageToUrl(args.source, args.page);
  const tier = tierFor(args.source);

  if (tier > 0) {
    console.error('[dry-session] T1+ 는 본 스크립트 범위 밖 — Phase 6 후속에서 별도 스크립트로 분리.');
    process.exit(1);
  }

  // 의존성 wiring.
  const robots = new RobotsChecker();
  // T0 robots 사전 로드 — Serebii 는 robots.txt 통과 정책.
  await robots.load(args.source, SOURCE_BASE_URL[args.source]);

  const cache = new HtmlCache();
  const crawlState = new CrawlState();
  const guard = initGuard();
  const config = loadNotifierConfig();
  const notifier = new Notifier(config);
  const errorReaction = new ErrorReaction({ notifier, crawlState });

  const sm = new SessionManager({
    guard,
    crawlState,
    fetcherFactory: (source, persona) => createFetcher(source, { robots, cache, persona }),
    errorReaction,
    notifier,
    chromeOnSessionStart: onSessionStart,
    resetUserAgentCache: resetCachedUserAgent,
  });

  await sm.bootstrap();
  console.log(`[dry-session] start source=${args.source} tier=${tier} page=${args.page} url=${url}`);

  const outcome = await sm.runSession({ source: args.source, tier, phase: 6 }, async (ctx) => {
    console.log('[dry-session] fetcher ready, requesting...');
    const result = await ctx.fetcher.fetch(url);
    console.log(
      `[dry-session] status=${String(result.status)} bytes=${String(result.html.length)} fromCache=${String(result.fromCache)}`,
    );
    return result.status;
  });

  console.log(`[dry-session] outcome.kind=${outcome.kind}`);

  // Phase 7 — notifier worker 종료 대기 (immediateQueue flush 보장).
  await notifier.shutdown();

  if (outcome.kind !== 'completed') {
    console.error(`[dry-session] outcome=${JSON.stringify(outcome)}`);
    process.exit(1);
  }
  process.exit(0);
}

await main().catch((err: unknown) => {
  const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[dry-session] fatal: ${reason}`);
  process.exit(1);
});
