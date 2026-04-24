/**
 * ConcurrencyGuard — CRAWLING_STRATEGY §6.4.3 A4.
 *
 * 모든 `SessionManager.start()` 호출 전에 통과해야 하는 동시성 게이트.
 *
 * ## 규칙 (§6.4.1)
 *
 *   1. 같은 소스 이미 활성 → `same_source_active`
 *   2. 같은 페르소나 이미 활성 → `same_persona_active`
 *   3. 다른 페르소나 활성 → `persona_conflict` (스케줄러 버그) + critical 알림
 *   4. T0 ↔ T1+ 스태거: T1+ 시작 시점에 T0 lastRequest 가 5분 이내면 대기.
 *
 * ## A4 강화 (v3.2)
 *
 *   - `canStart` → `register` 를 파일락으로 **원자적** 묶음 (`proper-lockfile`).
 *   - `ActiveSession.pid` / `hostname` 으로 stale 판별 (process.kill(pid, 0) +
 *     hostname 일치).
 *   - 부팅 훅은 **살아있는 항목 보존** + dead 만 제거 (과거의 "전체 소거" 폐기).
 *
 * ## 원자성·크래시 안전성
 *
 *   - state 파일 쓰기는 tmp + rename atomic (Phase 4 OPS-403 패턴).
 *   - proper-lockfile stale 10s, retries 10 회.
 *
 * ## 테스트 DI
 *
 *   constructor options (`statePath` / `hostname` / `isAlivePid` / `currentPid` /
 *   `nowISO` / `t0T1StaggerMs`) 로 시간·pid·hostname·파일경로를 주입 가능 →
 *   tmp 디렉토리 + fake pid set 조합으로 격리 테스트.
 */

import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { SourceSite } from '@pokopia-wiki/shared';
import lockfile from 'proper-lockfile';

import type { Notifier } from '../notifier/index.js';
import { repoPath } from '../paths.js';
import type { BrowserPersona } from '../persona/types.js';

export type SessionTier = 0 | 1 | 2 | 3;

export type ActiveSession = {
  source: SourceSite;
  tier: SessionTier;
  personaId?: string;
  pid: number;
  hostname: string;
  startedAt: string;
  lastRequestAt: string;
};

export type AcquireRejectReason = 'same_source_active' | 'same_persona_active' | 'persona_conflict' | 't0_t1_stagger';

export type AcquireResult =
  | { readonly ok: true; readonly session: ActiveSession }
  | { readonly ok: false; readonly reason: AcquireRejectReason; readonly retryAfterMs?: number };

export type ConcurrencyGuardOptions = {
  /** state 파일 경로 — 기본값: `<repoRoot>/data/state/active-sessions.json`. */
  statePath?: string;
  /** Notifier (옵션). 없으면 `scraper.crashed` / `scheduler.persona_conflict` 알림 skip. */
  notifier?: Notifier;
  /** 현재 호스트 이름 — 기본: `os.hostname()`. DI 로 테스트 격리. */
  hostname?: () => string;
  /** pid 생존 확인 — 기본: `process.kill(pid, 0)`. */
  isAlivePid?: (pid: number) => boolean;
  /** 현재 프로세스 pid — 기본: `process.pid`. */
  currentPid?: () => number;
  /** 현재 시각 ISO 문자열 — 기본: `new Date().toISOString()`. */
  nowISO?: () => string;
  /** Rule 4 stagger 간격 (ms) — 기본 5분. */
  t0T1StaggerMs?: number;
};

const DEFAULT_T0_T1_STAGGER_MS = 5 * 60 * 1000;

