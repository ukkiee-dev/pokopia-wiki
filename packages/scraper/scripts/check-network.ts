/* eslint-disable no-console, unicorn/prefer-top-level-await, max-lines-per-function */
/**
 * Preflight: 네트워크 일관성 검증 (CRAWLING_STRATEGY §9.3).
 *
 * 현재 외부 IP 의 국가·타임존이 페르소나 KR/Asia/Seoul 과 일치하는지 검사.
 * 미일치 시 운영자에게 경고만 남기고 exit 1 은 하지 않는다 —
 * VPN 테스트 환경에서도 Phase 3 preflight 가 통과해야 하기 때문.
 *
 * 실행:
 *   pnpm --filter @pokopia-wiki/scraper check:network
 *
 * 출력:
 *   - `data/preflight/<YYYYMMDD-HHMM>/network.json`
 *
 * exit code:
 *   - 0 항상 (VPN 환경 허용).
 *   - ipapi.co 자체에 접근 못 하면 `pass=false` 로 기록하고 exit 0.
 *
 * no-console / top-level-await 는 CLI 엔트리 관례로 의도적 disable.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import ky from 'ky';

import { repoPath } from '#paths';

/** ipapi.co 응답 중 본 스크립트가 소비하는 필드. */
type IpApiResponse = {
  country_code: string;
  timezone: string;
  org: string;
};

/** ipapi.co 응답이 기대 형태인지 확인하는 타입 가드. */
function isIpApiResponse(value: unknown): value is IpApiResponse {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec['country_code'] === 'string' && typeof rec['timezone'] === 'string' && typeof rec['org'] === 'string'
  );
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatStamp(now: Date = new Date()): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

async function main(): Promise<void> {
  const stamp = formatStamp();
  const dir = repoPath('data', 'preflight', stamp);
  await mkdir(dir, { recursive: true });
  const outPath = path.resolve(dir, 'network.json');

  const measuredAt = new Date().toISOString();
  let countryCode: string | null = null;
  let timezone: string | null = null;
  let org: string | null = null;
  let error: string | undefined;

  try {
    const raw: unknown = await ky
      .get('https://ipapi.co/json/', {
        timeout: 10_000,
        retry: { limit: 1 },
      })
      .json();
    if (!isIpApiResponse(raw)) {
      throw new TypeError('ipapi.co 응답 포맷 불일치');
    }
    countryCode = raw.country_code;
    timezone = raw.timezone;
    org = raw.org;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const pass = countryCode === 'KR' && timezone === 'Asia/Seoul';
  const report = {
    measuredAt,
    country_code: countryCode,
    timezone,
    org,
    pass,
    ...(error ? { error } : {}),
  };

  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('[check:network] summary');
  console.log(`  country_code: ${countryCode ?? '<unknown>'}  (expected KR)`);
  console.log(`  timezone:     ${timezone ?? '<unknown>'}  (expected Asia/Seoul)`);
  console.log(`  org:          ${org ?? '<unknown>'}`);
  console.log(`  pass:         ${String(pass)}`);
  console.log(`  report:       ${outPath}`);

  if (error) {
    console.warn(`[check:network] ipapi 조회 실패 (기록만, exit 0): ${error}`);
  } else if (!pass) {
    console.warn('[check:network] IP 국가/타임존이 KR/Asia/Seoul 과 불일치 — VPN 환경이면 무시, 운영 환경이면 점검.');
  }
}

main().catch((err: unknown) => {
  console.error('[check:network] fatal', err);
  process.exit(1);
});
