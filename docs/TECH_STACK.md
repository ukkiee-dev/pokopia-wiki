# Pokopia Project - Technical Stack Specification

> 개정 이력
> - 2026-04-17 (오전): 레포지토리 구조를 3개 독립 레포 → 모노레포(`pokopia` = scraper + api + shared) + 별도 web 레포로 변경. Prisma 스키마 공유 방식을 pnpm workspace로 단순화(§5.2). 빌드 격리 전략을 §5.3에 신설(scraper를 API 배포 이미지에서 제외). 기존 §5.3 Homelab K8s는 §5.4로 이동.
> - 2026-04-17 (오후): 모노레포 루트 디렉토리명 `pokopia` → `pokopia-wiki`로 변경. npm 스코프 `@pokopia/*` → `@pokopia-wiki/*`로 통일. §1 architecture 다이어그램·표, §2.6 루트 레이아웃, §2~§6 전반의 패키지 이름 갱신. DB명 `pokopia`·도메인·별도 레포 `pokopia-web`·소스 사이트명 `PokopiaGuide`/`pokopiaGuide`는 별개 개념이므로 유지.

## 1. Architecture Overview

2개 레포지토리로 구성한다. 데이터 파이프라인과 백엔드 API는 하나의 모노레포로 묶고, 프론트엔드는 별도 레포로 유지한다.

```
[pokopia-wiki (monorepo)]                             [pokopia-web]
  packages/scraper   데이터 수집 앱 (로컬 Mac)           프론트엔드
  packages/api       GraphQL API 서버 (homelab K8s)     homelab K8s 배포
  packages/shared    Prisma 클라이언트·Zod 타입 공유
  prisma/            DB 스키마 단일 관리
       │                                                     │
       └──── PostgreSQL (pokopia) ──── GraphQL ──────────────┘
              homelab Shared PG
```

| 레포/패키지 | 역할 | 실행 환경 |
|------------|------|----------|
| `pokopia-wiki` (monorepo root) | pnpm workspace, Prisma 스키마 단일 관리 | — |
| └ `packages/scraper` | Serebii 등 4개 소스에서 데이터 수집·파싱·DB 적재 | 로컬 Mac |
| └ `packages/api` | GraphQL API 서버 (위키 데이터 제공) | homelab K8s (ArgoCD) |
| └ `packages/shared` | Prisma 클라이언트 re-export, Zod·i18n 공통 타입 | 워크스페이스 의존성 |
| `pokopia-web` | 위키 프론트엔드 | homelab K8s (ArgoCD) |

**모노레포 채택 근거:**
- scraper와 api가 Prisma 스키마·Zod 타입·i18n 로직을 공유 → submodule/복사 오버헤드 제거
- Prisma 마이그레이션 단일 관리(§5.2)
- scraper를 API 배포 아티팩트에서 격리 가능(§5.3) — 이미지 크기·의존성 범위 최소화

**web 분리 근거:**
- 배포 주기·빌드 파이프라인·의존성 프로필이 scraper/api와 무관
- GraphQL SDL 계약으로만 api와 결합(§4.2)

---

## 2. packages/scraper (`@pokopia-wiki/scraper`)

데이터 수집 전용 패키지. 4개 소스 사이트에서 데이터를 스크래핑하여 PostgreSQL에 적재한다.

### 2.1 Core Stack

| 레이어 | 기술 | 버전 | 비고 |
|--------|------|------|------|
| Runtime | Node.js | LTS (22.x) | TypeScript |
| Package Manager | pnpm | latest | workspace(§5.2) |
| HTTP Client | ky | latest | fetch 기반, retry/timeout 내장. T0 (정적 HTML) 용도 |
| HTML Parser | node-html-parser | latest | 캐시된 HTML 재파싱 + T0 Serebii 파싱 |
| Browser Automation | Playwright | latest | T1 (중간 안티봇) — PokopiaGuide 등 |
| Browser Automation | patchright | latest | T2/T3 (고급 안티봇) — pokopoko / namu.wiki Cloudflare 등 |
| Browser Behavior | ghost-cursor-playwright | latest | Bezier 궤적 기반 자연스러운 마우스 (T1+) |
| Validation | zod | latest | 환경 변수 + 파싱 결과 스키마 검증 |
| Notifications | (ky + osascript) | — | Telegram 봇 + macOS 로컬 알림 (CRAWLING_STRATEGY §13.3) |
| ORM | Prisma | latest | `@pokopia-wiki/shared`로 api와 클라이언트 공유(§5.2), 벌크 쓰기 |
| Database | PostgreSQL | bitnami Helm | homelab Shared PostgreSQL, DB명: `pokopia` |