/** signal 0 = 존재 확인. 프로세스 없으면 ESRCH. */
function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class ConcurrencyGuard {
  private readonly statePath: string;
  private readonly notifier: Notifier | undefined;
  private readonly hostname: () => string;
  private readonly isAlivePid: (pid: number) => boolean;
  private readonly currentPid: () => number;
  private readonly nowISO: () => string;
  private readonly t0T1StaggerMs: number;

  constructor(options: ConcurrencyGuardOptions = {}) {
    this.statePath = options.statePath ?? repoPath('data', 'state', 'active-sessions.json');
    this.notifier = options.notifier;
    this.hostname = options.hostname ?? (() => os.hostname());
    this.isAlivePid = options.isAlivePid ?? defaultIsAlive;
    this.currentPid = options.currentPid ?? (() => process.pid);
    this.nowISO = options.nowISO ?? (() => new Date().toISOString());
    this.t0T1StaggerMs = options.t0T1StaggerMs ?? DEFAULT_T0_T1_STAGGER_MS;
  }

  /**
   * 부팅 시 1회 호출 — 죽은 엔트리 제거, 살아있는 것은 유지, reap 마다 `scraper.crashed` 알림.
   */
  async reconcileOnBoot(): Promise<void> {
    await this.withLock(async () => {
      const { reaped } = await this.readReconciled();
      const notifier = this.notifier;
      if (notifier === undefined || reaped.length === 0) return;
      // 병렬 notify — 각 알림이 독립적이고 best-effort 라 서로 기다릴 이유 없음.
      await Promise.all(
        reaped.map((s) =>
          notifier
            .notify('scraper.crashed', {
              source: s.source,
              personaId: s.personaId ?? null,
              pid: s.pid,
              startedAt: s.startedAt,
            })
            .catch(() => {
              /* best-effort */
            }),
        ),
      );
    });
  }

  /** 현재 살아있는 세션 목록 조회 (읽으면서 동시에 reap 진행). */
  async listActive(): Promise<readonly ActiveSession[]> {
    return this.withLock(async () => (await this.readReconciled()).live);
  }

  /** §6.4.1 4 규칙 검사 + 통과 시 등록. canStart↔register 가 단일 lock 안에서 원자적. */
  async acquire(args: { source: SourceSite; tier: SessionTier; persona?: BrowserPersona }): Promise<AcquireResult> {
    return this.withLock(async () => {
      const { live: active } = await this.readReconciled();
      const now = this.nowISO();

      const rejection = await this.evaluateRules(active, args);
      if (rejection) return rejection;

      const session: ActiveSession = {
        source: args.source,
        tier: args.tier,
        ...(args.persona ? { personaId: args.persona.id } : {}),
        pid: this.currentPid(),
        hostname: this.hostname(),
        startedAt: now,
        lastRequestAt: now,
      };
      const next = [...active, session];
      await this.atomicWrite(JSON.stringify(next, null, 2));
      return { ok: true, session };
    });
  }

  /** 세션 종료 시 호출 — 같은 pid + source 매칭 엔트리 제거. */
  async release(source: SourceSite): Promise<void> {
    await this.withLock(async () => {
      const { live } = await this.readReconciled();
      const myPid = this.currentPid();
      const remaining = live.filter((s) => !(s.source === source && s.pid === myPid));
      await this.atomicWrite(JSON.stringify(remaining, null, 2));
    });
  }

  /** T0↔T1+ 스태거 계산에 쓰이는 lastRequestAt 갱신 — 각 HTTP 요청 성공 직후 호출. */
  async touchLastRequest(source: SourceSite): Promise<void> {
    await this.withLock(async () => {
      const { live } = await this.readReconciled();
      const myPid = this.currentPid();
      const nowIso = this.nowISO();
      // Why for-loop: oxc `no-map-spread` 가 map 콜백 내 객체 스프레드를 금지.
      // 불변 업데이트 의도는 그대로 유지하면서 규칙을 피한다.
      const updated: ActiveSession[] = [];
      for (const s of live) {
        if (s.source === source && s.pid === myPid) {
          updated.push({ ...s, lastRequestAt: nowIso });
        } else {
          updated.push(s);
        }
      }
      await this.atomicWrite(JSON.stringify(updated, null, 2));
    });
  }

  // ── 내부 구현 ────────────────────────────────────────────────────────────────

  private async evaluateRules(
    active: readonly ActiveSession[],
    args: { source: SourceSite; tier: SessionTier; persona?: BrowserPersona },
  ): Promise<AcquireResult | null> {
    // Rule 1: 같은 소스
    if (active.some((s) => s.source === args.source)) {
      return { ok: false, reason: 'same_source_active' };
    }
    // Rule 2: 같은 페르소나
    if (args.persona !== undefined && active.some((s) => s.personaId === args.persona?.id)) {
      return { ok: false, reason: 'same_persona_active' };
    }
    // Rule 3: 다른 페르소나 활성 — 스케줄러 버그
    const personaId = args.persona?.id;
    if (personaId !== undefined && active.some((s) => s.personaId !== undefined && s.personaId !== personaId)) {
      const activeIds = active
        .map((s) => s.personaId)
        .filter((x): x is string => x !== undefined)
        .join(',');
      await this.notifier
        ?.notify('scheduler.persona_conflict', { requested: personaId, active: activeIds })
        .catch(() => {
          /* best-effort */
        });
      return { ok: false, reason: 'persona_conflict' };
    }
    // Rule 4: T0 ↔ T1+ stagger
    if (args.tier >= 1) {
      const t0 = active.find((s) => s.tier === 0);
      if (t0) {
        const since = Date.parse(this.nowISO()) - Date.parse(t0.lastRequestAt);
        if (since < this.t0T1StaggerMs) {
          return {
            ok: false,
            reason: 't0_t1_stagger',
            retryAfterMs: this.t0T1StaggerMs - Math.max(0, since),
          };
        }
      }
    }
    return null;
  }

  /** 락 영역에서 fn 실행. state 파일이 없으면 빈 `[]` 로 선생성 (lockfile 전제). */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(path.dirname(this.statePath), { recursive: true });
    try {
      await access(this.statePath);
    } catch {
      await this.atomicWrite('[]');
    }
    const release = await lockfile.lock(this.statePath, {
      retries: { retries: 10, minTimeout: 100, maxTimeout: 1000 },
      stale: 10_000,
    });
    try {
      return await fn();
    } finally {
      await release();
    }
  }

  /** state 파일 파싱 + 살아있음/죽음 분리. 죽은 것 있으면 파일 갱신. */
  private async readReconciled(): Promise<{ live: ActiveSession[]; reaped: ActiveSession[] }> {
    const raw = await readFile(this.statePath, 'utf8').catch(() => '[]');
    const parsed = this.safeParseArray(raw);
    const live: ActiveSession[] = [];
    const reaped: ActiveSession[] = [];
    for (const s of parsed) {
      (this.isAliveSession(s) ? live : reaped).push(s);
    }
    if (reaped.length > 0) {
      await this.atomicWrite(JSON.stringify(live, null, 2));
    }
    return { live, reaped };
  }

  private safeParseArray(raw: string): ActiveSession[] {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as ActiveSession[]) : [];
    } catch {
      return [];
    }
  }

  /** 호스트 다르면 보존 (판단 불가), 호스트 같으면 pid 로 판단. */
  private isAliveSession(s: ActiveSession): boolean {
    if (s.hostname !== this.hostname()) return true;
    return this.isAlivePid(s.pid);
  }

  /** Phase 4 OPS-403 패턴: tmp write + rename 원자 교체. */
  private async atomicWrite(data: string): Promise<void> {
    const tmp = `${this.statePath}.tmp.${this.currentPid()}.${Date.now()}`;
    try {
      await writeFile(tmp, data, 'utf8');
      await rename(tmp, this.statePath);
    } catch (err) {
      await unlink(tmp).catch(() => {
        /* best-effort */
      });
      throw err;
    }
  }
}
