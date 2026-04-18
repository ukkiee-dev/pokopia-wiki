/* eslint-disable no-console, unicorn/prefer-top-level-await, max-lines-per-function, max-lines, no-await-in-loop */
/**
 * Preflight: 각 소스 대표 페이지 1 개 접근 테스트.
 *
 * 티어별 fetcher 를 실제로 구동해 스모크 접속이 되는지 기록한다. 404/403
 * 발생은 "정상 기록" 대상이며 exit 1 은 내지 않는다 — T2/T3 의 차단 가능성은
 * Phase 12 (§12.6) 에서 판단하므로 여기서는 근거 수집만.
 *
 * 실행:
 *   pnpm --filter @pokopia-wiki/scraper check:access
 *
 * 출력:
 *   - `data/preflight/<YYYYMMDD-HHMM>/access-<source>.json` (소스별 결과)
 *   - `data/preflight/<YYYYMMDD-HHMM>/access-<source>.png` (T1~T3 만)
 *   - console 요약 표
 *
 * exit code:
 *   - 0 항상 — T2/T3 실패도 정보 가치이므로 스크립트 자체는 항상 성공.
 *   - 1 은 T0 Serebii 자체 네트워크가 끊긴 경우에만 (그 외는 수집 대상이므로 기록만).
 *
 * 주의: headful 모드가 필요하면 `SCRAPER_HEADED=1` 로 실행.
 *
 * max-lines / max-lines-per-function: 4 티어 분기가 한 파일에 모여야 읽기 쉬움.
 * no-await-in-loop: probe 를 순차 실행해야 쿠키·네트워크 전기가 섞이지 않음.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import ky from 'ky';
import type { BrowserContext } from 'patchright';
import { chromium as patchrightChromium } from 'patchright';
import { chromium as playwrightChromium } from 'playwright';

import { repoPath } from '#paths';

const DEFAULT_USER_AGENT = 'PokopiaScraperBot/1.0 (+ukyi.js@gmail.com)';
const HEADED = process.env['SCRAPER_HEADED'] === '1';

type SourceSlug = 'serebii' | 'pokopiaguide' | 'pokopoko' | 'namu.wiki';

type AccessResult = {
  source: SourceSlug;
  tier: 'T0' | 'T1' | 'T2' | 'T3';
  url: string;
  ok: boolean;
  status?: number;
  contentBytes?: number;
  title?: string;
  screenshot?: string;
  notes: string[];
  error?: string;
};

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatStamp(now: Date = new Date()): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** 결과 저장 — `access-<source>.json`. `notes` 는 운영자 판단 힌트. */
async function writeResult(dir: string, result: AccessResult): Promise<void> {
  const safeSlug = result.source.replaceAll('.', '_');
  const outPath = path.resolve(dir, `access-${safeSlug}.json`);
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

/**
 * 쿨다운 유틸 — `setTimeout` promise 래핑. lint `promise/param-names` 규칙을
 * 따라 `resolve` 명명 사용. `promise-executor-return` 회피를 위해 블록 바디.
 */
function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * T0 Serebii — `ky` 로 HTTP GET.
 *
 * 성공 조건:
 *   - HTTP 200
 *   - 본문에 "Available Pokemon" 문구 (페이지 고유 마커) 포함
 * 둘 다 아니어도 exit 1 은 내지 않는다 — 실패 자체가 리포트 대상이기 때문.
 */
async function probeSerebii(userAgent: string): Promise<AccessResult> {
  const url = 'https://www.serebii.net/pokemonpokopia/availablepokemon.shtml';
  const notes: string[] = [];
  try {
    const response = await ky.get(url, {
      timeout: 20_000,
      retry: { limit: 1 },
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      throwHttpErrors: false,
    });
    const body = await response.text();
    const hasMarker = body.includes('Available Pokemon');
    if (!hasMarker) notes.push('marker "Available Pokemon" 미검출');
    return {
      source: 'serebii',
      tier: 'T0',
      url,
      ok: response.status === 200 && hasMarker,
      status: response.status,
      contentBytes: body.length,
      notes,
    };
  } catch (err) {
    return {
      source: 'serebii',
      tier: 'T0',
      url,
      ok: false,
      notes: ['ky.get threw'],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * T1 PokopiaGuide — playwright 순정 chromium.
 *
 * 성공 조건:
 *   - `page.goto` 가 2xx 에서 끝남
 *   - 본문 길이 > 1024 (SPA 빈 껍데기 회피용 임계)
 */
async function probePokopiaGuide(dir: string): Promise<AccessResult> {
  const url = 'https://www.pokopiaguide.com/ko';
  const notes: string[] = [];
  const screenshot = path.resolve(dir, 'access-pokopiaguide.png');

  const browser = await playwrightChromium.launch({ headless: !HEADED });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    const status = response?.status();
    await page.waitForTimeout(3000);
    const html = await page.content();
    await page.screenshot({ path: screenshot, fullPage: true });
    const title = await page.title();
    const ok = status !== undefined && status >= 200 && status < 300 && html.length > 1024;
    if (!ok) notes.push(`status=${status ?? '-'} contentBytes=${String(html.length)}`);
    return {
      source: 'pokopiaguide',
      tier: 'T1',
      url,
      ok,
      status,
      contentBytes: html.length,
      title,
      screenshot,
      notes,
    };
  } catch (err) {
    return {
      source: 'pokopiaguide',
      tier: 'T1',
      url,
      ok: false,
      screenshot,
      notes: ['playwright.goto threw'],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await context.close().catch(() => {
      /* best-effort */
    });
    await browser.close().catch(() => {
      /* best-effort */
    });
  }
}

type PatchrightProbeArgs = {
  source: SourceSlug;
  tier: 'T2' | 'T3';
  url: string;
  dir: string;
  slug: string;
  waitForCfClearance?: boolean;
  interpret: (ctx: { status?: number; html: string; notes: string[]; cfCleared?: boolean }) => boolean;
};

/**
 * 공통 patchright probe — T2/T3 양쪽이 쓴다.
 *
 * 각 티어 고유 로직은 `interpret` 콜백에 위임.
 */
async function probeWithPatchright(args: PatchrightProbeArgs): Promise<AccessResult> {
  const { source, tier, url, dir, slug, waitForCfClearance, interpret } = args;
  const screenshot = path.resolve(dir, `access-${slug}.png`);
  const notes: string[] = [];

  const browser = await patchrightChromium.launch({ headless: !HEADED });
  const context: BrowserContext = await browser.newContext();
  const page = await context.newPage();

  try {
    const response = await page.goto(url, { timeout: 45_000, waitUntil: 'domcontentloaded' });
    let status = response?.status();
    await page.waitForTimeout(3000);

    let cfCleared: boolean | undefined;
    if (waitForCfClearance) {
      cfCleared = await waitForCloudflareClearance(context, url);
      // CF 통과 후 본문 재확보
      await page.waitForTimeout(2000);
      try {
        status = response?.status() ?? status;
      } catch {
        /* no-op */
      }
    }

    const html = await page.content();
    await page.screenshot({ path: screenshot, fullPage: true });
    const title = await page.title();
    const ok = interpret({ status, html, notes, cfCleared });
    return {
      source,
      tier,
      url,
      ok,
      status,
      contentBytes: html.length,
      title,
      screenshot,
      notes,
    };
  } catch (err) {
    return {
      source,
      tier,
      url,
      ok: false,
      screenshot,
      notes: ['patchright.goto threw'],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await context.close().catch(() => {
      /* best-effort */
    });
    await browser.close().catch(() => {
      /* best-effort */
    });
  }
}

/**
 * T2 pokopoko — patchright. 403 도 "정보" 로 기록.
 *
 * Phase 12 에서 403 회피 가능 여부로 pokopoko 포함 여부 결정 예정.
 */
function probePokopoko(dir: string): Promise<AccessResult> {
  const url = 'https://pokopoko.kr/';
  return probeWithPatchright({
    source: 'pokopoko',
    tier: 'T2',
    url,
    dir,
    slug: 'pokopoko',
    interpret: ({ status, html, notes }) => {
      if (status === 403) {
        notes.push('403 Forbidden — Cloudflare 차단 가능성. Phase 12 에서 회피 전략 결정.');
        return false;
      }
      return (status ?? 0) >= 200 && (status ?? 0) < 300 && html.length > 1024;
    },
  });
}

/**
 * T3 namu.wiki — patchright + CF challenge 대기.
 *
 * `cf_clearance` 쿠키를 최대 30 초간 기다린 뒤 본문을 수집. 실패해도
 * Phase 12 판단용으로만 사용하므로 exit 영향 없음.
 */
function probeNamu(dir: string): Promise<AccessResult> {
  const url = 'https://namu.wiki/w/포코피아';
  return probeWithPatchright({
    source: 'namu.wiki',
    tier: 'T3',
    url,
    dir,
    slug: 'namu_wiki',
    waitForCfClearance: true,
    interpret: ({ status, html, notes, cfCleared }) => {
      if (!cfCleared) notes.push('cf_clearance 쿠키 미획득');
      const httpOk = (status ?? 0) >= 200 && (status ?? 0) < 400;
      return httpOk && html.length > 2048 && cfCleared === true;
    },
  });
}

/**
 * 주어진 컨텍스트에서 Cloudflare `cf_clearance` 쿠키가 발급될 때까지 대기.
 * 최대 30 초. 타임아웃 시 false.
 */
async function waitForCloudflareClearance(context: BrowserContext, url: string): Promise<boolean> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const cookies = await context.cookies(url);
    if (cookies.some((c) => c.name === 'cf_clearance' && typeof c.value === 'string' && c.value.length > 0)) {
      return true;
    }
    await sleep(1000);
  }
  return false;
}

async function main(): Promise<void> {
  const stamp = formatStamp();
  const dir = repoPath('data', 'preflight', stamp);
  await mkdir(dir, { recursive: true });

  const userAgent = process.env['SCRAPER_USER_AGENT'] ?? DEFAULT_USER_AGENT;

  // Serebii — 단일 네트워크 실패만 exit 1 결정권을 가짐.
  const serebii = await probeSerebii(userAgent);
  await writeResult(dir, serebii);

  const pokopiaguide = await probePokopiaGuide(dir);
  await writeResult(dir, pokopiaguide);

  const pokopoko = await probePokopoko(dir);
  await writeResult(dir, pokopoko);

  const namu = await probeNamu(dir);
  await writeResult(dir, namu);

  const results: readonly AccessResult[] = [serebii, pokopiaguide, pokopoko, namu];

  console.log('[check:access] summary');
  console.log('  tier  source          ok     status  bytes       notes');
  for (const r of results) {
    const status = r.status ?? '-';
    const bytes = r.contentBytes ?? 0;
    const noteStr = r.notes.length > 0 ? r.notes.join('; ') : (r.error ?? '');
    console.log(
      `  ${r.tier}    ${r.source.padEnd(14)} ${String(r.ok).padEnd(6)} ${String(status).padEnd(7)} ${String(bytes).padEnd(11)} ${noteStr}`,
    );
  }

  if (serebii.error && !serebii.ok && serebii.status === undefined) {
    console.error('[check:access] Serebii (T0) 네트워크 자체 실패 — 기본 연결 점검 필요.');
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error('[check:access] fatal', err);
  process.exit(1);
});