### 2.2 Fetcher Strategy

> **SSoT:** fetcher 선택·티어 분류·안티봇 정책은 [`CRAWLING_STRATEGY.md §1.3 소스 티어 분류`](./CRAWLING_STRATEGY.md)가 단일 진실 소스. 이 섹션은 상위 요약만 제공.

**원칙:** 소스별 방어 수준에 비례하는 최소 전략(티어 T0~T3)을 적용. 과잉 스텔스는 오히려 탐지 시그널.

| 티어 요약 | Fetcher | 대상 소스 |
|----------|---------|----------|
| T0 (방어 없음/낮음) | `ky` + `node-html-parser` | Serebii |
| T1 (중간) | `playwright` 순정 | PokopiaGuide |
| T2 (403) | `patchright` | pokopoko |
| T3 (Cloudflare WAF) | `patchright` + CF challenge 대기 | namu.wiki (성공 보장 X) |

상세 (페르소나/워밍/Rate Limit/에러 반응/알림 등)는 CRAWLING_STRATEGY 참조.

### 2.3 Caching Strategy

스크래핑한 원본 HTML을 로컬에 캐싱하여 재파싱 시 사이트 재요청을 방지한다.

| 항목 | 설정 |
|------|------|
| TTL | 3일 |
| 무효화 | `--force-fetch` CLI 플래그 |
| 저장 위치 | `data/cache/{source}/{page}.html` (모노레포 루트의 `data/`) |
| 메타데이터 | `data/cache/{source}/{page}.meta.json` (url, fetchedAt, status, contentHash) |
| Git 추적 | `.gitignore`에 `data/cache/` 추가 |

```
fetch(url)
  → cache hit & TTL 유효? → 캐시된 HTML 반환
  → cache miss or 만료?  → HTTP 요청 → HTML + meta 저장 → 반환
```

### 2.4 Intermediate Storage

파싱 결과를 JSON으로 중간 저장하여 디버깅과 재적재를 용이하게 한다.

| 항목 | 설정 |
|------|------|
| 저장 위치 | `data/parsed/{entity}/{source}.json` (모노레포 루트의 `data/`) |
| 형식 | JSON (엔티티별 배열) |
| Git 추적 | `.gitignore`에 `data/parsed/` 추가 |

### 2.5 Image Storage

수집한 이미지는 homelab 외장 SSD에 저장한다.

| 항목 | 설정 |
|------|------|
| 저장 위치 | 외장 SSD (homelab, Immich 미사용 중이라 활용) |
| 디렉토리 구조 | `/images/{category}/{id}.png` |
| 추정 수량 | ~1,100장 |

### 2.6 Package Structure

```
packages/scraper/
├── src/
│   ├── fetchers/               # 소스별 HTTP fetcher
│   │   ├── ky-fetcher.ts       # ky 기반 (정적 HTML)
│   │   └── playwright-fetcher.ts # Playwright 기반 (CSR)
│   ├── cache/                  # HTML 캐싱 로직
│   │   └── html-cache.ts
│   ├── scrapers/               # 소스별 스크래퍼
│   │   ├── serebii/
│   │   ├── pokopia-guide/
│   │   ├── pokopoko/
│   │   └── namuwiki/
│   ├── parsers/                # 페이지별 파서
│   │   ├── pokemon.ts
│   │   ├── items.ts
│   │   ├── specialty.ts
│   │   ├── habitat.ts
│   │   ├── location.ts
│   │   └── ...
│   ├── mappers/                # 한국어 매핑 로직
│   │   └── i18n-mapper.ts
│   ├── loaders/                # JSON → DB 적재
│   │   └── db-loader.ts
│   ├── validators/             # 데이터 품질 검증
│   │   └── data-validator.ts
│   └── index.ts                # CLI 진입점
├── scripts/                    # Phase별 실행 스크립트
│   ├── phase1-core.ts
│   ├── phase2-relations.ts
│   └── ...
├── package.json                # "name": "@pokopia-wiki/scraper"
└── tsconfig.json
```

