# Prisma 격리 패턴

`packages/shared`의 Prisma + Postgres 환경에서 테스트 격리를 위한 패턴. 테스트 간 상태 누수 방지가 핵심.

## 목차
1. [전략 비교](#전략-비교)
2. [트랜잭션 롤백 패턴 (권장)](#트랜잭션-롤백-패턴-권장)
3. [Truncate 패턴](#truncate-패턴)
4. [Testcontainers 패턴](#testcontainers-패턴)
5. [엣지 케이스 카탈로그](#엣지-케이스-카탈로그)
6. [성능 팁](#성능-팁)

---

## 전략 비교

| 전략 | 격리 강도 | 속도 | 적용 범위 |
|------|----------|------|----------|
| **트랜잭션 롤백** | 강 | 빠름 | 단위·통합 테스트 |
| **Truncate** | 중 | 보통 | 통합 테스트, FK 많을 때 |
| **DB 재생성** | 강 | 느림 | E2E, 마이그레이션 검증 |
| **Testcontainers** | 강 | 셋업 비용 | CI, 격리된 Postgres 인스턴스 |

기본은 **트랜잭션 롤백**. 트리거·DDL 테스트만 Truncate 또는 재생성.

---

## 트랜잭션 롤백 패턴 (권장)

각 테스트가 `BEGIN` → 작업 → `ROLLBACK`. 테스트 종료 후 DB 상태 변화 없음.

### 기본 셋업

```ts
// packages/shared/test/setup.ts
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

export async function withTx<T>(
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return await prisma.$transaction(async (tx) => {
    const result = await fn(tx as PrismaClient)
    throw new RollbackSignal(result)
  }).catch((e) => {
    if (e instanceof RollbackSignal) return e.value
    throw e
  })
}

class RollbackSignal<T> extends Error {
  constructor(public value: T) { super('rollback') }
}
```

### 사용

```ts
import { withTx } from '@pokopia-wiki/shared/test'

test('createPokemon persists record', async () => {
  await withTx(async (tx) => {
    const created = await tx.pokemon.create({
      data: { source_slug: 'bulbasaur', ... },
    })
    expect(created.id).toBeTruthy()

    const found = await tx.pokemon.findUnique({ where: { id: created.id } })
    expect(found).toMatchObject({ source_slug: 'bulbasaur' })
  })
  // 트랜잭션 종료 후 DB에 'bulbasaur' 없음
})
```

### 라우트 통합 테스트와 결합

Hono 핸들러가 prisma 의존이면, 테스트마다 트랜잭션 클라이언트 주입:

```ts
test('POST /pokemon creates record', async () => {
  await withTx(async (tx) => {
    const app = createApp({ prisma: tx })
    const res = await app.request('/pokemon', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source_slug: 'bulbasaur', ... }),
    })
    expect(res.status).toBe(201)
  })
})
```

> 핸들러가 글로벌 prisma 싱글톤을 쓰면 주입 불가 → DI 구조로 리팩터 권고.

---

## Truncate 패턴

트랜잭션 롤백이 어려운 경우 (예: DDL 테스트, 트리거 검증):

```ts
beforeEach(async () => {
  await prisma.$executeRaw`
    TRUNCATE TABLE
      pokemon_i18n,
      pokemon_specialty,
      pokemon
    RESTART IDENTITY CASCADE
  `
})
```

- FK 순서 주의 (CASCADE 권장)
- `RESTART IDENTITY` 로 시퀀스 초기화
- 매 테스트마다 호출되므로 느림

---

## Testcontainers 패턴

CI에서 격리된 Postgres 인스턴스가 필요할 때:

```ts
import { PostgreSqlContainer } from '@testcontainers/postgresql'

let container: StartedPostgreSqlContainer
let prisma: PrismaClient

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test')
    .start()

  process.env.DATABASE_URL = container.getConnectionUri()
  await execa('pnpm', ['prisma', 'migrate', 'deploy'])
  prisma = new PrismaClient()
}, 60_000)

afterAll(async () => {
  await prisma.$disconnect()
  await container.stop()
})
```

장점: 완전 격리, 병렬 실행 가능
단점: 컨테이너 시작 비용 (10~30초)

---

## 엣지 케이스 카탈로그

augmenter가 후보로 제시할 Prisma 표준 케이스:

| 카테고리 | 케이스 |
|---------|--------|
| UNIQUE 위반 | 동일 `source_slug` 두 번 INSERT → P2002 |
| FK 위반 | 존재하지 않는 `pokemon_id`로 i18n INSERT → P2003 |
| NOT NULL 위반 | required 필드 누락 |
| 트랜잭션 부분 실패 | 두 INSERT 중 두 번째 실패 → 첫 번째도 롤백 |
| 동시 INSERT | 같은 UNIQUE 키로 동시 INSERT 두 건 (lock 검증) |
| `findUnique` 부분 키 | composite key 일부만 전달 → 컴파일 에러 또는 런타임 |
| N+1 발견 | `findMany` + 루프 안에서 `findUnique` → 쿼리 카운트 검증 |
| Connection pool 고갈 | 동시 트랜잭션 50개 |
| 마이그레이션 호환 | 기존 데이터 + 새 마이그레이션 적용 |
| Soft delete 혼용 | `deletedAt` 있는 레코드 조회 결과 |

### 쿼리 카운트로 N+1 검증

```ts
test('findAllWithI18n does not have N+1', async () => {
  await withTx(async (tx) => {
    // seed 100 pokemon + i18n
    for (let i = 0; i < 100; i++) {
      await tx.pokemon.create({ data: { ... } })
    }

    let queryCount = 0
    tx.$on('query', () => { queryCount++ })

    await pokemonService.findAllWithI18n(tx)

    expect(queryCount).toBeLessThanOrEqual(2) // 1 SELECT pokemon + 1 SELECT i18n
  })
})
```

---

## 성능 팁

- 트랜잭션 롤백 패턴은 트랜잭션 1개당 비용이 작음 → 가장 빠른 격리
- 테스트 DB는 `synchronous_commit = off`, `fsync = off` 로 속도 향상 (테스트 전용)
- migration은 `beforeAll` 1회, 매 테스트마다 재실행 금지
- CI에서는 vitest `--maxConcurrency=4` 정도로 DB 동시 접근 제어

## 안티패턴

- 매 테스트마다 DB drop·create
- prisma 글로벌 싱글톤 사용으로 트랜잭션 격리 불가
- mock prisma — Prisma는 SQL을 정확히 실행하므로 mock하면 SQL 회귀 못 잡음
- 테스트 간 의존 (`테스트 1이 만든 데이터를 테스트 2가 사용`)
- 트랜잭션 안에서 외부 HTTP 호출 (트랜잭션 길어짐)
