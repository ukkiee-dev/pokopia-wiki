/**
 * Fetcher 계층 커스텀 에러 → ErrorType 변환 (ARCH-607).
 *
 * 배경:
 *   - `fetchers/errors.ts` 의 `SessionAbortError` / `RateLimitExceededError` 등 5 종
 *     커스텀 에러(§11.1.1 SSoT)가 호출자에서 `ErrorReaction.react(error, ctx)` 의
 *     `error: ErrorType` 인자로 전환될 때, 변환 규칙이 호출자마다 수동 분기여서
 *     일관성·누락 리스크가 있었다.
 *   - 본 모듈은 "어떤 Throwable 이든 ErrorType 으로 안전 매핑" 단일 계약 제공.
 *
 * 매핑 원칙:
 *   - 페이지 관찰 신호 (BLOCK/RATE_LIMIT/TIMEOUT/CF/CAPTCHA/SOFT_THROTTLE) → 해당
 *     ErrorType.
 *   - 프로그래밍 오류 (PersonaRequiredError, CachePathTraversalError,
 *     SkippedByRobotsError) → UNKNOWN (호출자가 별도 처리, ErrorReaction 은 abort-session).
 *
 * SessionAbortError.reason 은 §11.1 의 `String(ErrorType)` 출력과 동일하다는
 * 관례를 신뢰. 혹시 포맷이 달라도 부분 문자열 포함 매칭으로 fallback.
 */

import {
  CachePathTraversalError,
  PersonaRequiredError,
  RateLimitExceededError,
  SessionAbortError,
  SkippedByRobotsError,
} from '../fetchers/errors.js';
import { ErrorType } from './reaction.js';

/**
 * 임의의 Throwable 을 ErrorType 리터럴로 변환. 매핑 불가 시 `UNKNOWN`.
 */
export function classifyFetcherError(err: unknown): ErrorType {
  if (err instanceof SessionAbortError) return mapSessionAbort(err.reason);
  if (err instanceof RateLimitExceededError) return ErrorType.RATE_LIMIT_429;
  if (err instanceof SkippedByRobotsError) return ErrorType.UNKNOWN;
  if (err instanceof PersonaRequiredError) return ErrorType.UNKNOWN;
  if (err instanceof CachePathTraversalError) return ErrorType.UNKNOWN;

  if (err instanceof Error) {
    return mapByMessage(err.message);
  }
  return ErrorType.UNKNOWN;
}

function mapSessionAbort(reason: string): ErrorType {
  const upper = reason.toUpperCase();
  // 순서 중요: 구체적인 문맥(CF) 를 TIMEOUT 같은 일반 키워드보다 먼저 검사.
  if (upper === 'BLOCK_403' || upper.includes('403')) return ErrorType.BLOCK_403;
  if (upper === 'RATE_LIMIT_429' || upper.includes('429')) return ErrorType.RATE_LIMIT_429;
  if (upper === 'CLOUDFLARE_CHALLENGE' || upper.includes('CLOUDFLARE') || upper.includes(' CF ') || upper.startsWith('CF ') || upper.includes('CHALLENGE')) {
    return ErrorType.CLOUDFLARE_CHALLENGE;
  }
  if (upper === 'CAPTCHA' || upper.includes('CAPTCHA')) return ErrorType.CAPTCHA;
  if (upper === 'SOFT_THROTTLE' || upper.includes('SOFT_THROTTLE')) return ErrorType.SOFT_THROTTLE;
  if (upper === 'TIMEOUT' || upper.includes('TIMEOUT')) return ErrorType.TIMEOUT;
  return ErrorType.UNKNOWN;
}

function mapByMessage(message: string): ErrorType {
  const lower = message.toLowerCase();
  if (lower.includes('timeout')) return ErrorType.TIMEOUT;
  if (lower.includes('403') || lower.includes('forbidden')) return ErrorType.BLOCK_403;
  if (lower.includes('429') || lower.includes('rate limit')) return ErrorType.RATE_LIMIT_429;
  if (lower.includes('cloudflare') || lower.includes('challenge')) return ErrorType.CLOUDFLARE_CHALLENGE;
  if (lower.includes('captcha')) return ErrorType.CAPTCHA;
  return ErrorType.UNKNOWN;
}
