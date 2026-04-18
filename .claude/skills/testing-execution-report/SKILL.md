---
name: testing-execution-report
description: vitest를 모노레포 인식 모드로 실행하고, 실패를 8개 카테고리로 분류하며, 커버리지 변화를 추적해 사용자 결정에 필요한 형태로 보고하는 절차. 테스트·구현 코드 수정 절대 금지(분석만). flaky 탐지는 3회 재실행 후 판정. testing-runner 에이전트가 사용. 트리거: "테스트 실행", "vitest", "실패 분석", "커버리지 변화", "왜 빨간색", "CI 실패".
version: "1.0.0"
---

# Execution Report — vitest 실행·분석·리포트 절차

vitest 실행 결과를 사용자 의사결정에 필요한 형태로 가공하는 절차. testing-runner 에이전트가 사용한다.

## 절대 규칙

> **테스트 코드도, 구현 코드도 수정하지 않는다. 패치 제안조차 하지 않는다.**

수정은 두 가지를 망친다:
- assertion 완화로 실패 제거 → 회귀를 통과로 위장
- 구현 수정으로 통과 → TDD/리뷰 게이트 우회

이 절차의 출력은 **언제나 분석 리포트**.

## 단계

```
1. SCOPE       → 실행 범위 결정 (--all / --changed / 패키지 / 파일)
2. RUN         → 결정적 명령으로 실행, JSON reporter 사용
3. CLASSIFY    → 실패를 8개 카테고리로 분류, 같은 원인 그룹화
4. FLAKY CHECK → 의심 케이스 3회 재실행, 결과 변동 시 flaky 마킹
5. COVERAGE    → 직전 실행과 라인·브랜치·함수 커버리지 비교
6. REPORT      → 사용자가 다음 행동을 결정할 수 있는 형태로 작성
7. ROUTE       → 실패 원인별로 다른 에이전트 라우팅 권고 (orchestrator에)
```

## 모노레포 실행 명령

### 변경 파일 기반 (CI 친화)

```bash
pnpm vitest run --changed origin/main \
  --reporter=json \
  --outputFile=_workspace/testing/{ts}/05_run.json
```

### 패키지 단독

```bash
pnpm --filter @pokopia-wiki/api vitest run --reporter=json
pnpm --filter @pokopia-wiki/scraper vitest run --reporter=json
pnpm --filter @pokopia-wiki/shared vitest run --reporter=json
```

### 커버리지 포함 전체

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
pnpm vitest run packages/api/src/pokemon --reporter=json
```

> watch 모드 (`vitest` 단독) 절대 사용하지 않는다 — 결정적이지 않음.

## 8개 분류 카테고리

| 분류 | 시그니처 | 예시 |
|------|---------|------|
| **assertion_failure** | `expected X received Y` | 값 불일치 |
| **error_thrown** | 테스트 본문에서 unexpected throw | null reference, type error |
| **timeout** | 테스트 5초 초과 | 비동기 await 누락, deadlock |
| **flaky** | 재실행 시 결과 변동 | 시간·동시성·순서 의존 |
| **setup_failure** | beforeAll/beforeEach 실패 | DB 연결, fixture 누락 |
| **import_error** | 파일 로드 실패 | path alias, 빌드 오류 |
| **type_error** | 런타임 타입 위반 | 외부 응답 shape 변경 |
| **snapshot_drift** | snapshot 매칭 실패 | 의도된 변경 또는 회귀 |

같은 원인의 여러 실패는 묶어서 1건으로 보고 (예: setup_failure 1개로 20개 테스트가 모두 실패).

## flaky 탐지

```
1. 첫 실행에서 실패한 테스트 식별
2. 같은 명령으로 2회 재실행
3. 결과 비교:
   - 3회 모두 실패 → 진짜 실패 (해당 카테고리 유지)
   - 결과 혼재 → flaky 마킹
