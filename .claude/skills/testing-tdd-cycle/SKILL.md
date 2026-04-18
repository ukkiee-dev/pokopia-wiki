---
name: testing-tdd-cycle
description: 신규 모듈을 TDD red-green-refactor 사이클로 만드는 절차. 사용자 spec → 실패 테스트 1개 → 사용자 검토 게이트 → 최소 구현 → refactor 권고. Hono 라우트, Prisma 메서드, 스크래퍼 파서별 첫 RED 패턴 제공. testing-tdd-guide 에이전트가 모든 신규 코드 작성 직전 사용한다. 단순 한 줄 추가가 아니라 "기능 단위" 신규 코드일 때 반드시 적용.
version: "1.0.0"
---

# TDD Cycle — Red-Green-Refactor 절차

신규 모듈을 만들 때 반드시 통과해야 하는 사이클. testing-tdd-guide 에이전트가 사용한다.

## 핵심 사이클

```
RED      → 실패하는 테스트 1개 작성, 실행해서 빨간색 확인
GATE     → 사용자에게 보여주고 "spec을 잘 표현했는가" 확인
GREEN    → 통과하는 최소 구현 (상수 반환도 OK)
RUN      → testing-runner에게 실행 의뢰, 초록색 확인
REFACTOR → 중복/이름/구조 개선 권고 (사용자 수락 시 적용)
NEXT     → 다음 행동 1개 선택해서 RED부터 반복
```

한 사이클에 1개 테스트. 한 사이클에 여러 행동 묶기 금지.

## Spec → 첫 RED 변환

사용자 spec은 보통 모호하다. "포켓몬 라우트 만들어줘" → 어떻게 테스트할 것인가? 다음 질문으로 spec을 좁힌다:

1. 입력은 무엇인가? (요청 형태, 파라미터)
2. 관찰 가능한 출력은 무엇인가? (응답 코드, body, side effect)
3. 가장 단순한 케이스는? (정상 1개 또는 부정 1개)
4. 명백한 부정 케이스는? (404, 422 같은 것)

대부분 **명백한 부정 케이스를 첫 RED로** 잡는 게 안전하다. 정상 케이스는 구현이 복잡해서 첫 사이클이 무거워진다.

### Hono 라우트 예시

```ts
// Spec: "GET /pokemon/:id, 없으면 404"
// 첫 RED:
import { describe, expect, test } from 'vitest'
import { app } from './app'

test('GET /pokemon/:id returns 404 for unknown id', async () => {
  const res = await app.request('/pokemon/9999')
  expect(res.status).toBe(404)
})
```

### Prisma 메서드 예시

```ts
// Spec: "createPokemon은 source_slug 중복 시 throw"
// 첫 RED:
test('createPokemon throws on duplicate source_slug', async () => {
  await prisma.$transaction(async (tx) => {
    await createPokemon(tx, { source_slug: 'bulbasaur', ... })
    await expect(
      createPokemon(tx, { source_slug: 'bulbasaur', ... })
    ).rejects.toThrow(/unique/i)
  })
})
```

### 스크래퍼 파서 예시

```ts
// Spec: "parsePokemonPage가 fixture에서 pokedex_no 추출"
// 첫 RED:
import { readFileSync } from 'node:fs'

test('parsePokemonPage extracts pokedex_no', () => {
  const html = readFileSync(
    '__fixtures__/serebii/pokemon/0001.html', 'utf-8'
  )
  const result = parsePokemonPage(html)
  expect(result.pokedex_no).toBe(1)
})
```

> fixture가 아직 없으면 testing-fixture-keeper에게 캡처 요청.

## GATE — 사용자 검토

테스트 작성 직후 사용자에게 다음을 묻는다:

```
다음 RED 테스트를 작성했습니다:

{테스트 코드}

이 테스트가 통과되면 spec이 충족된다고 보십니까?
- [예] 진행 → 최소 구현 단계
- [아니오] spec 재명확화 후 다시 작성
- [수정] {어떻게 바꿔야 할지}
```

승인 없이 GREEN 단계로 넘어가지 않는다.

## GREEN — 최소 구현

원리: **통과시키기 위한 가장 단순한 변경**.

