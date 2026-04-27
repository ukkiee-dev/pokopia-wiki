/**
 * driver-page.ts TDD — X-509 #7 (Phase 5 ARCH-503 + ARCH-508 해소).
 *
 * 검증 대상:
 *   - `resolveDriverKind` 가 SourceSite 4 종을 정확히 매핑
 *   - exhaustive switch 의 `never` fallback 으로 신규 소스 누락이 컴파일 오류로 노출
 *
 * 구조적 타입(`DriverPage` / `DriverContext` / `AddInitScriptCapable` 등) 자체는
 * 런타임 검증 대상이 아니라 TypeScript 컴파일 단계에서 검사된다. 별도 테스트
 * 없이 type-check 로 회귀를 잡는다.
 */

import type { SourceSite } from '@pokopia-wiki/shared';
import { describe, expect, it } from 'vitest';

import {
  asDriverContext,
  asDriverPage,
  resolveDriverKind,
  type DriverKind,
} from './driver-page.js';

describe('resolveDriverKind', () => {
  it.each<readonly [SourceSite, DriverKind]>([
    ['serebii', 'none'],
    ['pokopiaGuide', 'playwright'],
    ['pokopoko', 'patchright'],
    ['namuwiki', 'patchright'],
  ])('maps %s → %s', (source, expected) => {
    expect(resolveDriverKind(source)).toBe(expected);
  });

  it('throws for unknown source (defensive against future enum drift)', () => {
    // SSoT 가 4 소스만 정의하지만, JSON/CLI 경계에서 unknown 이 흘러들 수 있다.
    // never fallback 이 throw 하는지만 확인 — 컴파일타임 exhaustiveness 는
    // tsc 가 보장하므로 여기서는 런타임 보험만 검증.
    expect(() => resolveDriverKind('unknown' as SourceSite)).toThrow(/unknown source/);
  });
});

describe('asDriverPage / asDriverContext', () => {
  it('asDriverPage returns the same reference (identity cast)', () => {
    const fake = { url: () => 'https://example.com', evaluate: async () => 0 };
    expect(asDriverPage(fake)).toBe(fake);
  });

  it('asDriverContext returns the same reference (identity cast)', () => {
    const fake = { addInitScript: async () => undefined, close: async () => undefined };
    expect(asDriverContext(fake)).toBe(fake);
  });
});
