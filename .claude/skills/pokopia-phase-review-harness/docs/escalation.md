# Escalation Procedure

`loop_count >= MAX_RETRY` (기본 3) 또는 무한 루프 의심 시 사용자에게 수동 결정을 요청하는 절차.

## 트리거 조건

다음 중 하나라도 충족 시 `VERDICT: ESCALATE`:

1. `loop_count >= MAX_RETRY` (기본 3회)
2. 동일 Critical이 3회 루프 동안 계속 재현 (구현자가 해결 불가 상태)
3. 루프 중 전혀 새로운 Critical이 추가로 발견 (수정이 다른 부분을 깨는 패턴)
4. 필수 감사자의 2회 이상 실패 (인프라 문제 가능성)

## 사용자에게 제시할 정보

다음 4개 섹션을 반드시 포함한다:

### 1. 미해결 Critical 목록

각 finding에 대해:
- 파일 / 라인
- `rule` (severity-rules.md의 어느 조항 위반인지)
- `evidence` (감사자가 제시한 증거)
- `suggestion` (감사자의 수정 제안)
- `prev_status` 이력 (루프별 변화: `unresolved → partial → unresolved → regressed` 등)

### 2. 루프별 수정 이력

루프마다 어떤 구현 스킬이 호출되었고, 무엇이 변경되었으며, 어떤 finding이 해결/악화되었는지:

```
Loop 1 (초기):
  - 호출된 구현 스킬: pokopia-schema-prisma
  - critical 발견: 5건
  - 주요 지적: SCHEMA.md cooking 6필드 중 2필드 누락

Loop 2 (재시도):
  - 호출된 구현 스킬: pokopia-schema-prisma
  - critical 발견: 3건 (2건 resolved)
  - 새로 추가된 critical: cooking.ingredient_item_slug 교차 참조 깨짐

Loop 3 (재시도):
  - 호출된 구현 스킬: pokopia-schema-prisma + pokopia-page-parser
  - critical 발견: 3건 (동일 재현)
  - 진전 없음
```

### 3. 원인 가설

리더(`pokopia-phase-review-lead`)가 작성한 2-3문장의 원인 가설:
- 구현 스킬이 문제를 이해 못 함
- 계획 문서(SCHEMA.md 등)가 구현 가능하지 않음
- 감사자 간 상충하는 요구사항
- 구현 스킬과 감사자의 해석 차이

### 4. 결정 옵션 3가지

사용자에게 AskUserQuestion으로 제시:

| 옵션 | 설명 | 결과 |
|---|---|---|
| (a) **수동 수정** | 사용자가 직접 파일을 수정. 하네스는 대기. | 사용자 수정 완료 신호 받으면 하네스 재진입 (loop_count 유지) |
| (b) **Warning 강등 + 강제 통과** | 해당 Critical을 Warning으로 강등하고 Phase를 통과시킴. 리포트에 강등 이력 명시. | `VERDICT: PASS (FORCED)`, 다음 Phase 진행. 리스크는 리포트에 누적 기록 |
| (c) **Phase 롤백** | 이번 Phase의 구현 변경을 롤백하고 계획 재수립. 계획 문서가 부적절했을 가능성. | Phase 재설계 단계로 복귀. pokopia-doc-consistency 재실행 권장 |

추가 옵션:
- (d) **다른 구현 스킬 시도** — 현재 자동 선택된 구현 스킬 외 다른 스킬로 수정 시도 (예: schema만 고쳐도 안 되면 parser도 동시에 조정)

## 제시 UX 예시

```
═══════════════════════════════════════════════
[ESCALATE] Phase 2 (parser) 감사 3회 반복 후 Critical 2건 미해결
═══════════════════════════════════════════════

## 미해결 Critical (2건)

1. [CRITICAL] src/parsers/cooking.ts:47
   rule: cross-reference-broken
   evidence: cooking.ingredient_item_slug "apple" 이 item 테이블에 없음
   루프 이력: unresolved → partial → unresolved

2. [CRITICAL] src/parsers/cooking.ts:82
   rule: korean-coverage-below-target
   evidence: 아이템 한국어 커버리지 87% (목표 90%)
   루프 이력: unresolved → unresolved → unresolved

## 루프 이력

Loop 1: pokopia-page-parser 재실행 → 5건 중 2건 resolved
Loop 2: pokopia-page-parser 재실행 → 1건 resolved, 1건 regressed
Loop 3: pokopia-page-parser 재실행 → 진전 없음

## 원인 가설

파서가 생성하는 item 이름이 schema 쪽 item 테이블의 정규화 규칙과 다름.
Phase 1(schema)의 정규화 로직을 parser가 참조하지 않는 것으로 추정.

## 결정 옵션

(a) 수동 수정 — 직접 cooking.ts의 정규화 로직을 schema와 맞춤
(b) Warning 강등 후 Phase 통과 (리스크: 교차 참조 깨진 상태로 다음 Phase)
(c) Phase 롤백 — Phase 1(schema) 재설계부터 다시
(d) pokopia-schema-prisma + pokopia-page-parser 동시 재실행 시도

어떻게 진행할까요?
═══════════════════════════════════════════════
```

## 사용자 응답 처리

- (a): 하네스 대기 모드. 사용자가 "수정 완료" 신호 보내면 `loop_count` 유지한 채 재감사.
- (b): 리포트 상단에 `VERDICT: PASS (FORCED)` + `FORCED_DOWNGRADED_CRITICALS` 섹션 추가. 모든 강등 이력 보존. 호출자에게 PASS 반환.
- (c): 이번 Phase의 변경 파일 목록을 호출자에게 전달. pokopia-doc-consistency 재실행을 권장 메시지에 포함.
- (d): `loop_count += 1`로 재진입하되 지정된 복수 구현 스킬을 동시 호출하도록 loopback_directive.md에 명시.

## 기록 보존

모든 ESCALATE 케이스는 `_workspace/audit/phase-{N}/ESCALATION_LOG.md`에 누적 기록. 향후 동일 패턴 감지 시 참조.
