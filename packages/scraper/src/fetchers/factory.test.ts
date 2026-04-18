/**
 * FetcherFactory TDD 테스트 (Task 4.10).
 *
 * 실제 HTTP 호출 금지. 구현 인스턴스 타입만 검증.
 * Persona 누락 시 PersonaRequiredError 를 throw 하는지 확인.
 *
 * NOTE: PlaywrightFetcher / PatchrightFetcher / PatchrightCfFetcher 는
 * 생성자에서 브라우저를 띄우지 않고 lazy 로 열므로, instanceof 확인까지는
 * launch 없이 안전히 가능하다.
 */

import { describe, expect, it } from 'vitest';

import { HtmlCache } from '../cache/html-cache.js';
import type { BrowserPersona } from '../persona/types.js';
import { RobotsChecker } from '../robots/checker.js';
import { PersonaRequiredError } from './errors.js';
import { createFetcher, resolveTier } from './factory.js';
import { KyFetcher } from './ky-fetcher.js';
import { PatchrightCfFetcher } from './patchright-cf-fetcher.js';
import { PatchrightFetcher } from './patchright-fetcher.js';
import { PlaywrightFetcher } from './playwright-fetcher.js';

/** 고정 페르소나 fixture — 테스트 격리를 위해 storageState 경로도 tmp 제안. */
const KOREAN_FAN: BrowserPersona = {
  id: 'korean-pokemon-fan',
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
  storageStatePath: '/tmp/pokopia-test-persona-kpf.json',
  usedFor: ['pokopiaGuide', 'pokopoko'],
};

const NAMU_RESEARCHER: BrowserPersona = {
  id: 'namuwiki-researcher',
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
  storageStatePath: '/tmp/pokopia-test-persona-nwr.json',
  usedFor: ['namuwiki'],
};

describe('resolveTier()', () => {
  it('maps serebii → 0', () => {
    expect(resolveTier('serebii')).toBe(0);
  });
  it('maps pokopiaGuide → 1', () => {
    expect(resolveTier('pokopiaGuide')).toBe(1);
  });
  it('maps pokopoko → 2', () => {
    expect(resolveTier('pokopoko')).toBe(2);
  });
  it('maps namuwiki → 3', () => {
    expect(resolveTier('namuwiki')).toBe(3);
  });
});

const robots = new RobotsChecker();
const cache = new HtmlCache('/tmp/pokopia-test-cache');

describe('createFetcher() — returns correct implementation per tier', () => {
  it('returns KyFetcher for serebii (T0) without persona', () => {
    const fetcher = createFetcher('serebii', { robots, cache });
    expect(fetcher).toBeInstanceOf(KyFetcher);
  });

  it('returns PlaywrightFetcher for pokopiaGuide (T1) with persona', () => {
    const fetcher = createFetcher('pokopiaGuide', { robots, cache, persona: KOREAN_FAN });
    expect(fetcher).toBeInstanceOf(PlaywrightFetcher);
  });

  it('returns PatchrightFetcher for pokopoko (T2) with persona', () => {
    const fetcher = createFetcher('pokopoko', { robots, cache, persona: KOREAN_FAN });
    expect(fetcher).toBeInstanceOf(PatchrightFetcher);
  });

  it('returns PatchrightCfFetcher for namuwiki (T3) with persona', () => {
    const fetcher = createFetcher('namuwiki', { robots, cache, persona: NAMU_RESEARCHER });
    expect(fetcher).toBeInstanceOf(PatchrightCfFetcher);
  });
});

describe('createFetcher() — persona guard', () => {
  it('throws PersonaRequiredError when T1 called without persona', () => {
    expect(() => createFetcher('pokopiaGuide', { robots, cache })).toThrow(PersonaRequiredError);
  });

  it('throws PersonaRequiredError when T2 called without persona', () => {
    expect(() => createFetcher('pokopoko', { robots, cache })).toThrow(PersonaRequiredError);
  });

  it('throws PersonaRequiredError when T3 called without persona', () => {
    expect(() => createFetcher('namuwiki', { robots, cache })).toThrow(PersonaRequiredError);
  });
});