- 상수 반환으로 통과 가능하면 그렇게 한다 (다음 사이클이 일반화 강제)
- 분기·반복은 두 번째 테스트가 강제할 때까지 미룬다 (Triangulation)
- 프로덕션 품질은 refactor 단계의 일

### 예시 진화

```ts
// 사이클 1: GET /pokemon/:id 가 404 반환
app.get('/pokemon/:id', (c) => c.json({ error: 'not found' }, 404))
// 통과. 이건 상수 반환이지만 OK

// 사이클 2: 존재하는 id 는 200 반환
app.get('/pokemon/:id', async (c) => {
  const id = c.req.param('id')
  const found = await prisma.pokemon.findUnique({ where: { id: Number(id) } })
  if (!found) return c.json({ error: 'not found' }, 404)
  return c.json(found)
})
// 일반화는 두 번째 사이클에서
```

## RUN — 실행 의뢰

새 테스트 파일 또는 변경된 파일 경로를 testing-runner에게 전달:

```
SendMessage(to: "runner", body: {
  intent: "tdd_cycle_check",
  files: ["packages/api/src/pokemon/pokemon.test.ts"],
  expect: "RED 또는 GREEN 분기 확인"
})
```

runner는 다음 결과를 회신:
- 의도된 RED인가 GREEN인가
- 통과/실패 사유 한 줄

## REFACTOR — 권고만

GREEN 도달 후 다음 후보를 사용자에게 제시:

| 카테고리 | 예시 |
|---------|------|
| 중복 제거 | 동일 라우트 핸들러의 공통 로직 추출 |
| 이름 개선 | `data` → `pokemonRecord` |
| 책임 분리 | 라우트에서 비즈니스 로직 → service 레이어 |
| 타입 강화 | `any` → 명시적 타입 |

사용자가 거부하면 그대로 종료. 강제 금지.

## NEXT — 다음 사이클

다음 1개 행동을 사용자와 합의하고 RED부터 다시 시작.

권장 순서: 정상 1개 → 부정 1개 → 경계 1개 → 의존 격리 → ...

## 모노레포 컨텍스트별 셋업

### Hono (`packages/api`)
- 테스트 파일: `packages/api/src/{module}/{module}.test.ts`
- vitest 설정: `packages/api/vitest.config.ts` (workspace 인식)
- 통합 테스트는 `app.request()` 사용 (HTTP 서버 띄우지 않음)

### Prisma (`packages/shared`)
- 테스트 파일: 사용 측 패키지에 위치 (`packages/api/...`)
- 격리 패턴: `references/prisma-isolation.md` 참조 (트랜잭션 롤백)
- migration된 테스트 DB 필요 (postgres docker 또는 testcontainers)

### Scraper (`packages/scraper`)
- 테스트 파일: `packages/scraper/src/{source}/{parser}.test.ts`
- fixture는 `packages/scraper/__fixtures__/{source}/`
- live HTTP 금지

자세한 패턴은 `testing-orchestrator/references/{hono-patterns,prisma-isolation,scraper-fixture}.md`.

## 안티패턴

| 안티패턴 | 이유 |
|---------|------|
| 한 사이클에 여러 테스트 | 사이클이 무거워지고 RED 의미 흐려짐 |
| 첫 RED를 거대한 통합 테스트로 | 사용자 검토 부담, 작은 단위로 쪼갤 것 |
| GATE 우회 | 사용자가 spec과 다른 테스트를 통과시켜도 모름 |
| GREEN 후 즉시 다음 RED 작성 | refactor 권고 단계 생략 → 코드 부채 |
| `it('does')` 같은 모호한 이름 | 테스트는 명세, 평서문으로 |

## 출력

- 테스트 파일: 모듈 인접 (`{module}.test.ts`)
- 사이클 로그: `_workspace/testing/{ts}/02_tdd_log.md`

```markdown
# TDD Cycle Log

## Cycle 1
- 시각: 14:32
- RED: `GET /pokemon/:id returns 404 for unknown id`
- 사용자 GATE: 승인
- GREEN: 상수 404 반환
- 실행 결과: PASS
- Refactor: 권고 없음

## Cycle 2
...
```
