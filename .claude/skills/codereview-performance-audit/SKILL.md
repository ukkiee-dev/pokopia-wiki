---
name: codereview-performance-audit
description: 코드의 성능 병목·자원 낭비·확장성 문제를 감사한다. N+1 쿼리, 인덱스 누락, 비동기 순차 처리, 메모리 누수, 알고리즘 복잡도, 캐싱 미스, 번들 크기, ReDoS를 점검하고 공통 finding YAML로 기록한다. "성능 리뷰", "퍼포먼스 감사", "병목 분석", "확장성 점검", "메모리 누수 탐지" 요청 시 반드시 사용. 종합 코드 리뷰 팀의 성능 감사자가 호출.
version: "1.0.0"
---

# Performance Audit

코드의 성능 병목을 실제 운영 부하 맥락에서 감사하여 공통 finding YAML로 기록.

## 감사 절차

### Step 1: 핫패스 식별

1. 사용자 요청마다 실행되는 코드 경로:
   - HTTP 핸들러, GraphQL resolver, RPC endpoint
   - 웹소켓 이벤트 처리
   - 프론트엔드: 컴포넌트 렌더, 상태 업데이트
2. 배치/관리자 경로와 구분 — 심각도 보정에 사용
3. `/health`, `/metrics` 같은 고빈도 엔드포인트 주의

### Step 2: DB 접근 패턴

#### N+1 쿼리
- 반복문 안에서 쿼리 실행:
  ```typescript
  for (const user of users) {
    const posts = await db.post.findMany({ where: { userId: user.id } });
  }
  ```
- ORM의 lazy loading이 반복문 안에서 트리거되는 경우

해결: `include`/`join`, `IN` 쿼리로 배치화, DataLoader 패턴

#### 기타
- `SELECT *` 후 일부 필드만 사용 (불필요한 I/O)
- 인덱스 없는 컬럼에 `WHERE`
- 트랜잭션 범위 과다 (필요 없는 쿼리까지 포함)
- 연결 풀 고갈 가능 설계 (connection leak)

### Step 3: 비동기 처리

#### 순차 await → 병렬화 가능

**문제:**
```typescript
const a = await fetchA();  // 100ms
const b = await fetchB();  // 100ms — a와 독립적
// 총 200ms
```

**개선:**
```typescript
const [a, b] = await Promise.all([fetchA(), fetchB()]);
// 총 100ms
```

독립적 await 체인을 모두 검출.

#### 기타
- `await` 누락 → Promise 누수, 에러 무시
- `.then()` 체이닝 중 에러 경로 누락
- `async` 함수가 실제로는 동기(불필요한 Promise 래핑)
- `setInterval`/`setTimeout`의 cleanup 부재 (메모리 누수)
- event loop 블로킹: 동기 `fs.readFileSync`, 동기 crypto, `JSON.parse` on huge object

### Step 4: 메모리

- **누수**: 이벤트 리스너 미제거, closure에 큰 객체 캡처, 모듈 레벨 accumulator
- **불필요한 복사**: spread 과다(`{...large, ...more}`), 배열 복사 반복
- **버퍼링**: 스트리밍 가능한 데이터를 전체 버퍼링(`fs.readFile` vs `fs.createReadStream`)
- **사용 후 미해제**: WebSocket, DB connection, timer, file handle

### Step 5: 알고리즘 복잡도

- **O(n²) 내 `includes`/`indexOf`**: Array → Set/Map 변환 권장
- **중첩 반복문**: 데이터 크기 n이 클 때 치명적
- **정렬 반복**: `sort` in loop, 매 iteration마다 같은 정렬
- **불필요한 재계산**: 메모화 가능한 순수 함수의 반복 호출

### Step 6: 캐싱

- **무캐시 핫패스**: 반복 네트워크/계산 호출에 캐시 부재
- **부적절한 cache key**: 너무 세밀(적중률 낮음) 또는 너무 넓음(데이터 충돌)
- **invalidation 누락**: 쓰기 후 캐시 갱신 안 함
- **stale 허용 범위 없음**: stale-while-revalidate 패턴 후보

### Step 7: 네트워크/I/O

- **직렬 HTTP**: 독립 호출이 순차 → `Promise.all` 후보
- **connection 재사용**: HTTP/1.1 keep-alive, HTTP/2, gRPC 재사용
- **페이로드 크기**: 압축 미사용, 불필요 필드 전송
- **pagination 부재**: 수만 건 조회를 한 번에

### Step 8: 프론트엔드 (해당 시)

- **불필요 리렌더**: `useMemo`/`useCallback` 누락, 객체/배열 리터럴 prop
- **큰 리스트**: 가상화(virtualization) 부재, 1000+ 아이템 렌더
- **번들 크기**: 전체 lodash import, 거대 SVG inline, 동기 import 남용
- **이미지**: 최적화 부재, lazy loading 없음

