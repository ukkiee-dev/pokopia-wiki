/**
 * 브라우저 페르소나 타입 — CRAWLING_STRATEGY §5.1 / §5.3 A3 정리.
 *
 * Phase 4 까지는 Fetcher 가 즉시 소비하는 5 필드 (id/locale/timezone/
 * storageStatePath/usedFor) 만 있었다. Phase 5 에서 활성 시간·핑거프린트·프로필
 * 격리 필드를 **optional 로 확장**한다 — Phase 4 감사에서 확장 안전성 검증 완료
 * (기존 Fetcher 호출부는 새 필드를 참조하지 않아 깨지지 않음).
 *
 * ## 정체성 vs 런타임 상태 분리
 *
 * - **정체성 (불변)** — 이 타입과 `definitions.ts` 의 PERSONAS 상수에 담는다.
 *   한 번 정하면 "평생" 고정. 수정 시 쿠키·히스토리가 의미 잃음.
 * - **런타임 상태 (가변)** — `PersonaRuntimeState`. PersonaManager 가 파일
 *   (`data/state/persona-<id>.json`) 에 영속. 탐지 감점·워밍 완료·세션 사용
 *   이력 등 시간에 따라 변함.
 *
 * ## canvas/audio/fonts 는 ProfileFingerprint 에 포함하지 않음 (§5.3 A3)
 *
 * v3.1 까지 이 필드를 넣었으나 `attachFingerprint` 가 덮어쓰지 않는 dead field
 * 였다. v3.2 부터 `fingerprint-injector` 가 `<profilePath>/fingerprint.json` 에
 * 1회 생성해 영속하고, `attachFingerprint` 가 하드웨어 정체성과 합쳐 주입한다.
 *
 * ## `fingerprint.timezone` / `fingerprint.locale` 중복 이유
 *
 * 최상위 `locale` / `timezone` 은 Playwright `newContext()` 가 직접 쓰는 필드,
 * `fingerprint.locale` / `fingerprint.timezone` 은 init script 에서 `navigator`
 * 속성 주입용. 둘이 **동일 값** 이어야 함은 `definitions.ts` 의 책임.
 */

import type { SourceSite } from '@pokopia-wiki/shared';

/**
 * 하드웨어 결정형 정체성 (§5.3 A3). 프로필 생성 시 1회 랜덤화 → 평생 고정.
 *
 * Apple 실리콘 MacBook 기준 값. 두 페르소나가 **공유** — v2 의 "가짜 하드웨어
 * 다양성" 은 통계적으로 한 유저로 묶여 효과 없었음. 정체성 분리는 하드웨어가
 * 아닌 **시간** 으로 한다 (§5.1).
 */
export type ProfileFingerprint = {
  platform: 'MacIntel';
  hardwareConcurrency: number;
  deviceMemory: number;
  screen: { width: number; height: number; availWidth: number; availHeight: number };
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  webgl: { vendor: string; renderer: string };
  timezone: string;
  locale: string;
  languages: readonly string[];
};

/**
 * 활성 시간대 — 페르소나의 "사람다운 활동 시간" 범위 (§5.1).
 *
 * 경계: `start <= hour < end` (end 시각 포함 안 함).
 * 두 페르소나의 구간이 **겹치지 않도록** `definitions.ts` 에서 assertion.
 * Asia/Seoul 기준 0~23 정수.
 */
export type PersonaActiveHours = {
  start: number;
  end: number;
};

/**
 * Phase 4 + Phase 5 통합 BrowserPersona.
 *
 * Phase 4 필수 5 필드 + Phase 5 optional 확장 4 필드. Fetcher 에서는 Phase 4
 * 필드만 읽으므로 optional 확장이 기존 호출부를 깨지 않는다.
 *
 * - `id`: 로그/락 파일명. 공백·특수문자 없는 kebab-case (호출자 책임).
 * - `locale`: Playwright `newContext({ locale })` 주입값.
 * - `timezone`: Playwright `newContext({ timezoneId })` 주입값.
 * - `storageStatePath`: 쿠키/localStorage 영속 JSON 경로.
 * - `usedFor`: 담당 소스 목록. FetcherFactory 가 미스매치 감지에 사용.
 * - `profilePath`: `launchPersistentContext` 의 프로필 디렉토리. Phase 5 T1~T3
 *   에서 필수. 유저 Chrome 경로 (`~/Library/Application Support/Google/Chrome`
 *   등) 와 겹치지 않아야 한다 — PersonaManager 가 assertion.
 * - `activeHours`: PersonaManager 의 활성 선택 기준.
 * - `fingerprint`: FingerprintInjector 가 attach 시 병합.
 */
export type BrowserPersona = {
  id: string;
  locale: string;
  timezone: string;
  storageStatePath: string;
  usedFor: readonly SourceSite[];
  profilePath?: string;
  activeHours?: PersonaActiveHours;
  fingerprint?: ProfileFingerprint;
};

/**
 * 런타임 상태 — `data/state/persona-<id>.json` 에 영속.
 *
 * PersonaManager 의 `getState` / `saveState` / `touch` / `penalize` / `retire` /
 * `markWarmed` / `cooldown` 이 이 타입으로 I/O.
 *
 * - `healthScore`: 0~100. 탐지 신호 발생 시 감점 (§12.3). 0 이면 retire.
 * - `warmedUp`: §5.4 워밍 완료 여부. ProfileWarmer 가 세팅.
 * - `createdAt` / `lastUsed`: ISO 8601. `lastUsed` 가 null 이면 사용 전.
 * - `retired`: null 이 아니면 해당 페르소나는 활성 목록에서 제외.
 * - `cooldownUntil`: null 이 아니면 그 시각까지 페르소나 사용 금지 (Phase 6 §12.3
 *   healthScore < 50 → 2 주 cooldown). retire 와 달리 시각 만료 후 자동 복귀.
 */
export type PersonaRuntimeState = {
  id: string;
  healthScore: number;
  warmedUp: boolean;
  createdAt: string;
  lastUsed: string | null;
  retired: { at: string; reason: string } | null;
  cooldownUntil: string | null;
};
