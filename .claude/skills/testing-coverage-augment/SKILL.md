---
name: testing-coverage-augment
description: 기존 코드의 누락된 엣지·에러 경로 테스트를 보강하는 절차. 정상 경로 자동 생성 절대 금지(트로피 테스트 안티패턴 회피). 10개 카테고리 + 도메인 특화(Hono/Prisma/Scraper) 후보 발굴 → 사용자 우선순위 게이트 → 승인된 케이스만 작성. testing-augmenter 에이전트가 사용. 트리거: "엣지 케이스 보강", "에러 경로 추가", "negative test", "이 모듈 테스트 부족".
version: "1.0.0"
---

# Coverage Augment — 엣지·에러 경로 보강 절차

기존 코드에 누락된 부정 케이스만 골라 테스트를 추가하는 절차. testing-augmenter 에이전트가 사용한다.

## 절대 규칙

> **정상 경로(happy path) 테스트를 자동 생성하지 않는다.**

이유: 구현을 보고 만든 정상 경로 테스트는 구현이 틀리면 같이 틀린다. 회귀 방어 능력이 0이다. 정상 경로는 testing-tdd-guide의 영역.

사용자가 명시적으로 정상 경로 추가를 요구해도 거부하고 tdd-guide로 라우팅한다.

## 단계

```
1. SCAN     → 대상 파일 + 인접 테스트 파일 Read
2. INVENTORY → 이미 커버된 케이스 목록화
3. CANDIDATES → 누락 후보를 10개 카테고리 + 도메인 특화로 발굴
4. PRIORITIZE → 심각도 × 발생 가능성 매트릭스로 정렬
5. GATE     → 사용자에게 상위 5개 제시, 승인받기
6. WRITE    → 승인된 케이스만 1개씩 작성
7. RUN      → runner에게 즉시 실행 의뢰
8. REVIEW   → 통과한 부정 케이스 점검 (assertion 약함 의심)
```

## 10개 카테고리

| 카테고리 | 발굴 질문 |
|---------|----------|
| **경계값** | 빈/단일/최대 입력에서 어떻게 동작하는가? 0, 음수, undefined, null은? |
| **타입 경계** | 잘못된 타입 입력 시? NaN, Infinity, 객체 대신 배열은? |
| **시간** | 자정·윤년·DST·타임존이 영향을 주는가? |
| **동시성** | 같은 요청이 동시에 오면? 트랜잭션 충돌·중복 INSERT는? |
| **외부 실패** | 네트워크 타임아웃·5xx·malformed 응답은? |
| **DB 제약** | UNIQUE/FK/NOT NULL 위반 시 어떤 에러? |
| **인증·권한** | 토큰 만료·권한 부족·다른 사용자 자원 접근? |
| **입력 검증** | 빈 문자열·공백·매우 긴 입력·SQL/XSS payload? |
| **i18n** | 비-ASCII 키·다국어 정렬·누락된 locale? |
| **회복** | 재시도·멱등성·부분 실패 복구는? |

## 도메인 특화

### Hono API 후보 발굴

- 잘못된 Content-Type (`application/xml`을 받으면?)
- 인증 미들웨어 우회 (`Authorization: Bearer ` 빈 토큰)
- 페이지네이션 경계 (`?page=0`, `?page=-1`, `?limit=10000`)
- 라우트 파라미터 특수문자 (`/pokemon/%2F`, `/pokemon/..`)
- 동시 요청 시 응답 일관성 (예: 카운터 증가)
- CORS·rate limit 경계
- Response streaming 중단

### Prisma + Postgres 후보 발굴

- 트랜잭션 내 부분 실패 → 롤백되는가
- `findUnique`에 부분 키 → 적절한 에러
- N+1 쿼리 발생 시나리오 (의도적 트리거 후 카운트)
- soft delete vs 실제 delete 혼용 시 조회 결과
- 마이그레이션 후 schema drift 감지
- Connection pool 고갈

### Scraper 후보 발굴

