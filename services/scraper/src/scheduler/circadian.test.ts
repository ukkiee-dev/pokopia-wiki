/**
 * CircadianScheduler (Task 6.1) — CRAWLING_STRATEGY §6.1.
 *
 * 검증 대상:
 *   - CIRCADIAN 상수 SSoT (활성 시간대 / 세션 길이 / 세션 간 간격)
 *   - pickSessionDurationMs / pickInterSessionGapMs random 주입으로 deterministic
 *   - hourInSeoul: UTC → KST hour 변환 (DST 없음 — +9h 직접)
 *   - isInActiveHours: 페르소나 activeHours 포함 검사
 *   - isWithinGlobalActiveHours: CIRCADIAN.activeHours 포함 검사
 *   - nextSessionStart:
 *     · lastEndAt + gap 이 페르소나 activeHours 안 → 그대로
 *     · activeHours 밖 → 가장 가까운 activeHours.start 의 KST 시각으로 점프
 */

import { describe, expect, it } from 'vitest';

import type { BrowserPersona } from '../persona/types.js';
import { CIRCADIAN, CircadianScheduler, hourInSeoul } from './circadian.js';

const KOREAN_FAN: BrowserPersona = {
  id: 'korean-pokemon-fan',
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
  storageStatePath: 'data/browser-profiles/korean-pokemon-fan/storageState.json',
  usedFor: ['pokopiaGuide', 'pokopoko'],
  activeHours: { start: 8, end: 14 },
};

const NAMU_RESEARCHER: BrowserPersona = {
  id: 'namuwiki-researcher',
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
  storageStatePath: 'data/browser-profiles/namuwiki-researcher/storageState.json',
  usedFor: ['namuwiki'],
  activeHours: { start: 19, end: 23 },
};

describe('CIRCADIAN constant', () => {
  it('matches CRAWLING_STRATEGY §6.1 SSoT', () => {
    expect(CIRCADIAN.activeHours).toEqual({ start: 8, end: 23 });
    expect(CIRCADIAN.sessions.minPerDay).toBe(2);
    expect(CIRCADIAN.sessions.maxPerDay).toBe(5);
    expect(CIRCADIAN.sessions.durationMinMs).toBe(15 * 60 * 1000);
    expect(CIRCADIAN.sessions.durationMaxMs).toBe(45 * 60 * 1000);
    expect(CIRCADIAN.sessions.interSessionMinMs).toBe(60 * 60 * 1000);
    expect(CIRCADIAN.sessions.interSessionMaxMs).toBe(4 * 60 * 60 * 1000);
  });
});

describe('hourInSeoul', () => {
  it.each<readonly [string, number]>([
    ['2026-04-24T00:00:00Z', 9], // UTC 00 → KST 09
    ['2026-04-24T04:00:00Z', 13],
    ['2026-04-24T15:00:00Z', 0], // UTC 15 → KST 24 → 0 (자정 직후)
    ['2026-04-24T23:00:00Z', 8],
  ])('UTC %s → KST hour %i', (iso, expected) => {
    expect(hourInSeoul(new Date(iso))).toBe(expected);
  });
});

describe('CircadianScheduler.pickSessionDurationMs', () => {
  it('returns minimum at random=0', () => {
    const sched = new CircadianScheduler({ random: () => 0 });
    expect(sched.pickSessionDurationMs()).toBe(CIRCADIAN.sessions.durationMinMs);
  });

  it('returns close to maximum as random→1', () => {
    const sched = new CircadianScheduler({ random: () => 0.999_999 });
    const ms = sched.pickSessionDurationMs();
    expect(ms).toBeGreaterThan(CIRCADIAN.sessions.durationMinMs);
    expect(ms).toBeLessThanOrEqual(CIRCADIAN.sessions.durationMaxMs);
  });
});

