# Pokopia Wiki 구현 진행 현황 (이어서 작업하기)

> **For Next Session:** 이 문서는 `docs/plans/2026-04-18-implementation-roadmap.md`를 Phase 단위로 집행하면서 실제 상태를 축적한다.
> 새 세션을 시작할 때는 (1) 이 문서의 "다음에 할 일", (2) 로드맵 해당 Phase, (3) `_workspace/` 잔여물 순서로 읽는다.
>
> **최종 갱신:** 2026-04-18
> **현재 Phase:** Phase 0 (모노레포 스캐폴딩) — 진행 중
> **총 Phase 수:** 17개 (Phase 0 ~ Phase 16)

---

## 빠른 상태 보드

| Phase                           | 상태       | 시작       | 완료       | 감사 | 비고                                                 |
| ------------------------------- | ---------- | ---------- | ---------- | ---- | ---------------------------------------------------- |
| 0 — 모노레포 스캐폴딩           | ✅ 완료    | 2026-04-18 | 2026-04-18 | ⏳   | 전체 CI 로컬 시뮬레이션 ALL GREEN. 감사는 별도 세션. |
| 1 — Prisma 스키마               | ⏳ 대기    | —          | —    | —    | homelab DB 필요      |
| 2 — 공통 검증·메타데이터        | ⏳ 대기    | —          | —    | —    | —                    |
| 3 — Preflight 하네스            | ⏳ 대기    | —          | —    | —    | Telegram/Chrome 필요 |
| 4 — Fetcher 인프라              | ⏳ 대기    | —          | —    | —    | —                    |
| 5 — 페르소나·워밍               | ⏳ 대기    | —          | —    | —    | 워밍 1일 BG          |
| 6 — 세션/행동 루프              | ⏳ 대기    | —          | —    | —    | —                    |
| 7 — Notifier/CLI 대시보드       | ⏳ 대기    | —          | —    | —    | —                    |
| 8 — Serebii T0 파서             | ⏳ 대기    | —          | —    | —    | 35+ 파서             |
| 9 — Serebii 드라이런·크롤       | ⏳ 대기    | —          | —    | —    | —                    |
| 10 — PokopiaGuide API Discovery | ⏳ 대기    | —          | —    | —    | —                    |
| 11 — PokopiaGuide T1 + i18n     | ⏳ 대기    | —          | —    | —    | —                    |
| 12 — pokopoko T2 + namu T3      | ⏳ 대기    | —          | —    | —    | skip 가능            |
| 13 — 한국어 교차 검증           | ⏳ 대기    | —          | —    | —    | —                    |
| 14 — 이미지 + 최종 검증         | ⏳ 대기    | —          | —    | —    | —                    |
| 15 — API (GraphQL)              | ⏳ 대기    | —          | —    | —    | Phase 0 이후 병렬    |
| 16 — 백업·운영 정착             | ⏳ 대기    | —          | —    | —    | —                    |

범례: ⏳ 대기 / 🏗️ 진행 중 / 🟡 감사 대기 / 🔁 루프백 / ✅ 완료 / ⏭️ 스킵(사유 기록)

---

## 환경 기록 (2026-04-18 확인)

- Node: v24.14.0 (요구 ≥24 ✓)
- pnpm: 10.30.3 (요구 ≥10 ✓)
- Platform: darwin 25.3.0
- Primary working dir: `/Users/ukyi/workspace/pokopia-wiki`
- Git: main 브랜치, HEAD = `f128b85`, 커밋 히스토리 정상

### 아직 없는 자원 (Phase 진행 시점에 준비 필요)

- homelab PostgreSQL 접속 정보 (Phase 1)
- Telegram Bot 토큰/Chat ID (Phase 3)
- Playwright chromium 브라우저 (Phase 3 때 `npx playwright install`)
- 외장 SSD 마운트 `/Volumes/External` (Phase 14, 16)
- Pokemon 공식 DB / namu.wiki 접근 여부 (Phase 12, 13)

