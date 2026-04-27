/**
 * DetectionMonitor — CRAWLING_STRATEGY §12.1.
 *
 * 한 번의 페이지 응답을 보고 "탐지 신호" 후보를 수집해 호출자에게 반환한다.
 * 결과 처리(점수 감점·세션 종료·알림)는 HealthScorer / SessionManager 책임.
 *
 * ## DetectionSignal 형상 (§12.1 A2 v3.2)
 *
 *   evidence/url/at 모두 optional — 호출부 다수가 누락하던 필드를 helper 가
 *   기본 주입한다. 신규 신호 추가 시 evidence 에 식별 가능한 짧은 토큰을 넣어야
 *   로그에서 검색이 쉽다.
 *
 * ## 의존 표면 (구조적 타입)
 *
 *   `Page`/`Response` 객체 전체 대신 우리가 호출하는 메서드만 capability 인터페이스
 *   로 추출 — playwright/patchright 두 드라이버 + mock 응답 모두 호환.
 */

/** Page 의 최소 표면 — content/url 만. */
export type DetectablePage = {
  url(): string;
  content(): Promise<string>;
};

/** Response 의 최소 표면 — status/headers 만. */
export type DetectableResponse = {
  status(): number;
  headers(): Record<string, string>;
};

export type DetectionSignal = {
  type: 'block' | 'challenge' | 'captcha' | 'rate_limit' | 'soft_block' | 'anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence?: string;
  url?: string;
  at?: Date;
};

/**
 * CF challenge 마크업 정규식 — Cloudflare 가 보내는 변형 메시지 커버.
 *
 * case-sensitive: CF 응답은 문자열이 고정이라 i flag 불필요.
 * Phase 6 감사 PERF-604: 기존 배열 + 반복 `content.includes` → 단일 `RegExp.test` 로 통합.
 */
const CF_CHALLENGE_RE = /Just a moment\.\.\.|Checking your browser|cf-challenge/;

/**
 * 봇 차단 키워드 정규식 — case-insensitive + global.
 *
 * `i` flag 로 toLowerCase 복제(260KB 페이지에서 문자열 1개 추가 할당) 회피.
 * `g` flag 로 같은 응답에 여러 키워드가 등장해도 각각 signal push.
 */
const BOT_BLOCK_RE = /access denied|bot detected|automated traffic|suspicious activity/gi;

/**
 * CAPTCHA 식별 토큰 — iframe src·script 등. case-insensitive.
 */
const CAPTCHA_RE = /captcha|recaptcha|turnstile/i;

const SOFT_BLOCK_THRESHOLD = 500;

export type DetectBotFlagsOptions = {
  /** 기본: `() => new Date()`. signal.at 격리에 사용. */
  now?: () => Date;
};

/**
 * 한 응답에 대한 탐지 신호 후보 모두 수집. 호출자가 결과 처리.
 *
 * 반환은 발견 순서를 보존 — 디버깅 시 evidence 우선순위 추정에 도움.
 */
export async function detectBotFlags(
  page: DetectablePage,
  response: DetectableResponse,
  options: DetectBotFlagsOptions = {},
): Promise<DetectionSignal[]> {
  const at = options.now ? options.now() : new Date();
  const url = page.url();
  const signals: DetectionSignal[] = [];
  const push = (s: Omit<DetectionSignal, 'at' | 'url'>): void => {
    signals.push({ ...s, at, url });
  };

  // HTTP status
  const status = response.status();
  if (status === 403) push({ type: 'block', severity: 'high', evidence: 'http_403' });
  if (status === 429) push({ type: 'rate_limit', severity: 'high', evidence: 'http_429' });

  // Body 검사 — content() 는 비싸므로 단일 호출로 모든 패턴 검사.
  const content = await page.content();

  const cfMatch = CF_CHALLENGE_RE.exec(content);
  if (cfMatch) {
    push({ type: 'challenge', severity: 'high', evidence: `cf_marker:${cfMatch[0]}` });
  }

  // content-length 헤더 확인 — 비정상 작은 응답은 soft block 후보.
  const contentLengthHeader = response.headers()['content-length'];
  if (contentLengthHeader !== undefined) {
    const length = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(length) && length < SOFT_BLOCK_THRESHOLD) {
      push({ type: 'soft_block', severity: 'medium', evidence: `content_length=${length}` });
    }
  }

  // 여러 키워드 동시 등장 시 각각 signal — BOT_BLOCK_RE 에 g flag.
  for (const match of content.matchAll(BOT_BLOCK_RE)) {
    push({ type: 'block', severity: 'critical', evidence: match[0].toLowerCase() });
  }

  const captchaMatch = CAPTCHA_RE.exec(content);
  if (captchaMatch) {
    push({ type: 'captcha', severity: 'critical', evidence: `captcha_marker:${captchaMatch[0].toLowerCase()}` });
  }

  return signals;
}
