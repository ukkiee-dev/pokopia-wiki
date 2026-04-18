# Pokopia Wiki 구현 로드맵

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan Phase-by-Phase, task-by-task. 각 Phase는 `pokopia-wiki-build` 스킬의 팀 구성 패턴을 따르며, Phase 완료 시점에 `pokopia-phase-review-harness` 감사를 통과해야 다음 Phase로 진행한다.
>
> **작성일:** 2026-04-18
> **작성자:** Claude Opus 4.7 (1M context)
> **근거 문서:** `SCHEMA.md`, `DATA_COLLECTION_PLAN.md`, `CRAWLING_STRATEGY.md` (v3.2), `TECH_STACK.md`, `CLAUDE_HARNESS_REVIEW.md`

**Goal:** Serebii + PokopiaGuide + pokopoko + namu.wiki 4개 소스에서 Pokemon Pokopia 데이터를 수집·정규화·다국어 매핑하여 PostgreSQL에 적재하고, GraphQL API로 제공하는 모노레포 시스템을 구축한다.

**Architecture:** `pokopia-wiki` pnpm 모노레포(scraper + api + shared) + 별도 `pokopia-web` 프론트엔드 레포. scraper는 로컬 Mac에서 4.6주간 운영하며 homelab PostgreSQL에 적재, api는 homelab K8s에 ArgoCD 배포. Prisma 스키마를 루트에서 단일 관리하고 `@pokopia-wiki/shared`에서 re-export하여 scraper/api가 공유한다.

**Tech Stack:**
- **Runtime**: Node 24+, pnpm 10+, TypeScript
- **Scraper**: ky (T0), playwright (T1), patchright (T2/T3), fingerprint-injector, ghost-cursor-playwright, tough-cookie, robots-parser, proper-lockfile, node-cron
- **API**: Hono + graphql-yoga + Pothos + pothos-plugin-prisma
- **DB**: PostgreSQL (homelab bitnami Helm, DB명 `pokopia`) + Prisma ORM
- **Validation**: Zod 4
- **Testing**: Vitest 4
- **Notification**: Telegram Bot + macOS osascript
- **Build**: tsdown
- **Deployment**: Docker + ArgoCD (api/web만), Cloudflare Tunnel
- **Backup**: rsync → 외장 SSD + pg_dump (홈랩 NAS)

---

## 결정 이력

- **2026-04-18 — scraper 프레임워크 경계 확정:** scraper 본체는 Hono를 **메인 프레임워크로 쓰지 않는다**. 이유: Hono는 inbound HTTP 서버 프레임워크이며 요청 스코프 DI·미들웨어 체인이 inbound 요청 라이프사이클 기반이라, outbound HTTP + 장기 배치(세션/cooldown/crawl state) 모델과 책임이 맞지 않음. 대신 공통 빌딩블록은 재사용한다:
  - **재사용 (shared 또는 api core 패턴 복제):** Awilix DI 컨테이너, Zod 검증, pino 로거, AppException 계층
  - **복제 금지:** `defineController`, `hono-pino` 미들웨어, CORS/error filter 등 HTTP 요청 컨텍스트 전용 헬퍼
  - **Hono 부분 활용 허용 (optional control plane):** scraper 장기 실행 중 원격 제어가 필요하면 `GET /status`, `POST /scrape/pause`, `POST /scrape/resume` 같은 엔드포인트를 **localhost 바인딩**으로 mini Hono 앱 1개 추가. Phase 7 CLI 대시보드(`pnpm run status`)의 HTTP 버전으로 옵션 확장.
  - **구조 영향:** packages/api는 Hono 중심(기존 template-web 그대로 이관), packages/scraper는 CLI 중심(`commander`/`minimist` 기반 entrypoint + Awilix 컨테이너), packages/shared는 Prisma client + Zod 스키마 + 메타데이터 + redact 유틸로 경량 유지.

---

## 0. 현재 상태 평가

### 완비된 것
- **문서 SSoT**: 4개 핵심 문서가 v3.2 수준으로 정합성 확보. ENUM, Phase 번호, 수량 추정, 티어, rate 등 모두 명시.
- **.claude 하네스**: 26개 에이전트 + 30개 스킬. `pokopia-wiki-build`, `pokopia-phase-review-harness` 오케스트레이터가 팀 재구성/루프백 감사 패턴으로 구축됨 (`CLAUDE_HARNESS_REVIEW.md`).
- **프로젝트 뼈대**: template-web 템플릿 기반. Hono + Awilix DI + oxlint/oxfmt/vitest/tsdown 세팅, Dockerfile + GitHub Actions CI까지 존재.

### 미완 (이번 로드맵 대상)
- **모노레포 구조 없음**: `packages/`, `pnpm-workspace.yaml`, `prisma/` 디렉토리 부재. 현재 `src/`가 단일 앱 구조.
- **Prisma 미도입**: SCHEMA.md의 70+ 엔티티가 `schema.prisma`로 전사되지 않음.
- **scraper 코드 0%**: fetcher/parser/mapper/loader/검증/알림 모두 미구현.
- **API는 템플릿만**: health/example 모듈만 존재. GraphQL 스택(yoga + Pothos) 미도입.
- **사전 검증 미수행**: robots.txt/access/patchright/network/notifier 5종 preflight 미실행.

### 전체 예상 기간
| 구간 | 최소 | 최대 |
|------|------|------|
| 기반 구축 (Phase 0~7) | 14일 | 21일 |
| Serebii 수집 (Phase 8~9) | 1일 | 3일 |
| 한국어 매핑 (Phase 10~13) | 5일 | 22일 |
| 이미지 & API (Phase 14~15) | 3일 | 7일 |
| 백업/운영 정착 (Phase 16) | 1일 | 2일 |
| **총계** | **~24일 (3.5주)** | **~55일 (8주)** |

CRAWLING_STRATEGY §17.2의 수집 기간(1.2~4.6주)과 **별도**로 기반 구축/API 구현 기간이 필요함에 유의.

---

## Phase 0 — 모노레포 스캐폴딩

**Goal:** 단일 앱 구조를 `pokopia-wiki` pnpm 모노레포(scraper + api + shared)로 전환하고 Prisma 스키마 단일 관리 체계를 확립한다.

**관련 SSoT:** TECH_STACK.md §1, §2.6, §5.2, §5.3 / CLAUDE_HARNESS_REVIEW.md는 이 Phase 대상 아님.

**예상 기간:** 1~2일

**전제:** Node 24+, pnpm 10+, Docker(선택), 시스템 Chrome 설치.

### 산출물
- `pnpm-workspace.yaml`
- `packages/{scraper,api,shared}` 디렉토리 + 각 `package.json`
- 루트 `prisma/schema.prisma` (빈 껍데기 + generator)
- `tsconfig.base.json` + 각 패키지 `tsconfig.json` extends
- 기존 `src/` → `packages/api/src/`로 이동
- 루트 `package.json` 재구성 (devDeps만, workspace root)
- 업데이트된 `.gitignore`, `Dockerfile`, `.github/workflows/ci.yml` (packages/api 경로 반영)

### Tasks

**Task 0.1 — workspace manifest 생성**

Files:
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`

Step 1: `pnpm-workspace.yaml` 작성.
```yaml
packages:
  - 'packages/*'
```

Step 2: `tsconfig.base.json` 작성 — 기존 `tsconfig.json`의 `compilerOptions`를 그대로 이식하되 `composite: false`, `declaration: true` 추가. `include` 제거.

**Task 0.2 — packages/shared 생성**

Files:
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/prisma-client/index.ts` (placeholder)

`package.json`:
```json
{
  "name": "@pokopia-wiki/shared",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@prisma/client": "workspace:^",
    "zod": "^4.3.6"
  }
}
```

`src/index.ts`:
```ts
export * from './prisma-client';
// Zod 공통 스키마는 Phase 2에서 추가
```

`src/prisma-client/index.ts` (Phase 1에서 실제 Prisma generator output으로 교체):
```ts
// Phase 1에서 Prisma generator가 이 경로에 클라이언트를 생성한다.
export {};
```

**Task 0.3 — packages/api 생성 (기존 src 이동)**

Files:
- Create: `packages/api/package.json`
- Create: `packages/api/tsconfig.json`
- Move: `src/*` → `packages/api/src/*`
- Move: `vitest.config.ts` → `packages/api/vitest.config.ts`
- Move: `tsdown.config.ts` → `packages/api/tsdown.config.ts`
- Move: `Dockerfile` → `packages/api/Dockerfile` (COPY 경로 갱신)
- Move: `.app-config.yml` → `packages/api/.app-config.yml`
- Update: 루트 `.gitignore` (dist, node_modules 경로)

`packages/api/package.json`:
```json
{
  "name": "@pokopia-wiki/api",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "imports": { "#*": "./src/*.ts" },
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=../../.env src/main.ts",
    "build": "tsdown",
    "start": "node --env-file-if-exists=../../.env dist/main.js",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "oxlint",
    "format": "oxfmt",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@hono/node-server": "^1.19.14",
    "@hono/zod-validator": "^0.7.6",
    "@pokopia-wiki/shared": "workspace:*",
    "awilix": "^13.0.3",
    "hono": "^4.12.14",
    "hono-pino": "^0.10.3",
    "pino": "^10.3.1",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^24.12.2",
    "tsdown": "^0.21.9",
    "tsx": "^4.21.0",
    "typescript": "^6.0.3",
    "vitest": "^4.1.4"
  }
}
```

**Task 0.4 — packages/scraper 생성 (빈 스캐폴딩)**

Files:
- Create: `packages/scraper/package.json`
- Create: `packages/scraper/tsconfig.json`
- Create: `packages/scraper/src/index.ts` (placeholder `console.log('scraper stub')`)

`packages/scraper/package.json`:
```json
{
  "name": "@pokopia-wiki/scraper",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "imports": { "#*": "./src/*.ts" },
  "scripts": {
    "scrape": "tsx --env-file-if-exists=../../.env src/index.ts",
    "check:robots": "tsx scripts/check-robots.ts",
    "check:access": "tsx scripts/check-access.ts",
    "check:patchright": "tsx scripts/check-patchright.ts",
    "check:network": "tsx scripts/check-network.ts",
    "notifier:test": "tsx scripts/notifier-test.ts",
    "status": "tsx scripts/status.ts",
    "validate": "tsx scripts/validate.ts",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "oxlint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@pokopia-wiki/shared": "workspace:*",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^24.12.2",
    "tsx": "^4.21.0",
    "typescript": "^6.0.3",
    "vitest": "^4.1.4"
  }
}
```