모노레포 루트 레이아웃:

```
pokopia-wiki/
├── prisma/
│   └── schema.prisma           # DB 스키마 단일 관리 (§5.2)
├── packages/
│   ├── scraper/                # 위 구조
│   ├── api/                    # §3
│   └── shared/                 # §5.2 (Prisma 클라이언트, Zod 공용 타입)
├── data/                       # scraper 런타임 데이터 (.gitignore)
│   ├── cache/
│   └── parsed/
├── pnpm-workspace.yaml
├── package.json                # 루트 workspace manifest
├── tsconfig.base.json
├── .env                        # (.gitignore)
├── .gitignore
├── CRAWLING_STRATEGY.md
├── DATA_COLLECTION_PLAN.md
├── SCHEMA.md
└── TECH_STACK.md               # 이 문서
```

---

## 3. packages/api (`@pokopia-wiki/api`)

위키 데이터를 GraphQL API로 제공하는 백엔드 서버.

### 3.1 Core Stack

| 레이어 | 기술 | 비고 |
|--------|------|------|
| HTTP Server | Hono | 경량, 미들웨어 (CORS, rate limit, auth) |
| GraphQL Server | graphql-yoga | Hono에 마운트, 공식 integration 지원 |
| Schema Builder | Pothos + pothos-plugin-prisma | code-first, Prisma 모델에서 GraphQL 타입 자동 생성 |
| ORM | Prisma | `@pokopia-wiki/shared`로 scraper와 클라이언트 공유(§5.2) |
| Database | PostgreSQL | homelab Shared PostgreSQL (`pokopia`) |

### 3.2 GraphQL Architecture

```typescript
// Hono + graphql-yoga 통합
const yoga = createYoga({ schema })
const app = new Hono()

app.use('/graphql', async (c) => yoga.handle(c.req.raw, c))
app.get('/health', (c) => c.json({ status: 'ok' }))
```

```typescript
// Pothos + Prisma 자동 타입 매핑
const PokemonType = builder.prismaObject('Pokemon', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    pokedexNo: t.exposeInt('pokedexNo'),
    translations: t.relation('translations'),
    specialties: t.relation('specialties'),
  }),
})
```

### 3.3 Deployment

| 항목 | 설정 |
|------|------|
| 배포 방식 | homelab K8s (ArgoCD GitOps) |
| 빌드 격리 | `packages/scraper`는 배포 이미지에서 제외 (§5.3) |
| 접근 | Tailscale (internal) 또는 Cloudflare Tunnel (public) |
| 도메인 | `pokopia-api.ukkiee.dev` (예정) |

---

## 4. pokopia-web

위키 프론트엔드. 별도 레포로 유지.

### 4.1 Core Stack

| 레이어 | 기술 | 비고 |
|--------|------|------|
| Framework | React + TanStack | SSR 필요시 TanStack Start, CSR이면 TanStack Router |
| GraphQL Client | TanStack Query + graphql-request | |
| Type Generation | graphql-codegen | API SDL에서 typed hooks 자동 생성 |

### 4.2 Type Sharing Strategy

별도 레포 간 타입 안전한 통신을 GraphQL 스키마 계약으로 보장한다.

```
packages/api (Pothos + Prisma)
  → SDL 내보내기 (schema.graphql)

pokopia-web
  → graphql-codegen으로 typed operations 생성
  → TanStack Query hooks 자동 생성
```

### 4.3 Deployment

| 항목 | 설정 |
|------|------|
| 배포 방식 | homelab K8s (ArgoCD GitOps) |
| 접근 | Cloudflare Tunnel (public) |
| 도메인 | `pokopia.ukkiee.dev` (예정) |

---

## 5. Shared Infrastructure

### 5.1 Database

