/**
 * BrowserPersona 타입 스텁 (Phase 4 — 타입 최소 선언, 구현 금지).
 *
 * CRAWLING_STRATEGY §5.1 의 완전한 `BrowserPersona` 인터페이스는 Phase 5 에서
 * 확장된다. Phase 4 Fetcher 인프라는 페르소나의 **최소 식별/격리 필드** 만 있으면
 * 동작 가능하므로 — PERSONAS 상수와 PersonaManager 는 Phase 5 로 미룬다.
 *
 * 이 모듈이 존재하는 이유:
 *  - Fetcher 시그니처(`FetchOptions.persona`) 가 타입을 요구
 *  - Factory 가 페르소나 누락을 타입/런타임에서 감지
 *  - 순환 import 방지 (Fetcher → Persona → PersonaManager 체인 차단)
 *
 * Phase 5 에서 할 일:
 *  - `activeHours`, `healthScore`, `warmedUp`, `fingerprint` 전체 필드 추가
 *  - `PERSONAS` 상수 (korean-pokemon-fan / namuwiki-researcher) 정의
 *  - `PersonaManager` (select / touch / retire) 구현
 */

import type { SourceSite } from '@pokopia-wiki/shared';

/**
 * Phase 4 에서 Fetcher 가 즉시 소비하는 필드만 포함.
 *
 * - `id`: 로그/락 파일명에 사용. 공백·특수문자 없는 kebab-case 강제 (호출자 책임).
 * - `locale`: Playwright `newContext({ locale })` 주입.
 * - `timezone`: Playwright `newContext({ timezoneId })` 주입.
 * - `storageStatePath`: 쿠키/localStorage 영속 경로 — Phase 5 에서 이 값을
 *   기반으로 `launchPersistentContext(profilePath)` 도 결정한다.
 * - `usedFor`: 페르소나가 담당할 소스 목록. FetcherFactory 가 "잘못된 페르소나
 *   주입" 을 감지할 때 사용.
 */
export type BrowserPersona = {
  id: string;
  locale: string;
  timezone: string;
  storageStatePath: string;
  usedFor: readonly SourceSite[];
};
