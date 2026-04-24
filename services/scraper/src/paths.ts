/**
 * 레포 루트 기준 경로 헬퍼.
 *
 * 왜 필요한가: `pnpm --filter @pokopia-wiki/scraper <script>` 실행 시
 * pnpm 은 필터된 패키지(`services/scraper/`) 를 cwd 로 사용한다. 그러나
 * `data/`, `docs/`, `.env.example` 등 프로젝트 자원은 모두 **repo root 기준**.
 * `path.resolve('data/...')` 는 cwd 에 의존하므로 잘못된 디렉토리에
 * 산출물이 쌓인다.
 *
 * 해결: 본 모듈이 `import.meta.url` 로 파일 위치를 알아내고, 거기서
 * repo root 를 추론한다 (`services/scraper/src/paths.ts` → `../../..`).
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * 모노레포 루트 절대경로 (`services/scraper/src/` 에서 3단 위).
 *
 * scraper 패키지 구조가 바뀌면 여기 상수도 함께 조정해야 한다.
 *
 * `import.meta.dirname` 은 Node 20.11+/21+ 에서 지원. tsx/Node 22 기준 ESM
 * 환경이므로 안전하게 사용 가능.
 */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

// Why: worktree, CI container, dist 번들 등 예상 밖 배치에서 REPO_ROOT 가 다른 곳을
// 가리켜도 module load 시점에 조기 실패시켜 `data/`·`docs/`·`.env` 산출물이 잘못된
// 디렉토리에 쌓이는 것을 차단 (Phase 4 audit OPS-002).
if (!existsSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'))) {
  throw new Error(
    `REPO_ROOT sanity check failed: pnpm-workspace.yaml not found at ${REPO_ROOT}. ` +
      'services/scraper/src/paths.ts 의 REPO_ROOT 상수가 모노레포 루트를 가리키지 않습니다 (import.meta.dirname 기반 추론 실패).',
  );
}

/** 레포 루트 기준 상대 경로를 절대 경로로 해석. */
export function repoPath(...segments: readonly string[]): string {
  return path.resolve(REPO_ROOT, ...segments);
}
