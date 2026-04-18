/**
 * Notifier 런타임 설정 로더 (CRAWLING_STRATEGY §13.3.4).
 *
 * Phase 3 뼈대 단계이므로 §13.3.4 원문의 Zod 검증은 Phase 7 에서 완성한다.
 * 여기서는 `process.env` 를 읽어 다음 세 상태 중 하나를 돌려준다:
 *   1. `enabled=true`  + Telegram 완전 설정 → Telegram 채널 실사용
 *   2. `enabled=false` + Telegram 부분/누락 → console 만 (fallback)
 *   3. `enabled=false` + `NOTIFICATIONS_ENABLED=false` → 명시적 비활성
 *
 * `macOSFallback` 은 Telegram 이 비활성일 때 로컬 터미널 인지도를
 * 확보하는 2차 경로. Phase 7 에서 osascript/terminal-notifier 연동 추가 예정.
 */

/** Telegram 채널 구성. `criticalChatId` 누락 시 `chatId` 로 폴백. */
export type NotifierTelegramConfig = {
  botToken: string;
  chatId: string;
  criticalChatId?: string;
};

/**
 * Notifier 공개 설정.
 *
 * - `enabled=false` 면 모든 `notify()` 호출이 console fallback 으로만 흐른다.
 * - `telegram=null` 이면 Telegram 송신을 완전히 건너뛴다 (토큰/챗ID 미설정).
 * - `macOSFallback=true` 는 Phase 7 에서 로컬 알림음/배너를 띄울 때 켠다.
 *   현재 뼈대 단계에서는 참조만 되고 실제 osascript 호출은 없다.
 */
export type NotifierConfig = {
  enabled: boolean;
  telegram: NotifierTelegramConfig | null;
  macOSFallback: boolean;
};

/** `NOTIFICATIONS_ENABLED` 문자열을 boolean 으로 정규화 (미설정=false). */
function parseEnabledFlag(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/** Telegram bot token 의 얕은 검증 — `123456789:AA...` 패턴. */
function isPlausibleTelegramToken(raw: string | undefined): raw is string {
  if (!raw) return false;
  // 7~10 자리 숫자 : 30+ 영숫자/-/_
  return /^\d{7,10}:[A-Za-z0-9_-]{30,}$/.test(raw.trim());
}

/** Telegram chat id — 음수(group) 허용. `-?\d+` 만 수용. */
function isPlausibleChatId(raw: string | undefined): raw is string {
  if (!raw) return false;
  return /^-?\d+$/.test(raw.trim());
}

/**
 * env 로부터 Notifier 설정 로드.
 *
 * 관측 가능한 결과 매트릭스:
 *
 * | TELEGRAM_BOT_TOKEN | TELEGRAM_CHAT_ID | NOTIFICATIONS_ENABLED | enabled | telegram |
 * |--------------------|------------------|-----------------------|---------|----------|
 * | 정상               | 정상             | true                  | true    | 객체     |
 * | 정상               | 정상             | false/미설정          | false   | 객체     |
 * | 정상               | 누락             | true                  | false   | null     |
 * | 누락               | -                | -                     | false   | null     |
 * | 형식 오류          | -                | -                     | false   | null     |
 *
 * 즉 **enabled=true 는 "모든 조건 충족"** 때만. Telegram 설정이 있어도
 * 플래그가 꺼져 있으면 객체는 남겨두고(`telegram !== null`) `enabled=false`
 * 를 반환해, Phase 7 에서 관리자가 설정만 확인하고 싶을 때의 실험 경로를 보존한다.
 */
export function loadNotifierConfig(): NotifierConfig {
  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  const chatId = process.env['TELEGRAM_CHAT_ID'];
  const criticalChatIdRaw = process.env['TELEGRAM_CHAT_ID_CRITICAL'];
  const enabledFlag = parseEnabledFlag(process.env['NOTIFICATIONS_ENABLED']);

  const tokenOk = isPlausibleTelegramToken(botToken);
  const chatOk = isPlausibleChatId(chatId);
  const criticalOk = isPlausibleChatId(criticalChatIdRaw);

  if (!tokenOk || !chatOk) {
    return {
      enabled: false,
      telegram: null,
      macOSFallback: true,
    };
  }

  return {
    enabled: enabledFlag,
    telegram: {
      botToken,
      chatId,
      ...(criticalOk ? { criticalChatId: criticalChatIdRaw } : {}),
    },
    macOSFallback: true,
  };
}
