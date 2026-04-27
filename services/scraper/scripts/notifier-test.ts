/* eslint-disable no-console, unicorn/prefer-top-level-await */
/**
 * Preflight: Notifier 뼈대 smoke test.
 *
 * 실행:
 *   pnpm --filter @pokopia-wiki/scraper notifier:test
 *
 * 목표:
 *   - 4 severity (info/warn/high/critical) 1 건씩 송신해 분기 전부를 통과시킨다.
 *   - `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` 누락 시 console fallback 경로만 검증.
 *   - 설정되어 있다면 실제로 Telegram 4 건 송신 + macOS 배너 (high/critical) 시도.
 *
 * exit code:
 *   - 0: 모든 notify() 호출이 리턴. 실제 Telegram 실패는 내부 catch 로 흡수되므로
 *        console 에 `[notifier] Telegram send failed` 가 찍히면 운영자가 확인.
 *   - 1: 설정 로드 자체 예외 (현재로선 거의 발생하지 않음).
 *
 * no-console / prefer-top-level-await 는 본 스크립트가 CLI 엔트리이므로 의도적 disable.
 */

import { loadNotifierConfig } from '#notifier/config';
import { Notifier } from '#notifier/index';

async function main(): Promise<void> {
  const config = loadNotifierConfig();
  console.log('[notifier:test] config', {
    enabled: config.enabled,
    telegramConfigured: config.telegram !== null,
    criticalChatId: config.telegram?.criticalChatId !== undefined,
    macOSFallback: config.macOSFallback,
  });
  const notifier = new Notifier(config);

  // info — milestone.progress 로 info 채널 진입
  await notifier.notify('milestone.progress', { stage: 'smoke', phase: 3 });
  // warn — soft_throttle.detected 로 warn 채널 진입
  await notifier.notify('soft_throttle.detected', { disk_free_pct: 25 });
  // high — block.429 로 high 채널 진입
  await notifier.notify('block.429', { source: 'serebii', window: '1h' });
  // critical — persona.retired 로 critical 채널 진입
  await notifier.notify('persona.retired', { persona: 'korean-pokemon-fan' });

  console.log('[notifier:test] 4건 디스패치 완료 — events.jsonl 확인 권장');
}

main().catch((err: unknown) => {
  console.error('[notifier:test] fatal', err);
  process.exit(1);
});
