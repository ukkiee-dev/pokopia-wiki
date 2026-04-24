# Pokopia Wiki 구현 진행 현황 (이어서 작업하기)

> **For Next Session:** 이 문서는 `docs/plans/2026-04-18-implementation-roadmap.md`를 Phase 단위로 집행하면서 실제 상태를 축적한다.
> 새 세션을 시작할 때는 (1) 이 문서의 "다음에 할 일", (2) 로드맵 해당 Phase, (3) `_workspace/` 잔여물 순서로 읽는다.
>
> **최종 갱신:** 2026-04-24
> **현재 Phase:** Phase 5 (페르소나·워밍) — 착수 준비 완료 (Phase 4 감사 PASS + 선결 5항목 보완)
> **총 Phase 수:** 17개 (Phase 0 ~ Phase 16)

---

## 이번 세션 요약 (2026-04-24)

**시작 상태:** Phase 4 구현 완료, 감사 대기 (`9d6d96b`). `feat/restructure-services-dir` 브랜치 — 모노레포 재구성(`3543bc4`)으로 `packages/*` → `services/*` + `shared/` 전환 완료.
**종료 상태:** Phase 4 감사 **PASS** + 선결 5항목 보완 완료. Phase 5 착수 준비.
**세션 작업:** Phase 4 감사 실행 (Phase 3 Loop 1 merged) + 감사 권고 5항목 보완.

**핵심 성과:**

- **Phase 4 감사 PASS** — `pokopia-phase-review-lead`로 `crawler` 프로파일 4 감사자 관점 실행. Critical 0건, Warning 11건(Phase 3 이월 8 + Phase 4 신규 3), Info 19건. Phase 3 이월 4건(SEC-001/002/003/OPS-001) 전부 **resolved** 태깅. 산출물 `_workspace/audit/phase-4/20260424-0205/REPORT.md` + 4 YAML (`.gitignore` 상태).
- **W-005 (STYLE-401) 최종 판정** — Phase 2→3→4 3연속 수렴 후 **Warning 유지**. Info 강등 반대 근거: Zod 로컬 ENUM 5개 + 테스트 커버리지 부분성. 대신 권고 A 투자로 실효 리스크 축소 반영.
- **Phase 5 선결 조건 5항목 보완 (옵션 A 선택):**
  1. **OPS-002** `services/scraper/src/paths.ts` — `REPO_ROOT` 런타임 assertion 추가 (`pnpm-workspace.yaml` 센티넬 존재 검사). worktree/CI 배치에서 산출물 오적재 방지.
  2. **OPS-403** `services/scraper/src/rate/limiter.ts` — `atomicWriteJson` 유틸(tmp write + rename) 도입. state JSON 2 write 지점(`ensureFile`/`bumpUnderLock`) atomic 전환. 크래시 시 count=0 리셋 리스크 제거.
  3. **PERF-405** 동일 파일 — `bumpUnderLock`이 `ApproachingAlertPayload` 반환하도록 재설계. `acquire()`가 락 해제 후 Notifier 호출 → Telegram 10s timeout이 다른 `acquire()`를 차단하지 않음.
  4. **STYLE-401 권고 A** `shared/src/validators/schemas/item.test.ts` — `expectTypeOf<ItemInput['tags'][number]>` / `ItemInput['locations'][number]['method']` 가드 2건 추가. Zod 로컬 ENUM과 `$Enums.ItemTagName` / `$Enums.ItemLocationMethod` 동기 상태 **컴파일 타임 보증**.
  5. **STYLE-404** `docs/CRAWLING_STRATEGY.md` §11.1.1 신규 — Fetcher 커스텀 에러 5종 SSoT 표. `SkippedByRobotsError`/`SessionAbortError`/`RateLimitExceededError`/`PersonaRequiredError`/`CachePathTraversalError` 각 throw 조건·호출부 반응 명시. 구현-문서 drift 해소.

**회귀 검증 (보완 후):**