> 스크래퍼 전용 의존성(playwright/patchright/ky/ghost-cursor/fingerprint-injector/tough-cookie/robots-parser/proper-lockfile/node-cron)은 Phase 2~5에서 실제 사용 시점에 `pnpm --filter @pokopia-wiki/scraper add ...`로 점진 추가.

> **공통 core 반영 (결정 이력 2026-04-18):** scraper는 Hono 본체를 쓰지 않지만 **Awilix + pino + AppException**은 재사용한다. 구현 전략 2가지 중 1개 선택:
> - **A. api core 패턴 복제 (권장):** Phase 0 완료 후 `packages/scraper/src/core/`에 `app-exception.ts`, `create-container.ts`, `define-module.ts`(→ `define-task.ts`로 이름 변경 권장), `logger.ts`, `env.ts`를 api에서 복제. HTTP 전용 헬퍼(`define-controller.ts`, `di.middleware.ts`, `logger.middleware.ts`, `cors.middleware.ts`)는 복제하지 않음.
> - **B. shared 승격:** `packages/shared/src/core/`로 공통 부분만 승격하고 api/scraper가 각자 re-export. 지금은 A 권장(scraper/api의 DI 요구사항이 미묘하게 달라 premature abstraction 회피). 세 번째 소비자(예: 배포 스크립트 앱)가 생기면 그때 B로 전환.
>
> Phase 0에서는 scraper에 `awilix`, `pino`만 추가(+ 향후 control plane용 `hono`는 **실제 필요 시점**에만 추가, YAGNI).

**Task 0.5 — 루트 prisma 디렉토리 & generator 설정**

Files:
- Create: `prisma/schema.prisma` (빈 껍데기)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../packages/shared/src/prisma-client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Task 0.6 — 루트 package.json 재구성**

Files:
- Modify: `package.json` (루트)

루트는 workspace manifest + 공통 devDeps + 루트 스크립트만 가진다.
```json
{
  "name": "pokopia-wiki",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r --parallel build",
    "test": "pnpm -r --parallel test:run",
    "lint": "pnpm -r --parallel lint",
    "type-check": "pnpm -r --parallel type-check",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "prisma:studio": "prisma studio"
  },
  "devDependencies": {
    "oxfmt": "^0.45.0",
    "oxlint": "^1.60.0",
    "pino-pretty": "^13.1.3",
    "prisma": "^5.22.0"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0"
  },
  "engines": { "node": ">=24", "pnpm": ">=10" },
  "packageManager": "pnpm@10.30.3"
}
```

**Task 0.7 — 설치 검증 + 기존 테스트 그대로 통과 확인**

Commands:
```bash
pnpm install                              # workspace 설치
pnpm --filter @pokopia-wiki/api type-check
pnpm --filter @pokopia-wiki/api test:run
pnpm --filter @pokopia-wiki/api dev       # curl http://localhost:3000/health 확인
```

**Task 0.8 — CI/CD 파이프라인 조정**

Files:
- Modify: `.github/workflows/ci.yml` — `pnpm --filter @pokopia-wiki/api ...` 로 변경
- Modify: `packages/api/Dockerfile` — 모노레포 컨텍스트로 `COPY` 경로 조정, `pnpm deploy --filter=@pokopia-wiki/api --prod /prod-out` 사용 (TECH_STACK §5.3)
- Modify: `.github/workflows/ci.yml` — path filter `packages/api/**`, `packages/shared/**`, `prisma/**` (scraper 변경 시 CI 트리거 X)

**Task 0.9 — 첫 커밋**

Commit message: `chore: transform to pnpm monorepo (scraper + api + shared)`

**Phase 0 완료 조건**
- [ ] `pnpm install` 성공
- [ ] `pnpm --filter @pokopia-wiki/api dev`로 기존 `/health` 동작 확인
- [ ] `pnpm --filter @pokopia-wiki/api test:run` 통과
- [ ] `prisma generate`가 `packages/shared/src/prisma-client/`에 빈 클라이언트 생성 (schema가 비었으므로 모델 없음)
- [ ] GitHub Actions CI 통과

**Phase 0 감사 (`pokopia-phase-review-harness`):** 프로파일 `docs`/`setup` → `codereview-architect-reviewer` + `pokopia-doc-strategist`가 모노레포 전환이 TECH_STACK.md §1~§5와 일치하는지 확인.

---

## Phase 1 — Prisma 스키마 작성

**Goal:** `SCHEMA.md`의 70+ 엔티티(§2.1~§2.27)를 `prisma/schema.prisma`로 완전히 전사하고 초기 마이그레이션을 생성한다.

**관련 SSoT:** SCHEMA.md 전체, TECH_STACK.md §5.2.

**예상 기간:** 2~3일

**에이전트 팀:** 팀 A (설계) = `pokopia-schema-architect` + `pokopia-doc-strategist`.

### 산출물
- `prisma/schema.prisma` — 모든 엔티티·i18n·polymorphic reward·감사 컬럼
- `prisma/migrations/0001_init/migration.sql`
- `packages/shared/src/prisma-client/` — 생성된 Prisma Client
- `packages/shared/src/types.ts` — Prisma 생성 타입 re-export

### Tasks

**Task 1.1 — PostgreSQL 준비**

Commands (homelab):
```bash
kubectl exec -it postgresql-0 -n apps -- psql -U postgres -c "CREATE DATABASE pokopia;"
kubectl exec -it postgresql-0 -n apps -- psql -U postgres -c "CREATE USER pokopia WITH PASSWORD '<secret>';"
kubectl exec -it postgresql-0 -n apps -- psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE pokopia TO pokopia;"
```

Files:
- Modify: `.env.example` — `DATABASE_URL` 추가
- Create: `.env` (gitignored) — Tailscale 또는 포트포워딩 경유 실제 connection string

**Task 1.2 — 공통 패턴 먼저 정의 (SCHEMA §1.1~§1.4)**

schema.prisma 상단 블록:
- i18n locale 규칙 주석
- 감사 컬럼 공통 규칙 주석
- Polymorphic reward ENUM 통합 주석
- M:N explicit join 컨벤션 주석

Prisma 제약:
- `@@id([...])` — SCHEMA.md의 복합 PK를 Prisma explicit join 테이블로 구현
- 감사 컬럼은 각 모델에 직접 선언 (중복 허용). Prisma는 공통 mixin이 없으므로 코드 생성 또는 수동 반복.
- ENUM은 `enum`으로 선언, i18n source ENUM은 SCHEMA.md §1.2 기준 7개 값 (`pokopiaguide, pokopoko, namuwiki, pokemon_official, manual, pending`).

**Task 1.3 — Phase별 엔티티 전사 (10개 청크)**

SCHEMA.md §2를 10개 청크로 나눠 순차 작성. 각 청크 작성 후 `pnpm prisma format` + `pnpm prisma validate` 실행.

| 청크 | SCHEMA.md 섹션 | 포함 모델 수 |
|------|----------------|-------------|
| 1.3.1 | §2.1 포켓몬 코어 | pokemon, pokemon_i18n, legendary_acquisition(+i18n), specialty(+i18n), pokemon_specialty |
| 1.3.2 | §2.2 아이템 | item, item_i18n, item_tag, item_location |
| 1.3.3 | §2.3 제작/요리 | crafting_recipe, crafting_ingredient, cooking_recipe, cooking_ingredient |
| 1.3.4 | §2.4~§2.5 지역/서식지 | location(+i18n), habitat(+i18n), habitat_pokemon |
| 1.3.5 | §2.6~§2.9 건축/선호/우정/음식/디토 | building_kit(+i18n), building_kit_material, favorite_category(+i18n), pokemon_favorite, item_favorite_tag, friendship_tier(+i18n), food, ditto_ability(+i18n) |
| 1.3.6 | §2.10~§2.12 환경/도색/스토리 | environment_reward, shop_item, currency(+i18n), paint_color(+i18n), paint_pattern(+i18n), paint_recipe, quest(+i18n), quest_requirement, team_challenge, team_challenge_requirement |
| 1.3.7 | §2.13~§2.16 센터/전기/물/커스터마이징/CD | pokemon_center, pokemon_center_material, generator(+i18n), water_type(+i18n), customization_item(+i18n), cd(+i18n), source_game(+i18n), cd_location |
| 1.3.8 | §2.17~§2.20 인간기록/도감/식물/유물 | human_record(+i18n), pokedex_milestone, plant(+i18n), plant_variant, lost_relic |
| 1.3.9 | §2.21~§2.24 이벤트/미니게임/부스트/섬 | event(+i18n), event_pokemon, event_habitat, event_item, stamp_card, stamp_reward, jumprope_tier, hideandsneak_reward, mosslax_boost(+i18n), island_variant(+i18n), island_reward |
| 1.3.10 | §2.25~§2.27 이미지/충돌/교역 | entity_image, translation_conflict, trade_valuation, exchange_recipe, pokemon_litter_reward |

**Task 1.4 — ENUM 일괄 선언**

모든 ENUM을 schema.prisma 하단에 모아 선언. 각 ENUM 이름은 PascalCase.
- `ItemCategory`, `ItemTag`, `ItemLocationMethod`, `MealCategory`, `CookingRole`
- `LocationType`, `TimeCondition`, `WeatherCondition`, `BuildingKitCategory`
- `FlavorType`, `PpRestore`, `MoveBoost`, `DittoAbilityType`
- `EnvironmentRewardType`, `HumanRecordCategory`, `HumanRecordRewardType`
- `PlantType`, `LostRelicSize`, `CustomizationCategory`
- `StampJumpropeRewardType`, `HideAndSneakRewardType`, `IslandRewardType`
- `PokedexMilestoneRewardType`, `JumpropeRewardType`
- `EntityImageType` (14개 값, SCHEMA §2.25)
- `I18nSource` (7개 값)

**Task 1.5 — 마이그레이션 실행 & Client 생성**

```bash
pnpm prisma migrate dev --name init
pnpm prisma generate
```

Verify:
```bash
psql $DATABASE_URL -c "\dt"   # 테이블 개수 확인 (~70개 이상 + prisma_migrations)
```

**Task 1.6 — shared 패키지에서 Prisma Client 노출**

Files:
- Modify: `packages/shared/src/index.ts`

```ts
export { PrismaClient, Prisma } from './prisma-client';
export type * from './prisma-client';
```

**Task 1.7 — Zod 파생 타입 생성 스텁 (optional, Phase 2에서 본격)**

