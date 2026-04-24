/**
 * DetectionMonitor (Task 6.5) — CRAWLING_STRATEGY §12.1.
 *
 * 검증 대상:
 *   - HTTP 403 → block/high
 *   - HTTP 429 → rate_limit/high
 *   - "Just a moment..." 등 CF challenge markup → challenge/high
 *   - content-length < 500 → soft_block/medium
 *   - 봇 차단 키워드 ('access denied', 'bot detected' 등) → block/critical
 *   - captcha markup ('captcha', 'recaptcha', 'turnstile') → captcha/critical
 *   - DetectionSignal evidence/url/at 자동 주입
 */

import { describe, expect, it } from 'vitest';

import { detectBotFlags, type DetectablePage, type DetectableResponse } from './monitor.js';

function fakeResponse(args: { status: number; contentLength?: number }): DetectableResponse {
  const headers: Record<string, string> = {};
  if (args.contentLength !== undefined) {
    headers['content-length'] = String(args.contentLength);
  }
  return {
    status: () => args.status,
    headers: () => headers,
  };
}

function fakePage(args: { url: string; html: string }): DetectablePage {
  return {
    url: () => args.url,
    content: async () => args.html,
  };
}

describe('detectBotFlags HTTP status', () => {
  it('emits block/high on 403', async () => {
    const signals = await detectBotFlags(
      fakePage({ url: 'https://x', html: '<html><body>ok ok ok</body></html>'.padEnd(800) }),
      fakeResponse({ status: 403, contentLength: 800 }),
    );
    expect(signals.some((s) => s.type === 'block' && s.severity === 'high' && s.evidence === 'http_403')).toBe(true);
  });

  it('emits rate_limit/high on 429', async () => {
    const signals = await detectBotFlags(
      fakePage({ url: 'https://x', html: 'ok'.padEnd(800) }),
      fakeResponse({ status: 429, contentLength: 800 }),
    );
    expect(signals.some((s) => s.type === 'rate_limit' && s.severity === 'high' && s.evidence === 'http_429')).toBe(
      true,
    );
  });
});

describe('detectBotFlags Cloudflare challenge', () => {
  it('emits challenge/high on "Just a moment..."', async () => {
    const html = '<html><body>Just a moment...</body></html>'.padEnd(800);
    const signals = await detectBotFlags(
      fakePage({ url: 'https://x', html }),
      fakeResponse({ status: 200, contentLength: 800 }),
    );
    expect(signals.some((s) => s.type === 'challenge' && s.severity === 'high')).toBe(true);
  });

  it('emits challenge/high on "Checking your browser"', async () => {
    const html = '<html><body>Checking your browser before access</body></html>'.padEnd(800);
    const signals = await detectBotFlags(
      fakePage({ url: 'https://x', html }),
      fakeResponse({ status: 200, contentLength: 800 }),
    );
    expect(signals.some((s) => s.type === 'challenge')).toBe(true);
  });
});

describe('detectBotFlags small response', () => {
  it('emits soft_block/medium when content-length < 500', async () => {
    const signals = await detectBotFlags(
      fakePage({ url: 'https://x', html: 'tiny' }),
      fakeResponse({ status: 200, contentLength: 100 }),
    );
    expect(signals.some((s) => s.type === 'soft_block' && s.severity === 'medium')).toBe(true);
  });

  it('does not emit soft_block when content-length missing or >= 500', async () => {
    const signals = await detectBotFlags(
      fakePage({ url: 'https://x', html: 'a'.repeat(800) }),
      fakeResponse({ status: 200 }),
    );
    expect(signals.some((s) => s.type === 'soft_block')).toBe(false);
  });
});

describe('detectBotFlags bot keyword', () => {
  it('emits block/critical on "access denied"', async () => {
    const html = '<html><body>Access Denied. Suspicious activity detected.</body></html>'.padEnd(800);
    const signals = await detectBotFlags(
      fakePage({ url: 'https://x', html }),
      fakeResponse({ status: 200, contentLength: 800 }),
    );
    const block = signals.find((s) => s.type === 'block' && s.severity === 'critical');
    expect(block).toBeDefined();
    expect(block?.evidence).toMatch(/access denied|suspicious activity/i);
  });
});

describe('detectBotFlags captcha markup', () => {
  it('emits captcha/critical on "turnstile"', async () => {
    const html = '<html><body><iframe src="https://challenges.cloudflare.com/turnstile"></iframe></body></html>'.padEnd(
      800,
    );
    const signals = await detectBotFlags(
      fakePage({ url: 'https://x', html }),
      fakeResponse({ status: 200, contentLength: 800 }),
    );
    expect(signals.some((s) => s.type === 'captcha' && s.severity === 'critical')).toBe(true);
  });
});

describe('detectBotFlags meta enrichment', () => {
  it('attaches at/url to every signal', async () => {
    const fixedNow = new Date('2026-04-24T09:00:00Z');
    const signals = await detectBotFlags(
      fakePage({ url: 'https://serebii.net/x', html: 'a'.repeat(800) }),
      fakeResponse({ status: 403, contentLength: 800 }),
      { now: () => fixedNow },
    );
    for (const s of signals) {
      expect(s.url).toBe('https://serebii.net/x');
      expect(s.at?.toISOString()).toBe(fixedNow.toISOString());
    }
  });
});
