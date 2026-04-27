/**
 * Telegram Bot API client — CRAWLING_STRATEGY §13.3.5 / §13.3.6 (B8).
 *
 * Notifier 본체에서 분리한 이유:
 *   1. verifyBotIdentity (부팅 시 getMe) 와 sendTelegramMessage 를 같은 모듈에서
 *      재사용 — 공통 응답 파싱·에러 매핑 로직 단일화.
 *   2. Phase 7 이전 index.ts 에 인라인 되어 있던 Telegram 호출을 외부화해
 *      단위 테스트 때 HTTP layer 를 mock 교체 용이.
 *
 * ## §13.3.6 B8 — `ok: false` 패턴 방어
 *
 *   Telegram API 는 HTTP 200 + `{ ok: false, description, error_code }` 로 실패를
 *   알려주는 경우가 있다. ky 의 `throwHttpErrors` 는 4xx/5xx 만 잡으므로 본 파일은
 *   응답 body 의 `ok` 필드를 명시적으로 검증한다.
 *
 * ## 시크릿 관리
 *
 *   token 은 URL 에 포함되어 전송. 에러 메시지에 URL 이 섞여 로그로 흘러가지 않도록
 *   호출부(Notifier) 가 `redact()` 를 적용. 본 파일은 redact 를 직접 하지 않는다 —
 *   도메인 분리.
 */

import ky from 'ky';

/** `getMe` 응답 의미 있는 필드. Telegram 이 반환하는 나머지 필드는 무시. */
type TelegramGetMeResponse = {
  ok: boolean;
  description?: string;
  error_code?: number;
  result?: { username?: string; id?: number };
};

/** `sendMessage` 응답. 본문은 ok 필드만 확인. */
type TelegramSendMessageResponse = {
  ok: boolean;
  description?: string;
  error_code?: number;
};

export type VerifyResult =
  | { readonly ok: true; readonly username: string }
  | { readonly ok: false; readonly reason: string };

const DEFAULT_VERIFY_TIMEOUT_MS = 5_000;
const DEFAULT_SEND_TIMEOUT_MS = 10_000;
const DEFAULT_SEND_RETRIES = 2;

/**
 * `getMe` 로 bot 식별 확인. 실패 케이스를 예외 대신 `{ ok: false, reason }` 로
 * 표현해 호출부가 try/catch 없이 분기할 수 있다.
 *
 * - 성공: `{ ok: true, username: '<bot_username>' }`
 * - HTTP 에러: `{ ok: false, reason: 'HTTP 401 Unauthorized' }` (ky 가 throw 한 메시지)
 * - API ok=false: `{ ok: false, reason: 'getMe ok=false code=401 Unauthorized' }`
 * - 타임아웃·네트워크: `{ ok: false, reason: 'TimeoutError: ...' }`
 */
export async function verifyBotIdentity(token: string, timeoutMs = DEFAULT_VERIFY_TIMEOUT_MS): Promise<VerifyResult> {
  const url = `https://api.telegram.org/bot${token}/getMe`;
  try {
    const response = await ky.get(url, { timeout: timeoutMs, retry: 0 }).json<TelegramGetMeResponse>();
    if (!response.ok || !response.result?.username) {
      return {
        ok: false,
        reason: `getMe ok=false code=${response.error_code ?? '-'} ${response.description ?? 'unknown'}`,
      };
    }
    return { ok: true, username: response.result.username };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason };
  }
}

/**
 * `sendMessage` 로 텍스트 1건 송신. HTTP 실패는 throw, API `ok: false` 는 명시 Error.
 *
 * `disable_notification=!withSound` — critical 만 소리(=withSound=true).
 * retry 기본 2회: ky 가 exponential backoff 로 1s, 2s 후 재시도.
 */
export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  options: { withSound: boolean; timeoutMs?: number; retryLimit?: number },
): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await ky
    .post(url, {
      json: {
        chat_id: chatId,
        text,
        disable_notification: !options.withSound,
        disable_web_page_preview: true,
      },
      timeout: options.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS,
      retry: { limit: options.retryLimit ?? DEFAULT_SEND_RETRIES },
    })
    .json<TelegramSendMessageResponse>();
  if (!response.ok) {
    throw new Error(
      `Telegram API ok=false: code=${response.error_code ?? '-'} ${response.description ?? 'unknown'}`,
    );
  }
}
