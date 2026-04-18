/* eslint-disable no-console */
/**
 * Notifier 뼈대 (CRAWLING_STRATEGY §13.3.5) — Phase 3 사전 검증용.
 *
 * Phase 7 에서 배칭·dedup·백프레셔·백그라운드 워커를 추가할 예정이다.
 * 지금은 **즉시 전송 + events.jsonl append + console fallback** 의 3경로만.
 *
 * 왜 Phase 3 에서 필요한가:
 *   - preflight 스크립트들이 실패 시 `critical`/`high` 를 외부로 내보낼 채널이 없으면
 *     macOS GUI 세션이 닫혔을 때 감지 불가 → 무한 대기 리스크.
 *   - Phase 7 완성본이 오기 전까지 "console + jsonl + (설정 시) Telegram 즉시 송신"
 *     까지만 제공해도 Phase 4/5/6 실행 안전망은 확보된다.
 *
 * no-console: Notifier 는 자체가 로깅 시스템의 일부라 console 이 정당한 fallback
 *   출력 채널이다. Phase 7 에서 pino/자체 logger 로 이행 시 제거 예정.
 */

import { execFile } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { redact, redactObject } from '@pokopia-wiki/shared';
import ky from 'ky';

import { repoPath } from '../paths.js';
import type { NotifierConfig } from './config.js';
import { SEVERITY_MAP, type EventType, type NotifierEvent, type Severity } from './events.js';

const execFileAsync = promisify(execFile);

/** `data/logs/events.jsonl` — repo root 기준 고정 경로. */
const EVENTS_LOG_PATH = repoPath('data', 'logs', 'events.jsonl');

/**
 * 메타 키 네이밍 가드 (Phase 3 감사 SEC-002).
 *
 * `notify(event, meta)` 의 `meta` 는 호출자가 자유롭게 채우는 Record 라
 * 실수로 `botToken`/`apiKey`/`authorization` 같은 키에 원본 시크릿이 들어올 수
 * 있다. redact 는 값 내부의 패턴만 잡으므로, 아예 키 이름으로 의심되는 필드는
 * 값을 `<REDACTED>` 로 치환해 더 강한 가드를 건다. 케이스/구분자 비의존.
 */
const SENSITIVE_META_KEY_PATTERN = /token|apikey|authorization|password|secret|credential|cookie|bearer/i;

function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    sanitized[key] = SENSITIVE_META_KEY_PATTERN.test(key) ? '<REDACTED>' : value;
  }
  return sanitized;
}

/**
 * Telegram API 응답 최소 스키마.
 *
 * §13.3.6 B8: `ok=false` + HTTP 200 패턴이 있으므로 `ok` 필드 확인 필수.
 * Phase 7 `verifyNotifier()` 에서 재활용한다.
 */
type TelegramSendMessageResponse = {
  ok: boolean;
  description?: string;
  error_code?: number;
};

/**
 * 이벤트를 JSON 한 줄로 직렬화해 `events.jsonl` 에 append.
 *
 * - 경로가 없으면 `mkdir -p` 로 생성.
 * - 이미 redacted 된 payload 를 받으므로 추가 마스킹 없음.
 * - IO 실패는 console.error 로만 기록(로깅 실패가 파이프라인을 죽이면 안 됨).
 */
async function appendEventLog(entry: NotifierEvent): Promise<void> {
  try {
    await mkdir(path.dirname(EVENTS_LOG_PATH), { recursive: true });
    await appendFile(EVENTS_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (err) {
    // Phase 3 감사 SEC-003: 에러 메시지에 경로 이외의 민감정보가 섞일 수
    // 있으므로 fs 에러도 redact 경유 후 출력.
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[notifier] events.jsonl append failed: ${redact(reason)}`);
  }
}

/** `severity` 에 맞는 chat id 선택 — critical 은 전용 채팅방이 있으면 거기로. */
function routeChatId(config: NotifierConfig, severity: Severity): string | undefined {
  if (!config.telegram) return undefined;
  if (severity === 'critical' && config.telegram.criticalChatId) {
    return config.telegram.criticalChatId;
  }
  return config.telegram.chatId;
}

/**
 * Telegram 메시지 포맷 — Phase 7 에서 배칭 헤더 추가 예정.
 * 현재 뼈대는 단건 즉시 송신이므로 단일 이벤트 서식 고정.
 */
function formatTelegramText(entry: NotifierEvent): string {
  const metaLines = Object.entries(entry.meta)
    .map(([k, v]) => `  ${k}: ${String(v).slice(0, 200)}`)
    .join('\n');
  const header = `[Pokopia Scraper] ${entry.severity.toUpperCase()} ${entry.event}`;
  return metaLines.length > 0 ? `${header}\n${entry.ts}\n${metaLines}` : `${header}\n${entry.ts}`;
}

/**
 * 간이 macOS 배너 — Phase 7 에서 terminal-notifier/node-notifier 교체 예정.
 *
 * AppleScript 인젝션 방지를 위해 `execFile` + argv 전달만 사용한다
 * (§13.3.5 원문 그대로). 제목/부제목/본문을 쉘에 escape 하지 않는다.
 */
async function sendMacOSBanner(entry: NotifierEvent): Promise<void> {
  if (process.platform !== 'darwin') return;
  const soundClause = entry.severity === 'critical' ? ' sound name "Sosumi"' : '';
  const script = `on run argv\n  display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv)${soundClause}\nend run`;
  const body = JSON.stringify(entry.meta).slice(0, 200);
  try {
    await execFileAsync('osascript', ['-e', script, 'Pokopia Scraper', entry.event, body]);
  } catch (err) {
    // Phase 3 감사 SEC-001 연계: 외부 프로세스 에러도 일관되게 redact 경유.
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[notifier] macOS banner failed: ${redact(reason)}`);
  }
}

