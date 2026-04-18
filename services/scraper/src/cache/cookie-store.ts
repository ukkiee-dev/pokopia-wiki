/**
 * CookieStore — 쿠키 영속 관리 (CRAWLING_STRATEGY §16.2).
 *
 * 역할:
 *   - `tough-cookie` + `tough-cookie-file-store` 를 래핑해 소스별 CookieJar 제공.
 *   - `data/cookies/<source>.json` 파일에 JSON 형식으로 저장.
 *   - 주 사용처: T2/T3 의 `cf_clearance` 같은 장수명 쿠키를 세션 재시작에도
 *     유지하기 위함. T1 은 Playwright `storageState` 로 충분하지만, ky 기반
 *     T0 에서 필요 시에도 공용으로 쓸 수 있다.
 *
 * 왜 tough-cookie 계열인가:
 *   - Playwright 의 `storageState` 는 Playwright context 범위.
 *   - ky/undici 쪽은 쿠키를 자동 저장하지 않아 외부 jar 필요.
 *   - tough-cookie-file-store 는 JSON 포맷으로 stable 직렬화를 제공해 재시작에
 *     안전.
 *
 * Phase 4 범위:
 *   - CookieJar 획득 API 만 제공 (`getJar(source)`).
 *   - 실제 fetcher 통합(예: undici dispatcher 에 jar 주입)은 Phase 5 이후.
 */

import path from 'node:path';

import type { SourceSite } from '@pokopia-wiki/shared';
import { CookieJar } from 'tough-cookie';
import FileCookieStore from 'tough-cookie-file-store';

import { repoPath } from '../paths.js';

/**
 * 소스별 CookieJar 싱글턴 — 같은 source 에 대해 여러 Jar 를 만들면 파일 쓰기
 * 경합이 발생한다. 싱글턴으로 단일 인스턴스 공유.
 */
export class CookieStore {
  private readonly jars = new Map<SourceSite, CookieJar>();

  /**
   * 지정 소스의 CookieJar 를 반환 (lazy).
   *
   * 첫 호출 시 파일(`data/cookies/<source>.json`) 이 없으면 빈 파일로 생성됨
   * (tough-cookie-file-store 내부 동작). 저장 포맷은 JSON 고정.
   */
  getJar(source: SourceSite): CookieJar {
    const cached = this.jars.get(source);
    if (cached) return cached;

    const filePath = this.pathFor(source);
    // async=true → 쓰기 비동기. loadAsync=false → 초기 로드는 sync (간단한 스토어).
    const store = new FileCookieStore(filePath, { async: true });
    const jar = new CookieJar(store);
    this.jars.set(source, jar);
    return jar;
  }

  /**
   * 디스크 경로 산출 — `data/cookies/<source>.json`.
   *
   * `path.resolve` 결과가 `data/cookies/` 하위를 벗어나지 않는지 검증.
   * SourceSite 는 enum 이라 traversal 위험은 없지만, 방어적 assert 는
   * 리팩터 시 실수를 차단한다.
   */
  private pathFor(source: SourceSite): string {
    const baseDir = repoPath('data', 'cookies');
    const abs = path.resolve(baseDir, `${source}.json`);
    const baseWithSep = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
    if (!abs.startsWith(baseWithSep)) {
      throw new Error(`cookie path traversal: ${abs} not under ${baseDir}`);
    }
    return abs;
  }
}