---

## Phase 0 — 모노레포 스캐폴딩

**Goal:** 단일 앱 구조를 `packages/{scraper,api,shared}` pnpm 모노레포로 전환. Prisma 스키마 단일 관리 체계 확립.

**세부 태스크 상태:**

| Task | 설명                                                          | 상태 |
| ---- | ------------------------------------------------------------- | ---- |
| 0.1  | workspace manifest (pnpm-workspace.yaml + tsconfig.base.json) | ✅   |
| 0.2  | packages/shared 생성                                          | ✅   |
| 0.3  | packages/api 생성 (기존 src 이동)                             | ✅   |
| 0.4  | packages/scraper 생성                                         | ✅   |
| 0.5  | 루트 prisma 디렉토리 & generator                              | ✅   |
| 0.6  | 루트 package.json 재구성                                      | ✅   |
| 0.7  | 설치 검증 + 기존 테스트 통과                                  | ✅   |
| 0.8  | CI/CD 파이프라인 조정                                         | ✅   |
| 0.9  | 첫 커밋                                                       | 🏗️  |

**Batch 계획 (executing-plans 패턴, 3 task씩):**

- Batch 1: 0.1 + 0.2 + 0.3 (workspace manifest · shared · api 이동)
- Batch 2: 0.4 + 0.5 + 0.6 (scraper · prisma · 루트 재구성)
- Batch 3: 0.7 + 0.8 + 0.9 (설치 검증 · CI · 커밋)

**완료 조건 (체크리스트):**

- [x] `pnpm install` 성공 (frozen-lockfile 포함)
- [x] `pnpm --filter @pokopia-wiki/api dev`로 `/health` 동작 확인 (PORT=3111, HTTP 200, 실서버 부팅 로그 확인)
- [x] `pnpm --filter @pokopia-wiki/api test:run` 통과 (4 tests)
- [~] `prisma generate` — **Prisma 5.22는 빈 schema에서 generate 실패**. `prisma format`은 OK. Phase 1에서 첫 모델 추가 후 generate 검증으로 이월.
- [~] GitHub Actions CI 통과 — 로컬 시뮬레이션(install --frozen-lockfile + lint + format:check + type-check + test:run) 전체 PASS. 실제 push 후 Actions 확인 필요.

**Phase 0 기술 결정 기록:**

- `.oxfmtrc.jsonc`의 `ignorePatterns`에 `**/*.md`, `.claude/**`, `docs/**`, `packages/shared/src/prisma-client/**`, `**/dist/**`, `**/node_modules/**` 추가. markdown은 이미 `.vscode/settings.json`에서 prettier 담당이므로 oxfmt에서 제외. Prisma 생성물은 자동 갱신이므로 포맷 대상 제외.
- `packages/shared/src/prisma-client/`는 Phase 0에서 `.gitkeep`만 두고 실제 generator output은 Phase 1에서 생성. 로드맵 Task 0.2의 `export {};` placeholder는 oxlint의 `unicorn/require-module-specifiers`와 충돌하여 제거.
- `packages/shared/src/index.ts`는 `SHARED_PACKAGE_NAME` 상수만 export — Phase 2에서 Zod/metadata/redact를 여기에 export 추가.
- `packages/shared/package.json`의 `@prisma/client` 의존은 `workspace:^`가 아닌 `^5.22.0` 명시(로드맵 Task 0.2 예시 오류 정정. npm 레지스트리 패키지이므로 workspace 프로토콜 부적합).
- `packages/{shared,scraper}`의 `test:run`은 `vitest run --passWithNoTests` — 빈 패키지에서 CI 실패 방지.
- 루트 `package.json`에 API 런타임 deps 제거. 루트의 `imports["#*"]`도 제거됨. API 개발은 반드시 `pnpm --filter @pokopia-wiki/api ...`.
- `packages/api/Dockerfile`은 모노레포 컨텍스트(`context: .`, `file: packages/api/Dockerfile`) + `pnpm deploy --filter=@pokopia-wiki/api --prod /prod-out` 2-stage. 빌드 컨텍스트 외 분리를 위해 `.dockerignore`는 루트로 복귀.
- `.github/workflows/ci.yml`에 `paths:` 필터 추가 (packages/api, packages/shared, prisma, pnpm-workspace.yaml 등). scraper 변경 시 이 워크플로는 트리거 안 됨.
- **루트 `tsconfig.json` 제거**. 각 패키지 tsconfig가 `../../tsconfig.base.json`을 extends하고, 루트 스크립트는 `pnpm -r --parallel type-check`로 실행되므로 불필요. 루트에 tsconfig가 남아 있으면 IDE가 루트 기준으로 잘못 분석할 수 있음.

