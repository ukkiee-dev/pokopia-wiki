/**
 * ProfileWarmer — CRAWLING_STRATEGY §5.4 (Phase -2 프로필 워밍).
 *
 * 새 프로필은 즉시 스크래핑하면 탐지됨. Chrome 을 실제로 띄워 사람다운 탐색
 * 트래픽을 쌓아 쿠키·히스토리·localStorage 가 자연스럽게 축적되도록 한다.
 *
 * ## 규칙 (§5.4)
 *
 *   - **파일 직접 편집 금지**: Chrome `Bookmarks` / LevelDB / SQLite 조작은
 *     프로필 손상 거의 확실. 브라우저 API (쿠키/localStorage/IndexedDB) 로만 축적.
 *   - **headful 필수**: headless 자체가 탐지 신호 (§9.1).
 *   - **공용 사이트 → 타겟 홈** 순서로 dwell + 부분 스크롤.
 *   - 완료 시 `PersonaManager.markWarmed()` 로 `warmedUp = true`.
 *
 * ## 브라우저 드라이버 선택
 *
 *   - 페르소나가 `namuwiki` 담당 → patchright (T3 대상 동일 브라우저로 워밍).
 *   - 그 외(PokopiaGuide/pokopoko) → playwright 순정 (T1/T2 대상).
 *   - 각각 `attachFingerprint` / `maybeReinforceWebgl` 호출.
 *
 * ## 타임박스 (v3 축소)
 *
 *   - v2 의 2~3일은 근거 없음. v3: **1일 3 세션 × 20~40분**.
 *   - `warm()` 1 회 호출은 1 세션. 실제 운용은 `scripts/warm-persona.ts` 반복.
 *
 * ## Lint
 *
 *   워밍은 "사람이 한 사이트 보고 다음 사이트로 이동" 하는 **순차적** 행동을
 *   모델링한다. 병렬화는 의도에 반하므로 `no-await-in-loop` 을 파일 단위로
 *   disable.
 */

/* oxlint-disable no-await-in-loop */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium as patchrightChromium } from 'patchright';
import { chromium as playwrightChromium } from 'playwright';

import { attachFingerprint } from '../fingerprint/inject.js';
import { maybeReinforceWebgl } from '../fingerprint/patchright-webgl.js';
import type { PersonaManager } from './manager.js';
import type { BrowserPersona } from './types.js';

/** 한국 페르소나에 자연스러운 공용 방문처 (§5.4 원문). */
const COMMON_SITES: readonly { url: string; dwellMs: readonly [number, number] }[] = [
  { url: 'https://www.naver.com', dwellMs: [20_000, 60_000] },
  { url: 'https://www.youtube.com', dwellMs: [30_000, 90_000] },
  { url: 'https://news.naver.com', dwellMs: [15_000, 45_000] },
];

/** 페르소나 id → 타겟 도메인 홈 URL. 스크래핑 대상 상세 페이지가 아님에 유의. */
const WARMUP_TARGETS: Readonly<Record<string, readonly string[]>> = {
  'korean-pokemon-fan': ['https://www.pokopiaguide.com/ko/'],
  'namuwiki-researcher': ['https://namu.wiki/w/%EB%8C%80%EB%AC%B8'],
};

/** 타겟 홈 방문 시 dwell 시간 (ms). */
const TARGET_DWELL_MS: readonly [number, number] = [10_000, 30_000];

/** 기본 뷰포트 — `persona.fingerprint?.viewport` 가 없을 때 fallback. */
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

/**
 * 워머가 사용하는 최소 Page 인터페이스.
 *
 * playwright / patchright 의 `Page` 는 서로 다른 class (독립 패키지)라 union 으로
 * 쓰면 TS 의 구조적 타이핑 엔진이 대형 generic 메서드에서 충돌. 그 중 워밍에서
 * 실제로 호출하는 3 개 메서드만 선언해 드라이버 결합을 끊는다.
 */
type WarmablePage = {
  goto(url: string): Promise<unknown>;
  waitForLoadState(state: 'domcontentloaded'): Promise<unknown>;
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
};

