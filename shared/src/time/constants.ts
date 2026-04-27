/**
 * 시간 단위 상수 SSoT — Phase 7 감사 STYLE-701 / X-703 해소.
 *
 * 이전: `scheduler/circadian.ts`, `daily-summary.ts` 가 각자 `KST_OFFSET_MS = 9 * 60 * 60 * 1000`
 * 선언. Phase 6 STYLE-604 Info 경고의 재발 (regressed → warning 승격). 본 모듈을
 * 공용 SSoT 로 삼아 import 로 통일한다.
 *
 * ## Asia/Seoul 고정 오프셋 근거
 *
 * 한국 표준시는 DST 없이 UTC+9 고정. 따라서 `Intl.DateTimeFormat` 없이 순수 ms
 * 산술로 KST hour 추출 가능 (`(utcMs + KST_OFFSET_MS) / HOUR_MS mod 24`). 스크래퍼
 * 전체가 Asia/Seoul 기준 활동 시간대를 사용하므로 본 상수가 가장 빈번히 참조된다.
 */

/** 1 시간을 ms 로 표현. */
export const HOUR_MS = 60 * 60 * 1000;

/** 24 시간 (1 일) ms. */
export const DAY_MS = 24 * HOUR_MS;

/** Asia/Seoul 의 UTC 오프셋 (ms). DST 없음. */
export const KST_OFFSET_MS = 9 * HOUR_MS;
