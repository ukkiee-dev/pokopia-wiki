/**
 * Notifier 이벤트 분류 (CRAWLING_STRATEGY §13.3.2, v3.2 A1 반영).
 *
 * 이벤트 네이밍은 dotted namespace. Dedup/배칭 대상이 되므로 정확히 여기 정의된
 * 리터럴만 사용한다. 새 이벤트 추가 시:
 *   1. `EventType` union 에 리터럴 추가
 *   2. `SEVERITY_MAP` 에 대응 severity 등록 (누락 시 런타임 에러)
 *   3. 문서 §13.3.2 테이블에도 반영 (doc-strategist 위임)
 */

/**
 * 이벤트 심각도 — `SEVERITY_MAP` 이 모든 `EventType` 을 커버해야 한다.
 *
 * `low` 등급은 §13.3.3 라우팅 표에는 없지만, Phase 7 완성 단계에서 세밀한
 * 티어링이 필요해질 가능성에 대비해 예약만 해 둔다. 현재는 실제로 부여하지
 * 않지만 타입 레벨에서 허용한다.
 */
export type Severity = 'low' | 'info' | 'warn' | 'high' | 'critical';

/**
 * CRAWLING_STRATEGY §13.3.2 EventType 전체.
 *
 * v3.2 A1: `notifyUser` 호출 시 문자열 오타로 `SEVERITY_MAP[type]` 이
 * undefined 가 되는 사고를 방지하기 위해 타입 리터럴로 고정.
 */
export type EventType =
  // 라이프사이클
  | 'scraper.start'
  | 'scraper.stop'
  | 'phase.start'
  | 'phase.complete'
  | 'session.start'
  | 'session.end'
  // 진행
  | 'milestone.progress'
  | 'milestone.daily_summary'
  // 경고
  | 'rate_limit.approaching'
  | 'health.score_dropped'
  | 'soft_throttle.detected'
  // 차단/탐지
  | 'block.403'
  | 'block.429'
  | 'cloudflare.challenge_timeout'
  | 'captcha.detected'
  | 'captcha.unresolved'
  // 치명적
  | 'persona.retired'
  | 'scraper.crashed'
  | 'network.inconsistency'
  | 'data.integrity_failure'
  // v3.2 추가
  | 'scheduler.persona_conflict'
  | 'chrome.version_bump'
  | 'robots.changed';

/**
 * `EventType` → `Severity` 매핑 (CRAWLING_STRATEGY §13.3.2 원문 그대로).
 *
 * 런타임에 `SEVERITY_MAP[event]` 가 `undefined` 면 Notifier 가 즉시 에러를
 * 로깅하고 이벤트를 무시한다. 즉, 이 맵 누락은 조용한 실패가 아니라 명시적
 * 경로다. TypeScript `Record<EventType, Severity>` 제약 덕에 누락된 키는
 * 컴파일 타임에 에러.
 */
export const SEVERITY_MAP: Record<EventType, Severity> = {
  // 라이프사이클
  'scraper.start': 'info',
  'scraper.stop': 'info',
  'phase.start': 'info',
  'phase.complete': 'info',
  'session.start': 'info',
  'session.end': 'info',
  // 진행
  'milestone.progress': 'info',
  'milestone.daily_summary': 'info',
  // 경고
  'rate_limit.approaching': 'warn',
  'health.score_dropped': 'warn',
  'soft_throttle.detected': 'warn',
  // 차단/탐지
  'block.403': 'high',
  'block.429': 'high',
  'cloudflare.challenge_timeout': 'high',
  'captcha.detected': 'critical',
  'captcha.unresolved': 'critical',
  // 치명적
  'persona.retired': 'critical',
  'scraper.crashed': 'critical',
  'network.inconsistency': 'critical',
  'data.integrity_failure': 'high',
  // v3.2 추가
  'scheduler.persona_conflict': 'critical',
  'chrome.version_bump': 'info',
  'robots.changed': 'warn',
};

/**
 * 영구 로그·알림 본문에 실리는 정규화된 이벤트 레코드.
 *
 * - `ts` 는 ISO8601 (UTC) — 파일 정렬 가능성 유지.
 * - `meta` 는 마스킹 이후의 `Record<string, unknown>`. 재귀 구조는 피하고
 *   단순 key/value 만 전달하길 권장.
 */
export type NotifierEvent = {
  event: EventType;
  severity: Severity;
  ts: string;
  meta: Record<string, unknown>;
};

/**
 * `SEVERITY_MAP` 조회 헬퍼 — 타입 리터럴이 아닌 값이 들어오는 경계 지점
 * (예: CLI 인자) 에서 사용. 미등록 이벤트는 `undefined` 를 돌려준다.
 */
export function severityOf(event: EventType): Severity {
  return SEVERITY_MAP[event];
}
