# Integration Guide — 모노레포 + vitest + CI

`services/scraper`, `services/api`, `shared` 모노레포(TECH_STACK §2.6)에서 vitest 를 안정적으로 운영하기 위한 실전 가이드.

## 목차
1. [모노레포 구조 가정](#모노레포-구조-가정)
2. [vitest workspace 설정](#vitest-workspace-설정)
3. [실행 명령 카탈로그](#실행-명령-카탈로그)
4. [CI 통합 패턴](#ci-통합-패턴)
5. [Path alias·환경변수](#path-alias환경변수)
6. [공통 테스트 헬퍼 위치](#공통-테스트-헬퍼-위치)
7. [디버깅 팁](#디버깅-팁)

---

## 모노레포 구조 (TECH_STACK §2.6 기준)

```
pokopia-wiki/
├── package.json              # 루트 workspace manifest
├── pnpm-workspace.yaml
├── vitest.workspace.ts       # vitest workspace 진입점
├── prisma/
│   └── schema.prisma         # DB 스키마 단일 관리 (§5.2)
├── services/
│   ├── scraper/
│   │   ├── package.json      # @pokopia-wiki/scraper
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   ├── __fixtures__/
│   │   └── __tests__/        # (선택) 통합 테스트만
│   └── api/
│       ├── package.json      # @pokopia-wiki/api
│       ├── vitest.config.ts
│       └── src/
└── shared/
    ├── package.json      # @pokopia-wiki/shared (Prisma client re-export + 공용 헬퍼)
    ├── vitest.config.ts
    ├── src/
    └── test/             # 공용 트랜잭션 헬퍼(withTx 등)
```

> TECH_STACK.md의 SSoT 구조를 따른다. Prisma Client는 `shared`에서 re-export(§5.2)하므로 별도 `db` 패키지를 두지 않는다.

---

## vitest workspace 설정

### `vitest.workspace.ts` (루트)

```ts
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'services/*',
  'shared',
])
```

### 패키지별 `vitest.config.ts`

```ts
// services/api/vitest.config.ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: '@pokopia-wiki/api',
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    pool: 'forks', // Prisma 사용 시 forks 권장
    poolOptions: {
      forks: { singleFork: false, maxForks: 4 },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      exclude: ['**/__fixtures__/**', '**/*.config.*'],
    },
  },
})
```

> `name` 필드로 워크스페이스 출력에서 패키지 구분.

---

## 실행 명령 카탈로그

### 변경 파일 기반 (CI 친화)

```bash
pnpm vitest run --changed origin/main \
  --reporter=json \
  --outputFile=_workspace/testing/{ts}/05_run.json
```

### 패키지 단독

```bash
pnpm --filter @pokopia-wiki/api vitest run
pnpm --filter @pokopia-wiki/scraper vitest run
pnpm --filter @pokopia-wiki/shared vitest run
```

### 워크스페이스 전체 + 커버리지

```bash
pnpm vitest run \
  --coverage \
  --coverage.reporter=json-summary \
  --coverage.reporter=text \
  --reporter=json \
  --outputFile=_workspace/testing/{ts}/05_run.json
```

### 단일 파일·패턴

```bash
pnpm vitest run services/api/src/pokemon
pnpm vitest run -t 'returns 404'
```

### 특정 패키지의 변경 파일만

```bash
pnpm --filter @pokopia-wiki/api vitest run --changed origin/main
```

### flaky 검증 재실행

```bash
pnpm vitest run --retry=2 -t '<test name>'
```

> `--retry`는 자동 재실행이지만, runner는 결과를 flaky로 마킹하고 보고만 한다.

### watch 금지

```bash
# 절대 사용 금지 (결정적이지 않음)
pnpm vitest
```

---

## CI 통합 패턴

### GitHub Actions 예시

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 } # --changed 사용 시 필수
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma migrate deploy
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/test
      - run: pnpm vitest run --changed origin/main --coverage --reporter=json --outputFile=test-results.json
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: test-results.json
```

> CI 명령은 `testing-runner`가 호출. 환경변수 설정 누락 시 setup_failure로 분류해 사용자에게 라우팅.

---

## Path alias·환경변수

### tsconfig path alias

```json
{
  "compilerOptions": {
    "paths": {
      "@pokopia-wiki/shared": ["./shared/src/index.ts"],
      "@/*": ["./src/*"]
    }
  }
}
```

vitest는 `vite-tsconfig-paths` 플러그인으로 인식.

### 환경변수

```ts
// services/api/test/setup.ts
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(__dirname, '../.env.test') })

// 필수 변수 검증
const required = ['DATABASE_URL', 'JWT_SECRET']
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env: ${key}`)
  }
}
```

`.env.test` 는 git에 커밋(테스트 전용 더미 값). `.env.local`은 .gitignore.

---

## 공통 테스트 헬퍼 위치

| 헬퍼 | 위치 |
|------|------|
| Prisma 트랜잭션 롤백 (`withTx`) | `shared/test/with-tx.ts` |
| Hono test app factory | `services/api/test/create-test-app.ts` |
| fixture loader | `services/scraper/test/load-fixture.ts` |
| 공통 fake 데이터 빌더 | `shared/test/builders.ts` |

각 패키지의 `test/` 디렉토리는 빌드 산출물에 포함하지 않도록 `tsconfig.build.json`의 `exclude`에 추가.

---

## 디버깅 팁

### 단일 테스트 디버그

```bash
pnpm vitest run services/api/src/pokemon/pokemon.test.ts \
  -t 'returns 404 for unknown id' \
  --no-threads
```

`--no-threads` 로 단일 프로세스 → 디버거 attach 가능.

### Prisma 쿼리 로그

```ts
const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
})
prisma.$on('query', (e) => console.log(e.query, e.params))
```

테스트 실패 시 어떤 SQL이 실제로 실행됐는지 확인.

### vitest 자체 verbose

```bash
pnpm vitest run --reporter=verbose
```

각 테스트의 진행 상황 라이브 출력.

### 메모리 누수 의심 시

```bash
node --expose-gc node_modules/.bin/vitest run --logHeapUsage
```

heap 변화 모니터.

---

## 안티패턴

- 모든 패키지를 한 vitest 인스턴스에서 실행 (격리 깨짐)
- CI에서 watch 모드
- `setup.ts`에 무거운 셋업 (DB drop·migration·seed) → 매 테스트가 비용 분담
- 환경변수 하드코딩 → 시크릿 누출
- coverage threshold를 vitest config에 강제 → runner의 분석 영역 침해
