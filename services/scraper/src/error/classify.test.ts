/**
 * classifyFetcherError (ARCH-607) 단위 테스트.
 *
 * 검증:
 *   - SessionAbortError reason 별 매핑 (BLOCK_403 / 429 / TIMEOUT / CF / CAPTCHA / SOFT_THROTTLE)
 *   - RateLimitExceededError → RATE_LIMIT_429
 *   - SkippedByRobotsError / PersonaRequiredError / CachePathTraversalError → UNKNOWN
 *   - 일반 Error 의 message heuristic 매핑
 *   - 비-Error (string, null) → UNKNOWN
 */

import { describe, expect, it } from 'vitest';

import {
  CachePathTraversalError,
  PersonaRequiredError,
  RateLimitExceededError,
  SessionAbortError,
  SkippedByRobotsError,
} from '../fetchers/errors.js';
import { classifyFetcherError } from './classify.js';
import { ErrorType } from './reaction.js';

describe('classifyFetcherError — SessionAbortError', () => {
  it.each<readonly [string, ErrorType]>([
    ['BLOCK_403', ErrorType.BLOCK_403],
    ['RATE_LIMIT_429', ErrorType.RATE_LIMIT_429],
    ['TIMEOUT', ErrorType.TIMEOUT],
    ['CLOUDFLARE_CHALLENGE', ErrorType.CLOUDFLARE_CHALLENGE],
    ['CAPTCHA', ErrorType.CAPTCHA],
    ['SOFT_THROTTLE', ErrorType.SOFT_THROTTLE],
  ])('reason=%s → %s', (reason, expected) => {
    expect(classifyFetcherError(new SessionAbortError(reason))).toBe(expected);
  });

  it('fallback substring match for free-form reason', () => {
    expect(classifyFetcherError(new SessionAbortError('got http 403 from origin'))).toBe(ErrorType.BLOCK_403);
    expect(classifyFetcherError(new SessionAbortError('CF 60s timeout'))).toBe(ErrorType.CLOUDFLARE_CHALLENGE);
  });

  it('unknown reason → UNKNOWN', () => {
    expect(classifyFetcherError(new SessionAbortError('weird custom reason'))).toBe(ErrorType.UNKNOWN);
  });
});

describe('classifyFetcherError — 5 종 커스텀 에러', () => {
  it('RateLimitExceededError → RATE_LIMIT_429', () => {
    expect(classifyFetcherError(new RateLimitExceededError('serebii', 'navigation', 80, 81))).toBe(
      ErrorType.RATE_LIMIT_429,
    );
  });
  it('SkippedByRobotsError → UNKNOWN', () => {
    expect(classifyFetcherError(new SkippedByRobotsError('https://x', 'serebii'))).toBe(ErrorType.UNKNOWN);
  });
  it('PersonaRequiredError → UNKNOWN', () => {
    expect(classifyFetcherError(new PersonaRequiredError('pokopiaGuide', 1))).toBe(ErrorType.UNKNOWN);
  });
  it('CachePathTraversalError → UNKNOWN', () => {
    expect(classifyFetcherError(new CachePathTraversalError('serebii', '/evil', '/safe'))).toBe(ErrorType.UNKNOWN);
  });
});

describe('classifyFetcherError — plain Error message heuristics', () => {
  it.each<readonly [string, ErrorType]>([
    ['Request timeout after 30s', ErrorType.TIMEOUT],
    ['HTTP 403 Forbidden', ErrorType.BLOCK_403],
    ['Rate limit exceeded: 429', ErrorType.RATE_LIMIT_429],
    ['Cloudflare challenge detected', ErrorType.CLOUDFLARE_CHALLENGE],
    ['Captcha iframe present', ErrorType.CAPTCHA],
  ])('message=%j → %s', (msg, expected) => {
    expect(classifyFetcherError(new Error(msg))).toBe(expected);
  });

  it('unmatched message → UNKNOWN', () => {
    expect(classifyFetcherError(new Error('unexplained glitch'))).toBe(ErrorType.UNKNOWN);
  });
});

describe('classifyFetcherError — non-Error throws', () => {
  it('string throw → UNKNOWN', () => {
    expect(classifyFetcherError('boom')).toBe(ErrorType.UNKNOWN);
  });
  it('null → UNKNOWN', () => {
    expect(classifyFetcherError(null)).toBe(ErrorType.UNKNOWN);
  });
});
