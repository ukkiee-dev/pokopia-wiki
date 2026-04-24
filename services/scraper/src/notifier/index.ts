/* eslint-disable no-console */
/**
 * Notifier — CRAWLING_STRATEGY §13.3.5 완전 구현 (Phase 7).
 *
 * Phase 3 뼈대에서 확장: immediateQueue + 백그라운드 worker + 배치 flush +
 * dedup 파일 영속(`data/state/notifier-dedup.json`) + shutdown grace.
 *
 * ## 처리 흐름
 *
 *   호출자 `notify(event, meta)` → severity 조회 → sanitize + redact → events.jsonl
 *   append → Telegram 활성 시 severity 분기:
 *     - critical / high: immediateQueue push → 백그라운드 worker 가 즉시 송신
 *     - warn: queue push → 10분 주기 flushBatched 배치
 *     - info: queue push → 30분 주기 flushBatched 배치
 *
 *   Dedup: critical 제외, 5분 window 내 같은 event 재발생 시 skip. lastSentAt 을
 *   `data/state/notifier-dedup.json` 에 영속해 재시작 시 복구.
 *
 * ## 왜 async 시그니처 유지
 *
 *   §13.3.5 원문은 `notify(): void` 로 fire-and-forget 이지만, Phase 3 뼈대에서
 *   Promise 를 반환한 호출부(특히 SessionManager.safeNotify) 가 존재. 호환성 위해
 *   `async notify(): Promise<void>` 유지하고 내부는 여전히 sync push — `await`
 *   해도 즉시 resolve.
 *
 * no-console: Notifier 자체가 로깅 시스템이라 console 은 정당한 fallback.
 */

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { redact, redactObject } from '@pokopia-wiki/shared';

import { repoPath } from '../paths.js';
import type { NotifierConfig } from './config.js';
import { SEVERITY_MAP, type EventType, type NotifierEvent, type Severity } from './events.js';
import { sendMacOSNotification } from './macos.js';
import { sendTelegramMessage, verifyBotIdentity, type VerifyResult } from './telegram.js';

/** `data/logs/events.jsonl` — 영구 이벤트 기록. config.enabled 와 무관하게 항상 append. */
const EVENTS_LOG_PATH = repoPath('data', 'logs', 'events.jsonl');

/** Dedup 영속 파일 — 프로세스 재시작 후에도 5 분 cooldown 이어짐. */
const DEDUP_STATE_PATH = repoPath('data', 'state', 'notifier-dedup.json');

/** info/warn 큐 상한. 초과 시 오래된 것부터 drop (BPF — 백프레셔). */
const QUEUE_HIGH_MAX = 500;

/** Dedup window. 같은 event 가 이 시간 내 재발생 시 스킵 (critical 제외). */
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

/** Dedup 파일이 무한 성장하지 않도록 24 시간 지난 레코드는 load 시 버림. */
const DEDUP_RETENTION_MS = 24 * 60 * 60 * 1000;

/** 배치 flush 주기 (§13.3.3). warn 10 분, info 30 분. */
const WARN_FLUSH_INTERVAL_MS = 10 * 60 * 1000;
const INFO_FLUSH_INTERVAL_MS = 30 * 60 * 1000;

/** immediateQueue poll 간격. 200 ms 는 체감 즉시 + CPU 부담 낮음의 균형. */
const WORKER_POLL_INTERVAL_MS = 200;

/**
 * 메타 키 네이밍 가드 (Phase 3 SEC-002). `botToken` / `authorization` 같은 키로
 * 호출부가 실수로 시크릿을 넘길 때 값 내용 redact 이전에 키 이름으로 차단.
 */
const SENSITIVE_META_KEY_PATTERN = /token|apikey|authorization|password|secret|credential|cookie|bearer/i;

function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    sanitized[key] = SENSITIVE_META_KEY_PATTERN.test(key) ? '<REDACTED>' : value;
  }
  return sanitized;
}

