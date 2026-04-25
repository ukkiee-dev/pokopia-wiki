/* eslint-disable no-await-in-loop -- 의도적 순차 fs 쓰기: 동일 baseName 의
   sequence suffix 충돌 방지 + 권한 모드 일관성. */
/**
 * InvalidIsolator — 파서 실패 entity 의 격리 디렉토리 저장.
 *
 * CRAWLING_STRATEGY §27.1 / §22.3 정책:
 *   - 파싱/검증 실패 시 원본 HTML + 파싱 결과 + 에러 로그를
 *     `data/invalid/<source>/<timestamp>/<entity>.json` 으로 저장
 *   - 디렉토리/파일 권한 0o600 (파일 소유자만 읽기/쓰기) — 민감 데이터 격리
 *   - 수동 조사 → 셀렉터 수정 후 재실행 (멱등 upsert 보장)
 *
 * Phase 8 Task 8.5 / Phase 9 선결 코드. 본 모듈은 Prisma 의존 없이 fs 만 사용.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { repoPath } from '#paths';

/**
 * 격리 대상 한 건의 raw 정보.
 *
 * - `entity`: 격리 디렉토리 안 파일명 prefix (예: 'pokemon', 'item').
 * - `sourceSlug`: 식별자 (없으면 'unknown-<index>' 등 호출자 책임).
 * - `originalHtml`: 파서 입력으로 사용된 HTML 원문 (선택적, 재현용).
 * - `parsedCandidate`: Zod safeParse 직전의 candidate object (직렬화 가능).
 * - `errors`: Zod issues 또는 일반 에러 메시지 배열.
 */
export type InvalidEntry = {
  entity: string;
  sourceSlug: string;
  originalHtml?: string;
  parsedCandidate: unknown;
  errors: ReadonlyArray<string>;
};

/**
 * 한 isolator 호출 결과.
 *
 * - `directory`: 생성된 격리 디렉토리 절대 경로 (`data/invalid/<source>/<timestamp>/`).
 * - `entries`: 저장 완료된 entry 수 (스킵 없음 — 모두 저장 시도).
 */
export type IsolationResult = {
  directory: string;
  entries: number;
};

/**
 * Invalid entry 들을 timestamp 디렉토리에 격리 저장.
 *
 * 디렉토리 구조:
 *   ```
 *   data/invalid/<sourceSite>/<ISO-timestamp>/
 *     ├─ <entity>__<sourceSlug>.json   ← parsedCandidate + errors
 *     └─ <entity>__<sourceSlug>.html   ← originalHtml (있을 때)
 *   ```
 *
 * 같은 sourceSlug 가 같은 호출에서 여러 번 들어오면 파일명에 sequence suffix
 * (`__001`, `__002`) 자동 부여. 다른 호출(다른 timestamp) 사이는 디렉토리가
 * 분리되어 있어 충돌 없음.
 *
 * 권한: 디렉토리/파일 모두 0o600 (소유자만). 외장 SSD 보관 고려한 격리.
 */
export async function isolateInvalidEntries(
  sourceSite: string,
  entries: ReadonlyArray<InvalidEntry>,
): Promise<IsolationResult> {
  if (entries.length === 0) {
    return { directory: '', entries: 0 };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = repoPath('data', 'invalid', sourceSite, timestamp);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const seenNames = new Map<string, number>();
  let saved = 0;
  for (const entry of entries) {
    const baseName = sanitizeFilename(`${entry.entity}__${entry.sourceSlug}`);
    const seq = seenNames.get(baseName) ?? 0;
    seenNames.set(baseName, seq + 1);
    const finalName = seq === 0 ? baseName : `${baseName}__${String(seq + 1).padStart(3, '0')}`;

    const jsonPath = path.resolve(dir, `${finalName}.json`);
    await writeFile(
      jsonPath,
      JSON.stringify(
        {
          entity: entry.entity,
          sourceSlug: entry.sourceSlug,
          parsedCandidate: entry.parsedCandidate,
          errors: entry.errors,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    saved += 1;

    if (entry.originalHtml !== undefined && entry.originalHtml.length > 0) {
      const htmlPath = path.resolve(dir, `${finalName}.html`);
      await writeFile(htmlPath, entry.originalHtml, { mode: 0o600 });
    }
  }

  return { directory: dir, entries: saved };
}

/**
 * 파일명에 사용 못 하는 문자(슬래시/콜론 등)를 `-` 로 치환.
 */
function sanitizeFilename(raw: string): string {
  return raw.replace(/[\\/:*?"<>|\s]/g, '-');
}
