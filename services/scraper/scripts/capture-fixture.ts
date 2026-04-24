/* eslint-disable no-console, unicorn/prefer-top-level-await, max-lines-per-function */
/**
 * Fixture 수집 도구 (Phase 8 — 파서 테스트용 `__fixtures__` 준비).
 *
 * 단일 Serebii 페이지를 받아 `services/scraper/src/parsers/serebii/__fixtures__/`
 * 디렉토리에 `<pageId>.html` + `<pageId>.license.yaml` 쌍으로 저장한다.
 *
 * 사용:
 *   pnpm --filter @pokopia-wiki/scraper capture-fixture <pageId> <url>
 *
 * 예:
 *   pnpm --filter @pokopia-wiki/scraper capture-fixture specialty \
 *     https://www.serebii.net/pokemonpokopia/specialty.shtml
 *
 * 주의사항:
 *   - **개발자 fixture 수집 전용**. robots.txt 는 Phase 3 `check:robots` preflight 로
 *     사전 승인된 경로만 사용할 것 (CRAWLING_STRATEGY §15.1). 본 스크립트는
 *     RobotsChecker 를 우회하므로 URL 결정은 호출자의 책임.
 *   - Serebii rate limit (페이지당 3~5 초) 준수 — 연속 실행 시 sleep 필요.
 *   - HTML `data/cache/serebii/` 캐시는 건드리지 않는다. fixture 는 장기 보존,
 *     cache 는 TTL 3 일로 수명이 다름 (§16.1).
 *
 * 출력:
 *   `services/scraper/src/parsers/serebii/__fixtures__/<pageId>.html`
 *   `services/scraper/src/parsers/serebii/__fixtures__/<pageId>.license.yaml`
 *
 * exit code:
 *   - 0 성공
 *   - 1 인자 누락 / 비정상 응답 / 네트워크 실패
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import ky from 'ky';

import { repoPath } from '#paths';

/**
 * 연락처 포함 봇 UA — Serebii 에 선의로 식별 가능 (`ky-fetcher.ts` 와 동일).
 * 운영자가 임시로 교체하려면 `.env SCRAPER_USER_AGENT` 설정.
 */
const DEFAULT_USER_AGENT = 'PokopiaScraperBot/1.0 (+ukyi.js@gmail.com)';
const TIMEOUT_MS = 20_000;

type LicenseInput = {
  pageId: string;
  url: string;
  fetchedAt: string;
  status: number;
  contentType: string;
  contentHash: string;
};

async function main(): Promise<void> {
  const [pageIdArg, urlArg] = process.argv.slice(2);
  if (pageIdArg === undefined || urlArg === undefined) {
    console.error('Usage: capture-fixture <pageId> <url>');
    console.error('  예: capture-fixture specialty https://www.serebii.net/pokemonpokopia/specialty.shtml');
    process.exit(1);
  }
  const pageId = pageIdArg;
  const url = urlArg;

  const userAgent = process.env['SCRAPER_USER_AGENT']?.trim() || DEFAULT_USER_AGENT;
  console.log(`[capture-fixture] fetching pageId=${pageId} url=${url}`);

  const response = await ky.get(url, {
    timeout: TIMEOUT_MS,
    retry: { limit: 3, statusCodes: [429, 503], backoffLimit: 5000 },
    headers: {
      'User-Agent': userAgent,
      'Accept-Language': 'en-US,en;q=0.9',
    },
    throwHttpErrors: false,
  });

  const html = await response.text();
  const status = response.status;
  const contentType = response.headers.get('content-type') ?? '';
  const contentHash = createHash('sha256').update(html).digest('hex');
  const fetchedAt = new Date().toISOString();

  if (status < 200 || status >= 300) {
    console.error(`[capture-fixture] non-2xx status=${String(status)} — aborting fixture save`);
    process.exit(1);
  }

  const fixtureDir = repoPath(
    'services',
    'scraper',
    'src',
    'parsers',
    'serebii',
    '__fixtures__',
  );
  await mkdir(fixtureDir, { recursive: true });

  const htmlPath = path.resolve(fixtureDir, `${pageId}.html`);
  const licensePath = path.resolve(fixtureDir, `${pageId}.license.yaml`);

  await writeFile(htmlPath, html, 'utf8');
  await writeFile(
    licensePath,
    buildLicenseYaml({ pageId, url, fetchedAt, status, contentType, contentHash }),
    'utf8',
  );

  const hashPreview = `${contentHash.slice(0, 12)}…`;
  console.log(
    `[capture-fixture] ok pageId=${pageId} status=${String(status)} bytes=${String(html.length)} hash=${hashPreview}`,
  );
  console.log(`[capture-fixture] html:    ${htmlPath}`);
  console.log(`[capture-fixture] license: ${licensePath}`);
}

function buildLicenseYaml(input: LicenseInput): string {
  return [
    '# Phase 8 fixture 라이선스 메타 (CRAWLING_STRATEGY §5.3 / §27.4)',
    '#',
    `# 이 파일은 동일 디렉토리 \`${input.pageId}.html\` 원본에 대한 attribution 기록.`,
    '# fixture 갱신(재수집) 시 fetched_at / content_hash / status 를 함께 갱신.',
    '# 수집 스크립트: services/scraper/scripts/capture-fixture.ts',
    '',
    `page: ${input.pageId}`,
    'source_site: serebii',
    `source_url: ${input.url}`,
    `fetched_at: ${input.fetchedAt}`,
    `content_hash: ${input.contentHash}`,
    `status: ${String(input.status)}`,
    `content_type: ${input.contentType}`,
    'license: "Fan-use (non-commercial). Per Serebii.net content guidelines."',
    'copyright_holder: "Game content © The Pokémon Company / Nintendo / GAME FREAK. Original writings © Serebii.net."',
    'attribution: "Data from Serebii.net — https://www.serebii.net/pokemonpokopia/"',
    'note: |',
    '  scripts/capture-fixture.ts 로 수집. 재수집 시',
    `  pnpm --filter @pokopia-wiki/scraper capture-fixture ${input.pageId} ${input.url}`,
    '',
  ].join('\n');
}

main().catch((error: unknown) => {
  console.error('[capture-fixture] failed:', error);
  process.exit(1);
});