- HTML 구조 변경 (셀렉터 깨짐) → 명시적 에러
- 빈 페이지 / 404 / 5xx 응답
- 인코딩 깨짐 (Shift_JIS, EUC-KR 응답)
- robots.txt 변경
- 부분 응답 / 스트리밍 중단
- 너무 큰 페이지 (메모리 부담)

## 우선순위 매트릭스

심각도(가로) × 발생 가능성(세로):

|         | 심각도 낮 | 중 | 높 | critical |
|---------|----------|----|----|----------|
| 일상적   | low      | mid | high | **must** |
| 가끔     | nit      | low | mid | high |
| 드묾     | skip     | nit | low | mid |
| 거의 없음 | skip     | skip | nit | low |

`must`와 `high`는 강력 권고, `mid`는 권고, `low`/`nit`는 사용자 판단, `skip`은 후보에서 제외.

## GATE — 사용자 검토

후보 리스트를 다음 형식으로 제출:

```markdown
# 보강 후보 — services/api/src/pokemon/pokemon.service.ts

| # | 카테고리 | 케이스 | 우선순위 |
|---|---------|--------|---------|
| 1 | DB 제약 | source_slug 중복 시 PRISMA_P2002 처리 | **must** |
| 2 | 입력 검증 | 빈 문자열 source_slug 입력 시 422 | high |
| 3 | 동시성 | 동일 source_slug 동시 INSERT | high |
| 4 | 시간 | scrapedAt이 미래 시각인 경우 | mid |
| 5 | 인증 | 다른 사용자의 pokemon 수정 시 403 | high |

추가할 케이스를 선택해주세요 (번호 또는 "전부"/"must만"). 위 외에 추가 케이스 요청도 가능합니다.
```

승인 없이 작성하지 않는다.

## WRITE — 케이스 작성 규칙

각 테스트:
- 1개의 부정 케이스만 (묶음 금지)
- 이름은 케이스를 평서문으로: `'returns 422 when source_slug is empty'`
- AAA 구조 (Arrange / Act / Assert)
- 가능하면 기존 `*.test.ts`에 append, 카테고리 다르면 `*.edge.test.ts` 신설

```ts
test('throws PRISMA_P2002 on duplicate source_slug', async () => {
  await prisma.$transaction(async (tx) => {
    // Arrange
    await tx.pokemon.create({ data: { source_slug: 'bulbasaur', ... } })
    // Act + Assert
    await expect(
      tx.pokemon.create({ data: { source_slug: 'bulbasaur', ... } })
    ).rejects.toMatchObject({ code: 'P2002' })
  })
})
```

## REVIEW — 통과한 부정 케이스 점검

부정 케이스가 통과하면 의심한다:
- assertion이 너무 약한가? (`toBeTruthy()` 대신 구체적 expectation)
- 구현이 우연히 처리하는가? (테스트가 의도한 부분이 아닌 다른 곳에서 처리)

의심 발견 시 케이스 보정 또는 폐기.

## 산출물

- 후보 리스트: `_workspace/testing/{ts}/03_augment_candidates.md`
- 추가된 테스트: 모듈 인접 (`*.edge.test.ts` 또는 기존 파일 append)
- 작업 로그: `_workspace/testing/{ts}/03_augment_log.md`

```markdown
# Augment Log

## 대상: services/api/src/pokemon/pokemon.service.ts

## 후보 발굴: 12개
## 사용자 승인: 5개 (must 3 + high 2)
## 작성: 5개
## 실행 결과: 4 PASS, 1 FAIL

### FAIL 분석
- `throws on negative pokedex_no` → 구현이 음수를 허용 중. tdd-guide로 라우팅 권고.

### 통과 의심 케이스
- 없음
```

## 안티패턴

| 안티패턴 | 이유 |
|---------|------|
| 정상 경로 자동 생성 | 트로피 테스트, 회귀 방어 0 |
| GATE 없이 30개 한꺼번에 추가 | 검토 부담, 품질 보증 불가 |
| 모든 외부를 mock | 실제 동작과 괴리, 통합 회귀 누락 |
| `expect(x).toBeTruthy()` | 구체적 케이스를 모호하게 통과 |
| 한 테스트에 여러 부정 케이스 묶기 | 첫 실패에서 종료, 나머지 검증 안 됨 |