- 테스트 **47/47** (api 4, shared 23 [+2], scraper 20) — 새 `expectTypeOf` 가드 포함
- lint: shared 1 warning (기존 `redact.test.ts` nested describe, 무관) + services/* 0/0
- type-check: 3/3 **PASS** — Zod ENUM ↔ Prisma `$Enums` 동기 컴파일러 보증 확인
- format:check: 83 files all correct

**외부 자원 상태:**

- Postgres docker 컨테이너 기동 (이 세션 재시작). 볼륨 데이터 영속.
- 다른 자원은 2026-04-19 상태 유지 (Telegram 토큰 미주입, playwright chromium 설치됨, 4 소스 robots/access OK).

**미결(다음 세션 이월):**

1. **Phase 5 (페르소나·워밍) 착수 (최우선)** — 선결 조건 전부 해소. scope 문서에 X-003(SessionManager 선결 조건) 명시 필수: Chrome bump notify 호출자 의무화, catch redact 강제, cachedUserAgent 리셋, fetcher close() 강제.
2. **Phase 4 Warning 잔존 운영 개선 3건** — OPS-003(preflight 타임스탬프 공유), OPS-004(SUMMARY.md 자동 생성), OPS-006(check:network fallback) — Phase 5~6 중 처리.
3. **Phase 4 Warning Phase 7 이월 3건** — PERF-001/002/003 (Notifier worker화 — dedup/queue/backpressure).
4. **Telegram 토큰** (사용자 액션, 선택) — @BotFather 발급 → `.env` 주입.
5. **`packages/` 빈 디렉토리 정리** — 재구성(`3543bc4`) 후 잔존. `git rm -r packages/` 1커밋 처리 가능.

---

## 이번 세션 요약 (2026-04-19)

**시작 상태:** Phase 1 감사 루프 1 PASS (`b286dac`) — 85 Prisma 모델 + ARCH-003 unresolved.
**종료 상태:** Phase 4 완료, 감사 대기 (`c63e996`).
**세션 커밋:** 13개. Phase 2 구현+감사+Warning 보완 6 / Phase 3 구현+감사+Critical 번들 수정 5 / Phase 4 구현 2.

**핵심 성과:**

- **Phase 2 (공통 검증·메타데이터)** — ARCH-003 resolved(`@prisma/adapter-pg` factory), zod 4 API 핵심 5 엔티티, SOURCE_DEFAULTS, redact TDD. 감사 Loop 0 PASS. Warning 보완 세션으로 CRAWLING_STRATEGY v3.3 동기화 (redact 패턴 확장, scrapedAt 옵셔널, zod 4 원문 갱신).
- **Phase 3 (사전 검증 하네스)** — 4 preflight 스크립트 실행 + Notifier 뼈대 + data/ 13 디렉토리 표준화. 감사 Loop 0에서 Critical 2건 발견 → 번들 수정(SEC-001 Telegram URL redact, OPS-001 Serebii marker HTML entity) → CRAWLING_STRATEGY v3.4 동기화. Loop 1 재감사는 Phase 4 감사에 병합 결정.
- **Phase 4 (Fetcher 인프라)** — 15 파일(티어별 fetcher 4종 + factory + HtmlCache TDD + CookieStore + RateLimiter §14.3 + Chrome 버전 훅 + 공용 에러 5종 + persona stub). 모노레포 회귀 45/45 tests pass.

**외부 자원 상태:**
- Telegram 토큰 미주입 (사용자 TODO, 필수 아님 — console fallback으로 Phase 5 진행 가능)
- Playwright chromium 설치 완료 (Phase 3에서 Claude가 수행)
- docker-compose.local.yml Postgres 정상 (Phase 1부터)
- robots.txt 4 소스 전부 샘플 URL allowed
- T0~T3 4 소스 HTTP 접근 전부 `ok=true` (OPS-001 수정 후)

**미결(다음 세션 이월):**
1. **Phase 4 감사 실행 (최우선)** — Phase 3 Loop 1 병합 포함. 프로파일 `crawler` + security 1명. Phase 3 Critical 2건 resolved 확인 + Warning 8건 재분류 + Phase 4 신규 감사.
2. **W-005 재분류 결정 (Phase 4 감사 내)** — Phase 2에서 전제 반증됐지만 Warning 유지. Phase 4 감사에서 Info 강등 vs Warning 유지 재판정.
3. **Telegram 토큰 (사용자 액션, 선택)** — @BotFather 발급 후 `.env` 주입 → `notifier:test` 실전송 확인.
4. **Phase 5 (페르소나 & 워밍)** — Phase 4 감사 Critical 없음 확인 후 진입. 워밍 1일 백그라운드 실행 포함.

---

## 빠른 상태 보드

| Phase                           | 상태       | 시작       | 완료       | 감사 | 비고                                                 |
| ------------------------------- | ---------- | ---------- | ---------- | ---- | ---------------------------------------------------- |
| 0 — 모노레포 스캐폴딩           | ✅ 완료    | 2026-04-18 | 2026-04-18 | ⏳   | 전체 CI 로컬 시뮬레이션 ALL GREEN. 감사는 별도 세션. |
| 1 — Prisma 스키마               | ✅ 완료    | 2026-04-19 | 2026-04-19 | ✅   | 루프 1 PASS (DC-001 resolved). 85 모델 + 25 ENUM, 10 도메인 파일 분리, Prisma 7.7.0 |
| 2 — 공통 검증·메타데이터        | ✅ 완료    | 2026-04-19 | 2026-04-19 | ✅   | 루프 0 PASS. Critical 0, Warning 8, Info 29. ARCH-003 resolved. Warning 7건 보완 세션 완료(W-005 의도적 잔존). |
| 3 — Preflight 하네스            | ✅ 완료    | 2026-04-19 | 2026-04-19 | 🟡   | Loop 0: LOOP_REQUIRED (SEC-001/OPS-001) → 번들 수정 완료. Loop 1 재감사는 Phase 4 감사에 병합(스킵 사유 하단 기록). |
| 4 — Fetcher 인프라              | ✅ 완료    | 2026-04-19 | 2026-04-19 | ✅   | 감사 Loop 0 PASS (2026-04-24, Phase 3 Loop 1 merged). Critical 0, Warning 11, Info 19. 선결 5항목 보완 완료. Phase 5 scope 에 X-003 명시 필수. |
| 5 — 페르소나·워밍               | 🏗️ 준비   | —          | —    | —    | 착수 가능. 워밍 1일 BG. X-003(SessionManager 선결 조건) scope 명시 필수. |
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

- homelab PostgreSQL 접속 정보 (Phase 1은 로컬 Docker로 선행, homelab 이관은 Phase 14~16 또는 scraper 프로덕션 실행 직전)
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
| 0.9  | 첫 커밋                                                       | ✅   |

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

**Phase 0 커밋:** `b02617f` `chore: transform to pnpm monorepo (scraper + api + shared)` (49 files changed, +2226 / -66).

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

## Phase 1 — Prisma 스키마

**Goal:** SCHEMA.md §2.1~§2.27 (70+ 엔티티)를 `prisma/schema/` 다중 파일로 전사하고 초기 마이그레이션을 생성.

**세부 태스크 상태:**

| Task | 설명                                                         | 상태 |
| ---- | ------------------------------------------------------------ | ---- |
| 1.1  | 로컬 Docker PostgreSQL 구성 + .env.example 확장              | ✅   |
| 1.2  | schema.prisma 상단 공통 패턴 주석 블록                       | ✅   |
| 1.3  | 10 청크 순차 전사 (§2.1~§2.27)                               | ✅   |
| 1.4  | ENUM 일괄 선언 (25 enum)                                     | ✅   |
| 1.5  | prisma migrate dev --name init + generate                    | ✅   |
| 1.6  | packages/shared/src/index.ts Prisma Client re-export         | ✅   |
| 1.7  | Zod 파생 타입 스텁 — skip (Phase 2 로 이월)                  | ⏭️   |
| 1.8  | 커밋                                                         | ✅   |
| 1.9  | schema → 도메인 10개 .prisma 파일 분리 (prismaSchemaFolder)  | ✅   |

**실행 방식 (사용자 선택 2026-04-19):**

- 로컬 Docker Postgres 17-alpine (homelab 이관 전 개발 단계)
- 청크마다 `pnpm prisma format` + `validate` (총 10회, 모두 pass)
- 10 청크 완료 직후 `prismaSchemaFolder` preview feature로 도메인 파일 분리 (사용자 제안)

**완료 조건 (체크리스트):**

- [x] `prisma migrate dev` 로컬 DB에 성공 (migration `20260418152503_init`)
- [x] `public` 스키마 테이블 수: 86 (= 85 모델 + `_prisma_migrations`)
- [x] `packages/shared/src/prisma-client/index.d.ts`에 `PrismaClient` export 확인
- [x] 모든 polymorphic reward 테이블(`environment_reward`, `pokedex_milestone`, `human_record`, `island_reward`, `jumprope_tier`, `hideandsneak_reward`, `pokemon_litter_reward`)이 `reward_type` + `reward_ref_id` 컬럼 보유
- [x] 신규 테이블 `trade_valuation`, `exchange_recipe`, `pokemon_litter_reward` 존재
- [x] 폴더 모드 인식: `pnpm prisma format`/`validate` 모두 "Prisma schema loaded from prisma/schema" 출력
- [x] `pnpm prisma migrate status` → "Database schema is up to date" (diff==0)
- [x] type-check (shared, api) + lint (0 err/warn) + test (4 pass)

**Phase 1 기술 결정 기록:**

- **로컬 개발 DB**: `postgres:17-alpine` (docker-compose.local.yml, 5432, pokopia 유저/DB). homelab 이관 시 `DATABASE_URL` 교체만. bitnami Helm 차트는 homelab 단계에서 별도 사용.
- **Prisma 버전**: Phase 0에서는 5.22로 시작 → Phase 1 커밋 직전 **Prisma 7.7.0으로 업그레이드** (사용자 결정 2026-04-19). 7.0.0의 multi-file 인식 버그는 7.7.0에서 해결됨을 로컬 검증(format/validate/migrate status 모두 pass).
- **스키마 파일 분리**: `prismaSchemaFolder` preview feature는 Prisma 7에서 GA이므로 `previewFeatures` 리스트에서 제거. 폴더 경로 지정은 `prisma.config.ts`의 `schema: 'prisma/schema'`로.
- **Prisma 7 breaking change 대응**:
  - `datasource` 블록에서 `url = env(...)` 제거 → `prisma.config.ts`의 `datasource.url`로 이관.
  - `PrismaClient` 인스턴스 생성 시 `adapter` 또는 `accelerateUrl` 필요. Phase 2~3에서 `@prisma/adapter-pg` 주입 패턴 도입 예정.
  - `dotenv` 런타임 의존성 추가 (`prisma.config.ts`의 `import 'dotenv/config'`).
  - 루트 `package.json`의 `"prisma": {"schema": "..."}` 필드 제거 (config.ts 우선).
- **도메인 그룹**: 10 파일 (`_base` / `pokemon` / `item` / `recipe` / `geography` / `infrastructure` / `social` / `content` / `economy` / `polymorphic_meta`). ENUM은 관련 모델과 동거 (공유 `I18nSource`만 `_base.prisma`, `FlavorType`은 item 정의 + content 참조).
- **`.env` gitignored** (Phase 0부터 `.env*` / `!.env.example` 정책 유지).
- **Prisma 생성물**: `packages/shared/src/prisma-client/**`는 `.gitignore`에 추가하고 `.gitkeep`만 커밋. 루트 `package.json`의 `postinstall` hook(`prisma generate`)로 `pnpm install` 후 자동 재생성.
- **`.oxlintrc.jsonc` `ignorePatterns`**에 `packages/shared/src/prisma-client` 추가 (Prisma 생성물 린트 제외). oxfmtrc는 Phase 0에서 이미 처리.
- **초기 마이그레이션 이름**: `init` (feat(schema) 범주).

**SCHEMA.md SSoT 대비 도출된 불일치 (Phase 1 감사 시 doc-consistency가 검토):**

1. **I18nSource ENUM 값 수**: 로드맵 Task 1.2는 "7개 값"이라 기술했으나 SCHEMA §1.2는 6값(pokopiaguide/pokopoko/namuwiki/pokemon_official/manual/pending). 스키마는 SCHEMA를 따라 6값 선언. **로드맵 문서 오타 의심**.
2. **`ItemTag` 모델 vs ENUM 이름 충돌**: 로드맵 Task 1.4는 ENUM 이름을 `ItemTag`로 나열했으나 `model ItemTag`가 SCHEMA §2.2에 존재 (PostgreSQL table/type 네임스페이스 공유로 충돌). ENUM을 **`ItemTagName`**으로 변경.
3. **SCHEMA §2.5 `habitat_pokemon`의 time/weather_condition "nullable"**: 복합 PK는 NOT NULL 필수. "nullable" 대신 **NOT NULL + default `Any`**로 구현 (두 ENUM 모두 `Any` 값 보유하므로 의미 보존).
4. **SCHEMA §2.27 `pokemon_litter_reward`의 habitat_id nullable + 복합 PK**: 동일 이유로 `@@id` 대신 **autoincrement id + `@@unique([pokemonId, itemId, habitatId])`**로 구현. `habitat_id` NULL = "모든 서식지 공통" 의미 보존.
5. **`PlantType` 값 `SeashorFlower`**: 오타 가능성(Seashore?). SCHEMA를 SSoT로 그대로 사용. 감사 시 원문 교차 확인.
6. **로드맵 Task 1.4의 `StampJumpropeRewardType` ENUM**: SCHEMA §2.22 `stamp_reward`는 ENUM 필드 없음(`coin_amount` INT만). 생성 안 함. **로드맵 문서 오타 의심**.
7. **`building_kit_material`**: SCHEMA §2.6은 `(building_kit_id, item_id) PK`만 명시하고 수량 필드 없음. 구현도 SCHEMA 그대로 (quantity 없음). 추후 SCHEMA 명시 필요 시 Phase에 맞춰 추가.

**Phase 1 산출물:**

- `docker-compose.local.yml` (postgres:17-alpine, healthcheck, persistent volume)
- `.env.example` + `.env` (DATABASE_URL)
- `prisma/schema/` 10개 파일 (≈1770줄 총합, 85 모델, 25 ENUM, Prisma 7.7.0 포맷)
- `prisma/migrations/20260418152503_init/` (migration.sql + migration_lock.toml, 5.22에서 생성되었으나 7.7.0 호환 확인됨)
- `prisma.config.ts` (schema 폴더 경로 + datasource.url 관리)
- `packages/shared/src/index.ts` (`PrismaClient` + `Prisma` + type re-export)
- `package.json` (prisma/@prisma/client 7.7.0 + dotenv + postinstall hook), `packages/shared/package.json` (@prisma/client 7.7.0), `.oxlintrc.jsonc`, `.gitignore` 업데이트

**Phase 1 커밋:**
- `990e39f` `feat(schema): add Prisma 7.7 schema with 85 entities across 10 domain files (§2.1-§2.27)` (23 files, +4624 / -94) — 초기 전사
- 루프 1 수정 커밋 (`fix(schema): LostRelic 감정 필드 추가`) — LostRelic 2 필드 + 마이그레이션 `20260418161151_add_lost_relic_appraisal`

**Phase 1 감사 (루프 1, PASS):**

- **하네스:** `pokopia-phase-review-harness` (프로파일 `schema`). 감사자 3명: `pokopia-doc-consistency`, `codereview-architecture`, `codereview-style`.
- **루프 0 (2026-04-18 15:46 UTC):** VERDICT=LOOP_REQUIRED. Critical 1건(DC-001: `LostRelic` 모델에 `appraisal_result_item_id`/`appraisal_cost` 2개 필드 누락 — SCHEMA.md §2.20 5필드 정의 중 2개 미구현). Warning 18건, Info 21건.
- **루프백 수정:** `loopback_directive.md` 지시에 따라 `prisma/schema/item.prisma`의 `LostRelic` 모델에 2 필드 + `appraisalResultItem` 관계(`@relation("LostRelicAppraisalResult", onDelete: SetNull)`) 추가, `Item` 모델에 역관계 2건(`lostRelicExt @relation("LostRelicItem")`, `lostRelicAppraisalResultFor`) 추가, 마이그레이션 `20260418161151_add_lost_relic_appraisal` 생성·적용.
- **루프 1 (2026-04-18 16:12 UTC):** VERDICT=**PASS**. DC-001 `resolved`, 신규 Critical 0건. 신규 Warning 3건(DC-101/ARCH-103/STYLE-101 — 동일 주제 3각도 교차: "관계명·onDelete 정책이 SSoT에 미기술"), Info 4건. 기존 Warning 18 + Info 21은 `unresolved`(사용자 방침으로 의도적 보류 → 별도 세션 처리).
- **감사 산출물:** `_workspace/audit/phase-1/20260418-1546/` + `_workspace/audit/phase-1/20260418-1612/` (`.gitignore`로 제외됨).

**Phase 1 후속 작업 (별도 세션 권장 순위):**

1. **X-6 신규(DC-101/ARCH-103/STYLE-101):** SCHEMA.md §1 또는 §2.20에 관계명·onDelete 정책 규칙 명시 → 3건 일괄 resolved
2. **X-2 `SeashorFlower` 오타:** 원본 확인 후 SCHEMA 정정 (ENUM rename 마이그레이션 수반)
3. **DC-002/003/005/006/007/008:** SCHEMA 정정 + 로드맵 stale 수정(`pokopia-doc-consistency`)
4. **STYLE-001/002:** i18n 네이밍 일괄 통일(full 권장)
5. **ARCH-003:** Phase 2 착수 시 `@prisma/adapter-pg` factory 구현 — **Phase 2 필수 진입 조건**
6. **STYLE-011:** prisma-lint 도구 도입 검토(별도 chore)

---

## Phase 2 — 공통 검증·메타데이터 인프라

**Goal:** `packages/shared`에 스크래퍼/API가 공유하는 Zod 검증 계약, 출처 메타데이터, 로깅 마스킹 유틸을 정착.

**세부 태스크 상태:**

| Task | 설명                                                         | 상태 |
| ---- | ------------------------------------------------------------ | ---- |
| 2.0  | ARCH-003: `@prisma/adapter-pg` factory 진입 조건 해결        | ✅   |
| 2.1  | `SourceMetadataSchema` (CRAWLING_STRATEGY §27.1)             | ✅   |
| 2.2  | 엔티티별 Zod 스키마 (핵심 5개 + 도메인 분리)                 | ✅   |
| 2.3  | `SOURCE_DEFAULTS` + `buildSourceMetadata()` (§27.4)          | ✅   |
| 2.4  | `redact()` 유틸 + 테스트 (§22.3, TDD)                        | ✅   |
| 2.5  | `packages/shared/src/index.ts` 통합 export                   | ✅   |
| 2.6  | type-check + test + 커밋                                     | ✅   |

**실행 방식 (사용자 선택 2026-04-19):**

- Task 2.2 범위: **핵심 5개 + 도메인 분리** — Pokemon / Item / CookingRecipe / CraftingRecipe / Habitat. 나머지 80 엔티티는 해당 파서 Phase(Phase 8+)에서 점진 추가.
- Factory 위치: **`packages/shared/src/db/client.ts`** (prisma-client/는 생성물이라 postinstall로 갈아엎혀서 제외).

**Phase 2 기술 결정 기록:**

- **zod 4 API 판정**: `z.url()` / `z.iso.datetime()` / `.extend(B.shape)` 사용. `z.string().url()` / `z.string().datetime()` / `.merge()` 는 zod 4에서 deprecated. `_base.ts` JSDoc에 후속 에이전트용 가이드 명시.
- **Zod 스코프 경계**: Zod는 "스크래퍼가 파싱 직후 넘기는 객체" 계약. Prisma 생성 컬럼(`id` autoincrement, `createdAt`/`updatedAt`, `contentHash` 파생)은 Zod에서 제외하고 loader 책임으로. FK는 영문명(`resultItemNameEn` 등)으로 느슨히 두고 loader가 name→id resolve.
- **Prisma 7 runtime adapter 패턴**: `createPrismaClient({ connectionString?, pool? })` 팩토리 + `getPrismaClient()` 싱글톤 + `resetPrismaClient()` 테스트용. `PrismaPg(pool)` 주입, pg named import(`{ Pool }`) 사용 (oxlint `no-named-as-default-member` 준수).
- **redact 정규식 1건 원문 차이**: Telegram 토큰 패턴 뒷경계를 `\b` 대신 `(?![A-Za-z0-9_-])`로 구현. `-`가 `\w`에 속하지 않아 원문 `\b`가 조기 종료하는 문제 회피. 의미 동일. §22.3 원문 보완 여부는 감사 시 `doc-strategist`가 판정.
- **이중 타입 호환 검증**: `expectTypeOf<PokemonInput['pokedexNo']>().toExtend<Prisma.PokemonCreateInput['pokedexNo']>()` 등 compile-time 할당성 보장. Pokemon + Item 두 엔티티에 대해 각 5건(safeParse 3 + 타입 2) = 총 10건 신규 테스트.
- **의존성 추가**: `@prisma/adapter-pg`, `pg` 런타임 + `@types/pg` devDep (3 packages). 다른 의존성은 건드리지 않음.
- **docker-compose.local.yml oxfmt side-effect**: Phase 1 커밋 이후 포맷 미정렬 상태였던 파일이 format:check에서 드러남. Phase 2 커밋 범위에 포함시켜 정리.

**Phase 2 산출물:**

- 신규 13개 파일:
  - `packages/shared/src/db/client.ts` (Prisma factory, ARCH-003)
  - `packages/shared/src/validators/schemas/{_base,pokemon,item,recipe,geography,index}.ts` (6개)
  - `packages/shared/src/validators/schemas/{pokemon,item}.test.ts` (2개)
  - `packages/shared/src/validators/metadata.ts` (buildSourceMetadata)
  - `packages/shared/src/config/source-metadata.ts` (SOURCE_DEFAULTS)
  - `packages/shared/src/logging/{redact,redact.test}.ts` (2개)
- 수정: `packages/shared/src/index.ts` (통합 export), `packages/shared/package.json` (+3 deps), `pnpm-lock.yaml`, `docker-compose.local.yml` (oxfmt)

**완료 조건 (체크리스트):**

- [x] `SourceMetadataSchema.safeParse({ ... })` 정상 동작
- [x] `buildSourceMetadata({ sourceSite: 'serebii', sourceUrl: '...' })`가 license/copyrightHolder/attribution 자동 주입
- [x] `redact()`가 Telegram 토큰·Bearer·cf_clearance 쿠키 모두 마스킹 (4 tests pass)
- [x] Pokemon + Item Zod `.infer` ↔ Prisma.{Entity}CreateInput 타입 호환 compile-time 검증
- [x] `pnpm --filter @pokopia-wiki/shared type-check` + `test:run` (14 pass) + `lint` (0/0) + `pnpm format:check` 전체 PASS
- [x] `pnpm --filter @pokopia-wiki/api type-check` + `test:run` (4 pass) — shared 변경이 api 호환성 깨뜨리지 않음

**Phase 2 커밋:**
- `221704f` `feat(shared): add Phase 2 validation/metadata infra (ARCH-003 + Task 2.1-2.5)` (17 files, +957/-3)
- `2c741c1` `docs(plans): record Phase 2 implementation in progress tracker`
- 감사 결과 반영 커밋: 후속 `docs(plans): Phase 2 감사 루프 0 PASS 결과 기록`

**Phase 2 감사 (루프 0, PASS):**

- **하네스:** `pokopia-phase-review-harness` (프로파일 `schema` + 사용자 요청 `security` 1명 추가). 감사자 4명: `pokopia-doc-consistency`, `codereview-architecture`, `codereview-style`, `codereview-security`.
- **루프 0 (2026-04-19 02:06 KST):** VERDICT=**PASS**. Critical 0건, Warning 8건, Info 29건. 감사자 4명 전원 verdict_hint: PASS로 독립 수렴.
- **ARCH-003 해소 확정:** doc-consistency(DC-001) + architecture(ARCH-201) 양측 독립 `resolved` 판정. Phase 1 감사의 `rule: dip-runtime-adapter`는 본 Phase에서 종료.
- **주요 Warning (후속 세션 대상):**
  - W-001~003 (doc): CRAWLING_STRATEGY §27.1 zod 4 API 반영, §22.3 Telegram 뒷경계 치환 각주, §27.4 `scrapedAt` 1회 호출 규칙 명시
  - W-004 (arch): `buildSourceMetadata`의 `new Date()` 내부 호출 → `scrapedAt?: string` 옵셔널 추가 권장
  - W-005 (style): `item.ts`의 Zod 로컬 ENUM 5개는 Prisma `$Enums` 런타임 제약으로 수동 동기 (expectTypeOf 차단 중, 의도적)
  - W-006~008 (sec): redact Bearer 범위 확장(JSON body access_token, Basic auth), Cookie 키 확장(CSRF/refresh/JWT), `redactObject` BigInt/순환 throw 방어
- **감사 산출물:** `_workspace/audit/phase-2/20260419-0206/` (scope.md, profile.md, 4개 YAML, REPORT.md — `.gitignore`로 제외됨)

**Phase 2 Warning 보완 세션 (2026-04-19, 완료):**

1. **코드 3파일 보완:**
   - `packages/shared/src/validators/metadata.ts` — `scrapedAt?: string` 옵셔널 (W-004)
   - `packages/shared/src/logging/redact.ts` — TOKEN_PATTERNS 5개로 확장(Telegram + Bearer + Basic + OAuth JSON + Cookie 키 확장), `\b` 단어 경계, `redactObject` try-catch fallback (W-006/007/008)
   - `packages/shared/src/logging/redact.test.ts` — 회귀 케이스 6건 추가 (Basic auth / OAuth JSON / CSRF+JWT / Base64 padding / BigInt / circular). 총 20/20 pass.
2. **CRAWLING_STRATEGY.md v3.3 동기화:** §22.3 TOKEN_PATTERNS 확장 설명 + `redactObject` 방어, §27.1 zod 4 API 전환(`.extend(B.shape)`/`z.url()`/`z.iso.datetime()`) + deprecated 금지 각주, §27.4 `buildSourceMetadata` scrapedAt 옵셔널 + 1엔티티 1회 호출 규칙. 개정 이력 v3.3 엔트리.
3. **해결된 Warning (7/8):** W-001, W-002, W-003, W-004, W-006, W-007, W-008.
4. **의도적 잔존 (1/8):** W-005 `item.ts` Prisma `$Enums` 로컬 ENUM 5개 수동 동기 — Prisma 7 런타임 `$Enums`가 `type`만 export하고 value를 export하지 않는 제약으로 Zod `z.enum`에서 사용 불가. expectTypeOf로 컴파일 타임 차단 중이며, Prisma enum 변경 시 IDE·CI가 즉시 감지. 설계상 정당하므로 Info 강등이 자연스러움 — 다음 감사에서 재분류.

---

## Phase 3 — 사전 검증 하네스

**Goal:** `packages/scraper`에 robots/access/patchright/network/notifier 5종 preflight + Notifier 뼈대 구축. 외부 자원 접근성 · WebGL stealth · 네트워크 위치 · 민감정보 마스킹 체계를 크롤링 착수 전에 검증.

**세부 태스크 상태:**

| Task | 설명                                                           | 상태 |
| ---- | -------------------------------------------------------------- | ---- |
| 3.1  | scraper 의존성 추가 (ky/robots-parser/playwright/patchright 등) | ✅   |
| 3.2  | `.env.example` 확장 (Telegram·UA·SSD 마운트 빈값+주석)         | ✅   |
| 3.3  | `check:robots` + `robots/checker.ts`                           | ✅   |
| 3.4  | `check:access` (T0~T3 대표 페이지)                             | ✅   |
| 3.5  | `check:patchright` WebGL probe                                 | ✅   |
| 3.6  | `check:network` (ipapi 국가/시간대)                            | ✅   |
| 3.7  | Notifier 뼈대 (events/config/index) + `notifier:test`          | ✅   |
| 3.8  | `data/` 13개 디렉토리 + `.gitignore` 규칙                      | ✅   |
| 3.9  | chromium 설치 + 4 preflight 부분 실행 (Telegram 제외)          | ✅   |
| 3.10 | 검증 + 커밋                                                    | ✅   |

**실행 방식 (사용자 선택 2026-04-19):**

- 의존성 설치 + `npx playwright install chromium`까지 Claude가 수행
- `.env.example`은 모두 빈값 + 주석 (실제 `.env` 값 주입은 사용자)
- Telegram 토큰은 사용자가 `@BotFather` 발급 후 `.env`에 주입 (Notifier 실제 전송은 그 이후)

**Phase 3 기술 결정 기록:**

- **의존성 추가 (13개 신규):** `ky` `robots-parser` `dotenv` (런타임 1차), `playwright` `patchright` `fingerprint-injector` `fingerprint-generator` `ghost-cursor-playwright` `tough-cookie` `tough-cookie-file-store` `proper-lockfile` `node-cron` (런타임 2차), `@types/proper-lockfile` `@types/node-cron` (devDep). tsx는 Phase 0부터 존재.
- **`src/paths.ts` 추가 (의뢰 외):** `pnpm --filter`는 cwd를 `packages/scraper/`로 설정해서 스크립트 내 `path.resolve('data/...')` 이 잘못된 위치에 산출물을 남기는 버그를 1차 smoke test에서 재현. `import.meta.dirname` 기반 `REPO_ROOT` 상수로 통일. 2차 smoke에서 repo root `data/logs/events.jsonl` 정확 기록 확인.
- **Notifier 뼈대 전략:** events.ts (EventType union + Severity + SEVERITY_MAP 전체) + config.ts (`loadNotifierConfig` — 환경변수 누락 시 null + enabled=false console fallback) + index.ts (`Notifier.notify(event, meta)` — `redactObject` 경유 후 events.jsonl append + Telegram POST 또는 console). **Phase 7에서 batch/dedup/rate/shutdown 훅 추가 예정** — TODO 7건 `_workspace/phase-3/01_preflight_harness.md` 기록.
- **CWD headless 전략:** `patchright`·`playwright` 기본 `headless: true`. `SCRAPER_HEADED=1` 환경변수로 선택 토글.
- **실행 내성 (Task 3.4/3.6):** ipapi 429나 T2/T3 접근 실패는 exit 0으로 기록만 (VPN 환경·Phase 12 skip 근거 판단). 반면 Task 3.5 patchright는 실패 시 exit 1 (stealth 검증 핵심).
- **`.gitignore`**: `data/<subdir>/*` + `!data/*/.gitkeep` 규칙으로 구조만 유지. `data/manual/`은 수동 번역 소스이므로 추적.
- **User-Agent 기본값:** `process.env.SCRAPER_USER_AGENT ?? 'PokopiaScraperBot/1.0'` fallback. `.env.example` 에서는 명시적 빈값 + 발급 절차 주석.

**Phase 3 실행 결과 (2026-04-19 03:07~08 KST):**

| 스크립트 | 결과 | 비고 |
|---|---|---|
| check:network | 429 (ipapi rate limit), exit 0 기록만 | `data/preflight/20260419-0307/network.json`. VPN 의심 시 수동 재검증. |
| check:robots | 4 소스 전원 OK, 샘플 11 URL 전부 allowed | serebii 62B / pokopiaguide 1738B / pokopoko 1807B / namu 393B |
| check:patchright | ✅ `overridesWebgl: true`, patchright v1.59.4 (8일 전 릴리스) | `data/preflight/patchright-webgl.json`. headless 모드라 WebGL vendor/renderer="no-webgl"로 stealth 적용됨 |
| check:access | T0 HTTP 200 261KB (marker 미검출 — warn), T1/T2/T3 OK | T0 marker "Available Pokemon" 미검출은 Phase 8 파서 착수 시 실제 HTML 구조로 재확인 필요 |
| notifier:test | code-builder smoke: 4 severity 전부 console fallback + `data/logs/events.jsonl` append 확인 | Telegram 실전송은 사용자 토큰 주입 후 별도 재실행 |

**Phase 3 산출물:**

- 신규 10개 소스 파일:
  - `packages/scraper/src/robots/checker.ts` (RobotsChecker §26.2)
  - `packages/scraper/src/notifier/{events,config,index}.ts` (3파일, 뼈대)
  - `packages/scraper/src/paths.ts` (REPO_ROOT 헬퍼)
  - `packages/scraper/scripts/{check-robots,check-access,check-patchright,check-network,notifier-test}.ts` (5파일)
- 수정: `packages/scraper/package.json` (+13 deps), `packages/scraper/src/index.ts` (lint disable 1줄), `.env.example` (Telegram·UA·SSD 추가), `.gitignore` (data 규칙), `pnpm-lock.yaml`
- 신규 13개 `.gitkeep` (data/ 하위 디렉토리)

**완료 조건 (체크리스트):**

- [x] `pnpm --filter @pokopia-wiki/scraper type-check` 0 error
- [x] `pnpm --filter @pokopia-wiki/scraper lint` 0 warning/0 error
- [x] `pnpm --filter @pokopia-wiki/scraper test:run` (No test files — Phase 4+에서 단위 테스트 추가 예정)
- [x] `pnpm format:check` clean
- [x] 4 preflight 스크립트 실제 실행 + 산출물 기록 확인
- [x] notifier-test Telegram 미설정 시 console fallback 경로 smoke 통과

**Phase 3 감사 (별도 세션 권장):**

- **프로파일:** `crawler` (fetcher·preflight 성격). 감사자 구성은 harness의 프로파일 파일 참조.
- **주목 포인트 (Phase 2 감사 지연 리스크 포함):**
  - W-005 재분류 — `packages/shared/src/validators/schemas/item.ts`의 Zod 로컬 ENUM 5개는 Prisma 7 `$Enums` 제약이라 Info 강등이 자연스러움. 본 Phase 감사에서 같이 처리.
  - `redactObject` 실사용 — Notifier가 진짜로 `events.jsonl` append 전에 호출하는지 security auditor 확인 (Phase 2에서 실사용 지점 없어 유보됐던 검증)
  - `paths.ts` REPO_ROOT 해석 — worktree/remote 환경에서도 정확한 repo root를 가리키는지 architect 확인
  - Notifier의 "Phase 7에서 완성" TODO 7건이 구조적으로 이후 확장 가능한지 검증

---

## Phase 3 감사 후속 — Loop 1 재감사 스킵 결정

**결정(2026-04-19):** Phase 3 감사 Loop 0에서 식별된 Critical 2건(SEC-001 Telegram URL 토큰 누출, OPS-001 T0 marker HTML entity)은 커밋 `0fcfdbb` + `6da10e4`로 번들 수정 완료. Warning 2건(SEC-002/003)도 SEC-001 수정에 번들 포함. smoke 2건(`check:access` T0~T3 전원 `ok=true`, `notifier:test` 4건 console fallback) 모두 PASS.

**Loop 1 재감사는 Phase 4 감사에 병합하여 처리.** 사유:
- 수정 범위가 좁고 지역적 (2 파일 4 catch 지점 + 1 정규식) — 감사 재실행으로 새 critical이 등장할 확률 낮음
- Phase 3 코드 + Phase 4 신규 코드가 동일 `packages/scraper/` 패키지에 있어 교차 검토가 더 효율적
- Phase 4 감사 프로파일 `crawler` + security 1명 조합이 SEC-001 resolved 확인과 fetcher 신규 보안(path traversal 등)을 함께 커버
- 잔존 Warning 8건(PERF Phase 7 이월·OPS 운영·STYLE DRY·W-005)도 Phase 4 감사에서 일괄 재분류

**리스크 수용 근거:** Phase 3 Critical 2건의 근본 원인(redact 불변 에러 경로 우회, HTML entity 미대응)은 수정 직후 smoke PASS + shared 21/21 + scraper 20/20 tests로 재현 가능 증거 확보. 이 범위에 대한 loop 1 단일 재감사보다 Phase 4 전체 감사가 정보 가치 높음.

---

## Phase 4 — Fetcher 인프라 & 캐시 & Rate Limiter

**Goal:** 티어별 fetcher(T0 ky / T1 playwright / T2·T3 patchright)를 `FetcherFactory`로 추상화, HTML 캐시(TTL 3일) + 쿠키 영속 + RateLimiter + Chrome 버전 훅 연결로 멱등적 네트워크 레이어 완성.

**세부 태스크 상태:**

| Task | 설명                                                    | 상태 |
| ---- | ------------------------------------------------------- | ---- |
| 4.1  | `HtmlCache` TDD (getOrFetch + TTL 3일 + content_hash)   | ✅   |
| 4.2  | `Fetcher` types + persona stub + `errors.ts`            | ✅   |
| 4.2b | `KyFetcher` (T0 ky, robots + 429/503 백오프)            | ✅   |
| 4.3  | `PlaywrightFetcher` (T1, `channel:'chrome'` 강제)       | ✅   |
| 4.4  | `PatchrightFetcher` (T2, fingerprint-injector 미적용)   | ✅   |
| 4.5  | `PatchrightCfFetcher` (T3, CF challenge 60s 대기)       | ✅   |
| 4.6  | `FetcherFactory` (`createFetcher(source, deps)`)        | ✅   |
| 4.7  | `RateLimiter` + `config.ts` (§14.3 SSoT 이식, 3종 영속) | ✅   |
| 4.8  | `CookieStore` (tough-cookie + file-store)               | ✅   |
| 4.9  | Chrome 버전 훅 (`detectChromeVersion` + `onSessionStart`) | ✅   |
| 4.10 | `FetcherFactory` 통합 테스트 (11 tests)                 | ✅   |
| 4.11 | 검증 + 커밋                                             | ✅   |

**Phase 4 기술 결정 기록:**

- **`persona/types.ts` stub 전략:** Phase 5에서 `PersonaManager`·`definitions.ts` 완성 예정이라 Phase 4에서는 `BrowserPersona` 타입만 최소 필드(`id`/`locale`/`timezone`/`storageStatePath`)로 stub. Fetcher 인자에서 `persona?: BrowserPersona`로 받되 T1+ 호출 시 throw.
- **`fetchers/errors.ts` 공용 에러 클래스 5종:** `SkippedByRobotsError` / `SessionAbortError` / `RateLimitExceeded` / `CacheStaleError` / `ChromeVersionUnavailable`. 모든 fetcher가 이 공용 파일에서 throw.
- **HtmlCache 경로 해싱 (§10.3 path traversal 방어):** url을 `encodeURIComponent` 후 sha256 앞 16자 → `data/cache/<source>/<hash>.html` + `<hash>.meta.json`. 메타에서 cookie/set-cookie/authorization 헤더 필터링.
- **RateLimiter 3종 분리:** navigation/resource/direct 각각 `{ rps, dailyLimit }` 독립 카운트. `data/state/rate/<source>.json` 영속. **UTC+9 자정 회계일 리셋** (Asia/Seoul). proper-lockfile 쓰기 보호. 80% 도달 시 Notifier에 `rate_limit.approaching` 이벤트 발행 (주입 의존성).
- **`isHigherTierActive()` 스텁:** §6.4.1 "T1+ 활성 시 T0 50% 감속" 요구사항은 ConcurrencyGuard(Phase 5)와 연동되어야 구현 가능 → 지금은 `false` 반환 스텁, TKTK 주석으로 Phase 5 연결 명시.
- **T1/T2/T3 공통 `userAgentDataInitScript` 중복:** Phase 5에서 `behavior/` 모듈로 공용화 예정 (TKTK 마킹).
- **Chrome 버전 bump 이벤트:** `data/state/chrome-version.json`에 마지막 값 저장. `onSessionStart()`가 비교 후 bump 감지 시 Notifier로 `chrome.version_bump` 이벤트 발행.
- **TDD 검증:** HtmlCache 9 tests (cache hit/miss/TTL 만료/force/stale 복구/content_hash/민감 헤더 필터링 등) + Factory 11 tests (tier 해석 4건 + 인스턴스 타입 4건 + persona 누락 throw + deps 조합 등) = 20 tests.

**Phase 4 산출물 (15 파일):**

- 신규 소스:
  - `packages/scraper/src/cache/{html-cache,cookie-store}.ts` + `html-cache.test.ts`
  - `packages/scraper/src/fetchers/{types,errors,factory,ky-fetcher,playwright-fetcher,patchright-fetcher,patchright-cf-fetcher}.ts` + `factory.test.ts`
  - `packages/scraper/src/rate/{config,limiter}.ts`
  - `packages/scraper/src/browser/chrome-version.ts`
  - `packages/scraper/src/persona/types.ts` (Phase 5에서 확장)

**완료 조건 (체크리스트):**

- [x] `createFetcher('serebii', deps)`가 `KyFetcher` 반환 (factory test로 검증)
- [x] HtmlCache TDD 9건 PASS — TTL/force/stale/hash/헤더 필터링 전부
- [x] RateLimiter 3종 분리 + `data/state/rate/<source>.json` 영속 로직 구현
- [x] Chrome 버전 bump 감지 + `events.jsonl` 기록 경로 구현 (단위 검증 가능)
- [x] `pnpm --filter @pokopia-wiki/scraper type-check` + `test:run` (20 pass) + `lint` (0/0) + `pnpm format:check` 전체 PASS
- [x] 모노레포 회귀: shared 21/21 + api 4/4 + scraper 20/20 = 45/45

**Phase 5 연결 TODO (TKTK 주석으로 마킹됨):**

1. `PersonaManager` 실제 구현 + `PERSONAS` 상수 정의 (`persona/definitions.ts` + `persona/manager.ts`)
2. `attachFingerprint(context, persona)` — T1 fingerprint-injector 연결
3. `maybeReinforceWebgl(context)` — T2 addInitScript 주입 (patchright-webgl.json 결과 기반)
4. `RateLimiter.isHigherTierActive` → ConcurrencyGuard 연동
5. `onSessionStart` → Notifier `chrome.version_bump` 이벤트 발행 경로
6. T1/T2/T3 `userAgentDataInitScript` → `behavior/` 모듈로 공용화

**Phase 4 감사 (별도 세션 권장):**

- **프로파일:** `crawler` — `pokopia-tier-crawler` + `codereview-performance-auditor` (N+1, 메모리 누수) + `codereview-security-auditor` (path traversal §10.3, 경로 해시 안전성).
- **주목 포인트:**
  - Phase 3 SEC-001/OPS-001 resolved 확인 (Loop 1 재감사 통합)
  - Phase 3 잔존 Warning 8건 재분류 (PERF/OPS/STYLE/W-005)
  - HtmlCache 경로 해싱의 path traversal 방어 실효성 (§10.3)
  - RateLimiter 3종 분리 + UTC+9 자정 리셋 로직 정확성
  - `persona/types.ts` stub이 Phase 5에서 깨지지 않고 확장 가능한지 architecture 관점
  - T1/T2/T3 `userAgentDataInitScript` 중복이 DRY 위반(Warning)인지 공용화 TODO(Info)인지 판정

---

## 다음 세션 바로 시작 카드 — Phase 5 (페르소나·워밍)

Phase 4 ✅ 감사 PASS + 선결 5항목 보완 완료. Phase 5 착수 가능.

### 첫 15분 체크리스트 (세션 재개 직후)

```bash
# 1. 위치 + 환경 확인 (복붙 실행)
cd /Users/ukyi/workspace/pokopia-wiki
git log --oneline -5                        # 마지막 커밋: Phase 4 감사 PASS + 선결 보완
git status                                   # clean 확인
pnpm -r --parallel test:run                  # 47/47 pass 재확인 (api 4, shared 23, scraper 20)
docker compose -f docker-compose.local.yml ps postgres  # Running 확인
```

### 2. Phase 5 착수 (최우선)

**로드맵:** `docs/plans/2026-04-18-implementation-roadmap.md` §Phase 5 (라인 827~)

**주 산출물 (Phase 4 TKTK 6건 + 신규 모듈):**

- `services/scraper/src/persona/definitions.ts` — PERSONAS 2인 (`korean-pokemon-fan` T1/T2 / `namuwiki-researcher` T3). `activeHours`/`healthScore`/`fingerprint` 등 Phase 5 전용 필드는 `persona/types.ts` 에 optional 로 추가 (Phase 4 감사에서 확장 안전성 확인).
- `services/scraper/src/persona/manager.ts` — 활성 시간 기반 선택 + `retire()`.
- `services/scraper/src/persona/warmer.ts` — ProfileWarmer (파일 편집 금지, API만).
- `services/scraper/src/fingerprint/inject.ts` — T1 `attachFingerprint` (Phase 4 TKTK #2 해소).
- `services/scraper/src/fingerprint/patchright-webgl.ts` — T2/T3 `maybeReinforceWebgl` (Phase 4 TKTK #3 해소).
- `services/scraper/src/scheduler/concurrency-guard.ts` — §6.4.3 A4 전체 (`proper-lockfile` 파일락) + `RateLimiter.isHigherTierActive` 연결 (Phase 4 TKTK #4 해소).
- `services/scraper/src/behavior/` — `userAgentDataInitScript` 공용화 (Phase 4 TKTK #6 해소).
- `data/browser-profiles/{korean-pokemon-fan,namuwiki-researcher}/` — 워밍 후 생성.

**스킬 호출:** `/pokopia-code-builder` 또는 `/pokopia-tier-crawler` 로 Task 분할.

### 3. Phase 5 scope 문서 필수 명시 — X-003 (SessionManager 선결 조건)

Phase 4 감사 교차 이슈 X-003 에서 지적. Phase 5 scope 에 **반드시 포함**:

1. **Chrome bump notify 호출자 의무화** — `services/scraper/src/browser/chrome-version.ts` 의 `onSessionStart(notifier)` 가 SessionManager 초기화 시 누락되면 `chrome.version_bump` 이벤트 미발행 (Phase 4 TKTK #5 해소).
2. **catch redact 강제** — SessionManager 의 모든 `catch` 경로가 `redact()` 를 거쳐 로그에 쓰도록. Phase 3 SEC-001 의 근본 방어선 연장.
3. **cachedUserAgent 리셋** — Chrome 버전 bump 감지 시 cachedUserAgent 를 파기해 새 버전으로 재샘플.
4. **fetcher close() 강제** — 세션 종료 시 모든 fetcher `close()` 호출 보장 (proper-lockfile stale 10s 대비).

### 4. Phase 4 잔존 Warning 운영 개선 (Phase 5~6 중 처리)

| ID      | 위치                                       | 개선 내용                                                          |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ |
| OPS-003 | `data/preflight/<date>/`                   | preflight 스크립트에 `PREFLIGHT_TS` env 공유 (분 단위 분리 제거)   |
| OPS-004 | `data/preflight/<date>/SUMMARY.md`         | `preflight:all` 스크립트 + 통합 리포터                             |
| OPS-006 | `services/scraper/scripts/check-network.ts` | ip-api.com fallback (ipapi.co 429 대비)                            |

### 5. Phase 4 Warning Phase 7 이월 3건 (Notifier worker 화)

| ID       | 위치                                     | Phase 7 처리                                         |
| -------- | ---------------------------------------- | ---------------------------------------------------- |
| PERF-001 | `services/scraper/src/notifier/index.ts` | notify sync 블로킹 → worker 비동기 큐                |
| PERF-002 | 동일                                     | events.jsonl race → worker 직렬화                    |
| PERF-003 | 동일                                     | dedup/queue/backpressure 부재 → worker + ring buffer |

### 6. 복귀 시 유의 사항

- `_workspace/` 는 `.gitignore` 로 제외됨. Phase 4 감사 리포트 (`_workspace/audit/phase-4/20260424-0205/`) 는 이번 세션 생성 — 필요 시 별도 백업.
- `packages/` 빈 디렉토리 잔존 (`3543bc4` 재구성 후). Phase 5 착수 전 `git rm -r packages/` 1 커밋으로 정리 권장.
- 디렉토리 경로: 구(舊) `packages/scraper` → 현 `services/scraper`, 구 `packages/shared` → 현 `shared`. pnpm workspace 이름(`@pokopia-wiki/*`) 은 유지.
- Postgres docker 컨테이너는 `docker compose -f docker-compose.local.yml up -d` 로 재시작. 볼륨 데이터 영속.
- `services/scraper/src/persona/types.ts` 는 최소 5 필드(`id`/`locale`/`timezone`/`storageStatePath`/`usedFor`). `activeHours`, `fingerprintSeed` 등은 Phase 5 에서 optional 로 추가 (감사 OK).
- `services/scraper/src/paths.ts` 에 `REPO_ROOT` 런타임 assertion 추가됨 — 모듈 load 시 `pnpm-workspace.yaml` 미발견이면 throw. worktree/CI 에서 임의 cwd 로 실행하면 조기 실패하니 인지.

**사용자 TODO (Phase 5 진행과 무관, 선택):**

- `@BotFather` Telegram 토큰 발급 후 `.env` 에 `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` 주입 → `pnpm --filter @pokopia-wiki/scraper notifier:test` 재실행해 실제 메시지 도착 확인. Phase 5 워밍 1일 BG 실행 알림 채널로 유용 (필수 아님).

---

## 기존 레포 상태에서 발견된 (Phase 0~1 스코프 밖) 이슈

- `.claude/**`, `docs/**` 마크다운 파일에 oxfmt 기준 포맷 이슈가 다수 존재 (커밋 `eb59b45`, `2e90506` 당시부터). `.oxfmtrc.jsonc` ignorePatterns에 편입하여 CI는 통과. Prettier로 일괄 정리하려면 별도 작업.
- `pnpm-lock.yaml`은 Phase 0에서 재생성됨 (단일 앱 → 모노레포 전환 불가피). 이전 lockfile은 더 이상 유효하지 않음.
- 로드맵(`docs/plans/2026-04-18-implementation-roadmap.md`)의 Task 1.2·1.4 ENUM 기술에서 오탈자 의심 항목 2건 (위 Phase 1 §"SCHEMA.md SSoT 대비 도출된 불일치" 1·6번). SCHEMA.md(SSoT)를 기준으로 Phase 1 구현 결정, 로드맵 수정은 Phase 1 감사 때 `pokopia-doc-consistency`가 판정.
