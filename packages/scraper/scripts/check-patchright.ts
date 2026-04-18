/* eslint-disable no-console, unicorn/prefer-top-level-await, max-lines-per-function */
/**
 * Preflight: patchright 스텔스 능력 실측 (CRAWLING_STRATEGY §9.1.2 ★ v3.2).
 *
 * 핵심 2 가지:
 *   1. WebGL (37445/37446) 기본 반환값이 patchright 패치에 의해 변경되는지 확인.
 *      결과를 `data/preflight/patchright-webgl.json` 에 기록해 런타임
 *      `maybeReinforceWebgl()` 이 이중 패치를 회피하도록 한다.
 *   2. bot.sannysoft.com / nowsecure.nl 을 통과하는지 스크린샷 + HTML 덤프.
 *      T3 활성 여부(namu.wiki) 결정의 직접 근거.
 *
 * 실행:
 *   pnpm --filter @pokopia-wiki/scraper check:patchright
 *
 * 출력:
 *   - `data/preflight/patchright-webgl.json` (런타임에서 읽는 고정 경로)
 *   - `data/preflight/<stamp>/patchright-sannysoft.png` + `.html`
 *   - `data/preflight/<stamp>/patchright-nowsecure.png` + `.html`
 *   - `data/preflight/<stamp>/patchright.json` (종합 리포트)
 *
 * exit code:
 *   - 0: 모든 probe 완료 (스크린샷만 남아도 OK — 시각 확인은 운영자의 몫)
 *   - 1: patchright launch 자체 실패 / WebGL probe 실패 — 스크래퍼 운영 불가
 */

import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { BrowserContext } from 'patchright';
import { chromium } from 'patchright';

import { repoPath } from '#paths';

const execFileAsync = promisify(execFile);

const HEADED = process.env['SCRAPER_HEADED'] === '1';

type WebGLProbe = {
  vendor: string;
  renderer: string;
  overridesWebgl: boolean;
  measuredAt: string;
  patchrightVersion: string;
};

type SiteProbe = {
  url: string;
  ok: boolean;
  title: string;
  screenshot: string;
  html: string;
  error?: string;
};

type NpmReleaseInfo = {
  latestVersion: string;
  modifiedAt: string;
  agedays: number;
  withinSixMonths: boolean;
  error?: string;
};

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatStamp(now: Date = new Date()): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/**
 * 설치된 patchright 패키지 버전 추출.
 *
 * npm 원격 조회와 달리 로컬 package 메타만 본다. `npm view` 는 별도
 * `fetchNpmLatestRelease()` 에서.
 */