향후 `prisma-zod-generator` 같은 도구를 도입할지 결정. 일단은 수동 Zod 스키마(§2)로 진행.

**Task 1.8 — 커밋**

Commit: `feat(schema): add Prisma schema with 70+ entities from SCHEMA.md §2.1-§2.27`

**Phase 1 완료 조건**
- [ ] `prisma migrate dev`가 빈 DB에 성공
- [ ] `psql`로 테이블 수 확인: SCHEMA.md §3 ERD와 일치
- [ ] `packages/shared/src/prisma-client/index.d.ts`에 `PrismaClient` export 있음
- [ ] SCHEMA.md의 모든 polymorphic reward 테이블(`environment_reward`, `pokedex_milestone`, `human_record`, `island_reward`, `jumprope_tier`, `hideandsneak_reward`)이 `reward_type` + `reward_ref_id` 컬럼을 가짐
- [ ] 신규 테이블(`trade_valuation`, `exchange_recipe`, `pokemon_litter_reward`) 존재 — DATA_COLLECTION_PLAN §6 Phase 5 단계 33~35 실행 가능 조건

**Phase 1 감사 (`pokopia-phase-review-harness`):** 프로파일 `schema` → `pokopia-schema-architect` + `codereview-architect-reviewer` + `codereview-style-reviewer` + `pokopia-doc-strategist`. SCHEMA.md와 schema.prisma 1:1 매핑 검증.

---

## Phase 2 — 공통 검증·메타데이터 인프라

**Goal:** Zod 스키마(`SourceMetadataSchema` + 엔티티별), `SOURCE_DEFAULTS`, `buildSourceMetadata()`, 로깅 `redact()` 등 **스크래퍼/API 양쪽이 공유하는 검증 인프라**를 `packages/shared`에 정착시킨다.

**관련 SSoT:** CRAWLING_STRATEGY §27 (Zod), §22.3 (redact), §26.1 (robots 기본값).

**예상 기간:** 1~2일

### 산출물
- `packages/shared/src/validators/schemas.ts` — Zod 엔티티 스키마 전부
- `packages/shared/src/validators/metadata.ts` — `buildSourceMetadata()`
- `packages/shared/src/config/source-metadata.ts` — `SOURCE_DEFAULTS`
- `packages/shared/src/logging/redact.ts` — 토큰/쿠키 마스킹
- `packages/shared/src/logging/redact.test.ts`

### Tasks

**Task 2.1 — SourceMetadataSchema (공통)**

Files:
- Create: `packages/shared/src/validators/schemas.ts`

CRAWLING_STRATEGY §27.1 그대로 구현:
- `SourceSiteEnum = z.enum(['serebii', 'pokopiaGuide', 'pokopoko', 'namuwiki'])`
- `SourceMetadataSchema` — 7개 필수 필드 + optional `derivedFrom`

**Task 2.2 — 엔티티별 Zod 스키마**

SCHEMA.md §2의 각 엔티티에 대해 1:1 Zod 스키마 작성. 기본 패턴:
- 정적 속성 z.object({...}).merge(SourceMetadataSchema)
- 모든 스키마는 파일 하나에 Collocated, `export` 필수

작성 순서(Phase 1 청크와 동일 10개 청크 패턴):
- `PokemonSchema`, `PokemonI18nSchema`, `LegendaryAcquisitionSchema`
- `ItemSchema`, `ItemLocationSchema`, `ItemTagSchema`
- `CookingRecipeSchema`, `CraftingRecipeSchema`
- `HabitatSchema`, `HabitatPokemonSchema`
- ...전 엔티티

> 한국어 매핑 스키마는 `derivedFrom`을 의무화 (`KoreanPokemonMappingSchema` 등).

**Task 2.3 — SOURCE_DEFAULTS & buildSourceMetadata**

Files:
- Create: `packages/shared/src/config/source-metadata.ts` (CRAWLING_STRATEGY §27.4 그대로)
- Create: `packages/shared/src/validators/metadata.ts` (§27.4 헬퍼)

**Task 2.4 — redact 유틸 + 단위 테스트**

Files:
- Create: `packages/shared/src/logging/redact.ts` (CRAWLING_STRATEGY §22.3)
- Create: `packages/shared/src/logging/redact.test.ts` — Telegram 토큰/Bearer/Set-Cookie 3종 마스킹 검증 (`testing-augmenter` 패턴: 엣지 케이스만)

TDD 순서:
1. 실패 테스트 작성 (`1234567:ABC...` → `<TELEGRAM_TOKEN>`)
2. `redact()` 최소 구현
3. 테스트 통과
4. Bearer/set-cookie 케이스 추가

**Task 2.5 — shared index 갱신**

Files:
- Modify: `packages/shared/src/index.ts`

```ts
export * from './prisma-client';
export * from './validators/schemas';
export * from './validators/metadata';
export * from './config/source-metadata';
export * from './logging/redact';
```

**Task 2.6 — 타입 체크 & 커밋**

```bash
pnpm --filter @pokopia-wiki/shared type-check
pnpm --filter @pokopia-wiki/shared test:run
```

Commit: `feat(shared): add Zod schemas, source metadata, redact util`

**Phase 2 완료 조건**
- [ ] `SourceMetadataSchema.safeParse({ ... })`가 올바른 입력에 대해 성공
- [ ] `buildSourceMetadata({ sourceSite: 'serebii', sourceUrl: '...' })`가 `license/copyrightHolder/attribution` 자동 주입
- [ ] `redact()`가 Telegram 토큰·Bearer·cf_clearance 쿠키 모두 마스킹
- [ ] 최소 한 엔티티(Pokemon, Item)에 대해 Zod + Prisma 이중 타입 체크 패스

**Phase 2 감사:** 프로파일 `schema` → `codereview-style-reviewer` + `codereview-security-auditor` (redact 우회 가능성).

---

## Phase 3 — 사전 검증 하네스 (CRAWLING_STRATEGY Phase -1)

**Goal:** robots/access/patchright/network/notifier 5종 preflight 스크립트를 구축하고, 모든 항목이 초록 불이어야 이후 Phase로 진행할 수 있는 게이트를 만든다.

**관련 SSoT:** CRAWLING_STRATEGY §1.4, §4.3, §9.1.2 (WebGL probe), §9.3, §13.3, §21, §25, §26.

**예상 기간:** 1.5~2일

### 산출물
- `packages/scraper/scripts/check-robots.ts`
- `packages/scraper/scripts/check-access.ts`
- `packages/scraper/scripts/check-patchright.ts` — `data/preflight/patchright-webgl.json` 생성
- `packages/scraper/scripts/check-network.ts`
- `packages/scraper/scripts/notifier-test.ts`
- `packages/scraper/src/notifier/` — Notifier 클래스 뼈대 (Phase 7에서 완성)
- `data/preflight/` 디렉토리 + `.gitkeep`
- `data/robots/` 디렉토리 + `.gitkeep`
- 업데이트된 `.env.example` — Telegram 토큰 등

### Tasks

**Task 3.1 — 의존성 추가**

```bash
pnpm --filter @pokopia-wiki/scraper add ky robots-parser dotenv
pnpm --filter @pokopia-wiki/scraper add playwright patchright fingerprint-injector fingerprint-generator ghost-cursor-playwright tough-cookie tough-cookie-file-store proper-lockfile node-cron
pnpm --filter @pokopia-wiki/scraper add -D @types/proper-lockfile @types/node-cron
npx playwright install chromium   # 브라우저 바이너리 설치
```

**Task 3.2 — .env 확장**

Files:
- Modify: `.env.example`

```bash
# Scraper runtime
DATABASE_URL=postgresql://pokopia:...@...
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_CHAT_ID_CRITICAL=
NOTIFICATIONS_ENABLED=true
SCRAPER_USER_AGENT=PokopiaScraperBot/1.0 (+ukyi.js@gmail.com)
IMAGE_ROOT=./data/images
EXTERNAL_SSD_MOUNT=/Volumes/External
```

**Task 3.3 — check:robots 스크립트**

Files:
- Create: `packages/scraper/src/robots/checker.ts` (CRAWLING_STRATEGY §26.2 그대로)
- Create: `packages/scraper/scripts/check-robots.ts`

스크립트는:
1. 4개 소스 robots.txt 다운로드 → `data/robots/<source>.txt`
2. 수집 대상 샘플 URL(소스별 3~5개)에 대해 `isAllowed` 확인
3. 위반 목록을 `data/robots/exclusions.json`에 저장
4. 요약을 console + `data/preflight/<date>/robots.json`에 기록

**Task 3.4 — check:access 스크립트**

각 소스의 대표 페이지 1개에 실제 접근 테스트:
- T0 (Serebii): `ky.get('/pokemonpokopia/availablepokemon.shtml')` → 200 확인
- T1 (PokopiaGuide): Playwright 순정으로 `/ko` 로딩 + 콘텐츠 존재 확인
- T2 (pokopoko): patchright로 메인 페이지 접근, 403 재현 여부 기록
- T3 (namu.wiki): patchright + CF challenge 대기, 성공/실패 기록

결과: `data/preflight/<date>/access-<source>.json` + Playwright 세션 시 스크린샷 저장.

**Task 3.5 — check:patchright 스크립트 (★ v3.2 필수)**

CRAWLING_STRATEGY §9.1.2 WebGL probe 로직:
1. patchright chromium으로 bot.sannysoft.com 접근 → 전체 초록 검증
2. `getParameter(37445/37446)` 실측 → `data/preflight/patchright-webgl.json` 생성 (`overridesWebgl: boolean`)
3. nowsecure.nl 통과 여부 기록 (T3 활성 결정)
4. patchright npm 최종 릴리스 날짜 확인 (6개월 이내)

실패 시 exit 1 + Notifier (아직 Notifier 없으므로 console.error).

**Task 3.6 — check:network 스크립트**

CRAWLING_STRATEGY §9.3:
```ts
const ipInfo = await ky('https://ipapi.co/json/').json()
// assert country_code === 'KR', timezone === 'Asia/Seoul'
```

결과를 `data/preflight/<date>/network.json`에 저장.

**Task 3.7 — Notifier 뼈대 + notifier:test**

Files:
- Create: `packages/scraper/src/notifier/events.ts` (CRAWLING_STRATEGY §13.3.2 EventType + SEVERITY_MAP 전체)
- Create: `packages/scraper/src/notifier/config.ts` (§13.3.4)
- Create: `packages/scraper/src/notifier/index.ts` (§13.3.5 스켈레톤 — Phase 7에서 완성)
- Create: `packages/scraper/scripts/notifier-test.ts`

