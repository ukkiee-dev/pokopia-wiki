/**
 * Daily Summary — CRAWLING_STRATEGY §13.3.7, Phase 7 Task 7.4.
 *
 * 매일 KST 23:55 에 `milestone.daily_summary` 이벤트를 발행해 하루 활동 요약을
 * Telegram 에 보낸다. 프로세스가 다운되어 크론이 건너뛴 날짜가 있으면 재부팅 시
 * `maybeRunRecovery()` 로 복구 요약을 1 회 발송.
 *
 * ## 집계 소스
 *
 *   - `CrawlState.read()` — phase / persona / session.requestCount / cooldowns /
 *     healthScores / failedPages 크기
 *   - `data/logs/events.jsonl` — 오늘 날짜(KST) 로 시작하는 라인에서 block.*,
 *     captcha.*, session.start 카운트
 *
 * ## 왜 별도 모듈인가
 *
 *   Notifier 내부에 포함할 수도 있으나, cron 주기적 트리거 + events.jsonl 파싱은
 *   알림 전송과 분리된 책임. 본 모듈은 notify 호출만 하고 실제 전송은 Notifier 가
 *   처리.
 */

import { readFile } from 'node:fs/promises';

import { atomicWriteJson } from '@pokopia-wiki/shared';
import cron, { type ScheduledTask } from 'node-cron';

import type { Notifier } from './notifier/index.js';
import { repoPath } from './paths.js';
import { CrawlState } from './state/crawl-state.js';

/** cron 크론 문자열 — KST 23:55. */
const DAILY_CRON = '55 23 * * *';
const TIMEZONE_KST = 'Asia/Seoul';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 마지막 실행 날짜(KST YYYY-MM-DD) 영속 — 복구 여부 판단. */
const LAST_RUN_PATH = repoPath('data', 'state', 'daily-summary-last.json');
const EVENTS_LOG_PATH = repoPath('data', 'logs', 'events.jsonl');

export type DailySummaryStats = {
  phase: number | null;
  persona: string | null;
  requests: number;
  blocks: number;
  captcha: number;
  sessions: number;
  failedPages: number;
  cooldownSources: readonly string[];
  healthScores: Record<string, number>;
};

export type DailySummaryOptions = {
  notifier: Notifier;
  crawlState?: CrawlState;
  now?: () => Date;
};

function todayKst(now: Date): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

type EventLogEntry = { event?: string; ts?: string };

async function countTodayEvents(todayKstDate: string): Promise<{ blocks: number; captcha: number; sessions: number }> {
  const raw = await readFile(EVENTS_LOG_PATH, 'utf8').catch(() => '');
  if (raw.length === 0) return { blocks: 0, captcha: 0, sessions: 0 };
  let blocks = 0;
  let captcha = 0;
  let sessions = 0;
  for (const line of raw.split('\n')) {
    if (line.length === 0) continue;
    let entry: EventLogEntry;
    try {
      entry = JSON.parse(line) as EventLogEntry;
    } catch {
      continue;
    }
    // ts 는 UTC ISO — KST 로 변환해서 today 비교.
    if (typeof entry.ts !== 'string') continue;
    const kstDate = new Date(new Date(entry.ts).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
    if (kstDate !== todayKstDate) continue;
    if (entry.event === 'block.403' || entry.event === 'block.429') blocks += 1;
    else if (entry.event === 'captcha.detected' || entry.event === 'captcha.unresolved') captcha += 1;
    else if (entry.event === 'session.start') sessions += 1;
  }
  return { blocks, captcha, sessions };
}

export async function collectStats(options: DailySummaryOptions): Promise<DailySummaryStats> {
  const crawlState = options.crawlState ?? new CrawlState();
  const now = options.now?.() ?? new Date();
  const today = todayKst(now);

  const state = await crawlState.read();
  const eventCounts = await countTodayEvents(today);

  return {
    phase: state.phase,
    persona: state.persona,
    requests: state.session?.requestCount ?? 0,
    blocks: eventCounts.blocks,
    captcha: eventCounts.captcha,
    sessions: eventCounts.sessions,
    failedPages: state.failedPages.length,
    cooldownSources: Object.keys(state.cooldowns),
    healthScores: state.healthScores,
  };
}

/**
 * 집계 → 알림 송신. Notifier 가 enabled 하지 않아도 events.jsonl append 는 수행.
 */
export async function publishDailySummary(options: DailySummaryOptions): Promise<DailySummaryStats> {
  const stats = await collectStats(options);
  await options.notifier.notify('milestone.daily_summary', {
    phase: stats.phase,
    persona: stats.persona,
    requests: stats.requests,
    blocks: stats.blocks,
    captcha: stats.captcha,
    sessions: stats.sessions,
    failedPages: stats.failedPages,
    cooldownSources: stats.cooldownSources.join(','),
  });
  const now = options.now?.() ?? new Date();
  await saveLastRunDate(todayKst(now));
  return stats;
}

async function loadLastRunDate(): Promise<string | null> {
  const raw = await readFile(LAST_RUN_PATH, 'utf8').catch(() => null);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { date?: unknown };
    return typeof parsed.date === 'string' ? parsed.date : null;
  } catch {
    return null;
  }
}

async function saveLastRunDate(date: string): Promise<void> {
  await atomicWriteJson(LAST_RUN_PATH, { date });
}

/**
 * 부팅 시 복구 — 마지막 실행 날짜가 오늘(KST)보다 이전이면 1회 요약 발행.
 *
 * 반환: 실제로 복구 실행했는지 여부.
 */
export async function maybeRunRecovery(options: DailySummaryOptions): Promise<boolean> {
  const now = options.now?.() ?? new Date();
  const today = todayKst(now);
  const lastRun = await loadLastRunDate();
  if (lastRun === today) return false; // 오늘 이미 실행됨
  await publishDailySummary(options);
  return true;
}

/**
 * KST 23:55 cron 등록. 반환된 ScheduledTask 의 `stop()` 으로 해제.
 */
export function scheduleDailySummary(options: DailySummaryOptions): ScheduledTask {
  return cron.schedule(
    DAILY_CRON,
    () => {
      void publishDailySummary(options).catch(() => {
        /* best-effort — 실패해도 cron 은 계속 */
      });
    },
    { timezone: TIMEZONE_KST },
  );
}
