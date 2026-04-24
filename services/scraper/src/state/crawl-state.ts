/**
 * CrawlState — CRAWLING_STRATEGY §20.1 / §20.2.
 *
 * 스크래퍼 진행 상태를 `data/state/crawl.json` 에 영속해 재개 가능성과 cooldown
 * 준수를 보장한다.
 *
 * ## 책임
 *
 *   - 완료 페이지 멱등 스킵 — `markCompleted` / `isCompleted`
 *   - 소스별 cooldown — `setCooldown` / `isCoolingDown` (현재 시각과 ISO 비교)
 *   - 실패 페이지 누적 — `recordFailure` (재시도 카운트 + cooldownUntil)
 *   - 페르소나 healthScore — `setHealthScore` (DetectionMonitor 가 update)
 *   - 세션 라이프사이클 — `startSession` / `incrementRequestCount` / `endSession`
 *
 * ## 영속 정책
 *
 *   - `shared/atomicWriteJson` (tmp + rename) 으로 크래시 시 손상 방지.
 *   - 모든 mutation 은 `read → mutate → write` 순서. 단일 프로세스 가정 — 멀티
 *     프로세스 동시성은 §6.4 ConcurrencyGuard 가 상위에서 차단하므로 별도 파일
 *     락 없이 처리.
 *   - 파일 부재·JSON 파싱 실패 시 빈 default 로 graceful fallback (재실행 안정성
 *     vs. silent corruption — Phase 6 에서 새로 만드는 상태라 fallback 우선).
 *
 * ## DI
 *
 *   - `statePath`: 기본 `<repo>/data/state/crawl.json`. 테스트에서 tmp dir 주입.
 *   - `nowISO`: 기본 현재 시각. cooldown 비교·세션 startedAt 격리.
 */

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { atomicWriteJson, type SourceSite } from '@pokopia-wiki/shared';

import { repoPath } from '../paths.js';

/**
 * 실패 기록 — `failedPages[]` 의 단위.
 *
 * `cooldownUntil` 은 호출자가 ErrorReaction 의 지수 cooldown 결과를 같이 기록
 * 하고 싶을 때만 채운다 (없으면 단순 실패 누적).
 */
export type FailedPage = {
  url: string;
  error: string;
  retries: number;
  cooldownUntil?: string;
};

/**
 * 현재 진행 중 세션 상태 — `endSession` 호출 시 `null` 로 클리어.
 *
 * `plannedDuration` 은 §6.1 sessions.durationMin/Max 에서 결정한 ms 값. 타임 박스
 * 기반 종료 정책에 사용 (현재 Phase 6 에서는 기록만, 정책은 SessionManager 에서).
 */
export type SessionRecord = {
  startedAt: string;
  requestCount: number;
  plannedDuration: number;
};

/**
 * `data/state/crawl.json` 의 전체 형상 — §20.1 SSoT.
 *
 * `phase` / `persona` 는 세션 종료 후에도 유지되어 다음 세션의 컨텍스트로 활용.
 * `cooldowns` 키는 `SourceSite` 리터럴, value 는 ISO 8601 만료 시각.
 * `healthScores` 키는 personaId, value 는 0~100 정수 (clamping 은 호출자 책임).
 */
export type CrawlStateData = {
  phase: number | null;
  persona: string | null;
  session: SessionRecord | null;
  completedPages: string[];
  failedPages: FailedPage[];
  cooldowns: Partial<Record<SourceSite, string>>;
  healthScores: Record<string, number>;
};

export type CrawlStateOptions = {
  /** 기본: `<repo>/data/state/crawl.json`. */
  statePath?: string;
  /** 기본: `() => new Date().toISOString()`. */
  nowISO?: () => string;
};

const EMPTY_STATE: CrawlStateData = {
  phase: null,
  persona: null,
  session: null,
  completedPages: [],
  failedPages: [],
  cooldowns: {},
  healthScores: {},
};

export class CrawlState {
  private readonly statePath: string;
  private readonly nowISO: () => string;

  constructor(options: CrawlStateOptions = {}) {
    this.statePath = options.statePath ?? repoPath('data', 'state', 'crawl.json');
    this.nowISO = options.nowISO ?? (() => new Date().toISOString());
  }

  /** 현재 상태 read (파일 없거나 깨졌으면 EMPTY_STATE 반환 — write 는 없음). */
  async read(): Promise<CrawlStateData> {
    const raw = await readFile(this.statePath, 'utf8').catch(() => null);
    if (raw === null) return cloneState(EMPTY_STATE);
    try {
      const parsed = JSON.parse(raw) as unknown;
      return normalizeState(parsed);
    } catch {
      return cloneState(EMPTY_STATE);
    }
  }

  /**
   * mutator 로 부분 업데이트 후 atomic write. 핵심 mutation 진입점 — 다른
   * helper 메서드는 모두 이 함수 위에 빌드된다 (read-modify-write 일관성).
   */
  async update(mutator: (data: CrawlStateData) => CrawlStateData): Promise<CrawlStateData> {
    const current = await this.read();
    const next = mutator(current);
    await mkdir(path.dirname(this.statePath), { recursive: true });
    await atomicWriteJson(this.statePath, next);
    return next;
  }

  // ── 페이지 완료 ────────────────────────────────────────────────────────────

  async markCompleted(url: string): Promise<void> {
    await this.update((data) => {
      if (data.completedPages.includes(url)) return data;
      return { ...data, completedPages: [...data.completedPages, url] };
    });
  }

  async isCompleted(url: string): Promise<boolean> {
    const data = await this.read();
    return data.completedPages.includes(url);
  }

