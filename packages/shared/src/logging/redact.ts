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
 * CRAWLING_STRATEGY §22.3 TOKEN_PATTERNS (v3.3, 2026-04-19 확장).
 * 순서 의존: Telegram → Bearer → Basic → OAuth JSON → sensitive cookies.
 *
 * 각 패턴 근거:
 * - **Telegram**: 원문 `\b` 워드 바운더리는 `-` (∉ `\w`) 로 끝나는 토큰을 조기 종료시키므로
 *   동치 의미의 `(?![A-Za-z0-9_-])` 로 대체. 공백/문장부호/EOF 에서 정상 종료.
 * - **Bearer/Basic**: base64 padding 문자(`+`, `/`, `=`)를 포함해야 RFC 7617/7519 토큰을
 *   온전히 매칭한다. 단순 JWT base64url (`A-Za-z0-9_-`) 과 표준 base64 (`A-Za-z0-9+/=`) 동시 커버.
 * - **OAuth JSON**: Authorization 헤더를 경유하지 않는 응답 body (`{"access_token": "..."}`)
 *   에서도 마스킹. key 는 보존하고 value 만 `<REDACTED>` 처리해 구조 파악 여지 유지.
 * - **Cookies**: cf_* (Cloudflare), session/sid/auth (일반), csrf/xsrf/_csrf (위조 방지),
 *   refresh/jwt/token (OIDC/OAuth). `.` 을 허용해 JWT dot-separated 값도 매칭.
 */
const TOKEN_PATTERNS: Array<[RegExp, string]> = [
  // Telegram bot token: 7-10자리 숫자 : 30+자 영숫자/-/_
  [/\b\d{7,10}:[A-Za-z0-9_-]{30,}(?![A-Za-z0-9_-])/g, '<TELEGRAM_TOKEN>'],
  // HTTP Authorization: Bearer <jwt|opaque> (base64 padding +/= 포함)
  [/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, 'Bearer <REDACTED>'],
  // HTTP Authorization: Basic <base64(user:pass)>
  [/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic <REDACTED>'],
  // OAuth/OIDC JSON body: "access_token" / "refresh_token" / "id_token"
  [/"(access_token|refresh_token|id_token)"\s*:\s*"[^"]*"/gi, '"$1":"<REDACTED>"'],
  // 민감 쿠키 값 마스킹 (키 보존):
  //   cf_*, session/sid/auth, csrf/xsrf/_csrf, refresh/jwt/token
  // `\b` 단어 경계 — 짧은 키(`token`)가 `BOT_TOKEN=` 같은 합성어에 오인 매칭되는 것 방지.
  [/\b(cf_clearance|__cf_bm|session|sid|auth|csrf|xsrf|_csrf|refresh|jwt|token)=[^;\s,]+/gi, '$1=<REDACTED>'],
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
 * 주의:
 * - `undefined` / 함수 / `Symbol` 값은 `JSON.stringify` 에서 소실
 * - `BigInt` / 순환 참조는 `JSON.stringify` 에서 `TypeError` throw
 *
 * 로그 유실을 막기 위해 throw 시 `__redact_error` 마커를 포함한 fallback 객체를
 * 반환한다. 호출자가 로그 이벤트 관찰로 실패 징후를 감지할 수 있도록
 * 원인 메시지를 함께 기록.
 */
export function redactObject<T>(obj: T): T {
  try {
    return JSON.parse(redact(JSON.stringify(obj))) as T;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { __redact_error: reason } as unknown as T;
  }
}
