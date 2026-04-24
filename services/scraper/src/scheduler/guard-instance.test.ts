/**
 * guard-instance.ts (X-509 #6) 단위 테스트.
 *
 * 검증 대상:
 *   - initGuard 두 번째 호출 → throw
 *   - getGuard 미초기화 → throw
 *   - 같은 인스턴스 반환 (싱글톤 보장)
 *   - __resetGuardForTest 후 재초기화 가능
 *   - hasGuard 토글
 */

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetGuardForTest, getGuard, hasGuard, initGuard } from './guard-instance.js';

let dir: string;
beforeEach(() => {
  __resetGuardForTest();
  dir = mkdtempSync(path.join(os.tmpdir(), 'pokopia-guard-singleton-'));
});
afterEach(() => {
  __resetGuardForTest();
  rmSync(dir, { recursive: true, force: true });
});

describe('guard-instance singleton', () => {
  it('initGuard returns an instance and getGuard returns the same one', () => {
    const a = initGuard({ statePath: path.join(dir, 'a.json') });
    const b = getGuard();
    expect(b).toBe(a);
  });

  it('initGuard throws on second call', () => {
    initGuard({ statePath: path.join(dir, 'a.json') });
    expect(() => initGuard({ statePath: path.join(dir, 'b.json') })).toThrow(/already initialized/);
  });

  it('getGuard throws when not initialized', () => {
    expect(() => getGuard()).toThrow(/not initialized/);
  });

  it('hasGuard reflects state', () => {
    expect(hasGuard()).toBe(false);
    initGuard({ statePath: path.join(dir, 'a.json') });
    expect(hasGuard()).toBe(true);
  });

  it('__resetGuardForTest clears so init can run again', () => {
    initGuard({ statePath: path.join(dir, 'a.json') });
    __resetGuardForTest();
    expect(hasGuard()).toBe(false);
    expect(() => initGuard({ statePath: path.join(dir, 'b.json') })).not.toThrow();
  });
});