notifier-test는 `info`, `warn`, `high`, `critical` 각 1건씩 송신하여 Telegram + macOS 도착 확인.

**Task 3.8 — data 디렉토리 표준화 & gitignore**

Files:
- Modify: `.gitignore`

```
data/cache/
data/parsed/
data/logs/
data/state/
data/preflight/
data/robots/
data/browser-profiles/
data/images/
data/cookies/
data/manual/     # 나무위키 수동 복사본은 별도 정책 (§4.5)
data/invalid/
data/snapshots/
```

다만 아래는 추적:
```
!data/.gitkeep
!data/manual/.gitkeep
```

**Task 3.9 — Phase 3 통합 실행 & 기록**

```bash
pnpm --filter @pokopia-wiki/scraper check:robots
pnpm --filter @pokopia-wiki/scraper check:network
pnpm --filter @pokopia-wiki/scraper check:patchright
pnpm --filter @pokopia-wiki/scraper check:access
pnpm --filter @pokopia-wiki/scraper notifier:test
```

모든 항목 PASS 시 `data/preflight/<date>/SUMMARY.md`에 수동 기록:
- robots: pass
- network: KR/Asia/Seoul
- patchright: webgl override false/true, nowsecure pass
- access: serebii(200) pokopiaGuide(200) pokopoko(403 예상) namuwiki(?)
- notifier: Telegram + macOS 도착 확인

**Task 3.10 — 커밋**

Commit: `feat(scraper): add Phase -1 preflight checks (robots, access, patchright, network, notifier)`

**Phase 3 완료 조건**
- [ ] 5개 check 스크립트 전부 실행 가능
- [ ] `data/preflight/<date>/` 에 모든 스크립트 결과가 쌓임
- [ ] `data/preflight/patchright-webgl.json` 생성됨 — Phase 5에서 활용
- [ ] Telegram/macOS 알림이 실제 도착
- [ ] `nowsecure.nl` 통과 못 할 경우 T3 포기 결정을 문서화 (이 경우 Phase 12의 namu.wiki 스킵 확정)

**Phase 3 감사:** 프로파일 `ops`/`setup` → `pokopia-ops-conductor` + `codereview-security-auditor` (토큰 마스킹).

---

## Phase 4 — Fetcher 인프라 & 캐시 & Rate Limiter

**Goal:** 티어별 fetcher를 `FetcherFactory`로 추상화하고, HTML 캐시(TTL 3일) + 쿠키 영속 + RateLimiter를 연결해 **멱등적 네트워크 레이어**를 완성한다.

**관련 SSoT:** CRAWLING_STRATEGY §4.2, §9.2 (헤더), §14 (rate), §16 (캐시), §23.

**예상 기간:** 3~4일

### 산출물
- `packages/scraper/src/fetchers/ky-fetcher.ts` (T0)
- `packages/scraper/src/fetchers/playwright-fetcher.ts` (T1)
- `packages/scraper/src/fetchers/patchright-fetcher.ts` (T2)
- `packages/scraper/src/fetchers/patchright-cf-fetcher.ts` (T3)
- `packages/scraper/src/fetchers/factory.ts`
- `packages/scraper/src/cache/html-cache.ts`
- `packages/scraper/src/cache/cookie-store.ts`
- `packages/scraper/src/rate/limiter.ts` (§14.3 RateLimitConfig SSoT)
- `packages/scraper/src/robots/checker.ts` (Phase 3에서 이미 생성, fetcher와 연결)
- `packages/scraper/src/browser/chrome-version.ts` — `detectChromeVersion`, `onSessionStart`

### Tasks

**Task 4.1 — TDD로 HtmlCache 먼저**

Files:
- Create: `packages/scraper/src/cache/html-cache.ts`
- Create: `packages/scraper/src/cache/html-cache.test.ts`

RED → GREEN:
1. `cache.getOrFetch(url, fetchFn, ttlDays=3)` 인터페이스 작성
2. 실패 테스트: "cache miss → fetchFn 호출 → 결과 저장 → 메타데이터 기록"
3. 구현: `data/cache/<source>/<normalized-path>.html` + `.meta.json`
4. `content_hash` sha256 산출
5. 엣지 케이스 테스트: TTL 만료, `--force-fetch` 무시, stale 파일 복구

**Task 4.2 — KyFetcher (T0)**

Files:
- Create: `packages/scraper/src/fetchers/ky-fetcher.ts`

책임:
- 시스템 Chrome 버전 기반 UA 헤더 (§9.2)
- `Accept-Language: en-US,en;q=0.9`
- robots.txt 체크 우선 — 위반 시 `SkippedByRobotsError`
- 429/503 지수 백오프 (1s→2s→4s, 최대 3회)
- 응답 → HtmlCache 저장

**Task 4.3 — PlaywrightFetcher (T1)**

Files:
- Create: `packages/scraper/src/fetchers/playwright-fetcher.ts`

책임:
- `chromium.launchPersistentContext` — `channel: 'chrome'` 강제
- `locale`, `timezoneId`는 페르소나 값
- `extraHTTPHeaders` / `userAgent` **수동 override 금지** (§9.2)
- `fingerprint-injector` attach (Phase 5의 `attachFingerprint` 호출)
- `addInitScript`로 `navigator.userAgentData` 갱신 (§9.2)
- 응답 → HtmlCache 저장

> Persona/Session 주입은 Phase 5~6에서 연결. Phase 4에서는 factory 인터페이스만 마련.

**Task 4.4 — PatchrightFetcher (T2)**

T1과 동일 패턴이되:
- `import { chromium } from 'patchright'`
- `fingerprint-injector` **미적용** (§9.1.2 이중 패치 방지)
- `maybeReinforceWebgl` 호출 — `data/preflight/patchright-webgl.json` 결과 기반 조건부 보강

**Task 4.5 — PatchrightCfFetcher (T3)**

Patchright + Cloudflare challenge 대기:
- `waitForFunction` 60초, `#challenge-running` 사라지면 진행
- 실패 시 `SessionAbortError` 던짐 → 상위에서 24시간 cooldown

**Task 4.6 — FetcherFactory**

Files:
- Create: `packages/scraper/src/fetchers/factory.ts`

```ts
export type Tier = 0 | 1 | 2 | 3;
export function createFetcher(source: SourceSite, persona?: BrowserPersona): Fetcher {
  const tier = resolveTier(source);
  switch (tier) {
    case 0: return new KyFetcher(source);
    case 1: return new PlaywrightFetcher(source, persona!);
    case 2: return new PatchrightFetcher(source, persona!);
    case 3: return new PatchrightCfFetcher(source, persona!);
  }
}
```

**Task 4.7 — RateLimiter (§14.3 SSoT)**

Files:
- Create: `packages/scraper/src/rate/config.ts` (§14.3 `RateLimitConfig` 그대로)
- Create: `packages/scraper/src/rate/limiter.ts`

책임:
- navigation / resource / direct fetch 3종 분리 카운트
- `data/state/rate/<source>.json` 영속
- T1+ 활성 시 T0 50% 감속 (§6.4.1)
- 일별 초기화 (UTC+9 자정)
- 80% 도달 시 `rate_limit.approaching` 이벤트

**Task 4.8 — CookieStore**

Files:
- Create: `packages/scraper/src/cache/cookie-store.ts`

`tough-cookie` + `tough-cookie-file-store` — `data/cookies/<source>.json` 경로. T2/T3 장기 세션의 `cf_clearance` 보존용.

**Task 4.9 — Chrome 버전 훅**

Files:
- Create: `packages/scraper/src/browser/chrome-version.ts` (CRAWLING_STRATEGY §9.2 `detectChromeVersion`/`onSessionStart` 전체)

**Task 4.10 — 통합 테스트 (가짜 HTTP 서버 기반)**

Files:
- Create: `packages/scraper/src/fetchers/factory.test.ts`

`testing-tdd-guide` 패턴으로:
- RED: factory가 T0 Serebii 경우 KyFetcher 반환
- GREEN: switch 구현
- refactor 금지 구간

실제 Serebii 요청은 Phase 9 드라이런에서 수행.

**Task 4.11 — 커밋**

Commit: `feat(scraper): add tier-based fetcher factory with cache, rate limiter, chrome version hook`

**Phase 4 완료 조건**
- [ ] `createFetcher('serebii')`가 KyFetcher를 반환하고, 실제 Serebii 페이지 1개를 가져와 `data/cache/serebii/`에 저장
- [ ] 캐시 TTL이 만료되면 재요청, 유효하면 재사용
- [ ] RateLimiter가 `data/state/rate/serebii.json`에 카운트 영속
- [ ] Chrome 버전 bump가 `events.jsonl`에 기록되는지 수동 확인 (Chrome 업데이트 모의)

**Phase 4 감사:** 프로파일 `crawler` → `pokopia-tier-crawler` + `codereview-performance-auditor` (N+1, 메모리 누수) + `codereview-security-auditor` (path traversal §10.3).

---

## Phase 5 — 페르소나 & 워밍 & 핑거프린트 & 동시성

**Goal:** 2개 페르소나(`korean-pokemon-fan`, `namuwiki-researcher`)를 정의·격리·워밍하고, `ConcurrencyGuard`로 시간 분리를 강제한다. CRAWLING_STRATEGY Phase -2에 해당.

**관련 SSoT:** CRAWLING_STRATEGY §5, §6.4.3, §9.1.1, §9.1.2.

**예상 기간:** 2~3일 (실제 워밍 1일 백그라운드 포함)

### 산출물
- `packages/scraper/src/persona/definitions.ts` — 2개 페르소나 상수
- `packages/scraper/src/persona/manager.ts` — PersonaManager (활성 시간 기반 선택)
- `packages/scraper/src/persona/warmer.ts` — ProfileWarmer (파일 편집 금지, API만)
- `packages/scraper/src/fingerprint/inject.ts` — T1 `attachFingerprint`
- `packages/scraper/src/fingerprint/patchright-webgl.ts` — T2/T3 조건부 보강
- `packages/scraper/src/scheduler/concurrency-guard.ts` — §6.4.3 A4 전체
- `packages/scraper/src/scheduler/session-manager.ts` (Phase 6에서 확장)
- `data/browser-profiles/korean-pokemon-fan/` (워밍 후 생성)
- `data/browser-profiles/namuwiki-researcher/`

### Tasks

**Task 5.1 — 페르소나 정의**

Files:
- Create: `packages/scraper/src/persona/definitions.ts`