describe('CircadianScheduler.pickInterSessionGapMs', () => {
  it('returns minimum at random=0', () => {
    const sched = new CircadianScheduler({ random: () => 0 });
    expect(sched.pickInterSessionGapMs()).toBe(CIRCADIAN.sessions.interSessionMinMs);
  });

  it('returns midpoint at random=0.5', () => {
    const sched = new CircadianScheduler({ random: () => 0.5 });
    const expected = (CIRCADIAN.sessions.interSessionMinMs + CIRCADIAN.sessions.interSessionMaxMs) / 2;
    expect(sched.pickInterSessionGapMs()).toBe(expected);
  });
});

describe('CircadianScheduler.isInActiveHours', () => {
  it('true when KST hour falls within persona.activeHours', () => {
    const sched = new CircadianScheduler();
    // 2026-04-24T03:00Z = KST 12:00 — inside korean-fan [8,14)
    expect(sched.isInActiveHours(KOREAN_FAN, new Date('2026-04-24T03:00:00Z'))).toBe(true);
  });

  it('false when KST hour equals persona.activeHours.end (exclusive)', () => {
    const sched = new CircadianScheduler();
    // 2026-04-24T05:00Z = KST 14:00 — boundary, exclusive
    expect(sched.isInActiveHours(KOREAN_FAN, new Date('2026-04-24T05:00:00Z'))).toBe(false);
  });

  it('false for persona without activeHours', () => {
    const sched = new CircadianScheduler();
    const personaNoHours: BrowserPersona = { ...KOREAN_FAN, activeHours: undefined };
    expect(sched.isInActiveHours(personaNoHours, new Date('2026-04-24T03:00:00Z'))).toBe(false);
  });
});

describe('CircadianScheduler.isWithinGlobalActiveHours', () => {
  it('true at KST 12:00', () => {
    const sched = new CircadianScheduler();
    expect(sched.isWithinGlobalActiveHours(new Date('2026-04-24T03:00:00Z'))).toBe(true);
  });

  it('false at KST 02:00 (before 8)', () => {
    const sched = new CircadianScheduler();
    // UTC 17:00 → KST 26 → 02:00 next day
    expect(sched.isWithinGlobalActiveHours(new Date('2026-04-24T17:00:00Z'))).toBe(false);
  });
});

describe('CircadianScheduler.nextSessionStart', () => {
  it('returns lastEndAt + gap if still inside persona activeHours', () => {
    // lastEndAt = 2026-04-24T00:00Z = KST 09:00
    // gap = 1h (random=0) → next = KST 10:00 (inside [8,14))
    const sched = new CircadianScheduler({ random: () => 0 });
    const next = sched.nextSessionStart(KOREAN_FAN, new Date('2026-04-24T00:00:00Z'));
    expect(next.toISOString()).toBe('2026-04-24T01:00:00.000Z');
  });

  it('jumps to next persona.activeHours.start (next day) when gap exceeds activeHours.end', () => {
    // lastEndAt = 2026-04-24T04:00Z = KST 13:00
    // gap = 2.5h (random=0.5) → candidate KST 15:30 — outside [8,14)
    // → next: 다음 날 KST 08:00 = 2026-04-24T23:00Z
    const sched = new CircadianScheduler({ random: () => 0.5 });
    const next = sched.nextSessionStart(KOREAN_FAN, new Date('2026-04-24T04:00:00Z'));
    expect(next.toISOString()).toBe('2026-04-24T23:00:00.000Z');
  });

  it('jumps forward to today persona.activeHours.start when now is before activeHours', () => {
    // now = 2026-04-24T22:00Z = 다음 날 KST 07:00 (NAMU [19,23) 밖)
    // → next: 같은 KST day 19:00 = 2026-04-25T10:00Z
    const sched = new CircadianScheduler({
      random: () => 0,
      now: () => new Date('2026-04-24T22:00:00Z'),
    });
    const next = sched.nextSessionStart(NAMU_RESEARCHER);
    expect(next.toISOString()).toBe('2026-04-25T10:00:00.000Z');
  });

  it('throws when persona has no activeHours', () => {
    const sched = new CircadianScheduler();
    const personaNoHours: BrowserPersona = { ...KOREAN_FAN, activeHours: undefined };
    expect(() => sched.nextSessionStart(personaNoHours)).toThrow(/activeHours/);
  });
});
