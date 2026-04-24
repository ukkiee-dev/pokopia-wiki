/**
 * Atomic file write helper — Phase 4 OPS-403 / Phase 5 STYLE-501 공용화.
 *
 * tmp 파일에 먼저 쓰고 rename 으로 타겟을 교체. POSIX 보장: 같은 파일시스템 내
 * rename 은 **원자적** — 쓰기 도중 크래시가 끊어져도 기존 파일은 손상되지 않는다.
 *
 * ## 사용처
 *
 *   - `services/scraper/src/rate/limiter.ts` (rate counter state)
 *   - `services/scraper/src/persona/manager.ts` (persona runtime state)
 *   - `services/scraper/src/scheduler/concurrency-guard.ts` (active sessions state)
 *
 * ## 기본 파일 권한
 *
 *   `mode: 0o600` (owner read/write 만). 스크래퍼 state 파일은 쿠키·페르소나 식별자·
 *   세션 pid 등 민감 런타임 정보를 담을 수 있으므로 다른 유저 접근 차단. 필요 시
 *   `options.mode` 로 재정의 (예: 로그 파일은 `0o644`).
 *
 * ## tmp 파일 이름 충돌 방지
 *
 *   `<filePath>.tmp.<pid>.<timestamp>` — 동시에 여러 프로세스가 같은 타겟에 쓰는
 *   상황에서도 tmp 는 각자 고유. 단, tmp 자체가 실제로 경합하는 건 **rename 경합**
 *   이 아니라 **서로 다른 tmp 가 이후 rename 으로 한 파일을 교체**하는 패턴이라
 *   최종 내용은 마지막 rename 이 이긴다. 완전한 직렬화가 필요하면 상위에서 별도
 *   락(proper-lockfile 등) 과 결합할 것.
 */

import { rename, unlink, writeFile } from 'node:fs/promises';

export type AtomicWriteOptions = {
  /** 파일 권한. 기본 `0o600` (owner read/write). */
  mode?: number;
  /** 문자 인코딩. 기본 `utf8`. */
  encoding?: BufferEncoding;
};

/**
 * tmp + rename atomic 쓰기.
 *
 * @param filePath 타겟 경로 — 부모 디렉토리는 호출자가 미리 생성해 두어야 한다.
 * @param data 파일 내용 (문자열).
 * @param options mode / encoding 재정의.
 */
export async function atomicWrite(filePath: string, data: string, options: AtomicWriteOptions = {}): Promise<void> {
  const mode = options.mode ?? 0o600;
  const encoding: BufferEncoding = options.encoding ?? 'utf8';
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    await writeFile(tmp, data, { encoding, mode });
    await rename(tmp, filePath);
  } catch (err) {
    await unlink(tmp).catch(() => {
      /* best-effort — tmp 가 이미 없을 수 있음 */
    });
    throw err;
  }
}

/**
 * JSON 직렬화(`JSON.stringify(data, null, 2)`) 후 `atomicWrite`.
 *
 * 대부분의 스크래퍼 state 파일이 2-space pretty JSON 이라 이 형식을 기본으로.
 * 다른 포맷이 필요하면 호출자가 `JSON.stringify` 를 직접 수행 후 `atomicWrite` 호출.
 */
export async function atomicWriteJson(
  filePath: string,
  data: unknown,
  options: AtomicWriteOptions = {},
): Promise<void> {
  await atomicWrite(filePath, JSON.stringify(data, null, 2), options);
}
