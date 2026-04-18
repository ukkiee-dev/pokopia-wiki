import { describe, expect, it } from 'vitest';

import { redact, redactObject } from './redact';

describe('redact()', () => {
  it('masks Telegram bot tokens as <TELEGRAM_TOKEN>', () => {
    // Telegram bot token 형식: 7-10자리 숫자 : 30+자 영숫자/-/_ (CRAWLING_STRATEGY §22.3 TOKEN_PATTERNS[0])
    const input = 'TELEGRAM_BOT_TOKEN=1234567:ABCdefGHIjklMNOpqrSTUvwxYZ0123456_-';
    const output = redact(input);
    expect(output).toBe('TELEGRAM_BOT_TOKEN=<TELEGRAM_TOKEN>');
  });

  it('masks Telegram API URL embedded tokens while preserving URL structure', () => {
    // Phase 3 감사 SEC-001: URL 안의 bot<TOKEN> 은 단어 경계 부재로 기존 패턴이 잡지 못함.
    const input = 'GET https://api.telegram.org/bot1234567:ABCdefGHIjklMNOpqrSTUvwxYZ0123456_-/sendMessage failed';
    const output = redact(input);
    expect(output).toBe('GET https://api.telegram.org/bot<TELEGRAM_TOKEN>/sendMessage failed');
  });

  it('masks Bearer tokens in Authorization headers as Bearer <REDACTED>', () => {
    const input = 'Authorization: Bearer eyJhbGciOi.eyJzdWIi.SflKxw';
    const output = redact(input);
    expect(output).toBe('Authorization: Bearer <REDACTED>');
  });

  it('masks sensitive cookie values (cf_clearance / session) to <REDACTED>', () => {
    const input = 'Cookie: cf_clearance=abc123; session=xyz';
    const output = redact(input);
    expect(output).toBe('Cookie: cf_clearance=<REDACTED>; session=<REDACTED>');
  });

  it('masks Basic auth credentials', () => {
    // RFC 7617: Basic <base64(user:pass)>
    const input = 'Authorization: Basic dXNlcjpwYXNzd29yZA==';
    const output = redact(input);
    expect(output).toBe('Authorization: Basic <REDACTED>');
  });

  it('masks OAuth tokens in JSON response bodies while preserving keys', () => {
    const input = '{"access_token":"eyJhbG+ci/Oi=","refresh_token":"rt_abc123","scope":"read"}';
    const output = redact(input);
    expect(output).toBe('{"access_token":"<REDACTED>","refresh_token":"<REDACTED>","scope":"read"}');
  });

  it('masks CSRF-family and JWT cookie values', () => {
    // JWT 는 `.` 을 포함하지만 쿠키 값 캡처 패턴 `[^;\s,]+` 가 허용
    const input = 'Cookie: csrf=tok1; xsrf=tok2; jwt=eyJhbG.eyJzdWIi.sig; refresh=rt_xyz';
    const output = redact(input);
    expect(output).toBe('Cookie: csrf=<REDACTED>; xsrf=<REDACTED>; jwt=<REDACTED>; refresh=<REDACTED>');
  });

  it('handles base64 padding characters (+/=) in Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbG+ciO/iJI=.eyJzdWIi.abc';
    const output = redact(input);
    expect(output).toBe('Authorization: Bearer <REDACTED>');
  });
});

describe('redactObject()', () => {
  it('round-trips through JSON.stringify/parse while redacting sensitive string values', () => {
    const input = { token: 'Bearer abc', meta: { note: 'ok' } };
    const output = redactObject(input);
    expect(output).toEqual({ token: 'Bearer <REDACTED>', meta: { note: 'ok' } });
  });

  it('returns fallback marker when object contains BigInt (JSON.stringify throws)', () => {
    // BigInt 는 JSON.stringify 에서 TypeError
    const input = { balance: 9007199254740993n, currency: 'KRW' } as unknown;
    const output = redactObject(input) as { __redact_error?: string };
    expect(output.__redact_error).toMatch(/BigInt|serialize/i);
  });

  it('returns fallback marker when object has a circular reference', () => {
    type Node = { name: string; self?: Node };
    const input: Node = { name: 'root' };
    input.self = input;
    const output = redactObject(input) as { __redact_error?: string };
    expect(output.__redact_error).toMatch(/circular|cycle|convert/i);
  });
});
