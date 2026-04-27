/**
 * FetcherFactory (CRAWLING_STRATEGY §4.2, §23.1).
 *
 * 역할:
 *   - `SourceSite` → `Tier` 매핑 (`resolveTier`).
 *   - `Tier` → 구현체 선택 (`createFetcher`).
 *   - 페르소나 필요 티어에 페르소나가 누락되면 즉시 throw.
 *
 * 왜 factory 인가:
 *   - 호출부가 4 개 구현체의 생성자 차이를 알 필요 없음 (dependency inversion).
 *   - Phase 5 에서 `PersonaManager` 가 주입되면 `createFetcher(source)` 내부에서
 *     자동 선택 가능 (현재는 caller 가 persona 전달).
 *
 * switch exhaustiveness:
 *   - `resolveTier` 의 `switch` 는 `never` fallback 으로 TS 컴파일 시 누락 방지.
 */

import type { SourceSite } from '@pokopia-wiki/shared';

import { PersonaRequiredError } from './errors.js';
import { KyFetcher } from './ky-fetcher.js';
import { PatchrightCfFetcher } from './patchright-cf-fetcher.js';
import { PatchrightFetcher } from './patchright-fetcher.js';
import { PlaywrightFetcher } from './playwright-fetcher.js';
import type { Fetcher, FetcherDeps, Tier } from './types.js';

/**
 * 소스별 티어 매핑 — §1.3 결정 표 그대로.
 *
 * `switch(source)` 대신 `Record` 를 쓰고 싶지만 TypeScript 가 `Record<SourceSite, Tier>`
 * 누락 키 검사에 relaxation 이 없는 케이스가 있어, exhaustive `switch` + `never`
 * fallback 이 안전하다.
 */
export function resolveTier(source: SourceSite): Tier {
  switch (source) {
    case 'serebii':
      return 0;
    case 'pokopiaGuide':
      return 1;
    case 'pokopoko':
      return 2;
    case 'namuwiki':
      return 3;
    default: {
      const never: never = source;
      throw new Error(`resolveTier: unknown source=${String(never)}`);
    }
  }
}

/**
 * Factory — `source` + deps 로 적절한 Fetcher 인스턴스 반환.
 *
 * T1~T3 에서 `deps.persona` 누락 시 `PersonaRequiredError` — 타입상 optional 이지만
 * 런타임에서 명시적으로 실패시킨다.
 *
 * 재사용 주의:
 *   - 반환된 Fetcher 는 내부 브라우저 컨텍스트를 **재사용** 한다.
 *   - 여러 세션에 걸쳐 같은 인스턴스를 공유하지 말 것 — `close()` 호출 시점에
 *     명확한 수명 종료가 필요.
 */
export function createFetcher(source: SourceSite, deps: FetcherDeps): Fetcher {
  const tier = resolveTier(source);
  switch (tier) {
    case 0:
      return new KyFetcher(deps.robots, deps.cache);
    case 1: {
      if (!deps.persona) throw new PersonaRequiredError(source, 1);
      return new PlaywrightFetcher(source, deps.robots, deps.cache, deps.persona);
    }
    case 2: {
      if (!deps.persona) throw new PersonaRequiredError(source, 2);
      return new PatchrightFetcher(source, deps.robots, deps.cache, deps.persona);
    }
    case 3: {
      if (!deps.persona) throw new PersonaRequiredError(source, 3);
      return new PatchrightCfFetcher(source, deps.robots, deps.cache, deps.persona);
    }
    default: {
      const never: never = tier;
      throw new Error(`createFetcher: unknown tier=${String(never)}`);
    }
  }
}