CRAWLING_STRATEGY §5.1의 `PERSONAS` 배열 그대로. `ProfileFingerprint`는 §5.3의 A3 정리대로 하드웨어 결정형 필드만.

**Task 5.2 — PersonaManager**

Files:
- Create: `packages/scraper/src/persona/manager.ts`

책임:
- 현재 시각 → `activeHours` 체크 → 활성 페르소나 반환
- `usedFor` 매핑에 따라 source → persona 연결
- 유저 Chrome 프로필 경로 포함 여부 검증 (`~/Library/...` 금지)

**Task 5.3 — FingerprintInjector (T1)**

Files:
- Create: `packages/scraper/src/fingerprint/inject.ts`

CRAWLING_STRATEGY §9.1.1 A3 정리 반영:
- `getOrCreateFingerprint` — `<profilePath>/fingerprint.json` 영속
- `minVersion` 동적 계산 (§9.1.1 B4)
- `attachFingerprint` — 페르소나 식별 필드만 덮어쓰기

**Task 5.4 — WebGL 조건부 보강 (T2/T3)**

Files:
- Create: `packages/scraper/src/fingerprint/patchright-webgl.ts` (§9.1.2)

`data/preflight/patchright-webgl.json` 결과 기반으로만 주입. 이중 패치 방지.

**Task 5.5 — ProfileWarmer**

Files:
- Create: `packages/scraper/src/persona/warmer.ts`

CRAWLING_STRATEGY §5.4:
- Playwright 헤드풀로 Naver + YouTube + 뉴스 + 타겟 홈 방문
- `humanDwell`, `humanScroll` 적용
- **파일 직접 편집 금지** 원칙 강제
- 워밍 완료 시 `persona.warmedUp = true` + `data/state/persona-<id>.json` 기록

**Task 5.6 — ConcurrencyGuard (§6.4.3 A4 전체)**

Files:
- Create: `packages/scraper/src/scheduler/concurrency-guard.ts`
- Create: `packages/scraper/src/scheduler/concurrency-guard.test.ts`

TDD:
1. RED: `acquire({ source: 'serebii', tier: 0 })` 두 번 연속 호출 → 두 번째는 `same_source_active`
2. GREEN: 구현
3. 엣지 케이스: crash 시나리오 — `pid` kill 후 `reconcileOnBoot` → 해당 세션만 reap
4. Rule 4 (T0↔T1+ stagger) 테스트

**Task 5.7 — 워밍 실행 (실제 1일)**

```bash
pnpm --filter @pokopia-wiki/scraper tsx scripts/warm-persona.ts korean-pokemon-fan
# (백그라운드) 1일 후
pnpm --filter @pokopia-wiki/scraper tsx scripts/warm-persona.ts namuwiki-researcher
```

각 세션 30~60분, 일 2~3회. 프로필 디렉토리의 쿠키/히스토리 축적 확인.

**Task 5.8 — 커밋**

Commit: `feat(scraper): add personas, profile warmer, concurrency guard, fingerprint injection`

**Phase 5 완료 조건**
- [ ] 2개 페르소나 프로필 디렉토리 존재 + 쿠키 축적 확인
- [ ] `ConcurrencyGuard.acquire` 테스트 전부 통과 (레이스 포함)
- [ ] T1 페르소나로 PokopiaGuide 홈 접근 시 `fingerprint-injector` 주입 확인
- [ ] T2 페르소나(pokopoko)로 접근 시 이중 패치 없음 (Phase 3 probe 기반)

**Phase 5 감사:** 프로파일 `crawler` → `pokopia-tier-crawler` + `codereview-architect-reviewer` + `codereview-performance-auditor`.

---

## Phase 6 — 세션 매니저 & 행동 시뮬레이터 & 에러 반응

**Goal:** `SessionManager` + `CircadianScheduler` + `HumanBehaviorSimulator` + `ErrorReactionSimulator` + `DetectionMonitor`를 연결해 **사람다운 세션 실행 루프**를 구축한다.

**관련 SSoT:** CRAWLING_STRATEGY §6, §7, §8, §11, §12, §20.

**예상 기간:** 2~3일

### 산출물
- `packages/scraper/src/scheduler/session-manager.ts`
- `packages/scraper/src/scheduler/circadian.ts`
- `packages/scraper/src/behavior/navigation.ts` (링크 클릭 기반)
- `packages/scraper/src/behavior/ghost-cursor.ts` (`humanClick`, `humanScroll`, `humanDwell`)
- `packages/scraper/src/behavior/visibility.ts` (§7.3)
- `packages/scraper/src/detection/monitor.ts` (§12.1)
- `packages/scraper/src/detection/soft-throttle.ts` (§12.2)
- `packages/scraper/src/detection/health-scorer.ts` (§12.3)
- `packages/scraper/src/error/reaction.ts` (§11.1)
- `packages/scraper/src/state/crawl-state.ts` (§20.1)

### Tasks

**Task 6.1 — CircadianScheduler**

§6.1 `CIRCADIAN` 상수 구현 + "다음 세션 시작 시각" 계산 함수. 페르소나 `activeHours` 준수.

**Task 6.2 — SessionManager 라이프사이클**

```
start → ConcurrencyGuard.acquire → onSessionStart (§9.2)
      → load cookie + persistent context
      → navigation loop (다음 task)
      → end → ConcurrencyGuard.release + memory usage 기록
```

**Task 6.3 — Ghost cursor & 스크롤 & dwell**

CRAWLING_STRATEGY §7.2, §8.1~§8.3 구현. `gaussianRandom`, `humanClick`, `humanScroll` 3종 + visibility 위조 (§7.3 B2 주석 반영).

**Task 6.4 — Navigation Planner (링크 클릭 기반)**

직접 URL 이동 금지 (§7.1). 홈 → 메뉴 → 목록 → 상세 경로로 네비. 서식지 209 청크 분산 (§7.4).

**Task 6.5 — DetectionMonitor + SoftThrottle + HealthScorer**

§12.1 A2 정리 반영한 `DetectionSignal` 필드. 403/429/CF/CAPTCHA/소프트 throttle 탐지 + severity 산정 + 페르소나 healthScore 감점.

**Task 6.6 — ErrorReactionSimulator**

§11.1 A1 정리 반영한 EventType 정확 매칭:
- `block.403`, `block.429`, `cloudflare.challenge_timeout`, `captcha.detected`, `captcha.unresolved`, `soft_throttle.detected`

cooldown 지수 증가 + 세션 즉시 종료 정책.

**Task 6.7 — CrawlState 매니저 (§20.1)**

`data/state/crawl.json` 영속. `--resume`, cooldown 준수, 완료 페이지 멱등 스킵.

**Task 6.8 — 통합 테스트**

`packages/scraper/src/scheduler/session-manager.test.ts`:
- ConcurrencyGuard 모킹 → acquire 성공 가정
- Fetcher 모킹 → 403 반환 시 ErrorReaction 경로 실행 확인
- cooldown 기록 확인

**Task 6.9 — 커밋**

Commit: `feat(scraper): add session manager, circadian scheduler, human behavior, error reaction`

**Phase 6 완료 조건**
- [ ] 드라이런 1회(`tsx scripts/dry-session.ts --source serebii --page availablepokemon`)가 **세션 시작 → 페이지 네비 → 세션 종료** 경로를 완주
- [ ] 403 모킹 시 cooldown이 `data/state/crawl.json`에 기록
- [ ] healthScore가 탐지 신호에 따라 감점

**Phase 6 감사:** 프로파일 `crawler` → `pokopia-tier-crawler` + `codereview-architect-reviewer` + `codereview-performance-auditor`.

---

## Phase 7 — Notifier 완성 & CLI 대시보드

**Goal:** Phase 3에서 뼈대만 만든 Notifier를 완전한 구현으로 확장하고 (dedup 영속화, 백그라운드 워커, 배칭, daily summary), `pnpm run status` CLI 대시보드를 제공한다.

**관련 SSoT:** CRAWLING_STRATEGY §13.3, §22.2.

**예상 기간:** 1~1.5일

### 산출물
- `packages/scraper/src/notifier/index.ts` — B6/B7/B8 반영 전체
- `packages/scraper/src/notifier/telegram.ts` — `getMe` 검증 포함
- `packages/scraper/src/notifier/macos.ts` — AppleScript 인젝션 방어
- `packages/scraper/src/status/dashboard.ts` — 터미널 대시보드
- `packages/scraper/src/daily-summary.ts` — node-cron 23:55 트리거
- `packages/scraper/src/notifier/index.test.ts`

### Tasks

**Task 7.1 — Notifier 완성**

§13.3.5 구현체 전체. `immediateQueue` 백그라운드 워커, dedup `data/state/notifier-dedup.json` 영속화.

**Task 7.2 — Telegram getMe 검증 (§13.3.6 B8)**

부팅 시 `getMe` → `ok: true` 및 `result.id` 수신 확인. 실패 시 `description`/`error_code`로 명시적 에러 메시지.

**Task 7.3 — macOS 알림 인젝션 방어**

사용자 입력을 AppleScript에 직접 삽입 금지. `osascript -e` 대신 외부 `terminal-notifier`로 분리하거나, 인자 이스케이프 엄격 적용.

**Task 7.4 — daily_summary cron**

`node-cron` `55 23 * * *` → `milestone.daily_summary` 발행. 프로세스 다운 시 다음 실행 시 복구 요약 발송.

**Task 7.5 — CLI 대시보드 (`pnpm run status`)**

Files:
- Create: `packages/scraper/scripts/status.ts`

터미널 출력:
```
=== Pokopia Scraper Status ===
Phase: 6a (PokopiaGuide)
Active persona: korean-pokemon-fan (healthScore: 88)
Today requests: navigation=45/80, resource=330/600
Cooldowns: pokopoko until 2026-04-20T12:00
Last session: 2026-04-18T13:45 ~ 14:20 (35min, 23 pages)
Invalid parses (24h): 3
```

`data/state/` + `data/logs/` 를 읽어 구성.

**Task 7.6 — 커밋**

Commit: `feat(scraper): complete Notifier with dedup persistence, background worker, daily summary, status dashboard`

**Phase 7 완료 조건**
- [ ] 같은 이벤트 5분 내 재발생 시 1회만 송신
- [ ] Notifier 부팅 후 즉시 Telegram으로 `scraper.start` 알림 도착
- [ ] `pnpm run status`가 현재 상태를 한 화면에 출력