type WarmableContext = {
  newPage(): Promise<WarmablePage>;
  close(): Promise<void>;
};

export class ProfileWarmer {
  constructor(private readonly manager: PersonaManager) {}

  /**
   * 1회 워밍 세션 실행.
   *
   * 같은 페르소나에 대해 이 메서드를 여러 번 호출해 "1일 3회" 운용 — 병렬
   * 호출은 하지 말 것 (Chrome persistent profile lock 충돌).
   */
  async warm(persona: BrowserPersona): Promise<void> {
    this.assertReady(persona);
    const profileDir = path.resolve(persona.profilePath);
    await mkdir(profileDir, { recursive: true });

    if (persona.usedFor.includes('namuwiki')) {
      await this.warmWithPatchright(persona, profileDir);
    } else {
      await this.warmWithPlaywright(persona, profileDir);
    }

    await this.manager.markWarmed(persona.id);
  }

  private async warmWithPlaywright(persona: BrowserPersona, profileDir: string): Promise<void> {
    const context = await playwrightChromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: false,
      locale: persona.locale,
      timezoneId: persona.timezone,
      viewport: persona.fingerprint?.viewport ?? DEFAULT_VIEWPORT,
    });
    try {
      await attachFingerprint(context, persona);
      await this.browseSession(context as unknown as WarmableContext, persona.id);
    } finally {
      await context.close();
    }
  }

  private async warmWithPatchright(persona: BrowserPersona, profileDir: string): Promise<void> {
    const context = await patchrightChromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: false,
      locale: persona.locale,
      timezoneId: persona.timezone,
      viewport: persona.fingerprint?.viewport ?? DEFAULT_VIEWPORT,
    });
    try {
      await maybeReinforceWebgl(context, persona);
      await this.browseSession(context as unknown as WarmableContext, persona.id);
    } finally {
      await context.close();
    }
  }

  /**
   * 공용 사이트 방문 → 타겟 홈 방문. 순차 실행은 워밍의 설계 의도.
   */
  private async browseSession(context: WarmableContext, personaId: string): Promise<void> {
    const page = await context.newPage();

    for (const site of COMMON_SITES) {
      await page.goto(site.url);
      await page.waitForLoadState('domcontentloaded');
      await humanDwell(site.dwellMs[0], site.dwellMs[1]);
      await humanScrollPartial(page);
    }

    const targets = WARMUP_TARGETS[personaId] ?? [];
    for (const url of targets) {
      await page.goto(url);
      await page.waitForLoadState('domcontentloaded');
      await humanDwell(TARGET_DWELL_MS[0], TARGET_DWELL_MS[1]);
    }
  }

  private assertReady(persona: BrowserPersona): asserts persona is BrowserPersona & { profilePath: string } {
    if (persona.profilePath === undefined) {
      throw new Error(`persona "${persona.id}" lacks profilePath — cannot warm`);
    }
  }
}

/**
 * 일정 범위 내 랜덤 대기. Phase 6 `behavior/ghost-cursor.ts` 에서 고도화 예정 —
 * 현재는 워머 전용 간단 구현.
 */
async function humanDwell(minMs: number, maxMs: number): Promise<void> {
  const duration = minMs + Math.random() * (maxMs - minMs);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, duration);
  });
}

/**
 * 부분 스크롤 — 페이지 상단~중간까지 몇 번에 걸쳐 내려 본다. 100% 스크롤은 과도
 * (§7.2). 페이지 컨텍스트에서 실행되므로 내부 `sleep` 은 외부로 이동 불가.
 */
async function humanScrollPartial(page: WarmablePage): Promise<void> {
  await page.evaluate(async () => {
    // eslint-disable-next-line unicorn/consistent-function-scoping -- page context 내 local helper
    const sleep = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });
    const steps = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < steps; i += 1) {
      window.scrollBy(0, 100 + Math.random() * 200);
      await sleep(150 + Math.random() * 250);
    }
  });
}