### Step 9: 정규식

- **ReDoS 후보**: 중첩 quantifier(`(a+)+`), 교차 alternation(`(a|a)+`)
- **반복 compile**: 루프 안에서 `new RegExp(...)` — 밖으로 호이스팅

### Step 10: 로깅 비용

- `JSON.stringify(largeObject)` in hot path
- 프로덕션에서 debug 레벨 활성
- 로그 레벨 체크 전 문자열 포매팅(비싼 연산)

## 발견 기록 규칙

- ID: `PERF-NNN` (001부터)
- 필드: `codereview-orchestrator/references/finding-schema.md` 준수
- 심각도: `codereview-orchestrator/references/severity-matrix.md`의 성능 영역 기준
- **성능 전용 필드 활용:**
  - `complexity`: 예 `O(n²)`, `O(n log n)`
  - `expected_improvement`: 예 `10x for N>1000`
  - `measurement_hint`: 검증 방법 제안

### description 작성

- 복잡도 명시: "N개 요소에 대해 O(N²), N=10000일 때 1억 비교"
- 핫패스 여부: "사용자 요청마다 실행됨"
- 가정은 가정이라 밝힘: "N이 대체로 1000 이상으로 추정됨"

### recommendation 작성

- 구체적 대안 코드
- 예상 개선 폭 ("10배~100배, N 크기에 비례")
- 측정 방법: "autocannon으로 p99 비교", "console.time으로 측정"
- 우선순위: 핫패스 > 배치 > 관리자

## 교차 이슈 시그널

| 발견 | 공유 대상 | 메시지 |
|------|----------|--------|
| ReDoS 후보 | security-auditor | "정규식 catastrophic backtracking, DoS 벡터" |
| 무제한 루프/쿼리 | security-auditor | "레이트리밋 부재 + 이 무거운 쿼리 = DoS 용이" |
| 구조적 반복 I/O | architect-auditor | "레이어 설계 때문에 N+1 필연적, 구조 개편 필요" |
| 과도 복잡한 함수 | style-auditor | "성능 병목이 코드 복잡도와 겹침" |

## 출력 예시

```yaml
auditor: performance
scope:
  mode: all
  files_reviewed: 87
  generated_at: 2026-04-17T10:40:00Z
findings:
  - id: PERF-001
    severity: high
    category: performance
    title: 핫패스에서 N+1 쿼리 (사용자별 포스트 조회)
    location:
      file: src/api/users/[id]/feed.ts
      line: 18-28
      snippet: |
        const users = await db.user.findMany();
        for (const user of users) {
          user.posts = await db.post.findMany({
            where: { userId: user.id }
          });
        }
    description: |
      사용자 수 N에 대해 1 + N회 쿼리. 사용자 100명이면 101회 DB 왕복.
      피드 엔드포인트는 사용자 요청마다 호출되는 핫패스.
    impact: |
      - 요청당 지연: N=100 기준 약 500ms~2s (DB 왕복 시간 × 101)
      - 동시 요청 시 connection pool 고갈 가속
      - DB 부하 비례 증가로 확장성 상한 낮음
    recommendation: |
      include 또는 IN 쿼리로 1~2회 쿼리로 축소:
        const users = await db.user.findMany({
          include: { posts: true }
        });
      또는 DataLoader 패턴 (배치 + 캐싱). Prisma의 경우 `include`로 충분.
    confidence: high
    complexity: "O(N) DB round-trips → O(1)"
    expected_improvement: "50x-100x latency reduction for N≥50"
    measurement_hint: "autocannon -c 10 -d 30 /api/feed, p99 비교"
    related_findings: []
```

## 측정 권장

- 감사 단계에서 실제 벤치마크는 실행하지 않음 (정적 분석만)
- `measurement_hint`에 측정 방법 제안 (autocannon, k6, Clinic.js, py-spy, pprof 등)
- 실제 측정은 사용자가 수행하도록 안내

## 협업

- 메모리 누수/무한 루프 조건은 리더에게 즉시 SendMessage
- 보안 감사자의 ReDoS/DoS 관련 발견에 성능 측면 의견 추가
- 프로젝트의 성능 관련 문서(CLAUDE.md, benchmarks/)가 있으면 Read로 확인

## 금지 사항

- 벤치마크 없이 "X가 Y보다 빠르다" 단정
- 마이크로 최적화 집착 (`i++` vs `++i` 같은)
- 아키텍처 개편 수준의 제안 (architect-auditor에게 이관)
- N 크기가 불명인데 critical 판정