**Phase 7 감사:** 프로파일 `ops` → `pokopia-ops-conductor` + `codereview-security-auditor` (AppleScript injection).

---

## Phase 8 — Serebii T0 파서 (DATA_COLLECTION_PLAN Phase 1~5)

**Goal:** Serebii 46개 페이지 중 T0 대상 페이지의 파서·매퍼·로더를 구현한다. DATA_COLLECTION_PLAN §6 Phase 1~5의 수집 단계 1~35를 커버.

**관련 SSoT:** DATA_COLLECTION_PLAN §2, §6, §8, CRAWLING_STRATEGY §15.1, SCHEMA.md §2 전체.

**예상 기간:** 3~5일

**에이전트 팀:** 팀 B (구현) = `pokopia-code-builder` + `pokopia-schema-architect` + `pokopia-qa-analyst`.

### 산출물
- `packages/scraper/src/parsers/serebii/` — 35+ 파서 모듈
- `packages/scraper/src/loaders/` — Prisma upsert 로더 (엔티티별)
- `packages/scraper/src/validators/run-validation.ts` — 파싱 직후 Zod safeParse
- `packages/scraper/src/parsers/serebii/__fixtures__/` — 각 페이지 대표 HTML 고정화

### Tasks (TDD 사이클, 35개 페이지 단위)

**Task 8.1 — 파서 베이스 클래스**

Files:
- Create: `packages/scraper/src/parsers/base.ts`

```ts
export abstract class Parser<T> {
  abstract SELECTOR_VERSION: string;
  abstract parse(html: string, sourceUrl: string): T[];
}
```

파서는 `node-html-parser` 사용. HTML이 Phase 4 HtmlCache에서 이미 저장된 상태.

**Task 8.2 — `testing-fixture-keeper` 패턴으로 HTML 고정화**

각 Serebii 페이지에 대해 `check:access` 때 저장된 HTML을 `__fixtures__/<page>.html`로 마스킹 복사. 라이선스 메타 YAML 동반 (§5.3).

**Task 8.3 — 페이지별 파서 TDD 작성 순서**

DATA_COLLECTION_PLAN §6 Phase 1~5 단계 1~35를 순서대로:

| 단계 | 페이지 | 파서 파일 | 대상 엔티티 |
|------|--------|----------|------------|
| 1 | `/availablepokemon.shtml` | `available-pokemon.ts` | pokemon, pokemon_i18n(EN), pokemon_specialty |
| 2 | `/specialty.shtml` | `specialty.ts` | specialty, specialty_i18n(EN) |
| 3 | `/locations.shtml` + 5 상세 | `location.ts` | location, location_i18n(EN) |
| 4 | `/items.shtml` | `item.ts` | item, item_i18n(EN), item_location, item_tag |
| 5 | `/habitats.shtml` + 209 상세 | `habitat.ts` | habitat, habitat_pokemon |
| 6 | `/furniture.shtml` | `furniture.ts` | item 속성 보강 |
| 7 | `/favorites.shtml` | `favorites.ts` | favorite_category, pokemon_favorite, item_favorite_tag |
| 8 | `/crafting.shtml` | `crafting.ts` | crafting_recipe, crafting_ingredient |
| 9 | `/cooking.shtml` | `cooking.ts` | cooking_recipe, cooking_ingredient |
| 10 | `/flavors.shtml` | `flavors.ts` | food |
| 11 | `/building.shtml` | `building.ts` | building_kit, building_kit_material |
| 12 | `/abilities.shtml` | `abilities.ts` | ditto_ability |
| 13 | `/magnetrise.shtml` | `magnet-rise.ts` | item.is_magnet_rise_only |
| 14 | `/paint.shtml` | `paint.ts` | paint_color, paint_pattern, paint_recipe |
| 15 | `/electricity.shtml` + `/water.shtml` | `electricity.ts` + `water.ts` | generator, water_type |
| 16 | `/environmentlevel.shtml` | `environment.ts` | environment_reward, shop_item, currency |
| 17 | `/pokemoncenter.shtml` | `pokemon-center.ts` | pokemon_center, pokemon_center_material |
| 18 | `/friendship.shtml` | `friendship.ts` | friendship_tier |
| 19 | `/mosslaxboosts.shtml` | `mosslax.ts` | mosslax_boost |
| 20 | `/stampcard.shtml` | `stamp-card.ts` | stamp_card, stamp_reward |
| 21 | `/jumprope.shtml` + `/hideandsneak.shtml` | `jumprope.ts` + `hide-and-sneak.ts` | jumprope_tier, hideandsneak_reward |
| 22 | `/gameplay.shtml` | `gameplay.ts` | `data/parsed/reference/gameplay.json` (DB 비대상) |
| 23 | `/importantrequests.shtml` | `quests.ts` | quest, quest_requirement |
| 24 | `/teaminitiationchallenge.shtml` | `team-challenge.ts` | team_challenge, team_challenge_requirement |
| 25 | `/legendary.shtml` | `legendary.ts` | legendary_acquisition |
| 26 | `/uniquepokemon.shtml` | `unique-pokemon.ts` | pokemon 업데이트 |
| 27 | `/cds.shtml` | `cds.ts` | cd, source_game, cd_location |
| 28 | `/lostrelics.shtml` | `lost-relics.ts` | lost_relic |
| 29 | `/humanrecords.shtml` | `human-records.ts` | human_record |
| 30 | `/customisation.shtml` | `customization.ts` | customization_item |
| 31 | `/flowers.shtml` + `/vegetables.shtml` | `plants.ts` | plant, plant_variant |
| 32 | `/pokedexcompletion.shtml` | `pokedex-milestone.ts` | pokedex_milestone |
| 33 | `/trade.shtml` | `trade.ts` | item_location(Trade) + trade_valuation |
| 34 | `/collect.shtml` | `collect.ts` | exchange_recipe + item_location(Trade) |
| 35 | `/litter.shtml` | `litter.ts` | item_location(Litter) + pokemon_litter_reward |

각 파서는 `testing-tdd-cycle` 적용:
1. fixture HTML 저장
2. 실패 테스트 — 기대 엔티티 개수 + 1개 대표 엔티티의 필드 값
3. `SELECTOR_VERSION = '1'` + 최소 구현
4. Zod safeParse로 `buildSourceMetadata` 주입 후 검증
5. 엣지: 빈 섹션, 결손 이미지, 비구조적 텍스트

**Task 8.4 — 로더 (Prisma upsert)**

Files:
- Create: `packages/scraper/src/loaders/upsert-loader.ts`

정책 (DATA_COLLECTION_PLAN §9.1 / CRAWLING_STRATEGY §20.2):
- 모든 DB 작업 upsert (source_slug 기준)
- content_hash 변경 시만 `updated_at` 갱신
- 벌크 upsert는 Prisma의 `$executeRaw`로 우회 (성능)
- polymorphic reward는 애플리케이션 레벨 검증 (§8.1)

**Task 8.5 — Invalid parse 격리**

Zod 실패 시 `data/invalid/<source>/<timestamp>/<entity>.json` + 원본 HTML + 에러 로그. `chmod 600` (§22.3).

**Task 8.6 — 이벤트 포켓몬/서식지/아이템 (DATA_COLLECTION_PLAN Phase 6)**

단계 36~38은 Phase 8에 포함 (eventpokedex, habitats 이벤트 섹션, 이벤트 아이템). Serebii T0로 수집.

**Task 8.7 — Dream/Cloud Island (DATA_COLLECTION_PLAN Phase 7 단계 39~40)**

`/dreamislands.shtml`, `/cloudislands.shtml` 파서 + island_variant/island_reward 로더.

**Task 8.8 — 커밋 단위**

매 5개 페이지 단위로 커밋:
- `feat(scraper/parsers): Serebii pages 1-5 (pokemon/specialty/location/item/habitat)`
- ...

**Phase 8 완료 조건**
- [ ] 35+ Serebii 파서 전부 fixture 기반 단위 테스트 통과
- [ ] Zod 스키마 100% 커버 (모든 엔티티에 `SourceMetadataSchema` merge 반영)
- [ ] 로더가 빈 DB에 upsert 실행 시 모든 엔티티 반영
- [ ] Invalid parse 5% 미만 (§7.3 임계)

**Phase 8 감사:** 프로파일 `parser` → `pokopia-page-parser` + `pokopia-qa-analyst` + `codereview-style-reviewer` + `codereview-security-auditor`.

---

## Phase 9 — Serebii 드라이런 & 실제 크롤링

**Goal:** Phase 8에서 구현한 파서를 실제 Serebii에 적용해 **Phase -1 preflight → 드라이런 → Phase 1~5 Serebii T0 전체 수집**을 완주한다.

**관련 SSoT:** CRAWLING_STRATEGY §15.1, §17, §28, DATA_COLLECTION_PLAN Phase 1~5+6+7.

**예상 기간:** 1~2일 (실제 Serebii 수집 40~60분 + QA + 버퍼)

**에이전트 팀:** 팀 C (실행) = `pokopia-ops-conductor` + `pokopia-qa-analyst` (+ `pokopia-code-builder` 대기).

### Tasks

**Task 9.1 — 드라이런 5페이지**

```bash
pnpm --filter @pokopia-wiki/scraper scrape --dry-run --source serebii --page availablepokemon --limit 5
```

결과 `data/parsed/pokemon/serebii.json` 수동 검토 → `pokopia-qa-analyst` 리뷰.

**Task 9.2 — 전체 Serebii Phase 1 실행 (DB 쓰기)**

```bash
pnpm --filter @pokopia-wiki/scraper scrape --source serebii --phase 1
```

**Task 9.3 — Phase 2~5 순차**

```bash
pnpm --filter @pokopia-wiki/scraper scrape --source serebii --phase 2
# ...
pnpm --filter @pokopia-wiki/scraper scrape --source serebii --phase 5
```

서식지 209 청크는 자동 분산 세션이 처리.

**Task 9.4 — incremental QA 실행**

`pokopia-quality-gate` 스킬:
- 수량 확인: pokemon ≥ 199, habitat ≥ 209, item ≥ 300, specialty = 33, cd = 43
- 교차 참조: cooking.result_item_id → item 존재, pokemon_specialty 양측 FK 유효
- invalid parse 5% 미만
- Attribution 필드 100% 채워짐

**Task 9.5 — 실측 수량 문서 반영**

DATA_COLLECTION_PLAN §10의 "~300 (추정)" → "307 (실측, 2026-05-XX)" 갱신. `pokopia-doc-strategist` 경유.

**Task 9.6 — 커밋**

