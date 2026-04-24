/**
 * patchright WebGL 조건부 보강 (T2/T3) — CRAWLING_STRATEGY §9.1.2.
 *
 * 배경:
 *   - patchright 는 내부적으로 canvas/audio/fonts noise 를 자체 처리한다.
 *   - `fingerprint-injector` 를 함께 쓰면 **이중 패치** → 오히려 탐지 벡터.
 *   - 그러나 일부 patchright 버전은 `UNMASKED_VENDOR_WEBGL` /
 *     `UNMASKED_RENDERER_WEBGL` 을 위조하지 않는다 → 실 하드웨어 노출.
 *   - Phase 3 `check:patchright` 스크립트가 현재 환경에서 이미 위조 중인지 측정해
 *     `data/preflight/patchright-webgl.json` 에 기록.
 *
 * 동작 (§9.1.2 B1):
 *   - `overridesWebgl: true`  → 이미 patchright 가 처리 → **본 코드 적용 안 함**.
 *   - `overridesWebgl: false` → 페르소나 값으로 WebGL1 + WebGL2 보강.
 *   - probe 파일 없음/손상 → 보수적으로 `true` 로 간주 (이중 패치 방지 우선).
 *
 * Phase 5 통합: `PatchrightFetcher` / `PatchrightCfFetcher` 가 `ensureContext()`
 * 첫 호출 시점에 본 함수를 호출 (Phase 4 TKTK #3 해소 대상).
 */

import { readFile } from 'node:fs/promises';

import type { BrowserContext } from 'patchright';

import { repoPath } from '../paths.js';
import type { BrowserPersona } from '../persona/types.js';

/** §9.1.2 B1 probe 결과 구조 — Phase 3 `check:patchright` 스크립트가 생성. */
type PatchrightProbe = {
  overridesWebgl: boolean;
};

/**
 * 표준 WebGL 상수 (GLSL enum). `WEBGL_debug_renderer_info` 확장 없이도 번호로 직접
 * `getParameter()` 호출 가능. patchright 가 확장 자체를 숨겨도 값은 노출될 수 있어
 * 수동 상수가 필요.
 */
const UNMASKED_VENDOR_WEBGL = 37445;
const UNMASKED_RENDERER_WEBGL = 37446;

/**
 * `data/preflight/patchright-webgl.json` 조회. 파일 없음/손상 시 보수적으로
 * `overridesWebgl: true` 반환 (이중 패치 방지 우선).
 */
async function readPatchrightProbe(): Promise<PatchrightProbe> {
  try {
    const raw = await readFile(repoPath('data', 'preflight', 'patchright-webgl.json'), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PatchrightProbe>;
    return { overridesWebgl: parsed.overridesWebgl !== false };
  } catch {
    return { overridesWebgl: true };
  }
}

/**
 * patchright BrowserContext 에 WebGL vendor/renderer 보강을 **조건부** 로 주입.
 *
 * probe 가 `overridesWebgl: true` (patchright 가 이미 처리) 면 아무것도 안 함 —
 * 이중 패치는 `getParameter` toString 차이 같은 메타 시그널로 관찰될 수 있다.
 */
export async function maybeReinforceWebgl(context: BrowserContext, persona: BrowserPersona): Promise<void> {
  if (persona.fingerprint === undefined) {
    throw new Error(`persona "${persona.id}" lacks fingerprint — required for T2/T3 WebGL reinforcement`);
  }

  const probe = await readPatchrightProbe();
  if (probe.overridesWebgl) return;

  // initScript 는 페이지 컨텍스트에서 실행 — 외부 클로저 캡처 불가. 인자로 전달.
  const webglValues = {
    vendor: persona.fingerprint.webgl.vendor,
    renderer: persona.fingerprint.webgl.renderer,
  };

  await context.addInitScript(patchGetParameter, {
    webgl: webglValues,
    unmaskedVendor: UNMASKED_VENDOR_WEBGL,
    unmaskedRenderer: UNMASKED_RENDERER_WEBGL,
  });
}

/**
 * 페이지 컨텍스트에서 실행될 init script 본문.
 *
 * `WebGLRenderingContext.prototype.getParameter` 와 `WebGL2RenderingContext.prototype.
 * getParameter` 를 동일한 방식으로 패치해서 페르소나 벤더/렌더러 값을 반환.
 * 나머지 파라미터는 원본 호출로 위임.
 *
 * Why 파일 상단 상수로 추출: addInitScript 인자 함수는 Playwright 가 직렬화해
 * 페이지로 전달하므로 외부 스코프 캡처 불가. 인자 객체(`arg`)로 값 전달.
 */
function patchGetParameter(arg: {
  webgl: { vendor: string; renderer: string };
  unmaskedVendor: number;
  unmaskedRenderer: number;
}): void {
  const patch = (Ctor: unknown): void => {
    if (Ctor === undefined || Ctor === null) return;
    const proto = (Ctor as { prototype?: { getParameter?: (this: unknown, p: number) => unknown } }).prototype;
    if (!proto || typeof proto.getParameter !== 'function') return;
    const orig = proto.getParameter;
    proto.getParameter = function (p: number): unknown {
      if (p === arg.unmaskedVendor) return arg.webgl.vendor;
      if (p === arg.unmaskedRenderer) return arg.webgl.renderer;
      return orig.call(this, p);
    };
  };
  const g = globalThis as unknown as {
    WebGLRenderingContext?: unknown;
    WebGL2RenderingContext?: unknown;
  };
  patch(g.WebGLRenderingContext);
  patch(g.WebGL2RenderingContext);
}