  // ── 실패 기록 ─────────────────────────────────────────────────────────────

  async recordFailure(
    url: string,
    error: string,
    options: { cooldownUntil?: Date } = {},
  ): Promise<void> {
    await this.update((data) => {
      const existing = data.failedPages.find((p) => p.url === url);
      const cooldownIso = options.cooldownUntil?.toISOString();
      // 조건부 spread 의 분기를 positive 로 정렬 (oxlint no-negated-condition).
      const cooldownPart = cooldownIso === undefined ? {} : { cooldownUntil: cooldownIso };
      if (existing) {
        const updated: FailedPage[] = data.failedPages.map((p) =>
          p.url === url ? { ...p, error, retries: p.retries + 1, ...cooldownPart } : p,
        );
        return { ...data, failedPages: updated };
      }
      const next: FailedPage = { url, error, retries: 1, ...cooldownPart };
      return { ...data, failedPages: [...data.failedPages, next] };
    });
  }

  // ── Cooldown ─────────────────────────────────────────────────────────────

  async setCooldown(source: SourceSite, until: Date): Promise<void> {
    await this.update((data) => ({
      ...data,
      cooldowns: { ...data.cooldowns, [source]: until.toISOString() },
    }));
  }

  async isCoolingDown(source: SourceSite): Promise<boolean> {
    const data = await this.read();
    const until = data.cooldowns[source];
    if (until === undefined) return false;
    return Date.parse(this.nowISO()) < Date.parse(until);
  }

  // ── HealthScore ──────────────────────────────────────────────────────────

  async setHealthScore(personaId: string, score: number): Promise<void> {
    await this.update((data) => ({
      ...data,
      healthScores: { ...data.healthScores, [personaId]: score },
    }));
  }

  // ── 세션 라이프사이클 ────────────────────────────────────────────────────

  async startSession(args: { phase: number; persona: string | null; plannedDurationMs: number }): Promise<void> {
    await this.update((data) => ({
      ...data,
      phase: args.phase,
      persona: args.persona,
      session: {
        startedAt: this.nowISO(),
        requestCount: 0,
        plannedDuration: args.plannedDurationMs,
      },
    }));
  }

  /** 세션 열려 있을 때만 카운트 증가. 세션이 없으면 silently no-op. */
  async incrementRequestCount(): Promise<void> {
    await this.update((data) => {
      if (data.session === null) return data;
      return {
        ...data,
        session: { ...data.session, requestCount: data.session.requestCount + 1 },
      };
    });
  }

  async endSession(): Promise<void> {
    await this.update((data) => ({ ...data, session: null }));
  }
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function cloneState(src: CrawlStateData): CrawlStateData {
  return {
    phase: src.phase,
    persona: src.persona,
    session: src.session === null ? null : { ...src.session },
    completedPages: [...src.completedPages],
    failedPages: src.failedPages.map((p) => ({ ...p })),
    cooldowns: { ...src.cooldowns },
    healthScores: { ...src.healthScores },
  };
}

/**
 * 파싱된 unknown 을 CrawlStateData 로 정규화. 부분 누락 필드는 EMPTY_STATE 에서 보충.
 *
 * 구버전 파일 / 손상된 일부 필드를 허용하면서 "값이 있을 때만 반영" 정책으로
 * 새 필드 도입 시에도 readers 가 안전.
 */
function normalizeState(parsed: unknown): CrawlStateData {
  if (parsed === null || typeof parsed !== 'object') return cloneState(EMPTY_STATE);
  const obj = parsed as Record<string, unknown>;
  return {
    phase: typeof obj['phase'] === 'number' ? obj['phase'] : null,
    persona: typeof obj['persona'] === 'string' ? obj['persona'] : null,
    session: normalizeSession(obj['session']),
    completedPages: Array.isArray(obj['completedPages'])
      ? obj['completedPages'].filter((u): u is string => typeof u === 'string')
      : [],
    failedPages: Array.isArray(obj['failedPages'])
      ? obj['failedPages'].map((raw) => normalizeFailed(raw)).filter((p): p is FailedPage => p !== null)
      : [],
    cooldowns: normalizeCooldowns(obj['cooldowns']),
    healthScores: normalizeHealth(obj['healthScores']),
  };
}

function normalizeSession(raw: unknown): SessionRecord | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj['startedAt'] !== 'string') return null;
  return {
    startedAt: obj['startedAt'],
    requestCount: typeof obj['requestCount'] === 'number' ? obj['requestCount'] : 0,
    plannedDuration: typeof obj['plannedDuration'] === 'number' ? obj['plannedDuration'] : 0,
  };
}

function normalizeFailed(raw: unknown): FailedPage | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj['url'] !== 'string' || typeof obj['error'] !== 'string') return null;
  const retries = typeof obj['retries'] === 'number' ? obj['retries'] : 1;
  const cooldownUntil = typeof obj['cooldownUntil'] === 'string' ? obj['cooldownUntil'] : undefined;
  // positive condition 우선 (no-negated-condition).
  return cooldownUntil === undefined
    ? { url: obj['url'], error: obj['error'], retries }
    : { url: obj['url'], error: obj['error'], retries, cooldownUntil };
}

function normalizeCooldowns(raw: unknown): Partial<Record<SourceSite, string>> {
  if (raw === null || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const out: Partial<Record<SourceSite, string>> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      out[k as SourceSite] = v;
    }
  }
  return out;
}

function normalizeHealth(raw: unknown): Record<string, number> {
  if (raw === null || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}