Commit: `chore(data): Phase 1-5 Serebii crawl complete (<counts>)`

**Phase 9 완료 조건**
- [ ] DB에 Phase 1~7 (DATA_COLLECTION_PLAN 번호)의 Serebii 데이터 적재 완료
- [ ] invalid parse < 5% 전역
- [ ] Attribution 완전성 100%
- [ ] 실측 수량 DATA_COLLECTION_PLAN §10 갱신

**Phase 9 감사:** 프로파일 `parser`+`QA` → `pokopia-qa-analyst` + `pokopia-page-parser` + `codereview-performance-auditor`.

---

## Phase 10 — PokopiaGuide API Discovery (CRAWLING_STRATEGY Phase 0)

**Goal:** PokopiaGuide.com/ko의 내부 API 엔드포인트를 역추적해 DOM 파싱 대비 처리 속도 2~3배 확보 여부를 결정한다.

**관련 SSoT:** CRAWLING_STRATEGY §2.2, §15.2, §19.

**예상 기간:** 0.5~1일

### Tasks

**Task 10.1 — `scripts/api-discovery.ts` 작성**

CRAWLING_STRATEGY §19의 `discoverApi` 구현. patchright로 pokedex/items/habitat/crafting 페이지 방문하며 JSON/GraphQL 응답 모두 수집.

**Task 10.2 — 발견 결과 분석**

- REST/GraphQL/BaaS 발견 → Phase 11 전략 A (API 호출) 선택
- API 없음 → Phase 11 전략 B (DOM 파싱)

결과를 `data/api-discovery.json` + `docs/plans/pokopia-guide-discovery-report.md`에 기록.

**Task 10.3 — 도메인 매핑 가능성 평가**

API 스키마가 Serebii 엔티티와 매핑 가능한지 검토 (pokedex_no, 영문 이름 기반).

**Phase 10 완료 조건**
- [ ] discovery 결과 문서화
- [ ] Phase 11 진행 전략(A/B) 확정

---

## Phase 11 — PokopiaGuide T1 파서 + i18n Mapper (DATA_COLLECTION_PLAN Phase 8 단계 41)

**Goal:** PokopiaGuide 한국어 데이터를 Phase 9 적재 결과에 매핑해 `pokemon_i18n`/`item_i18n` 등에 `source='pokopiaguide'` 레코드를 채운다.

**관련 SSoT:** DATA_COLLECTION_PLAN §4, §6 Phase 8, CRAWLING_STRATEGY §15.2, §18.

**예상 기간:** 5~15일 (API 발견 시 5일, DOM만 15일)

**에이전트 팀:** 팀 B + 팀 C 혼합. `pokopia-i18n-mapper` 스킬 집중 활용.

### Tasks

**Task 11.1 — PokopiaGuide 파서 (Phase 10 전략에 따라 분기)**

Files:
- Create: `packages/scraper/src/parsers/pokopia-guide/` — entity별 파서

엔티티:
- pokemon (포켓몬 한국어명) — pokedex_no로 매핑
- item (아이템 한국어명) — 정규화 영문명으로 매핑
- specialty, habitat, location, recipe...

**Task 11.2 — i18n Mapper (`pokopia-i18n-mapper` 스킬)**

Files:
- Create: `packages/scraper/src/mappers/i18n-mapper.ts`

- `normalizeForMatch` (§18.2)
- `(entity_type, entity_id, locale='ko')` UNIQUE 제약 준수
- 이미 존재하는 행은 충돌 감지 → `translation_conflict`에 기록
- `source='pokopiaguide'`, `verified=false`, `verified_at=null` 설정

**Task 11.3 — 병렬 스케줄**

T1 세션은 하루 2~3개, 각 40~80분. `korean-pokemon-fan` 페르소나. activeHours 08~14.

**Task 11.4 — incremental QA per session**

세션 종료 시 `pokopia-quality-gate`로 당일 추가된 i18n 행 수 + 교차 참조 무결성 확인.

**Phase 11 완료 조건**
- [ ] 포켓몬 100%, 아이템 90%+, 메커니즘 80%+ KO 커버리지 (§8.2 목표)
- [ ] translation_conflict 기록이 예상 범위 내 (~100건)

**Phase 11 감사:** 프로파일 `i18n` → `pokopia-i18n-mapper` + `pokopia-qa-analyst` + `pokopia-doc-strategist`.

---

## Phase 12 — pokopoko T2 + namu.wiki T3 시도 (DATA_COLLECTION_PLAN Phase 8 단계 42~43)

**Goal:** Phase 10/Preflight 결과에 따라 pokopoko/namu.wiki 자동 수집을 시도하거나 조기 포기 결정을 문서화한다.

**관련 SSoT:** CRAWLING_STRATEGY §15.3, §15.4, DATA_COLLECTION_PLAN §4.5.

**예상 기간:** 0일 (skip) ~ 10일 (둘 다 성공)

### Tasks

**Task 12.1 — pokopoko T2 시도**

Phase 3 preflight에서 patchright가 pokopoko 403 돌파 가능한 것으로 나왔다면:
- 세션/일 1개, 20~45분
- `korean-pokemon-fan` 페르소나 공유 (T1 세션 완전 종료 후 2시간 gap)
- 실패 시 즉시 포기 + cooldown 문서화

**Task 12.2 — namu.wiki T3 시도**

`nowsecure.nl` 통과 시만:
- 10~30개 핵심 문서 수동 선별 (`_workspace/phase-12/namuwiki-targets.md`)
- `namuwiki-researcher` 페르소나, 19~23시
- 2회 연속 실패 시 수동 번역 대상 전환

**Task 12.3 — 나무위키 수동 복사 (DATA_COLLECTION_PLAN §4.5)**

자동 수집 포기 시:
- `data/manual/namuwiki/<entity-type>/<slug>.md` 작성
- 프론트매터 `entity_type`, `entity_id`, `field`, `source_url`, `copied_at` 준수
- 전용 파서(`packages/scraper/src/parsers/namuwiki/manual-reader.ts`)가 디렉토리 읽어 i18n 적재

**Phase 12 완료 조건**
- [ ] pokopoko: 접근 결과(성공/포기) 문서화
- [ ] namu.wiki: 접근 결과 문서화 + 수동 번역 목록 존재

---

## Phase 13 — 한국어 교차 검증 & 충돌 해결 (DATA_COLLECTION_PLAN Phase 8 단계 44~46)

**Goal:** pokemon.com/ko 공식 DB와 포켓몬 이름 교차 검증, translation_conflict 리뷰 큐 처리, pending→manual 전환 완료.

**관련 SSoT:** DATA_COLLECTION_PLAN §4.3, §4.4, §6 Phase 8 단계 44~46.

**예상 기간:** 2~3일

### Tasks

**Task 13.1 — pokemon.com/ko 파서 (T0 또는 T1)**

Pokemon 공식 DB의 한국어명 수집. rate 1 req/2s 보수적.

**Task 13.2 — 교차 검증 로직**

DATA_COLLECTION_PLAN §4.3 워크플로:
- 값 일치 → `verified=true`, source 유지
- 값 불일치 → translation_conflict 생성 + i18n 값을 공식 DB 값으로 덮어쓰기 + `source='pokemon_official'`

**Task 13.3 — 충돌 리뷰 CLI**

`scripts/resolve-conflicts.ts`:
- `translation_conflict` 미해결 건 목록 표시
- 한 건씩 `resolved_value` 입력 → i18n 반영 + `resolved_by` 기록

**Task 13.4 — Pending → Manual 전환**

`scripts/mark-manual.ts` — 번역자가 입력 후 `source='manual'`, `verified=true`로 업데이트.

**Phase 13 완료 조건**
- [ ] 포켓몬 이름 100% verified
- [ ] translation_conflict 미해결 건 < 10
- [ ] pending 행 정리 완료 (모두 manual로 전환되거나 명시적 "번역 대기" 라벨)

---

## Phase 14 — 이미지 수집 & Phase 7 최종 검증 (DATA_COLLECTION_PLAN Phase 9)

**Goal:** Serebii/PokopiaGuide 페이지 로드 시 브라우저가 자연스럽게 수집한 이미지를 외장 SSD에 저장하고, `entity_image` 테이블을 채우며, 최종 Attribution/수량/교차 참조 검증을 통과한다.

**관련 SSoT:** DATA_COLLECTION_PLAN §5, §6 Phase 9 단계 47~48, CRAWLING_STRATEGY §10.3, §27.3.

**예상 기간:** 1~2일

### Tasks

**Task 14.1 — 이미지 응답 리스너**

Files:
- Create: `packages/scraper/src/images/capture.ts`

CRAWLING_STRATEGY §10.3 `mapUrlToStoragePath` + Playwright `page.on('response')`. `ALLOWED_HOSTS` + 경로 traversal 방어.

**Task 14.2 — `entity_image` 적재**

- `entity_type` + `entity_id` 매핑 (pokemon = pokedex_no, item = id 등)
- `variant` ('thumb', 'detail', 'color_red' 등) 태깅
- `content_hash` sha256 산출
- `is_primary` 대표 이미지 지정

**Task 14.3 — Phase 7 최종 검증 (§27.3)**

`scripts/final-validation.ts`:
- 수량: pokemon ≥ 199, habitat ≥ 209, item ≥ 300, specialty = 33, cd = 43
- 교차 참조: cooking ingredients, pokemon_specialty, habitat_pokemon, quest_requirement, environment_reward.reward_ref_id
- 이미지: `imageUrl` 있는데 로컬 파일 없으면 `phase-7/missing-images.json`
- Attribution 완전성: 모든 레코드 `sourceUrl`/`license`/`copyrightHolder`/`attribution` NOT NULL

**Task 14.4 — 커밋 & 문서 갱신**

실측 수량 DATA_COLLECTION_PLAN §10에 반영. `pokopia-doc-strategist` 경유.

**Phase 14 완료 조건**
- [ ] ~1,400 이미지 외장 SSD 저장
- [ ] entity_image 테이블 레코드 존재
- [ ] final-validation.ts 전부 PASS

**Phase 14 감사:** 프로파일 `QA` → `pokopia-qa-analyst` + `codereview-security-auditor` (path traversal) + `pokopia-doc-strategist` (수량 갱신).

---

## Phase 15 — API 구현 (Hono + graphql-yoga + Pothos)

**Goal:** 위키 프론트엔드가 사용할 GraphQL API를 `packages/api`에 구현하고 homelab K8s에 ArgoCD로 배포한다. Phase 0 이후 병렬 진행 가능.