4. flaky로 판정해도 자동 skip 추가 금지 → 사용자에게 알림만
```

3회 한정. 무한 retry 금지.

## 커버리지 추적

직전 실행과 비교:

```
{
  "lines":     { "previous": 72.3, "current": 74.6, "delta": +2.3 },
  "branches":  { "previous": 65.1, "current": 64.8, "delta": -0.3 },
  "functions": { "previous": 80.0, "current": 81.2, "delta": +1.2 },
  "statements": { "previous": 71.5, "current": 73.7, "delta": +2.2 }
}
```

직전 실행이 없으면 baseline 표시. 임계 위반 판단은 사용자 영역 — 변화량만 보고.

## 리포트 형식

```markdown
# Test Run Report — {timestamp}

## 실행 명령
```
pnpm vitest run --changed origin/main --coverage ...
```

## 요약
- 통과: 142
- 실패: 7
- skip: 3
- flaky: 1
- 실행 시간: 23.4s

## 실패 분류

### assertion_failure (4건, 같은 원인)
- 파일: `packages/api/src/pokemon/pokemon.service.ts`
- 원인: `findById` 가 `null` 대신 `undefined` 반환
- 영향 테스트: 4건
- **권장 라우팅:** tdd-guide (구현 또는 spec 검토)

### setup_failure (2건, 같은 원인)
- 파일: `packages/shared/test/setup.ts`
- 원인: `DATABASE_URL` 환경변수 누락
- 영향 테스트: 20건이 같은 setup 사용 (모두 실패)
- **권장 라우팅:** 사용자 (환경 설정)

### snapshot_drift (1건)
- 파일: `packages/scraper/src/serebii/pokemon.test.ts`
- 원인: parsed JSON snapshot 불일치
- **권장 라우팅:** fixture-keeper (회귀 분류)

## flaky
- `packages/api/src/pokemon/pokemon.controller.test.ts > pagination order`
- 3회 중 1회 실패
- **추정 원인:** 정렬 안정성 부족 또는 동시성

## 커버리지 변화
- lines: 72.3 → 74.6 (+2.3)
- branches: 65.1 → 64.8 (-0.3)  ← 감소 주의
- functions: 80.0 → 81.2 (+1.2)

## 권장 다음 액션
1. setup_failure → DATABASE_URL 설정 (가장 광범위 영향)
2. assertion_failure → tdd-guide에게 spec 재검토 의뢰
3. snapshot_drift → fixture-keeper에게 회귀 분류 의뢰
4. flaky → 정렬 안정성 강화 검토 (즉시 skip 추가 비추천)
```

## 라우팅 매트릭스

| 분류 | 권장 라우팅 |
|------|----------|
| assertion_failure (구현 문제) | testing-tdd-guide (spec/구현 재검토) |
| assertion_failure (테스트 문제) | testing-augmenter (assertion 강화) |
| error_thrown (에러 핸들링 누락) | testing-augmenter (에러 경로 보강) |
| timeout | 사용자 (비동기 누락 패턴) |
| flaky | 사용자 (격리 강화 결정) |
| setup_failure | 사용자 (환경/인프라) |
| import_error | 사용자 (빌드/path) |
| type_error | 사용자 (타입 강화) |
| snapshot_drift | testing-fixture-keeper (회귀 분류) |

## 산출물

- raw 결과: `_workspace/testing/{ts}/05_run.json`
- 분석 리포트: `_workspace/testing/{ts}/05_analysis.md`
- 커버리지 비교: `_workspace/testing/{ts}/05_coverage_delta.md`

## 안티패턴

| 안티패턴 | 이유 |
|---------|------|
| 테스트 자동 수정 | 회귀 위장 |
| 구현 자동 수정 | 게이트 우회 |
| `--update` 자동 실행 | snapshot 무음 갱신 |
| flaky 자동 skip | 진짜 버그 은폐 |
| 커버리지 임계 자체 판정 | 사용자 정책 침해 |
| watch 모드 | 결정적이지 않음 |
| 타임아웃 무한 (5분 이상) | 무한 루프 가능, 강제 종료 필요 |
