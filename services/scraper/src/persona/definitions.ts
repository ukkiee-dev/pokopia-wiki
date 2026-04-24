/**
 * 페르소나 상수 — CRAWLING_STRATEGY §5.1 (v3 축소).
 *
 * 2 페르소나를 **시간으로 분리**. 같은 공인 IP·같은 하드웨어라도 활성 시간대가
 * 겹치지 않으면 탐지기 관점에서 "한 유저의 두 세션" 으로 클러스터링되지 않음.
 *
 * v2 의 4 페르소나는 통계적으로 한 유저로 묶여 격리 효과 없이 관리 비용만
 * 증가 — v3 는 시간 분리로 대체.
 *
 * ## 하드웨어 공유
 *
 * 두 페르소나가 `M4_FINGERPRINT` 를 공유하는 건 의도. "같은 유저가 서로 다른
 * 시간대·맥락으로 활동" 을 모델링 — v2 처럼 가짜 하드웨어 다양성을 흉내내지 않음.
 *
 * ## 경로 규칙
 *
 * `storageStatePath` / `profilePath` 는 repo root 기준 상대 경로. 실제 해석은
 * `PersonaManager` 가 `repoPath()` 로 수행 (유저 Chrome 경로와 격리).
 */

import type { BrowserPersona, ProfileFingerprint } from './types.js';

/**
 * Apple M4 기준 하드웨어 핑거프린트 공통값 (§5.3 "하드웨어 결정형 정체성").
 *
 * 값 기준:
 *   - `hardwareConcurrency: 10` — M4 Pro/Max 실측 (M4 무인 10~12 코어).
 *   - `deviceMemory: 16` — 16GB 구성. 웹은 0/0.25/0.5/1/2/4/8 bucket 으로 반올림.
 *   - `screen` 1920x1200 — Retina 논리 픽셀 기준 표준 데스크톱 해상도.
 *     `availHeight = height - 25` (macOS 메뉴바 추정).
 *   - `viewport` 1440x900 — 기본 Chrome 창 크기.
 *   - `deviceScaleFactor: 2` — Retina.
 *   - `webgl` — "Apple M4" renderer 로 일관성. §9.1.1 A3 에 따라 canvas/audio/
 *     fonts seed 는 여기 포함 안 함 (`<profilePath>/fingerprint.json` 영속).
 */
const M4_FINGERPRINT: ProfileFingerprint = {
  platform: 'MacIntel',
  hardwareConcurrency: 10,
  deviceMemory: 16,
  screen: { width: 1920, height: 1200, availWidth: 1920, availHeight: 1175 },
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  webgl: { vendor: 'Apple Inc.', renderer: 'Apple M4' },
  timezone: 'Asia/Seoul',
  locale: 'ko-KR',
  languages: ['ko-KR', 'ko', 'en-US', 'en'] as const,
};

/**
 * `korean-pokemon-fan` — T1 (PokopiaGuide) + T2 (pokopoko) 공유 페르소나.
 *
 * **08~14 KST** (오전~점심). 한국 포켓몬 팬이 출근 전·점심 시간에 공략 사이트
 * 를 돌아보는 행동 모델. T1 과 T2 를 같은 페르소나가 처리하되 **세션 하나에
 * 한 사이트만** — 왕복은 탐지 시그널 (§5.1).
 */
const KOREAN_POKEMON_FAN: BrowserPersona = {
  id: 'korean-pokemon-fan',
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
  storageStatePath: 'data/browser-profiles/korean-pokemon-fan/storageState.json',
  usedFor: ['pokopiaGuide', 'pokopoko'],
  profilePath: 'data/browser-profiles/korean-pokemon-fan',
  activeHours: { start: 8, end: 14 },
  fingerprint: M4_FINGERPRINT,
};

/**
 * `namuwiki-researcher` — T3 (namu.wiki) 전용 페르소나.
 *
 * **19~23 KST** (저녁). namu.wiki 는 Cloudflare 방어가 가장 엄격하고 CF 쿠키
 * 유지가 중요 → T1/T2 페르소나와 **분리** 해 CF 세션을 보존. 저녁은 리서치용
 * 장시간 탐색에 자연스러운 시간대.
 */
const NAMUWIKI_RESEARCHER: BrowserPersona = {
  id: 'namuwiki-researcher',
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
  storageStatePath: 'data/browser-profiles/namuwiki-researcher/storageState.json',
  usedFor: ['namuwiki'],
  profilePath: 'data/browser-profiles/namuwiki-researcher',
  activeHours: { start: 19, end: 23 },
  fingerprint: M4_FINGERPRINT,
};

/**
 * Phase 5 활성 페르소나 2인.
 *
 * T0 (Serebii) 는 페르소나 불필요 — ky 로 직접 HTTP 요청 (§5.1 주석).
 * FetcherFactory 가 `source === 'serebii'` 일 때 persona 인자를 무시한다.
 */
export const PERSONAS: readonly BrowserPersona[] = [KOREAN_POKEMON_FAN, NAMUWIKI_RESEARCHER];

/**
 * activeHours 가 겹치지 않는지 모듈 load 시 즉시 검증.
 *
 * Why: §5.1 시간 분리 규칙의 핵심 — 두 페르소나가 같은 IP 에서 동시에 활동하면
 * 탐지기가 "한 유저의 두 세션" 으로 묶어 격리 효과 붕괴. PERSONAS 수정 시 조기
 * 실패로 런타임 사고를 차단 (Phase 4 OPS-002 assertion 패턴과 동일).
 */
function assertNoActiveHoursOverlap(): void {
  const windows = PERSONAS.flatMap((p) =>
    p.activeHours ? [{ id: p.id, start: p.activeHours.start, end: p.activeHours.end }] : [],
  );
  for (const [i, a] of windows.entries()) {
    for (const b of windows.slice(i + 1)) {
      if (a.start < b.end && b.start < a.end) {
        throw new Error(`persona activeHours overlap: ${a.id} [${a.start},${a.end}) ∩ ${b.id} [${b.start},${b.end})`);
      }
    }
  }
}

assertNoActiveHoursOverlap();
