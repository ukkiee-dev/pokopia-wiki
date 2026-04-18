/**
 * 로그 민감정보 마스킹 유틸 (CRAWLING_STRATEGY §22.3)
 *
 * `data/logs/` 경로는 외장 SSD 백업 대상이므로 토큰/쿠키/PII가
 * 그대로 기록되면 백업 미디어 유출 시 위험하다. 모든 `events.jsonl`
 * append 및 HTTP 요청/응답 로그 직전에 본 모듈을 거친다.
 *
 * 적용 지점:
 * - `events.jsonl` append 시 `redactObject(event)` 필수
 * - HTTP 요청/응답 로그의 `headers` / `set-cookie` / `cookie` 전체 마스킹
 * - 파싱 실패 시 저장하는 원본 HTML(`data/invalid/...`)은 본 유틸 적용 대상 아님
 *   (대신 `chmod 600`으로 파일 권한 강화)
 */

/**
 * CRAWLING_STRATEGY §22.3 TOKEN_PATTERNS.
 * 순서 의존: Telegram bot token → Bearer → sensitive cookies.
 *
 * 구현 주의: SSoT 원문은 Telegram 패턴 끝에 `\b` 워드 바운더리를 쓰지만,
 * bot token은 `[A-Za-z0-9_-]` 을 허용해 `-` 로 끝날 수 있다.
 * `-` 는 `\w` 에 속하지 않으므로 `\b` 가 끝자리 `-` 직전에 경계를 만들어
 * 토큰이 부분만 매칭되는 문제가 있어, 동치 의미의 부정 전후방 탐색
 * `(?![A-Za-z0-9_-])` 로 대체한다 — 토큰 문자 집합 바깥(공백/문장부호/EOF)에서
 * 종료됨을 명시적으로 보장.
 */
const TOKEN_PATTERNS: Array<[RegExp, string]> = [
  // Telegram bot token: 7-10자리 숫자 : 30+자 영숫자/-/_
  [/\b\d{7,10}:[A-Za-z0-9_-]{30,}(?![A-Za-z0-9_-])/g, '<TELEGRAM_TOKEN>'],
  // Authorization: Bearer <jwt-or-opaque>
  [/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer <REDACTED>'],
  // Cloudflare clearance / session / sid / auth 쿠키 — 값만 마스킹 (키는 보존)
  [/(cf_clearance|__cf_bm|session|sid|auth)=[^;\s,]+/gi, '$1=<REDACTED>'],
];

/**
 * 평문 문자열에서 민감 토큰을 마스킹한다.
 * @param text 로그로 기록하기 전의 원문
 * @returns 마스킹된 문자열 (원본 불변)
 */
export function redact(text: string): string {
  let out = text;
  for (const [pat, rep] of TOKEN_PATTERNS) {
    out = out.replace(pat, rep);
  }
  return out;
}

/**
 * 임의 객체를 `JSON.stringify` → `redact` → `JSON.parse` 로 왕복시켜
 * 내부 문자열 필드에 포함된 민감 토큰까지 마스킹한다.
 *
 * 주의: `undefined` / 함수 / 순환 참조는 `JSON.stringify` 단계에서 소실되므로
 * 로그 이벤트 객체(plain data) 이외에는 사용하지 않는다.
 */
export function redactObject<T>(obj: T): T {
  return JSON.parse(redact(JSON.stringify(obj))) as T;
}
