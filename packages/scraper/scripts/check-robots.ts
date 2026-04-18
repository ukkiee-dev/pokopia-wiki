/* eslint-disable no-console, unicorn/prefer-top-level-await, no-await-in-loop, max-lines-per-function */
/**
 * Preflight: robots.txt 다운로드 + 소스별 샘플 URL 허용 여부 검증.
 *
 * 실행:
 *   pnpm --filter @pokopia-wiki/scraper check:robots
 *
 * 출력:
 *   - `data/robots/<source>.txt` (4 소스)
 *   - `data/robots/exclusions.json` (차단된 URL 목록)
 *   - `data/preflight/<YYYYMMDD-HHMM>/robots.json` (요약)
 *
 * exit code:
 *   - 0: 정상 종료. 차단 URL 이 있어도 0 (스크래퍼 실행 시 러너가 스킵).
 *   - 1: 4 소스 모두 robots.txt 다운로드 실패(네트워크 문제) — 운영자 개입 필요.
 *
 * no-console / top-level-await 는 CLI 엔트리 관례이므로 의도적 disable.
 * no-await-in-loop: 4 개 소스를 순차 처리해야 레이트 구별이 쉽고, 병렬화 시
 *   ipapi/robots 공급자에 동시 부하 가해 무해한 차단을 부를 수 있어 의도적 순차.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { repoPath } from '#paths';
import { DEFAULT_USER_AGENT, RobotsChecker, robotsCachePath } from '#robots/checker';

/** 대상 4 소스 — CRAWLING_STRATEGY §4 티어 표에 따라 순서 고정. */
type SourceSpec = {
  source: string;
  baseUrl: string;
  samplePaths: readonly string[];
};

const SOURCES: readonly SourceSpec[] = [
  {
    source: 'serebii',
    baseUrl: 'https://www.serebii.net',
    samplePaths: ['/pokemonpokopia/availablepokemon.shtml', '/pokemonpokopia/items/', '/pokemonpokopia/locations/'],
  },
  {
    source: 'pokopiaguide',
    baseUrl: 'https://www.pokopiaguide.com',
    samplePaths: ['/ko', '/ko/pokedex/1'],
  },
  {
    source: 'pokopoko',
    baseUrl: 'https://pokopoko.kr',
    samplePaths: ['/', '/pokedex'],
  },
  {
    source: 'namu.wiki',
    baseUrl: 'https://namu.wiki',
    samplePaths: ['/w/포코피아'],
  },
];

type ProbeResult = {
  source: string;
  url: string;
  allowed: boolean;
};

type SourceSummary = {
  source: string;
  robotsTxtSavedTo: string;
  robotsTxtBytes: number;
  checked: number;
  disallowed: number;
  loadError?: string;
};

/** 2자리 0-padding — 외부 스코프 고정(매 호출마다 재생성 방지). */
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** `YYYYMMDD-HHMM` 로컬 타임 포맷. `data/preflight/` 디렉토리명 표준. */
function formatStamp(now: Date = new Date()): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** robots.txt 파일 크기 — 미존재 시 0. */
async function robotsTxtBytes(source: string): Promise<number> {
  try {
    const s = await stat(robotsCachePath(source));
    return s.size;
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  const userAgent = process.env['SCRAPER_USER_AGENT'] ?? DEFAULT_USER_AGENT;
  const checker = new RobotsChecker();

  const stamp = formatStamp();
  const preflightDir = repoPath('data', 'preflight', stamp);
  await mkdir(preflightDir, { recursive: true });

  const summaries: SourceSummary[] = [];
  const exclusions: ProbeResult[] = [];
  const probes: ProbeResult[] = [];
  let loadFailures = 0;

  for (const spec of SOURCES) {
    let loadError: string | undefined;
    try {
      await checker.load(spec.source, spec.baseUrl);
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      loadFailures += 1;
    }

    const bytes = await robotsTxtBytes(spec.source);
    let disallowedCount = 0;
    let checkedCount = 0;

    if (!loadError) {
      for (const p of spec.samplePaths) {
        const url = new URL(p, spec.baseUrl).toString();
        const allowed = checker.isAllowed(spec.source, url, userAgent);
        probes.push({ source: spec.source, url, allowed });
        checkedCount += 1;
        if (!allowed) {
          disallowedCount += 1;
          exclusions.push({ source: spec.source, url, allowed });
        }
      }
    }

    summaries.push({
      source: spec.source,
      robotsTxtSavedTo: robotsCachePath(spec.source),
      robotsTxtBytes: bytes,
      checked: checkedCount,
      disallowed: disallowedCount,
      ...(loadError ? { loadError } : {}),
    });
  }

  // 1) data/robots/exclusions.json
  const exclusionsPath = repoPath('data', 'robots', 'exclusions.json');
  await writeFile(
    exclusionsPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), userAgent, exclusions }, null, 2)}\n`,
    'utf8',
  );

  // 2) data/preflight/<stamp>/robots.json
  const summaryPath = path.resolve(preflightDir, 'robots.json');
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        userAgent,
        sources: summaries,
        probes,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  // 3) console 요약
  console.log('[check:robots] summary');
  for (const s of summaries) {
    const status = s.loadError ? `FAIL (${s.loadError})` : `OK (${s.robotsTxtBytes}B)`;
    console.log(`  ${s.source.padEnd(14)} robots.txt: ${status}  checked=${s.checked}  disallowed=${s.disallowed}`);
  }
  console.log(`[check:robots] exclusions:  ${exclusionsPath}`);
  console.log(`[check:robots] summary:     ${summaryPath}`);

  if (loadFailures === SOURCES.length) {
    console.error('[check:robots] 전체 소스 robots.txt 로드 실패 — 네트워크 점검 필요');
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error('[check:robots] fatal', err);
  process.exit(1);
});
