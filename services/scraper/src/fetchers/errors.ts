/**
 * Fetcher 계층 커스텀 에러 (CRAWLING_STRATEGY §11.1 참조).
 *
 * 모든 에러 클래스는 `Error` 를 상속하고 `name` 을 명시한다.
 * 상위 `SessionManager` 가 에러 타입별 cooldown/재시도 전략을 분기할 수 있도록
 * `instanceof` 가 신뢰 가능해야 하며, 타입 `switch` 대신 `instanceof` 를 선호한다
 * (tsc `verbatimModuleSyntax` 와 `isolatedModules` 환경에서 안전).
 *
 * ★ v3.2 A1: 이벤트명은 §13.3.2 `EventType` 리터럴과 **완전 일치** 시켜야 한다.
 * `notifyUser` 경로에서 런타임 `SEVERITY_MAP[type]` 이 undefined 가 되지 않도록
 * 에러 코드와 이벤트명을 분리 관리 — 여기선 에러 '코드' 만 다룬다.
 */

/**
 * robots.txt 규칙 위반으로 요청 자체를 포기한 경우 (CRAWLING_STRATEGY §26.1 D4).
 *
 * `isAllowed()` 가 `undefined` 인 경우도 보수적으로 `false` 취급 → 본 에러 발생.
 * 호출부는 이 에러를 **경고 로그 + 스킵** 으로 처리하고 재시도하지 않는다
 * (규칙을 어기는 건 의도된 설계에 반함).
 */
export class SkippedByRobotsError extends Error {
  override readonly name = 'SkippedByRobotsError';

  constructor(
    public readonly url: string,
    public readonly source: string,
  ) {
    super(`robots.txt disallows ${url} for source=${source}`);
  }
}

/**
 * 세션 치명 에러 — 즉시 세션 종료 + cooldown 진입.
 *
 * 사용 사례:
 * - Cloudflare challenge 60s 대기 타임아웃 (T3)
 * - 403 차단 감지
 * - patchright launch 실패 (환경 문제)
 *
 * Phase 5 `SessionManager` 가 이 에러를 관찰해 `applyCooldown()` 호출.
 */
export class SessionAbortError extends Error {
  override readonly name = 'SessionAbortError';

  constructor(
    public readonly reason: string,
    public readonly url?: string,
  ) {
    super(url ? `session aborted: ${reason} (url=${url})` : `session aborted: ${reason}`);
  }
}

/**
 * 일/세션 한도 초과 (RateLimitConfig §14.3).
 *
 * navigation/resource/direct 3종 중 어느 카운터가 소진됐는지 `kind` 로 구분.
 * 호출부는 한도 리셋(UTC+9 자정) 시점까지 해당 소스를 큐잉 해제한다.
 */
export class RateLimitExceededError extends Error {
  override readonly name = 'RateLimitExceededError';

  constructor(
    public readonly source: string,
    public readonly kind: 'navigation' | 'resource' | 'direct',
    public readonly limit: number,
    public readonly used: number,
  ) {
    super(`rate limit exceeded: source=${source} kind=${kind} used=${used}/${limit}`);
  }
}

/**
 * 티어별 페르소나가 필요한데 주입되지 않은 경우.
 *
 * FetcherFactory 가 T1~T3 생성 시 persona 누락을 즉시 감지해 이 에러를 throw —
 * "조용히 undefined 로 진행 후 launchPersistentContext 가 실패" 하는 지연 오류
 * 를 막는다. 개발 단계 프로그래밍 오류 시그널.
 */
export class PersonaRequiredError extends Error {
  override readonly name = 'PersonaRequiredError';

  constructor(
    public readonly source: string,
    public readonly tier: number,
  ) {
    super(`tier ${tier} source=${source} requires a BrowserPersona but none was provided`);
  }
}

/**
 * 캐시 경로 traversal 감지 (CRAWLING_STRATEGY §10.3 D1).
 *
 * path.resolve 결과가 `data/cache/<source>/` 하위가 아니면 즉시 throw.
 * 공격자가 `..` 를 포함한 URL 을 넘겨 임의 파일에 HTML 을 쓰는 시나리오 방지.
 */
export class CachePathTraversalError extends Error {
  override readonly name = 'CachePathTraversalError';

  constructor(
    public readonly source: string,
    public readonly resolved: string,
    public readonly baseDir: string,
  ) {
    super(`cache path traversal detected: source=${source} resolved=${resolved} base=${baseDir}`);
  }
}