/** events.jsonl 1 줄 append. IO 실패는 console.error 로만 (파이프라인 유지). */
async function appendEventLog(entry: NotifierEvent): Promise<void> {
  try {
    await mkdir(path.dirname(EVENTS_LOG_PATH), { recursive: true });
    await appendFile(EVENTS_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[notifier] events.jsonl append failed: ${redact(reason)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatTelegramText(events: readonly NotifierEvent[], opts: { batch?: boolean; level?: string } = {}): string {
  const prefix =
    opts.batch === true
      ? `🗂 [Pokopia Scraper] ${(opts.level ?? 'batch').toUpperCase()} 배치 (${String(events.length)}건)\n\n`
      : `⚠️ [Pokopia Scraper]\n\n`;
  const lines = events.map((event) => {
    const time = event.ts.slice(11, 16); // ISO "YYYY-MM-DDTHH:MM:..." → "HH:MM"
    const metaLines = Object.entries(event.meta)
      .map(([k, v]) => `  ${k}: ${String(v).slice(0, 200)}`)
      .join('\n');
    return metaLines.length > 0 ? `[${time}] ${event.event}\n${metaLines}` : `[${time}] ${event.event}`;
  });
  return prefix + lines.join('\n\n');
}

export class Notifier {
  private queue: NotifierEvent[] = [];
  private immediateQueue: NotifierEvent[] = [];
  private lastSentAt: Partial<Record<EventType, number>> = {};
  private warnFlushTimer: ReturnType<typeof setInterval> | null = null;
  private infoFlushTimer: ReturnType<typeof setInterval> | null = null;
  private immediateWorker: Promise<void> | null = null;
  private stopping = false;

  constructor(private readonly config: NotifierConfig) {
    if (config.enabled && config.telegram !== null) {
      void this.loadDedup().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[notifier] dedup 복구 실패: ${redact(msg)}`);
      });
      this.warnFlushTimer = setInterval(() => {
        void this.flushBatched('warn');
      }, WARN_FLUSH_INTERVAL_MS);
      this.infoFlushTimer = setInterval(() => {
        void this.flushBatched('info');
      }, INFO_FLUSH_INTERVAL_MS);
      this.immediateWorker = this.runImmediateWorker();
    }
  }

  /** 설정 상으로 Telegram 송신이 가능한지. */
  isEnabled(): boolean {
    return this.config.enabled && this.config.telegram !== null;
  }

  /**
   * 이벤트 송신 요청 — fire-and-forget. 내부는 sync push 만 수행하고 events.jsonl
   * append 는 await. 호출부는 `await notifier.notify(...)` 해도 즉시 resolve.
   */
  async notify(event: EventType, meta: Record<string, unknown> = {}): Promise<void> {
    const severity = SEVERITY_MAP[event];
    if (severity === undefined) {
      console.error(`[notifier] SEVERITY_MAP missing EventType=${event}`);
      return;
    }

    const rawEntry: NotifierEvent = {
      event,
      severity,
      ts: new Date().toISOString(),
      meta: sanitizeMeta(meta),
    };
    const entry = redactObject(rawEntry);
    await appendEventLog(entry);

    if (!this.isEnabled()) {
      console.log(`[notifier:fallback] ${redact(JSON.stringify(entry))}`);
      return;
    }

    // Dedup — critical 제외, 5 분 window 내 재발생 스킵.
    if (severity !== 'critical') {
      const last = this.lastSentAt[event];
      if (last !== undefined && Date.now() - last < DEDUP_WINDOW_MS) return;
    }

    if (severity === 'critical' || severity === 'high') {
      this.immediateQueue.push(entry);
      this.lastSentAt[event] = Date.now();
      void this.persistDedup().catch(() => {
        /* best-effort */
      });
    } else {
      this.queue.push(entry);
      if (this.queue.length > QUEUE_HIGH_MAX) {
        this.queue.splice(0, this.queue.length - QUEUE_HIGH_MAX);
      }
    }
  }

  /**
   * `getMe` 로 Telegram bot 검증. 비활성 상태면 `{ ok: false, reason }`.
   * 호출자는 결과를 로깅 + 운영 결정 (실패 시 스크래퍼 진행은 계속).
   */
  async verifyBot(): Promise<VerifyResult> {
    if (!this.isEnabled() || this.config.telegram === null) {
      return { ok: false, reason: 'notifier disabled' };
    }
    return verifyBotIdentity(this.config.telegram.botToken);
  }

  /**
   * Worker / timer 종료 + 남은 큐 flush + dedup 영속. 엔트리 스크립트 종료 직전
   * 반드시 호출해 pending 이벤트 유실 방지 (Phase 7 완성 조건).
   */
  async shutdown(): Promise<void> {
    this.stopping = true;
    if (this.warnFlushTimer !== null) {
      clearInterval(this.warnFlushTimer);
      this.warnFlushTimer = null;
    }
    if (this.infoFlushTimer !== null) {
      clearInterval(this.infoFlushTimer);
      this.infoFlushTimer = null;
    }
    if (this.immediateWorker !== null) {
      await this.immediateWorker;
      this.immediateWorker = null;
    }
    await this.flushBatched('warn');
    await this.flushBatched('info');
    await this.persistDedup().catch(() => {
      /* best-effort */
    });
  }

  // ── 내부 ──────────────────────────────────────────────────────────────

  private async loadDedup(): Promise<void> {
    const raw = await readFile(DEDUP_STATE_PATH, 'utf8').catch(() => '{}');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (parsed === null || typeof parsed !== 'object') return;
    const cutoff = Date.now() - DEDUP_RETENTION_MS;
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && value > cutoff) {
        (this.lastSentAt as Record<string, number>)[key] = value;
      }
    }
  }

  private async persistDedup(): Promise<void> {
    try {
      await mkdir(path.dirname(DEDUP_STATE_PATH), { recursive: true });
      await writeFile(DEDUP_STATE_PATH, JSON.stringify(this.lastSentAt), 'utf8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[notifier] persistDedup 실패: ${redact(msg)}`);
    }
  }

  private async runImmediateWorker(): Promise<void> {
    while (!this.stopping || this.immediateQueue.length > 0) {
      const event = this.immediateQueue.shift();
      if (event === undefined) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(WORKER_POLL_INTERVAL_MS);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await this.sendImmediate(event).catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[notifier] immediate send 실패: ${redact(reason)}`);
      });
    }
  }

  private async sendImmediate(event: NotifierEvent): Promise<void> {
    if (this.config.telegram === null) return;
    const withSound = event.severity === 'critical';
    const chatId =
      withSound && this.config.telegram.criticalChatId !== undefined
        ? this.config.telegram.criticalChatId
        : this.config.telegram.chatId;
    const text = formatTelegramText([event]);
    await sendTelegramMessage(this.config.telegram.botToken, chatId, text, { withSound }).catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[notifier] Telegram 실패: ${redact(reason)}`);
    });

    if (this.config.macOSFallback && (event.severity === 'high' || event.severity === 'critical')) {
      await sendMacOSNotification({
        title: 'Pokopia Scraper',
        subtitle: event.event,
        body: JSON.stringify(event.meta),
        withSound,
      }).catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[notifier] macOS 실패: ${redact(reason)}`);
      });
    }
  }

  private async flushBatched(level: Severity): Promise<void> {
    if (!this.isEnabled() || this.config.telegram === null) return;
    const events = this.queue.filter((e) => e.severity === level);
    if (events.length === 0) return;
    this.queue = this.queue.filter((e) => e.severity !== level);

    const text = formatTelegramText(events, { batch: true, level });
    await sendTelegramMessage(this.config.telegram.botToken, this.config.telegram.chatId, text, {
      withSound: false,
    }).catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[notifier] 배치 전송 실패(${level}): ${redact(reason)}`);
      // 실패 시 큐에 되돌림 — 다음 주기에 재시도.
      this.queue.push(...events);
    });
  }
}
