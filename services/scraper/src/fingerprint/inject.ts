/**
 * FingerprintInjector (T1 PokopiaGuide) — CRAWLING_STRATEGY §9.1.1.
 *
 * 구성:
 *   - `getOrCreateFingerprint(persona)` — `<profilePath>/fingerprint.json` 에
 *     핑거프린트를 영속. 파일이 있으면 재사용, 없으면 `FingerprintGenerator` 로
 *     생성 후 정체성 필드(§5.3)를 페르소나 값으로 덮어쓴다.
 *   - `attachFingerprint(context, persona)` — 위 핑거프린트를 `FingerprintInjector.
 *     attachFingerprintToPlaywright` 로 context 에 주입.
 *
 * 핵심 설계:
 *   - canvas/audio/fonts seed 는 `FingerprintGenerator` 생성값 **그대로** 저장 →
 *     페르소나 수명 동안 **평생 고정** (§5.3 A3 — ProfileFingerprint 에 포함하지
 *     않는 대신 fingerprint.json 으로 영속).
 *   - `minVersion` 하드코딩 금지 (§9.1.1 B4). `detectChromeVersion()` 결과에서
 *     `Math.max(MIN_CHROME_MAJOR_FLOOR, current - SAMPLING_WINDOW)` 로 동적
 *     계산 — 시간이 지나도 구형 프로필만 샘플링되는 문제 방지.
 *   - 정체성 필드(screen/hardwareConcurrency/deviceMemory/platform/languages)만
 *     덮어쓰고, 그 외 `fingerprint-generator` 가 배정한 값은 건드리지 않는다 —
 *     내부적으로 일관성이 설계돼 있어 외부에서 부분 수정하면 깨진다.
 *
 * Phase 5 통합: `PlaywrightFetcher` 가 `ensureContext()` 첫 호출 시점에
 * `attachFingerprint()` 를 호출한다 (Phase 4 TKTK #2 해소 대상).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';
import type { BrowserContext } from 'playwright';

import { detectChromeVersion } from '../browser/chrome-version.js';
import type { BrowserPersona, ProfileFingerprint } from '../persona/types.js';

/** 무엇이 바뀌어도 120 미만 Chrome 은 샘플링 후보에서 제외 (§9.1.1 B4 하한). */
const MIN_CHROME_MAJOR_FLOOR = 120;

/** 현재 Chrome 에서 몇 메이저 이내까지 샘플링할지 (실유저 분포 가정). */
const SAMPLING_WINDOW = 4;

/** `fingerprint-generator` 결과 형상 — 직접 import 할 공식 타입이 없어 최소 구조만 선언. */
type GeneratedFingerprint = {
  fingerprint: {
    screen: Record<string, number>;
    navigator: {
      hardwareConcurrency: number;
      deviceMemory: number;
      platform: string;
      language: string;
      languages: string[];
    } & Record<string, unknown>;
  } & Record<string, unknown>;
  headers: Record<string, string>;
};

const fpGenerator = new FingerprintGenerator();
const fpInjector = new FingerprintInjector();

/**
 * 페르소나에 `profilePath` / `fingerprint` 가 있는지 검증.
 *
 * Phase 5 T1~T3 페르소나는 `definitions.ts` 에서 두 필드를 모두 채우지만, 타입은
 * optional 이라 런타임 확인이 필요. 호출부(FetcherFactory / PlaywrightFetcher)가
 * T0 를 사전에 분기하므로 실제로 이 에러가 발생하면 **설정 버그**.
 */
function assertFingerprintReady(persona: BrowserPersona): asserts persona is BrowserPersona & {
  profilePath: string;
  fingerprint: ProfileFingerprint;
} {
  if (persona.profilePath === undefined || persona.fingerprint === undefined) {
    throw new Error(`persona "${persona.id}" lacks profilePath/fingerprint — required for T1+ fingerprint injection`);
  }
}

/**
 * 페르소나 프로필 디렉토리의 `fingerprint.json` 을 재사용하거나 새로 생성.
 *
 * 첫 호출 시 `FingerprintGenerator` 가 desktop/macos/chrome 분포에서 샘플링 →
 * 정체성 필드만 페르소나 값으로 덮어씀 → 파일에 저장. 이후 호출은 파일만 읽음.
 */
export async function getOrCreateFingerprint(persona: BrowserPersona): Promise<GeneratedFingerprint> {
  assertFingerprintReady(persona);

  const fpPath = path.resolve(persona.profilePath, 'fingerprint.json');

  try {
    const raw = await readFile(fpPath, 'utf8');
    const parsed = JSON.parse(raw) as GeneratedFingerprint;
    return parsed;
  } catch {
    // 파일 없음 / 파싱 실패 → 새로 생성.
  }

  const chromeNow = await detectChromeVersion();
  const minMajor = Math.max(MIN_CHROME_MAJOR_FLOOR, chromeNow.major - SAMPLING_WINDOW);

  const generated = fpGenerator.getFingerprint({
    devices: ['desktop'],
    operatingSystems: ['macos'],
    browsers: [{ name: 'chrome', minVersion: minMajor }],
    locales: [persona.fingerprint.locale],
  }) as unknown as GeneratedFingerprint;

  // 정체성 필드 덮어쓰기 (§5.3 하드웨어 결정형). canvas/audio/fonts seed 는 보존.
  Object.assign(generated.fingerprint.screen, persona.fingerprint.screen);
  generated.fingerprint.navigator.hardwareConcurrency = persona.fingerprint.hardwareConcurrency;
  generated.fingerprint.navigator.deviceMemory = persona.fingerprint.deviceMemory;
  generated.fingerprint.navigator.platform = persona.fingerprint.platform;
  generated.fingerprint.navigator.language = persona.fingerprint.locale;
  generated.fingerprint.navigator.languages = [...persona.fingerprint.languages];

  await mkdir(path.dirname(fpPath), { recursive: true });
  await writeFile(fpPath, JSON.stringify(generated, null, 2), 'utf8');

  return generated;
}

/**
 * Playwright BrowserContext 에 페르소나의 핑거프린트를 주입.
 *
 * `FingerprintInjector.attachFingerprintToPlaywright` 는 context 의 초기 스크립트
 * 와 HTTP 헤더에 canvas/audio/fonts 일관성 노이즈를 적용. 호출 시점은 context
 * 생성 직후 (페이지 열기 전) 여야 한다.
 */
export async function attachFingerprint(context: BrowserContext, persona: BrowserPersona): Promise<void> {
  const fp = await getOrCreateFingerprint(persona);
  // fingerprint-injector 의 공식 타입이 playwright 의 BrowserContext 와 1:1 정렬되지
  // 않아 우회 캐스팅 필요 (Apify 라이브러리가 여러 브라우저 드라이버를 동시 지원).
  await fpInjector.attachFingerprintToPlaywright(context as never, fp as never);
}
