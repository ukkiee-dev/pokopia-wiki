/**
 * macOS 로컬 알림 — CRAWLING_STRATEGY §13.3.5 / §13.3.3.
 *
 * Notifier 본체에서 분리한 이유:
 *   1. AppleScript 인젝션 방어 원칙(§13.3.1) 을 한 곳에 격리.
 *   2. darwin 플랫폼 분기를 호출부에서 없애 Notifier 의 분기를 단순화.
 *
 * ## 인젝션 방어
 *
 *   `execFile('osascript', ['-e', script, title, subtitle, body])` 형태로 AppleScript
 *   에 argv 로 값을 전달. osascript 내부에서 `item 1/2/3 of argv` 로 읽기 때문에
 *   쉘 escape 가 불필요하고 개행·따옴표 조합 주입이 원천 차단된다.
 *
 *   v2 의 `.replace(/"/g, '\\"')` 직접 삽입은 AppleScript 문자열 리터럴 파싱
 *   규칙 (backslash escape) 을 완전 커버하지 못해 취약 — 본 파일은 그 방식을
 *   의도적으로 사용하지 않는다.
 *
 * ## 본문 길이 제한
 *
 *   `JSON.stringify(payload).slice(0, 200)` 처럼 호출부가 직렬화 후 슬라이스해서
 *   넘기거나, 본 파일이 인자로 받은 body 를 `BODY_MAX_LENGTH` 까지 자른다.
 *   긴 본문은 알림 UI 에서도 잘리고 osascript 인자 길이 상한 공격도 방어.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** macOS 알림 UI 가 표시하는 본문 최대 길이 (실제 UI 는 더 짧게 표시) + 방어 상한. */
const BODY_MAX_LENGTH = 200;
/** osascript 호출 타임아웃 — 사용자 gesture 대기 없음이므로 짧게. */
const EXEC_TIMEOUT_MS = 5_000;

/** `osascript` 실행 시 사용하는 AppleScript 템플릿 (sound 옵션만 동적). */
const SCRIPT_WITH_SOUND = [
  'on run argv',
  '  display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv) sound name "Sosumi"',
  'end run',
].join('\n');

const SCRIPT_NO_SOUND = [
  'on run argv',
  '  display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv)',
  'end run',
].join('\n');

export type MacNotificationArgs = {
  title: string;
  subtitle: string;
  body: string;
  /** critical 시 true — Sosumi 알림음 재생. */
  withSound?: boolean;
};

/**
 * macOS Notification Center 배너 표시.
 *
 * - 비 darwin 플랫폼: 즉시 no-op.
 * - osascript 호출 실패: throw (호출자가 catch + redact 후 로그).
 * - body 200+ 자: 앞 200자만.
 */
export async function sendMacOSNotification(args: MacNotificationArgs): Promise<void> {
  if (process.platform !== 'darwin') return;
  const script = args.withSound === true ? SCRIPT_WITH_SOUND : SCRIPT_NO_SOUND;
  const body = args.body.slice(0, BODY_MAX_LENGTH);
  await execFileAsync('osascript', ['-e', script, args.title, args.subtitle, body], {
    timeout: EXEC_TIMEOUT_MS,
  });
}