| 항목 | 설정 |
|------|------|
| Engine | PostgreSQL (bitnami Helm chart) |
| Instance | homelab Shared PostgreSQL (기존 인프라) |
| Database | `pokopia` (신규 생성) |
| Storage | 5Gi PVC (기존, 필요시 확장) |
| Backup | 기존 CronJob에 pokopia DB dump 추가 |

DB 생성 절차:
```bash
kubectl exec -it postgresql-0 -n apps -- \
  psql -U postgres -c "CREATE DATABASE pokopia;"
kubectl exec -it postgresql-0 -n apps -- \
  psql -U postgres -c "CREATE USER pokopia WITH PASSWORD '...';"
kubectl exec -it postgresql-0 -n apps -- \
  psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE pokopia TO pokopia;"
```

### 5.2 Prisma Schema Sharing

모노레포 루트의 `prisma/schema.prisma`를 단일 소스로 두고, `packages/shared`가 생성된 Prisma Client를 re-export하여 scraper·api가 공유한다.

| 항목 | 설정 |
|------|------|
| 스키마 위치 | `prisma/schema.prisma` (모노레포 루트) |
| 생성 출력 | `packages/shared/src/prisma-client/` (Prisma generator `output`) |
| 소비 방식 | scraper·api 모두 `@pokopia-wiki/shared`에서 `PrismaClient` import |
| 마이그레이션 | 루트에서 `pnpm prisma migrate dev` 단일 관리 |
| workspace 의존성 | 각 패키지 `package.json`에 `"@pokopia-wiki/shared": "workspace:*"` |

Git submodule·수동 복사·npm 배포 같은 레포 분리 시절의 공유 옵션은 workspace 공유로 대체되어 폐기한다.

### 5.3 Build Isolation

scraper는 로컬 Mac에서만 실행되므로 API 배포 이미지에 포함하지 않는다.

| 전략 | 방법 |
|------|------|
| Docker 복사 범위 제한 | Dockerfile에서 `packages/api`, `packages/shared`, `prisma`, 루트 `package.json`·`pnpm-lock.yaml`·`pnpm-workspace.yaml`만 `COPY`. `packages/scraper`는 제외 |
| pnpm deploy | `pnpm deploy --filter=@pokopia-wiki/api --prod ./out` 로 api 전용 번들 생성 (scraper·devDeps 포함되지 않음) |
| ArgoCD 경로 감시 | `packages/api/**`, `packages/shared/**`, `prisma/**` 변경 시에만 재빌드 트리거 |

이 격리로 Playwright·patchright 같은 scraper 전용 체인이 API 이미지에 흘러 들어가지 않는다. scraper는 로컬 Mac에서 직접 실행하므로 컨테이너 이미지 자체가 필요하지 않다.

### 5.4 Homelab K8s

| 항목 | 설정 |
|------|------|
| Platform | Mac Mini M4 + OrbStack K3s |
| GitOps | ArgoCD (self-heal, auto-sync) |
| Ingress | Traefik v3 + Cloudflare DNS ACME |
| Public Access | Cloudflare Tunnel |
| Internal Access | Tailscale VPN |
| Secrets | Sealed Secrets (Bitnami) |
| Monitoring | VictoriaMetrics + Grafana |

---

## 6. Development Workflow

### 6.1 Scraper 실행 흐름

```
로컬 Mac, 모노레포 루트에서 실행:

1. pnpm --filter @pokopia-wiki/scraper run scrape:phase1
   → fetch HTML → cache → parse → JSON → DB insert

2. pnpm --filter @pokopia-wiki/scraper run scrape:phase2
   ...

3. pnpm --filter @pokopia-wiki/scraper run validate
4. pnpm --filter @pokopia-wiki/scraper run report
```

### 6.2 API 개발 흐름

```
1. prisma/schema.prisma 수정 (모노레포 루트)
2. pnpm prisma migrate dev            # 루트에서 실행
3. Pothos 타입 정의 추가 (packages/api)
4. resolver 구현
5. git push → ArgoCD가 packages/api 변경 감지 → 재빌드 (§5.3)
```

### 6.3 Frontend 개발 흐름

```
1. API에서 SDL export
2. graphql-codegen 실행 → typed hooks 생성
3. 컴포넌트 구현
4. git push → ArgoCD 자동 배포
```