/**
 * Notifier 뼈대 클래스 (Phase 3).
 *
 * 공개 API 는 `notify(event, meta)` 하나. 반환형은 `Promise<void>` 이며
 * Phase 7 에서 fire-and-forget (`void`) 시그니처로 바뀔 예정이나, 뼈대
 * 단계에서 Telegram 응답 에러를 상위에서 삼킬 수 있도록 명시적으로 await
 * 가능하게 유지한다.
 */
export class Notifier {
  constructor(private readonly config: NotifierConfig) {}

  /**
   * 이벤트를 송신한다.
   *
   * 흐름:
   *   1. severity 조회 (미등록 이벤트는 console.error 후 조용히 반환)
   *   2. `redactObject` 로 payload 마스킹
   *   3. `events.jsonl` append (실패해도 계속)
   *   4. config.enabled && telegram 있음 → HTTP POST /sendMessage
   *      아니면 console.log fallback
   *   5. macOS 에서 severity>=high 면 배너 시도 (fail-soft)
   */
  async notify(event: EventType, meta: Record<string, unknown> = {}): Promise<void> {
    const severity = SEVERITY_MAP[event];
    if (!severity) {
      console.error(`[notifier] SEVERITY_MAP missing EventType=${event}`);
      return;
    }

    const rawEntry: NotifierEvent = {
      event,
      severity,
      ts: new Date().toISOString(),
      // Phase 3 감사 SEC-002: 키 네이밍 가드를 값 기반 redact 앞에서 먼저 적용.
      meta: sanitizeMeta(meta),
    };
    const entry = redactObject(rawEntry);

    await appendEventLog(entry);

    if (!this.config.enabled || !this.config.telegram) {
      // 이미 redactObject 를 거친 entry 이지만 JSON.stringify 결과 문자열에
      // URL 임베드 토큰이 재조립될 수 있어(§22.3 Telegram API URL 패턴) 2차 redact.
      console.log(`[notifier:fallback] ${redact(JSON.stringify(entry))}`);
    } else {
      await this.sendTelegram(entry).catch((err: unknown) => {
        // Phase 3 감사 SEC-001: ky HTTPError 메시지는 URL(토큰 포함) 을 담을 수
        // 있으므로 redact 경유 필수.
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[notifier] Telegram send failed: ${redact(reason)}`);
      });
    }

    if (this.config.macOSFallback && (severity === 'high' || severity === 'critical')) {
      await sendMacOSBanner(entry);
    }
  }

  /** 내부: Telegram Bot API 호출. §13.3.6 B8 — `ok` 필드 검증. */
  private async sendTelegram(entry: NotifierEvent): Promise<void> {
    if (!this.config.telegram) return;
    const chatId = routeChatId(this.config, entry.severity);
    if (!chatId) return;

    const url = `https://api.telegram.org/bot${this.config.telegram.botToken}/sendMessage`;
    const response = await ky
      .post(url, {
        json: {
          chat_id: chatId,
          text: formatTelegramText(entry),
          // critical 만 소리 — §13.3.3 라우팅 표 D2
          disable_notification: entry.severity !== 'critical',
          disable_web_page_preview: true,
        },
        timeout: 10_000,
        retry: { limit: 2 },
      })
      .json<TelegramSendMessageResponse>();

    if (!response.ok) {
      throw new Error(
        `Telegram API returned ok=false: code=${response.error_code ?? '-'} description=${response.description ?? 'unknown'}`,
      );
    }
  }
}