async function readInstalledPatchrightVersion(): Promise<string> {
  try {
    const mod = await import('patchright/package.json', { with: { type: 'json' } });
    const version = (mod.default as { version?: unknown }).version;
    return typeof version === 'string' ? version : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * `npm view patchright time.modified` 로 원격 릴리스 날짜 실측.
 *
 * `time.modified` 는 npm registry 의 마지막 publish 시점. 6 개월(180 일)
 * 이상이면 유지보수 중단 시그널 — `critical` 수준 경고로 기록.
 */
async function fetchNpmLatestRelease(): Promise<NpmReleaseInfo> {
  try {
    const { stdout } = await execFileAsync('npm', ['view', 'patchright', 'time.modified'], {
      timeout: 20_000,
    });
    const modifiedRaw = stdout.trim().replaceAll(/^['"]|['"]$/g, '');
    const modifiedDate = new Date(modifiedRaw);
    if (Number.isNaN(modifiedDate.getTime())) {
      throw new TypeError(`npm view 반환 해석 실패: ${stdout}`);
    }
    const { stdout: versionOut } = await execFileAsync('npm', ['view', 'patchright', 'version'], {
      timeout: 20_000,
    });
    const latestVersion = versionOut.trim();
    const ageMs = Date.now() - modifiedDate.getTime();
    const agedays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    return {
      latestVersion,
      modifiedAt: modifiedDate.toISOString(),
      agedays,
      withinSixMonths: agedays <= 180,
    };
  } catch (err) {
    return {
      latestVersion: 'unknown',
      modifiedAt: 'unknown',
      agedays: -1,
      withinSixMonths: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 한 페이지에 접속해 스크린샷 + HTML 을 덤프.
 *
 * 네트워크 에러/타임아웃 시 `ok=false` + `error` 필드 기록 후 반환. 뼈대
 * 단계이므로 본문 분석(초록 체크) 은 수행하지 않고 시각 확인은 운영자의 몫.
 */
async function runSiteProbe(
  context: BrowserContext,
  preflightDir: string,
  slug: string,
  url: string,
): Promise<SiteProbe> {
  const page = await context.newPage();
  const screenshotPath = path.resolve(preflightDir, `${slug}.png`);
  const htmlPath = path.resolve(preflightDir, `${slug}.html`);
  try {
    await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const html = await page.content();
    await writeFile(htmlPath, html, 'utf8');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const title = await page.title();
    return { url, ok: true, title, screenshot: screenshotPath, html: htmlPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    } catch {
      /* best-effort */
    }
    return { url, ok: false, title: '', screenshot: screenshotPath, html: htmlPath, error: message };
  } finally {
    await page.close().catch(() => {
      /* best-effort */
    });
  }
}

async function runWebGLProbe(context: BrowserContext, patchrightVersion: string): Promise<WebGLProbe> {
  const page = await context.newPage();
  try {
    await page.setContent('<html><body></body></html>');
    const webglRaw = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl =
        (canvas.getContext('webgl') as WebGLRenderingContext | null) ??
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
      if (!gl) return { vendor: 'no-webgl', renderer: 'no-webgl' };
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const vendorEnum = dbg ? ((dbg as { UNMASKED_VENDOR_WEBGL?: number }).UNMASKED_VENDOR_WEBGL ?? 37445) : 37445;
      const rendererEnum = dbg
        ? ((dbg as { UNMASKED_RENDERER_WEBGL?: number }).UNMASKED_RENDERER_WEBGL ?? 37446)
        : 37446;
      return {
        vendor: String(gl.getParameter(vendorEnum) ?? ''),
        renderer: String(gl.getParameter(rendererEnum) ?? ''),
      };
    });
    // Apple Silicon 호스트인데 렌더러가 Apple M* 이 아니면 patchright 가 override 중.
    const overridesWebgl = !/Apple M/i.test(webglRaw.renderer);
    return {
      vendor: webglRaw.vendor,
      renderer: webglRaw.renderer,
      overridesWebgl,
      measuredAt: new Date().toISOString(),
      patchrightVersion,
    };
  } finally {
    await page.close().catch(() => {
      /* best-effort */
    });
  }
}

async function main(): Promise<void> {
  const stamp = formatStamp();
  const preflightDir = repoPath('data', 'preflight', stamp);
  await mkdir(preflightDir, { recursive: true });
  await mkdir(repoPath('data', 'preflight'), { recursive: true });

  const patchrightVersion = await readInstalledPatchrightVersion();
  console.log(`[check:patchright] patchright@${patchrightVersion} headed=${String(HEADED)}`);

  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext();

  try {
    const webglProbe = await runWebGLProbe(context, patchrightVersion);
    const webglJsonPath = repoPath('data', 'preflight', 'patchright-webgl.json');
    await writeFile(webglJsonPath, `${JSON.stringify(webglProbe, null, 2)}\n`, 'utf8');
    console.log(
      `[check:patchright] WebGL vendor=${webglProbe.vendor} renderer=${webglProbe.renderer} overridesWebgl=${String(webglProbe.overridesWebgl)}`,
    );

    const sannysoftProbe = await runSiteProbe(
      context,
      preflightDir,
      'patchright-sannysoft',
      'https://bot.sannysoft.com/',
    );

    const nowsecureProbe = await runSiteProbe(context, preflightDir, 'patchright-nowsecure', 'https://nowsecure.nl/');

    const npmInfo = await fetchNpmLatestRelease();
    if (npmInfo.withinSixMonths) {
      console.log(
        `[check:patchright] patchright npm latest=${npmInfo.latestVersion} modified=${npmInfo.modifiedAt} (${String(npmInfo.agedays)}d ago)`,
      );
    } else {
      console.error(
        `[check:patchright] patchright npm 마지막 release 가 6 개월 초과 — agedays=${String(npmInfo.agedays)}  error=${npmInfo.error ?? '-'}`,
      );
    }

    const summary = {
      stamp,
      patchrightVersion,
      webglProbe,
      sites: [sannysoftProbe, nowsecureProbe],
      npmInfo,
    };
    const summaryPath = path.resolve(preflightDir, 'patchright.json');
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(`[check:patchright] summary:    ${summaryPath}`);
    console.log(`[check:patchright] webgl.json: ${webglJsonPath}`);
  } finally {
    await context.close().catch(() => {
      /* best-effort */
    });
    await browser.close().catch(() => {
      /* best-effort */
    });
  }
}

main().catch((err: unknown) => {
  console.error('[check:patchright] fatal', err);
  process.exit(1);
});