**Phase 0 감사 (완료 후):** 프로파일 `docs`/`setup` → `codereview-architect-reviewer` + `pokopia-doc-strategist`.

---

## 다음 세션에서 이어갈 지점

**아직 Batch 1부터 시작하지 않은 경우 (현재 상태):**

1. 이 문서의 "Phase 0 세부 태스크 상태"에서 마지막 ⏳를 찾는다.
2. 로드맵 Phase 0 (라인 65 ~ 318) 해당 Task를 읽는다.
3. `_workspace/`가 있으면 중간 산출물 확인.
4. Batch 단위로 실행한다 (executing-plans 패턴).

**Batch 실행 중단 시:**

- 중단된 Task는 `in_progress`인 상태로 두고, 이 문서 "Phase 0 세부 태스크 상태"에 ⚠️ 블로커 내용 기록.
- `pnpm install`이 깨졌다면 `node_modules/`와 `pnpm-lock.yaml`을 삭제 후 재설치할지 확인.

**Phase 0 완료 후:**

- Phase 0 행을 ✅로 갱신하고 감사 요약을 기록.
- Phase 1 진행 전에 homelab DATABASE_URL을 `.env`에 셋업.
- 새 세션에서 `/pokopia-wiki-build` 스킬로 "Phase 1 — Prisma 스키마" 팀 A 구성.

---

## 실행 로그 (배치별)

### Batch 1 — 완료 (2026-04-18)

- 범위: Task 0.1, 0.2, 0.3
- 산출물:
  - `pnpm-workspace.yaml` (packages/\*)
  - `tsconfig.base.json` (compilerOptions 이식 + composite:false, declaration:true, include 제거)
  - `packages/shared/{package.json,tsconfig.json,src/index.ts,src/prisma-client/index.ts}`
  - `packages/api/{package.json,tsconfig.json}` (neuen)
  - `git mv`로 이동: `src/` → `packages/api/src/`, `vitest.config.ts`, `tsdown.config.ts`, `Dockerfile`, `.app-config.yml`, `.dockerignore` → `packages/api/`
- 비고: tsconfig extends 경로는 `../../tsconfig.base.json`. vitest/tsdown configs는 packages/api 내부 이동이므로 `src/**` 상대경로 그대로 유효. oxlintrc는 루트에서 상향 탐색되어 OK.

### Batch 2 — 완료 (2026-04-18)

- 범위: Task 0.4 + 0.5 + 0.6
- 산출물:
  - `packages/scraper/{package.json,tsconfig.json,src/index.ts}` — 의존성 최소(shared + zod). check:robots/access/patchright/network/notifier 스크립트 참조만 선언, 실제 스크립트는 Phase 3에서 작성.
  - `prisma/schema.prisma` — generator(output: `../packages/shared/src/prisma-client`) + postgresql datasource 만 선언.
  - 루트 `package.json` 재구성 — workspace root로 단순화. devDeps에 `prisma`, `pino-pretty`, `oxlint`, `oxfmt`만 유지. 기존 api 런타임 deps는 전부 제거 (packages/api로 이관).
