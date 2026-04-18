# Hono 테스트 패턴

`services/api`에서 사용하는 Hono 통합·단위 테스트 패턴 모음. testing-tdd-guide 와 testing-augmenter 가 참조한다.

## 목차
1. [기본 원칙](#기본-원칙)
2. [`app.request()` 통합 테스트](#apprequest-통합-테스트)
3. [미들웨어 테스트](#미들웨어-테스트)
4. [에러·404·405 처리](#에러404405-처리)
5. [인증·권한 테스트](#인증권한-테스트)
6. [Validator (Zod) 테스트](#validator-zod-테스트)
7. [엣지 케이스 카탈로그](#엣지-케이스-카탈로그)

---

## 기본 원칙

- **HTTP 서버 띄우지 않는다** — `app.request()`로 직접 핸들러 호출. 빠르고 결정적.
- **단위 테스트보다 라우트 단위 통합 테스트** — Hono의 강점. 미들웨어·검증·핸들러 전체를 한 번에 검증.
- **Prisma는 트랜잭션 롤백** — 자세한 패턴은 `prisma-isolation.md`.
- **외부 호출은 fetch mock** — `vi.spyOn(global, 'fetch')` 또는 `msw`.

---

## `app.request()` 통합 테스트

```ts
import { describe, expect, test } from 'vitest'
import { app } from './app'

test('GET /pokemon/:id returns 200 for known id', async () => {
  const res = await app.request('/pokemon/1')
  expect(res.status).toBe(200)
  const json = await res.json()
  expect(json.pokedex_no).toBe(1)
})
```

### POST + body

```ts
test('POST /pokemon creates record', async () => {
  const res = await app.request('/pokemon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source_slug: 'bulbasaur', ... }),
  })
  expect(res.status).toBe(201)
})
```

### 헤더·쿼리

```ts
test('GET /pokemon respects locale header', async () => {
  const res = await app.request('/pokemon/1', {
    headers: { 'accept-language': 'ko' },
  })
  const json = await res.json()
  expect(json.name).toBe('이상해씨')
})
```

---

## 미들웨어 테스트

미들웨어 단독 테스트보다 **미들웨어 적용된 라우트 통합 테스트**가 실효적.

```ts
test('rate limit middleware returns 429 after 100 requests', async () => {
  for (let i = 0; i < 100; i++) {
    await app.request('/pokemon/1')
  }
  const res = await app.request('/pokemon/1')
  expect(res.status).toBe(429)
  expect(res.headers.get('retry-after')).toBeTruthy()
})
```

---

## 에러·404·405 처리

```ts
test('returns 404 for unknown route', async () => {
  const res = await app.request('/nonexistent')
  expect(res.status).toBe(404)
})

test('returns 405 for unsupported method', async () => {
  const res = await app.request('/pokemon/1', { method: 'PATCH' })
  expect(res.status).toBe(405)
  expect(res.headers.get('allow')).toContain('GET')
})

test('returns 500 with safe message on internal error', async () => {
  // service mock으로 throw 유도
  vi.spyOn(pokemonService, 'findById').mockRejectedValueOnce(new Error('db down'))
  const res = await app.request('/pokemon/1')
  expect(res.status).toBe(500)
  const json = await res.json()
  expect(json.error).not.toContain('db down') // 내부 메시지 노출 금지
})
```

---

## 인증·권한 테스트

```ts
test('returns 401 without authorization header', async () => {
  const res = await app.request('/me')
  expect(res.status).toBe(401)
})

test('returns 401 with expired token', async () => {
  const expired = signToken({ userId: 1, exp: Date.now() / 1000 - 60 })
  const res = await app.request('/me', {
    headers: { authorization: `Bearer ${expired}` },
  })
  expect(res.status).toBe(401)
})

test('returns 403 for other user resource', async () => {
  const userBToken = signToken({ userId: 2 })
  const res = await app.request('/users/1/profile', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${userBToken}` },
  })
  expect(res.status).toBe(403)
})
```

---

## Validator (Zod) 테스트

Hono `@hono/zod-validator` 사용 시:

```ts
test('returns 422 for missing required field', async () => {
  const res = await app.request('/pokemon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}), // source_slug 누락
  })
  expect(res.status).toBe(422)
  const json = await res.json()
  expect(json.errors).toContainEqual(
    expect.objectContaining({ path: ['source_slug'] })
  )
})

test('returns 422 for type mismatch', async () => {
  const res = await app.request('/pokemon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source_slug: 123 }), // string 기대
  })
  expect(res.status).toBe(422)
})
```

---

## 엣지 케이스 카탈로그

augmenter가 후보로 제시할 표준 케이스:

| 카테고리 | 케이스 |
|---------|--------|
| Content-Type | XML/form-data를 JSON 라우트로 보낼 때 |
| 빈 body | POST에 빈 body |
| 매우 큰 body | 1MB+ |
| 인코딩 | UTF-8 BOM, EUC-KR |
| 특수문자 라우트 | `%2F`, `..`, null byte |
| 페이지네이션 | `page=0`, `page=-1`, `limit=10000` |
| 동시 요청 | 같은 리소스 동시 PATCH (lock 검증) |
| CORS | Origin 누락, preflight |
| Rate limit | 경계 (100→101) |
| Streaming | 응답 중단 후 재요청 |
| 멱등성 | 같은 POST 두 번 (Idempotency-Key) |

---

## fetch mock 패턴

외부 API 의존 시:

```ts
import { vi } from 'vitest'

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 })
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('handles 5xx from upstream', async () => {
  vi.mocked(global.fetch).mockResolvedValueOnce(
    new Response('upstream down', { status: 503 })
  )
  const res = await app.request('/proxy/pokemon/1')
  expect(res.status).toBe(502) // bad gateway
})
```

복잡한 mock 시나리오는 `msw` 도입 검토.

---

## 안티패턴

- 실제 HTTP 서버 띄우기 (`serve(app)`) → 느리고 포트 충돌
- `app.fetch()` 직접 호출 (Hono 내부, 변경 가능) → `app.request()` 사용
- 핸들러 함수만 단위 테스트 → 미들웨어·검증 누락
- 모든 외부 의존을 mock → 통합 회귀 못 잡음
