/**
 * PersonaManager — CRAWLING_STRATEGY §5.1 / §5.2.
 *
 * 책임:
 *   - 현재 시각 → activeHours 매칭 → 활성 페르소나 반환 (`pickActive`)
 *   - source → 담당 페르소나 매핑 (`forSource`)
 *   - 위험 프로필 경로 (`~/Library/Application Support/Google/Chrome` 등) 차단
 *   - 런타임 상태 영속 (`getState` / `saveState` / `touch` / `penalize` /
 *     `retire` / `markWarmed`) → `data/state/persona-<id>.json`
 *
 * 설계 원칙:
 *   - **정체성 (PERSONAS 상수)** 은 불변, **런타임 상태** 는 파일로 분리 — 탐지
 *     신호 감점·워밍 완료 플래그 등 가변 값이 정의 상수를 오염시키지 않음.
 *   - 상태 파일 쓰기는 **atomic** (tmp + rename, POSIX 보장) — Phase 4 OPS-403
 *     과 동일한 크래시 안전성 패턴.
 *   - PersonaManager 자체는 락 없음 — 단일 scraper 프로세스 전제 (§6.4
 *     ConcurrencyGuard 가 상위에서 동시성 제어).
 *   - 생성자에서 모든 페르소나의 `profilePath` 를 사전 검증 → 유저 Chrome 경로
 *     공유로 인한 프로필 손상 사고 조기 실패 (§5.2 경고 사항).
 */

import { realpathSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { atomicWriteJson, type SourceSite } from '@pokopia-wiki/shared';

import { repoPath } from '../paths.js';
import { PERSONAS } from './definitions.js';
import type { BrowserPersona, PersonaRuntimeState } from './types.js';

/**
 * Chrome / Chromium 유저 프로필 표준 경로 — 절대 페르소나 경로로 쓰지 않는다.
 *
 * 유저의 북마크·확장 프로그램·로그인 쿠키와 충돌 시 프로필 손상 (§5.2). macOS /
 * Linux / Windows 주요 경로를 모두 커버.
 */
const USER_CHROME_PATHS: readonly string[] = [
  path.join(os.homedir(), 'Library/Application Support/Google/Chrome'),
  path.join(os.homedir(), 'Library/Application Support/Chromium'),
  path.join(os.homedir(), '.config/google-chrome'),
  path.join(os.homedir(), '.config/chromium'),
  path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data'),
  path.join(os.homedir(), 'AppData/Local/Chromium/User Data'),
];

/**
 * 페르소나 `profilePath` 가 유저 Chrome 경로에 속할 때 throw.
 *
 * PersonaManager 생성자에서 즉시 발생 — 설정 실수가 런타임까지 도달해 프로필을
 * 오염시키기 전에 fail-fast.
 */
export class InvalidProfilePathError extends Error {
  override readonly name = 'InvalidProfilePathError';

  constructor(
    public readonly personaId: string,
    public readonly profilePath: string,
  ) {
    super(`persona "${personaId}" profilePath resolves to user Chrome data: ${profilePath}`);
  }
}

/**
 * 요청한 id 또는 source 가 어느 페르소나에도 매치되지 않을 때 throw.
 *
 * - `forSource('serebii')` 는 T0 로 페르소나 없음 — `usedFor` 에 serebii 가
 *   없으므로 이 에러 발생. 호출부는 T0 를 사전에 분기해야 한다.
 */
export class PersonaNotFoundError extends Error {
  override readonly name = 'PersonaNotFoundError';

  constructor(public readonly key: string) {
    super(`no persona matches: ${key}`);
  }
}

export class PersonaManager {
  constructor(private readonly personas: readonly BrowserPersona[] = PERSONAS) {
    for (const persona of this.personas) {
      this.assertSafeProfilePath(persona);
    }
  }

  /**
   * 현재 시각이 어느 페르소나의 activeHours 구간에 속하는지 조회.
   *
   * `null` 반환은 "지금은 활동 시간이 아님" → 상위에서 세션을 skip 해야 함.
   * activeHours 미정의 페르소나는 선택 대상에서 제외.
   */
  pickActive(now: Date = new Date()): BrowserPersona | null {
    const hour = this.hourInSeoul(now);
    const active = this.personas.find(
      (p) => p.activeHours !== undefined && hour >= p.activeHours.start && hour < p.activeHours.end,
    );
    return active ?? null;
  }

  /**
   * 주어진 source 를 담당하는 페르소나.
   *
   * `usedFor` 매핑에서 정확히 1개 매칭 전제 (definitions.ts 가 보장). 0 개면
   * `PersonaNotFoundError` — T0 (serebii) 는 호출부에서 사전에 분기해야 한다.
   */
  forSource(source: SourceSite): BrowserPersona {
    const match = this.personas.find((p) => p.usedFor.includes(source));
    if (!match) throw new PersonaNotFoundError(source);
    return match;
  }

  /** 정의된 페르소나 목록 (얕은 readonly 복사). */
  list(): readonly BrowserPersona[] {
    return this.personas;
  }

  /**
   * 런타임 상태 조회 — 파일이 없거나 파싱 실패면 초기값 반환 (쓰기는 안 함).
   *
   * 첫 호출 시 항상 "healthScore=100, warmedUp=false, lastUsed=null" 로 시작.
   */
  async getState(id: string): Promise<PersonaRuntimeState> {
    if (!this.personas.some((p) => p.id === id)) {
      throw new PersonaNotFoundError(id);
    }

    const filePath = this.stateFilePath(id);
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return this.normalizeState(id, parsed);
    } catch {
      return this.initialState(id);
    }
  }

  /** 런타임 상태 영속 — shared atomic write helper (Phase 5 STYLE-501 공용화). */
  async saveState(state: PersonaRuntimeState): Promise<void> {
    const filePath = this.stateFilePath(state.id);
    await mkdir(path.dirname(filePath), { recursive: true });
    await atomicWriteJson(filePath, state);
  }

  /** 세션 시작 시 `lastUsed` 갱신. 상태 파일이 없으면 자동 생성. */
  async touch(id: string, now: Date = new Date()): Promise<PersonaRuntimeState> {
    const state = await this.getState(id);
    const next: PersonaRuntimeState = { ...state, lastUsed: now.toISOString() };
    await this.saveState(next);
    return next;
  }

  /**
   * 탐지 신호 발생 시 `healthScore` 감점.
   *
   * 0 미만으로 떨어지지 않도록 clamp. 0 에 도달하면 `retire` 를 별도 호출해
   * 페르소나를 활성 목록에서 제외할 책임은 상위 (DetectionMonitor §12).
   */
  async penalize(id: string, delta: number): Promise<PersonaRuntimeState> {
    const state = await this.getState(id);
    const next: PersonaRuntimeState = {
      ...state,
      healthScore: Math.max(0, state.healthScore - delta),
    };
    await this.saveState(next);
    return next;
  }

  /** 페르소나 은퇴 — `healthScore=0`, `retired` 기록. */
  async retire(id: string, reason: string, now: Date = new Date()): Promise<PersonaRuntimeState> {
    const state = await this.getState(id);
    const next: PersonaRuntimeState = {
      ...state,
      healthScore: 0,
      retired: { at: now.toISOString(), reason },
    };
    await this.saveState(next);
    return next;
  }

  /** §5.4 워밍 완료 플래그 세팅. `ProfileWarmer` 가 마지막 단계에서 호출. */
  async markWarmed(id: string): Promise<PersonaRuntimeState> {
    const state = await this.getState(id);
    const next: PersonaRuntimeState = { ...state, warmedUp: true };
    await this.saveState(next);
    return next;
  }

  /**
   * §12.3 — healthScore < 50 시 2 주 cooldown. retire 와 달리 시각 만료 후 자동
   * 복귀하므로 일시 비활성에 적합. 호출자(HealthScorer) 가 정책 결정.
   */
  async cooldown(id: string, until: Date): Promise<PersonaRuntimeState> {
    const state = await this.getState(id);
    const next: PersonaRuntimeState = { ...state, cooldownUntil: until.toISOString() };
    await this.saveState(next);
    return next;
  }

  /**
   * 현재 시각이 cooldownUntil 이전이면 true. SessionManager 가 pickActive 결과를
   * 다시 거른다 (pickActive 자체는 동기 — file I/O 분리 유지).
   */
  async isCoolingDown(id: string, now: Date = new Date()): Promise<boolean> {
    const state = await this.getState(id);
    if (state.cooldownUntil === null) return false;
    return now.getTime() < Date.parse(state.cooldownUntil);
  }

  /** Asia/Seoul 기준 현재 시각의 hour (0~23). Intl 기반 — DST 없어서 안정. */
  private hourInSeoul(now: Date): number {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      hour12: false,
    });
    // "HH" 또는 "HH, " 형식 모두 커버하기 위해 숫자 파싱.
    const parsed = Number.parseInt(fmt.format(now), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private stateFilePath(id: string): string {
    return repoPath('data', 'state', `persona-${id}.json`);
  }

  private initialState(id: string): PersonaRuntimeState {
    return {
      id,
      healthScore: 100,
      warmedUp: false,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      retired: null,
      cooldownUntil: null,
    };
  }

  /**
   * JSON 에서 읽은 값을 PersonaRuntimeState 로 정규화.
   *
   * 타입이 엉성하게 저장됐거나 구버전 필드가 없어도 안전하게 복구. 누락 필드는
   * `initialState` 에서 가져옴.
   */
  private normalizeState(id: string, parsed: unknown): PersonaRuntimeState {
    const base = this.initialState(id);
    if (parsed === null || typeof parsed !== 'object') return base;
    const obj = parsed as Record<string, unknown>;

    return {
      id,
      healthScore: typeof obj['healthScore'] === 'number' ? obj['healthScore'] : base.healthScore,
      warmedUp: obj['warmedUp'] === true,
      createdAt: typeof obj['createdAt'] === 'string' ? obj['createdAt'] : base.createdAt,
      lastUsed: typeof obj['lastUsed'] === 'string' ? obj['lastUsed'] : obj['lastUsed'] === null ? null : null,
      retired: this.normalizeRetired(obj['retired']),
      cooldownUntil: typeof obj['cooldownUntil'] === 'string' ? obj['cooldownUntil'] : null,
    };
  }

  private normalizeRetired(raw: unknown): PersonaRuntimeState['retired'] {
    if (raw === null || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r['at'] === 'string' && typeof r['reason'] === 'string') {
      return { at: r['at'], reason: r['reason'] };
    }
    return null;
  }

  private assertSafeProfilePath(persona: BrowserPersona): void {
    if (persona.profilePath === undefined) return;
    // repo root 기준 상대라도 실제 해석은 절대 경로로 — resolve() 가 현재 cwd 를
    // 합치므로 `data/browser-profiles/*` 는 안전 위치로 해석된다.
    const resolved = path.resolve(persona.profilePath);
    this.assertNotUserChromePath(persona.id, resolved);

    // Phase 5 SEC-501 — symlink 우회 방어: 경로가 실존한다면 realpath 로 symlink
    // 를 풀어 유저 Chrome 경로와 재검증. 파일이 없으면(첫 실행) 정상이며, 이후
    // 디렉토리 생성이 symlink 로 일어나도 다음 인스턴스 생성 시 잡힌다.
    try {
      const realResolved = realpathSync(resolved);
      if (realResolved !== resolved) {
        this.assertNotUserChromePath(persona.id, realResolved);
      }
    } catch {
      // 경로 미존재 — 무시 (정상적인 워밍 전 상태).
    }
  }

  private assertNotUserChromePath(personaId: string, candidate: string): void {
    for (const dangerous of USER_CHROME_PATHS) {
      if (candidate === dangerous || candidate.startsWith(dangerous + path.sep)) {
        throw new InvalidProfilePathError(personaId, candidate);
      }
    }
  }
}
