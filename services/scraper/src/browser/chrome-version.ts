/**
 * Chrome 버전 감지 (CRAWLING_STRATEGY §9.2, v3.2 B3).
 *
 * 왜 필요한가:
 *   - T0 (ky) 의 User-Agent 헤더는 **세션 시작마다** 시스템 Chrome 버전과 동기화.
 *   - Chrome 메이저 업데이트 시 `Sec-Ch-Ua-Full-Version-List` mismatch 방지.
 *   - `chrome.version_bump` 이벤트 트리거 (§13.3.2).
 *
 * 버전 체계 (v3.2 B3 수정):
 *   Chrome 공식 MAJOR.MINOR.BUILD.PATCH — v3.1까지 3/4번째 필드 의미가 반전돼
 *   있었던 버그 수정. `full` 문자열은 우연히 같지만 비교 로직이 한 필드라도
 *   쓰는 순간 틀어진다.
 *
 * 플랫폼 분기:
 *   - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --version`
 *   - 그 외: fallback 하드코딩 버전. 실제 스크래핑은 macOS에서만 지원하지만
 *     CI/테스트 환경(Linux) 에서 import 실패는 피해야 한다.
 */

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { repoPath } from '../paths.js';

const execFileAsync = promisify(execFile);

/** macOS 기본 Chrome 바이너리 경로. 채널(Canary/Beta) 는 지원하지 않는다. */
const CHROME_MACOS_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * 런타임 환경에서 Chrome 을 찾지 못했을 때 사용하는 fallback.
 *
 * Phase 4 시점 (2026-04) 기준 Stable 채널 최신 라인. CI/Linux에서 테스트가
 * import 를 평가할 때 `execFile` 이 실패해도 사용자가 에러 메시지 없이
 * 어떤 값을 쓸지 예측 가능하게 하기 위함. 프로덕션에서는 실측값이 우선.
 */
const FALLBACK_VERSION: ChromeVersion = {
  major: 136,
  minor: 0,
  build: 7103,
  patch: 93,
  full: '136.0.7103.93',
};

/**
 * Chrome 버전 (v3.2 B3 수정: MAJOR.MINOR.BUILD.PATCH).
 *
 * `build` = 3번째 세그먼트(큰 숫자, 예 7103).
 * `patch` = 4번째 세그먼트(작은 숫자, 예 93).
 */
export type ChromeVersion = {
  major: number;
  minor: number;
  build: number;
  patch: number;
  full: string;
};

/** 영속화 경로 — 직전 세션 비교용. */
const STATE_PATH = repoPath('data', 'state', 'chrome-version.json');

/**
 * 파일에 저장되는 레코드. `ChromeVersion` + `detectedAt` ISO 타임스탬프.
 */
type ChromeVersionRecord = ChromeVersion & { detectedAt: string };

/**
 * 시스템 Chrome 바이너리에서 버전 추출.
 *
 * macOS 가 아닌 환경 또는 Chrome 이 설치되지 않은 환경에서는 `FALLBACK_VERSION`
 * 을 반환. 에러 메시지는 throw 하지 않는다 — 스크래퍼가 dev machine 외에서도
 * import 가능해야 하기 때문 (타입 검사, CI).
 */
export async function detectChromeVersion(): Promise<ChromeVersion> {
  if (process.platform !== 'darwin') {
    return FALLBACK_VERSION;
  }
  try {
    const { stdout } = await execFileAsync(CHROME_MACOS_PATH, ['--version'], { timeout: 5000 });
    const m = stdout.match(/Chrome\s+(\d+)\.(\d+)\.(\d+)\.(\d+)/);
    if (!m) return FALLBACK_VERSION;
    const [, majorStr, minorStr, buildStr, patchStr] = m;
    return {
      major: Number(majorStr),
      minor: Number(minorStr),
      build: Number(buildStr),
      patch: Number(patchStr),
      full: `${majorStr}.${minorStr}.${buildStr}.${patchStr}`,
    };
  } catch {
    return FALLBACK_VERSION;
  }
}

/**
 * 시스템 Chrome 버전으로 User-Agent 문자열 구성.
 *
 * SSoT (§9.2): Intel Mac OS X 10_15_7 + AppleWebKit 537.36 + Safari 537.36.
 * Apple Silicon 을 사용 중이어도 Chrome 이 전송하는 UA 는 여전히 Intel 표기 —
 * 이는 `navigator.userAgent` 가 레거시 호환을 위해 고정되어 있기 때문(실제 Chrome
 * 동일).
 */
export async function getSystemChromeUserAgent(): Promise<string> {
  const v = await detectChromeVersion();
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v.full} Safari/537.36`;
}

/**
 * 세션 시작 훅 — 직전 저장값과 비교 후 `chrome.version_bump` 이벤트 판정.
 *
 * 반환값:
 *   - `version`: 이번 세션에서 사용할 ChromeVersion
 *   - `bumped`: **메이저** 버전이 달라진 경우에만 true (minor/patch는 잦으므로 제외)
 *
 * 호출자는 `bumped=true` 일 때 `notifier.notify('chrome.version_bump', ...)` 실행.
 * 직접 notify 호출을 이 함수에서 하지 않는 이유: Notifier 는 상위 오케스트레이터
 * (SessionManager) 가 주입하므로 순환 의존을 막기 위해.
 */
export async function onSessionStart(): Promise<{ version: ChromeVersion; bumped: boolean }> {
  const current = await detectChromeVersion();
  await mkdir(path.dirname(STATE_PATH), { recursive: true });

  const prev = await readFile(STATE_PATH, 'utf8')
    .then((s) => JSON.parse(s) as ChromeVersionRecord)
    .catch(() => null);

  const record: ChromeVersionRecord = { ...current, detectedAt: new Date().toISOString() };
  await writeFile(STATE_PATH, JSON.stringify(record, null, 2), 'utf8');

  const bumped = prev !== null && prev.major !== current.major;
  return { version: current, bumped };
}
