/**
 * PersonaManager 스모크 테스트 (Task 5.2).
 *
 * - pickActive: Asia/Seoul 기준 시각 → activeHours 매칭.
 * - forSource: usedFor 매핑.
 * - InvalidProfilePathError: 유저 Chrome 경로 차단 (§5.2).
 *
 * 파일 I/O (getState / saveState) 는 REPO_ROOT 의존이라 단위 테스트에서 제외 —
 * 실제 영속 동작은 Phase 5 워밍·세션 통합 테스트에서 커버한다.
 */

import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { InvalidProfilePathError, PersonaManager, PersonaNotFoundError } from './manager';
import type { BrowserPersona } from './types';

describe('PersonaManager.pickActive', () => {
  const manager = new PersonaManager();

  it('picks korean-pokemon-fan during morning hours (09:00 KST)', () => {
    // 00:00 UTC === 09:00 KST (UTC+9, DST 없음) → activeHours [8,14) 구간.
    const utc = new Date('2026-04-24T00:00:00Z');
    expect(manager.pickActive(utc)?.id).toBe('korean-pokemon-fan');
  });

  it('picks namuwiki-researcher during evening hours (20:00 KST)', () => {
    // 11:00 UTC === 20:00 KST → activeHours [19,23) 구간.
    const utc = new Date('2026-04-24T11:00:00Z');
    expect(manager.pickActive(utc)?.id).toBe('namuwiki-researcher');
  });

  it('returns null between windows (16:00 KST)', () => {
    // 07:00 UTC === 16:00 KST — 오후 공백.
    const utc = new Date('2026-04-24T07:00:00Z');
    expect(manager.pickActive(utc)).toBeNull();
  });

  it('returns null in deep night (02:00 KST)', () => {
    // 17:00 UTC === 02:00 KST (다음 날 새벽).
    const utc = new Date('2026-04-24T17:00:00Z');
    expect(manager.pickActive(utc)).toBeNull();
  });
});

describe('PersonaManager.forSource', () => {
  const manager = new PersonaManager();

  it('maps pokopiaGuide and pokopoko to korean-pokemon-fan', () => {
    expect(manager.forSource('pokopiaGuide').id).toBe('korean-pokemon-fan');
    expect(manager.forSource('pokopoko').id).toBe('korean-pokemon-fan');
  });

  it('maps namuwiki to namuwiki-researcher', () => {
    expect(manager.forSource('namuwiki').id).toBe('namuwiki-researcher');
  });

  it('throws PersonaNotFoundError for serebii (T0 — no persona)', () => {
    expect(() => manager.forSource('serebii')).toThrow(PersonaNotFoundError);
  });
});

describe('PersonaManager profilePath safety (§5.2)', () => {
  it('throws InvalidProfilePathError for user Chrome data dir', () => {
    const danger = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
    const dangerous: BrowserPersona[] = [
      {
        id: 'oops',
        locale: 'ko-KR',
        timezone: 'Asia/Seoul',
        storageStatePath: 'data/browser-profiles/oops/storageState.json',
        usedFor: ['namuwiki'],
        profilePath: danger,
      },
    ];
    expect(() => new PersonaManager(dangerous)).toThrow(InvalidProfilePathError);
  });

  it('throws for a subpath inside user Chrome data', () => {
    const sub = path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Profile 1');
    const dangerous: BrowserPersona[] = [
      {
        id: 'oops-sub',
        locale: 'ko-KR',
        timezone: 'Asia/Seoul',
        storageStatePath: 'data/browser-profiles/oops-sub/storageState.json',
        usedFor: ['namuwiki'],
        profilePath: sub,
      },
    ];
    expect(() => new PersonaManager(dangerous)).toThrow(InvalidProfilePathError);
  });

  it('allows a project-local profilePath', () => {
    const safe: BrowserPersona[] = [
      {
        id: 'safe',
        locale: 'ko-KR',
        timezone: 'Asia/Seoul',
        storageStatePath: 'data/browser-profiles/safe/storageState.json',
        usedFor: ['namuwiki'],
        profilePath: 'data/browser-profiles/safe',
      },
    ];
    expect(() => new PersonaManager(safe)).not.toThrow();
  });

  it('allows a persona without profilePath (Phase 4 compat)', () => {
    const minimal: BrowserPersona[] = [
      {
        id: 'legacy',
        locale: 'ko-KR',
        timezone: 'Asia/Seoul',
        storageStatePath: 'data/browser-profiles/legacy/storageState.json',
        usedFor: ['namuwiki'],
      },
    ];
    expect(() => new PersonaManager(minimal)).not.toThrow();
  });
});

describe('PersonaManager.list', () => {
  const manager = new PersonaManager();

  it('returns the 2 configured personas with non-overlapping activeHours', () => {
    const list = manager.list();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.id).toSorted()).toEqual(['korean-pokemon-fan', 'namuwiki-researcher']);
  });
});
