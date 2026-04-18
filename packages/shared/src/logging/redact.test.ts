import { describe, expect, it } from 'vitest';

import { redact, redactObject } from './redact';

describe('redact()', () => {
  it('masks Telegram bot tokens as <TELEGRAM_TOKEN>', () => {
    // Telegram bot token 형식: 7-10자리 숫자 : 30+자 영숫자/-/_ (CRAWLING_STRATEGY §22.3 TOKEN_PATTERNS[0])
    const input = 'TELEGRAM_BOT_TOKEN=1234567:ABCdefGHIjklMNOpqrSTUvwxYZ0123456_-';
    const output = redact(input);
    expect(output).toBe('TELEGRAM_BOT_TOKEN=<TELEGRAM_TOKEN>');
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
});

describe('redactObject()', () => {
  it('round-trips through JSON.stringify/parse while redacting sensitive string values', () => {
    const input = { token: 'Bearer abc', meta: { note: 'ok' } };
    const output = redactObject(input);
    expect(output).toEqual({ token: 'Bearer <REDACTED>', meta: { note: 'ok' } });
  });
});
