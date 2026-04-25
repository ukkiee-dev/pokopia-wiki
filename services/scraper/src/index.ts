/* eslint-disable no-console */
/**
 * Scraper CLI 엔트리포인트 — Phase 9 선결 코드.
 *
 * 사용법:
 *   pnpm --filter @pokopia-wiki/scraper scrape --source serebii \
 *     --page availablepokemon [--dry-run] [--use-fixture] [--limit N]
 *
 * 옵션:
 *   --source <site>      대상 소스 (serebii / pokopiaGuide / pokopoko / namuwiki).
 *                        현재 'serebii' 만 지원 (Phase 9).
 *   --page <pageId>      파싱 대상 페이지 ID (파서 pageId 와 일치).
 *                        예: 'availablepokemon', 'specialty', 'items'.
 *   --dry-run            DB upsert 를 건너뛰고 파싱 결과만 stdout 에 통계 출력.
 *                        Phase 9 Task 9.1 의 dryrun 검토용.
 *   --use-fixture        실제 네트워크 호출 대신 `__fixtures__/<pageId>.html` 사용.
 *                        개발/CI 모드.
 *   --limit <N>          파싱된 entity 중 첫 N 개만 처리 (오프셋 0).
 *
 * 종료 코드:
 *   0 — 모든 entity 정상 (failures 0).
 *   1 — 인자 오류 / 파서 미발견 / fetch 실패.
 *   2 — 일부 entity 가 invalid (failures > 0). 격리 디렉토리는 stderr 출력.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { repoPath } from '#paths';

import { AvailablePokemonParser } from './parsers/serebii/available-pokemon.js';
import type { Parser, ParseResult } from './parsers/base.js';
import { isolateInvalidEntries, type InvalidEntry } from './loaders/invalid-isolator.js';

// ─────────────────────────────────────────────────────────
//  CLI 인자 파싱 (의존성 추가 회피 위해 minimal manual parser)
// ─────────────────────────────────────────────────────────

type CliArgs = {
  source: string;
  page: string;
  dryRun: boolean;
  useFixture: boolean;
  limit?: number;
};

function parseArgs(argv: ReadonlyArray<string>): CliArgs | null {
  const args: Partial<CliArgs> = { dryRun: false, useFixture: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--source':
        args.source = argv[++i];
        break;
      case '--page':
        args.page = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--use-fixture':
        args.useFixture = true;
        break;
      case '--limit': {
        const value = Number.parseInt(argv[++i] ?? '', 10);
        if (Number.isFinite(value) && value > 0) args.limit = value;
        break;
      }
      default:
        // 무시 (향후 확장 여지).
        break;
    }
  }
  if (typeof args.source !== 'string' || typeof args.page !== 'string') return null;
  return args as CliArgs;
}

// ─────────────────────────────────────────────────────────
//  파서 레지스트리 — 페이지 ID → Parser 인스턴스
//  (Phase 9 점진적으로 확장 — 본 단계는 첫 예시로 available-pokemon)
// ─────────────────────────────────────────────────────────

const SEREBII_PARSERS: Record<string, () => Parser<unknown>> = {
  availablepokemon: () => new AvailablePokemonParser() as Parser<unknown>,
  // 추가 페이지: pageId → 새 Parser 인스턴스 매핑을 여기에 등록.
};

function pickParser(source: string, page: string): Parser<unknown> | null {
  if (source === 'serebii') {
    const factory = SEREBII_PARSERS[page];
    return factory ? factory() : null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────
//  Fixture 로딩 (--use-fixture 모드)
// ─────────────────────────────────────────────────────────

/**
 * 일부 fixture 파일명은 pageId 와 다른 형식을 사용 (예: 'availablepokemon' →
 * 'available-pokemon.html'). PARSER pageId 와 fixture 파일명 변형 매핑.
 */
const FIXTURE_FILENAME_OVERRIDES: Record<string, string> = {
  availablepokemon: 'available-pokemon',
};

function loadFixtureHtml(source: string, page: string): { html: string; sourceUrl: string } | null {
  if (source !== 'serebii') return null;
  const filename = FIXTURE_FILENAME_OVERRIDES[page] ?? page;
  const fixturePath = repoPath(
    'services',
    'scraper',
    'src',
    'parsers',
    'serebii',
    '__fixtures__',
    `${filename}.html`,
  );
  try {
    const html = readFileSync(fixturePath, 'utf8');
    const sourceUrl = `https://www.serebii.net/pokemonpokopia/${page}.shtml`;
    return { html, sourceUrl };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────
//  CLI 본체
// ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    console.error('Usage: scrape --source <site> --page <pageId> [--dry-run] [--use-fixture] [--limit N]');
    process.exit(1);
  }

  const parser = pickParser(args.source, args.page);
  if (parser === null) {
    console.error(`No parser registered for source=${args.source} page=${args.page}`);
    process.exit(1);
  }

  console.log(
    `[scrape] source=${args.source} page=${args.page} dryRun=${args.dryRun} useFixture=${args.useFixture}`,
  );

  // Fixture 모드만 본 단계에서 지원 (실제 fetcher 통합은 후속 작업).
  if (!args.useFixture) {
    console.error(
      '[scrape] live fetching not yet wired in CLI — re-run with --use-fixture (Phase 9 후속 작업).',
    );
    process.exit(1);
  }

  const fixture = loadFixtureHtml(args.source, args.page);
  if (fixture === null) {
    console.error(`[scrape] no fixture found for ${args.source}/${args.page}`);
    process.exit(1);
  }

  const result: ParseResult<unknown> = parser.parse(fixture.html, {
    sourceUrl: fixture.sourceUrl,
    scrapedAt: new Date().toISOString(),
  });

  const limited = args.limit !== undefined
    ? result.entities.slice(0, args.limit)
    : result.entities;

  console.log(
    `[scrape] parsed entities=${result.entities.length} (limited=${limited.length}) issues=${result.issues.length}`,
  );

  // 파서 issues 를 invalid 격리 (zod-fail / unexpected-structure 등).
  const invalid: InvalidEntry[] = result.issues.map((issue, index) => ({
    entity: args.page,
    sourceSlug: issue.at ?? `unknown-${index}`,
    parsedCandidate: { kind: issue.kind, message: issue.message },
    errors: [issue.message],
  }));

  if (invalid.length > 0) {
    const isolation = await isolateInvalidEntries(args.source, invalid);
    console.error(
      `[scrape] isolated ${String(isolation.entries)} invalid entries → ${isolation.directory}`,
    );
  }

  if (args.dryRun) {
    // dry-run 결과를 data/parsed/ 에 JSON 으로 저장 (Phase 9 Task 9.1).
    const outPath = repoPath('data', 'parsed', `${args.source}_${args.page}.json`);
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(limited, null, 2), 'utf8');
    console.log(`[scrape] dry-run wrote ${String(limited.length)} entities → ${outPath}`);
  } else {
    console.error(
      '[scrape] DB upsert path not yet wired — re-run with --dry-run (loader integration is Phase 9 후속).',
    );
    process.exit(1);
  }

  process.exit(invalid.length === 0 ? 0 : 2);
}

main().catch((error: unknown) => {
  console.error('[scrape] fatal:', error);
  process.exit(1);
});