**관련 SSoT:** TECH_STACK.md §3, §5.3, §6.2.

**예상 기간:** 2~5일 (병렬 진행 가능)

### 산출물
- `packages/api/src/schema/` — Pothos 타입 정의
- `packages/api/src/resolvers/` — 리졸버 (Prisma relation 기반 자동)
- `packages/api/src/graphql/` — graphql-yoga mount
- `packages/api/src/modules/pokemon/` — Hono 모듈 (기존 구조 유지)
- `packages/api/schema.graphql` — SDL export
- ArgoCD 매니페스트 업데이트

### Tasks

**Task 15.1 — Pothos + graphql-yoga 도입**

```bash
pnpm --filter @pokopia-wiki/api add @pothos/core @pothos/plugin-prisma graphql graphql-yoga
```

**Task 15.2 — Builder 설정**

Files:
- Create: `packages/api/src/schema/builder.ts`

```ts
import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import type PrismaTypes from '@pokopia-wiki/shared/prisma-client/pothos-types'; // generated

export const builder = new SchemaBuilder<{ PrismaTypes: PrismaTypes }>({
  plugins: [PrismaPlugin],
  prisma: { client: prisma },
});
```

**Task 15.3 — 엔티티별 Object 타입 정의**

SCHEMA.md §2의 모델을 순차 노출:
- `PokemonType`, `ItemType`, `HabitatType`, `LocationType`, `CookingRecipeType`, ...
- i18n 필드는 `locale` arg로 필터링 (`translations(locale: "ko")`)

**Task 15.4 — Query 루트**

- `pokemon(id | pokedex_no)`, `pokemons(filter, limit)`
- `item(id)`, `items(category, tag)`
- `habitat(habitat_no)`, `habitats()`
- ...

**Task 15.5 — Hono 마운트**

```ts
import { createYoga } from 'graphql-yoga';
import { schema } from './schema';
app.use('/graphql', (c) => createYoga({ schema }).handle(c.req.raw, c));
```

**Task 15.6 — SDL export + codegen 준비**

`scripts/export-sdl.ts` — `packages/api/schema.graphql`로 SDL 저장. 이후 pokopia-web 레포에서 graphql-codegen이 읽는다.

**Task 15.7 — Docker 배포 격리 (§5.3)**

`packages/api/Dockerfile`:
```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY packages/api ./packages/api
COPY packages/shared ./packages/shared
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @pokopia-wiki/api build
RUN pnpm deploy --filter=@pokopia-wiki/api --prod /prod-out

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /prod-out ./
USER 1000
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

**Task 15.8 — ArgoCD 매니페스트**

`homelab` 레포의 ArgoCD 매니페스트에 `pokopia-api` 추가. 이미지 태그 자동 갱신.

**Task 15.9 — E2E 테스트**

`packages/api/tests/e2e/pokemon.test.ts` — 실 GraphQL 쿼리:
```graphql
query { pokemon(pokedexNo: 1) { id nameEn translations(locale: "ko") { name } } }
```

**Phase 15 완료 조건**
- [ ] 로컬에서 `pnpm --filter @pokopia-wiki/api dev` → `curl http://localhost:3000/graphql` 동작
- [ ] homelab `pokopia-api.ukkiee.dev` 접근 가능
- [ ] `schema.graphql` SDL 파일 존재

**Phase 15 감사:** 프로파일 `api` → `codereview-architect-reviewer` + `codereview-performance-auditor` (N+1) + `codereview-security-auditor`.

---

## Phase 16 — 백업 & 주간 운영 정착

**Goal:** rsync 백업 + pg_dump + 주간 재크롤링 + 로그 로테이션 + CLI 대시보드를 운영 체제로 정착시킨다.

**관련 SSoT:** DATA_COLLECTION_PLAN §9.2, CRAWLING_STRATEGY §22, §29.

**예상 기간:** 1~2일

### Tasks

**Task 16.1 — backup.sh (§29.2 D2 정리)**

Files:
- Create: `scripts/backup.sh` — 외장 SSD 마운트 검증, 용량 체크, exit 2 정책

```bash
# crontab -e
0 4 * * * /Users/ukyi/workspace/pokopia-wiki/scripts/backup.sh >> /var/log/pokopia-backup.log 2>&1
```

**Task 16.2 — pg_dump 주간 정책**

- 최근 8주 롤링 + 월 1회분 12개월 보관
- `scripts/pg-dump.sh` + 홈랩 NAS 저장

**Task 16.3 — 주간 재크롤링 (§9.1)**

`node-cron` 내부 또는 외부 crontab:
- 일요일 새벽 Serebii `content_hash` diff 감지
- 변경분만 DB 반영 + 변경 리포트 생성

**Task 16.4 — 로그 로테이션**

`data/logs/*.jsonl` 14일 보존 정책. `pino` 또는 간이 rotator.

**Task 16.5 — CLI 대시보드 최종 확정**

`pnpm run status` (Phase 7) + health 리포트 자동 첨부.

**Task 16.6 — 복원 리허설 (§9.2)**

분기 1회 스테이징에서 pg_dump 복원 리허설 → 체크리스트 문서화.

**Task 16.7 — README 루트 재작성**

템플릿 README를 Pokopia 실제 내용으로 교체. 단 기존 CI/CD 섹션은 유지하되 모노레포 경로 반영.

**Phase 16 완료 조건**
- [ ] 외장 SSD에 `data/` 백업 존재
- [ ] pg_dump가 homelab에서 주기 실행
- [ ] 로그 14일 로테이션 동작
- [ ] 복원 리허설 성공

**Phase 16 감사:** 프로파일 `ops` → `pokopia-ops-conductor` + `codereview-security-auditor` (로그 마스킹 실효성).

---

## 교차 관점: 전체 Phase ↔ 에이전트/스킬 매핑

| Phase | 주 에이전트 | 스킬 | 감사 프로파일 |
|-------|-------------|------|--------------|
| 0 | code-builder + schema-architect | (wiki-build) | docs/setup |
| 1 | schema-architect + doc-strategist | pokopia-schema-prisma + pokopia-doc-consistency | schema |
| 2 | code-builder + qa-analyst | (커스텀) | schema |
| 3 | code-builder + ops-conductor | pokopia-ops-runner | ops/setup |
| 4 | code-builder | pokopia-tier-crawler | crawler |
| 5 | code-builder + ops-conductor | pokopia-tier-crawler | crawler |
| 6 | code-builder | pokopia-tier-crawler | crawler |
| 7 | code-builder + ops-conductor | pokopia-ops-runner | ops |
| 8 | code-builder + qa-analyst | pokopia-page-parser | parser |
| 9 | ops-conductor + qa-analyst | pokopia-ops-runner + pokopia-quality-gate | parser/QA |
| 10 | code-builder | pokopia-tier-crawler | crawler |
| 11 | code-builder + qa-analyst | pokopia-i18n-mapper | i18n |
| 12 | ops-conductor + doc-strategist | pokopia-ops-runner | ops |
| 13 | qa-analyst | pokopia-quality-gate | QA |
| 14 | qa-analyst + doc-strategist | pokopia-quality-gate | QA |
| 15 | code-builder | (커스텀) | api |
| 16 | ops-conductor | pokopia-ops-runner | ops |

각 Phase 시작 전 `pokopia-wiki-build` 스킬로 팀 구성, 완료 시 `pokopia-phase-review-harness`로 감사 후 다음 Phase 진행.

---

## 위험 & 결정 포인트 요약

| Phase | 위험 | 결정 게이트 |
|-------|------|------------|
| 3 | preflight 실패 | `nowsecure.nl` 실패 → T3 포기 |
| 3 | patchright 최신성 결여 | 6개월 이내 릴리스 없으면 T2 포기 검토 |
| 4 | Playwright 버전 호환성 | 시스템 Chrome 메이저 bump 시 autoupdate 허용 (§9.2) |
| 5 | 프로필 corruption | 워밍 1일 재수행 필요 |
| 8 | Serebii HTML 구조 변경 | SELECTOR_VERSION bump + fixture 재생성 |
| 9 | 파싱 실패율 ≥ 20% | 서킷 브레이커 + code-builder 투입 |
| 10 | PokopiaGuide API 없음 | Phase 11은 DOM 전략 B (+10일) |
| 11 | 한국어 커버리지 미달 | Phase 13에서 pending → 수동 번역 확대 |
| 12 | namu.wiki 차단 | DATA_COLLECTION_PLAN §4.5 수동 복사 전면 전환 |
| 14 | Attribution 누락 | 데이터 재생성 — 파서 `buildSourceMetadata` 확인 |
| 15 | N+1 GraphQL 쿼리 | Pothos prisma plugin relation 자동 최적화 확인 |
| 16 | 외장 SSD 미연결 | backup.sh exit 2 (D2 정리) → 운영자 수동 대응 |

---

## 커밋 전략 (요약)

1. Phase 0 완료 시점에 `chore: transform to pnpm monorepo`
2. Phase 1~14는 각 Task 단위로 작은 커밋 (`feat(scraper/parsers): ...`)
3. Serebii 수집 Phase 단위로 체크포인트 커밋 (`chore(data): Phase N Serebii crawl complete`)
4. 주간 백업 스크립트 실행 로그는 커밋하지 않음 (gitignored)
5. TDD 사이클: RED 커밋 → GREEN 커밋 (옵션, 보통 같이) → Refactor 커밋

---

## 실행 핸드오프

**이 계획은 writing-plans 스킬 권장 포맷을 따른 **프로젝트 전체 로드맵**이다. 각 Phase 내부는 개별 작은 계획 문서로 분리할 수 있다:

**옵션 1 (권장) — Phase 단위 executing-plans**
- Phase마다 새 세션에서 `pokopia-wiki-build` 스킬 활성 → 팀 A/B/C 구성
- 완료 후 `pokopia-phase-review-harness` 감사 → Critical 발견 시 루프백
- 다음 Phase 진행

**옵션 2 — 서브에이전트-드리븐 개발 (단일 세션)**
- 이 문서 안에서 `superpowers:subagent-driven-development` + `superpowers:executing-plans` 결합
- Phase 0 부터 16까지 순차 실행

**옵션 3 — 병렬 워크트리**
- Phase 0~7 (인프라) 와 Phase 15 (API) 를 별도 워크트리에서 병렬
- Phase 8~14 (데이터 수집) 는 직렬

사용자는 현재 Phase 0 착수 전이므로, **옵션 1**로 Phase 0부터 시작하길 권장한다.
