/**
 * robots.txt 다운로드·파서 래퍼 (CRAWLING_STRATEGY §26.2 그대로).
 *
 * 모든 fetcher 는 요청 직전 `isAllowed(source, url, userAgent)` 호출 의무.
 * §26.1 v3.2 D4: 규칙 해석 불가 (`undefined`) 는 **`false` (스킵)** 로 취급.
 *
 * 캐시 경로: `data/robots/<source>.txt` — Phase 3 check:robots 스크립트가
 * 쓰는 위치와 동일. `load()` 가 네트워크 실패 시 빈 문자열로 폴백하므로
 * 오프라인 환경에서도 파서가 생성되지만, 빈 robots.txt 는 "전부 허용" 이
 * 아니라 "규칙 없음 → `isAllowed` 가 대부분 `true` 반환" 이 된다. 이는
 * robots-parser 라이브러리 스펙.
 *
 * Phase 3 검증 게이트 목적상, preflight 는 **디스크에 저장된 robots.txt 에서
 * 파서를 복원하는 경로** 도 제공해야 재실행 가능성이 생긴다. → `loadFromDisk`.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import ky from 'ky';
import robotsParser from 'robots-parser';

import { repoPath } from '../paths.js';

/** robots-parser 인스턴스 타입 (default export 의 반환 형태). */
type RobotsInstance = ReturnType<typeof robotsParser>;

/** 기본 User-Agent — .env 의 `SCRAPER_USER_AGENT` 누락 시 사용. */
export const DEFAULT_USER_AGENT = 'PokopiaScraperBot/1.0 (+ukyi.js@gmail.com)';

/** 캐시 파일 경로 계산 — repo root 기준 절대경로 반환. */
export function robotsCachePath(source: string): string {
  return repoPath('data', 'robots', `${source}.txt`);
}

/**
 * RobotsChecker — 소스 단위 `robots-parser` 파서를 캐싱한다.
 *
 * 사용 패턴:
 *   1. `load(source, baseUrl)` 로 네트워크 다운로드 + 디스크 캐시 + 파서 구성
 *   2. 이후 `isAllowed(source, url, userAgent)` 를 반복 호출
 *   3. 긴 크롤링 시 `reloadIfChanged(source, baseUrl)` 로 해시 변경 감지
 *
 * 단일 프로세스 내 공유가 전제. 멀티 프로세스 공유는 §6.4 ConcurrencyGuard 와 결합.
 */
export class RobotsChecker {
  private parsers = new Map<string, RobotsInstance>();

  /**
   * 네트워크에서 robots.txt 를 가져와 디스크 캐시 + 메모리 파서를 갱신한다.
   *
   * - 타임아웃 10 초.
   * - 네트워크 실패(`throw` 캐치) 시 **빈 문자열** 로 대체해 cache 를 쓰고
   *   파서도 빈 규칙으로 생성. §26.1 D4 기본값 보수화와는 별개 — 이는
   *   "robots.txt 를 못 가져온 소스" 상태를 명시적으로 남기는 것이 중요.
   */
  async load(source: string, baseUrl: string): Promise<void> {
    const robotsUrl = new URL('/robots.txt', baseUrl).toString();
    const text = await ky
      .get(robotsUrl, { timeout: 10_000 })
      .text()
      .catch(() => '');
    const cachePath = robotsCachePath(source);
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, text);
    this.parsers.set(source, robotsParser(robotsUrl, text));
  }

  /**
   * 디스크 캐시에서 robots.txt 를 복원해 파서만 재구성.
   *
   * - `load()` 를 최근에 실행한 적이 있는 환경에서 네트워크 없이 재검증하고 싶을 때.
   * - `baseUrl` 을 넘기는 이유: robots-parser 는 상대경로 해석을 위해 원본 URL 이 필요.
   * - 파일이 없으면 `Error` throw — 호출부가 `load()` 로 폴백할 수 있다.
   */
  async loadFromDisk(source: string, baseUrl: string): Promise<void> {
    const cachePath = robotsCachePath(source);
    const text = await readFile(cachePath, 'utf8');
    const robotsUrl = new URL('/robots.txt', baseUrl).toString();
    this.parsers.set(source, robotsParser(robotsUrl, text));
  }

  /**
   * URL 이 해당 소스의 robots.txt 규칙상 허용되는지 반환.
   *
   * ★ v3.2 D4: `robots-parser` 의 `undefined` (규칙 모호/해석 불가) 는
   * **false 로 간주** — 보수적 기본값. 과거 `?? true` 는 과민 허용이었다.
   *
   * 파서 미로딩 상태면 `Error` throw — 호출부가 `await load()` 를
   * 잊고 호출한 조기 버그를 즉시 드러낸다.
   */
  isAllowed(source: string, url: string, userAgent: string): boolean {
    const parser = this.parsers.get(source);
    if (!parser) {
      throw new Error(`robots.txt not loaded for source=${source}`);
    }
    return parser.isAllowed(url, userAgent) ?? false;
  }

  /**
   * 캐시와 새로 가져온 내용을 비교해 변화가 있으면 true.
   *
   * 호출부 (§13.3.7) 는 true 반환 시 `robots.changed` 알림을 발행한다.
   * 비교는 텍스트 전체 문자열 동일성. 해시를 별도로 저장하지는 않는다 —
   * robots.txt 크기는 수 KB 이하라 O(n) 비교가 비용 부담이 아니다.
   */
  async reloadIfChanged(source: string, baseUrl: string): Promise<boolean> {
    const cachePath = robotsCachePath(source);
    const prev = await readFile(cachePath, 'utf8').catch(() => '');
    await this.load(source, baseUrl);
    const next = await readFile(cachePath, 'utf8').catch(() => '');
    return prev !== next;
  }
}