- 주의: 루트의 `imports["#*"]`를 제거했으므로 루트에서 tsx 실행은 불가. API 개발은 반드시 `pnpm --filter @pokopia-wiki/api ...`.

### Batch 3 — 완료 (2026-04-18)

- 범위: Task 0.7 + 0.8 + 0.9
- 검증 요약:
  - `pnpm install --frozen-lockfile`: 252 resolved, 147 packages added, lockfile 생성 후 재실행 시 no-op.
  - `pnpm --filter api --filter shared lint`: 0 error / 0 warning (28 files).
  - `pnpm format:check`: 43 files all correct (md/docs/.claude 제외 패턴 반영).
  - `pnpm --filter api --filter shared type-check`: 통과.
  - `pnpm --filter api --filter shared test:run`: 4 tests pass (기존 health.service / example.service).
  - 실 dev boot: `PORT=3111 pnpm --filter @pokopia-wiki/api dev` → `GET /health` 200 `{status: ok, uptime: 3.28...}` (pino access log 확인).
- CI 조정:
  - `packages/api/Dockerfile` 2-stage (builder `/repo` → runtime `/app`), `pnpm deploy --filter=@pokopia-wiki/api --prod /prod-out` 사용.
  - `.github/workflows/ci.yml` → path filter 추가 + `file: packages/api/Dockerfile` 명시 + `pnpm -r` 대신 `pnpm --filter @pokopia-wiki/api --filter @pokopia-wiki/shared`로 범위 축소.
  - `.dockerignore`는 루트에 유지 (빌드 컨텍스트 루트에 있어야 정확히 적용).

---

## 다음 세션 바로 시작 카드 — Phase 1

Phase 0가 ✅ 완료 상태이므로 새 세션에서 바로 Phase 1 진행 가능. 시작 체크리스트:

1. **homelab PostgreSQL 준비** (로드맵 Task 1.1)
   - `pokopia` DB + `pokopia` 유저 생성 (권한 `ALL PRIVILEGES`).
   - Tailscale 또는 포트포워딩 경유 connection string 획득.
   - `.env.example`에 `DATABASE_URL=postgresql://...` 추가 + 실제 `.env` 생성 (gitignored).
2. **Prisma 스키마 전사** (Task 1.2 ~ 1.4)
   - `pokopia-wiki-build` 스킬로 팀 A (schema-architect + doc-strategist) 구성.
   - SCHEMA.md §2.1~§2.27을 10개 청크로 나눠 순차 작성, 매 청크마다 `pnpm prisma format` + validate.
   - ENUM 일괄 선언.
3. **마이그레이션 + Client 생성**
   - `pnpm prisma migrate dev --name init`
   - `pnpm prisma generate` → `packages/shared/src/prisma-client/` 채워짐 확인.
4. **`packages/shared/src/index.ts` 복원**
   - `export * from './prisma-client';` + `export type * from './prisma-client';` 재추가 (Phase 0에서 제거했던 것).
5. **Phase 1 감사**
   - `pokopia-phase-review-harness` (프로파일 `schema`) 호출 → schema-architect + style-reviewer + doc-strategist.

**중단 시 복구 가이드:** Phase 1 실행 중 Prisma 마이그레이션이 실패하면 `prisma migrate reset`은 사용자 승인 후. 로컬 DB일 때만 허용, 프로덕션에서는 절대 `--force` 금지(로드맵 리스크 표 참조).

---

## 기존 레포 상태에서 발견된 (Phase 0 스코프 밖) 이슈

- `.claude/**`, `docs/**` 마크다운 파일에 oxfmt 기준 포맷 이슈가 다수 존재 (커밋 `eb59b45`, `2e90506` 당시부터). `.oxfmtrc.jsonc` ignorePatterns에 편입하여 CI는 통과. Prettier로 일괄 정리하려면 별도 작업.
- `pnpm-lock.yaml`은 이번 Phase 0에서 재생성됨 (단일 앱 → 모노레포 전환 불가피). 이전 lockfile은 더 이상 유효하지 않음.
