# Finding YAML Schema

이 하네스의 감사자는 **`codereview-orchestrator/references/finding-schema.md`의 YAML 스키마를 그대로 재사용한다.** 별도 스키마 신설 금지.

## 왜 재사용하는가

1. 통합 리포트가 codereview 공통 포맷을 이미 사용
2. 감사자(codereview-architect/security/performance/style) 4명은 이미 해당 스키마로 출력
3. Pokopia 특화 감사자(pokopia-doc-strategist, pokopia-qa-analyst, pokopia-ops-conductor 등)도 동일 스키마로 통일하면 병합 비용 0

## 이 하네스가 추가로 요구하는 필드

공통 스키마 위에 **이 하네스 전용 확장 필드**를 finding에 포함한다 (optional):

```yaml
- id: finding-001
  severity: critical              # 공통: critical | warning | info
  category: cross-reference       # 공통
  file: src/parsers/cooking.ts    # 공통
  line: 47                        # 공통
  rule: cross-reference-broken    # 공통 (severity-rules.md 조항명 권장)
  evidence: |                     # 공통
    cooking.ingredient_item_slug "apple" 이 item 테이블에 없음
  suggestion: |                   # 공통
    item 테이블에 해당 slug 추가 or parser에서 정규화 키 맞추기
  confidence: high                # 공통: high | medium | low
  related_findings: []            # 공통: 교차 이슈 id 리스트

  # ↓ 이 하네스 전용 확장 (optional)
  prev_status: unresolved         # resolved | partial | unresolved | regressed (재감사 시)
  phase_context:                  # 어느 Phase의 어떤 맥락인지
    phase: 4
    type: parser
  suggested_implementer: pokopia-page-parser  # 루프백 시 재호출할 구현 스킬
  requires_cross_phase: false     # true면 다른 Phase 재설계 필요 (예: schema 재정의 없이 해결 불가)
```

## 확장 필드 사용 규칙

### `prev_status`
재감사 시 감사자가 이전 리포트를 읽고 각 finding에 대해 판정:
- `resolved`: 완전히 해결됨 (이 루프에서 사라짐)
- `partial`: 일부 해결 (심각도 낮아짐 또는 일부 케이스만 해결)
- `unresolved`: 여전히 동일 상태
- `regressed`: 해결 시도했으나 다른 문제 발생 / 임계값 회피로 숨긴 상태

### `suggested_implementer`
리더가 loopback_directive.md 생성 시 이 필드를 참조하여 어떤 구현 스킬을 재호출할지 결정. 여러 finding이 동일 implementer를 가리키면 1회 호출로 묶는다.

값 후보 (기존 스킬명):
- `pokopia-schema-prisma`
- `pokopia-page-parser`
- `pokopia-tier-crawler`
- `pokopia-i18n-mapper`
- `pokopia-ops-runner`
- `manual` — 자동 구현자 없음, 사용자 수동 수정 필요

### `requires_cross_phase`
`true`인 경우 ESCALATE 판정 쪽으로 기울인다 (단순 구현 스킬 재호출로 해결 불가). 리더는 Phase 롤백 옵션을 사용자에게 제시.

### `phase_context`
여러 Phase에 걸친 감사 (예: schema + parser 동시 변경)에서 finding이 어느 Phase 맥락인지 식별.

## 검증 규칙

리더는 감사자 YAML을 Read 후 파싱 실패 시 1회 재생성 요청. 재실패 시:
- 원본을 리포트에 그대로 첨부
- `category: schema-violation` + `severity: info` finding 추가
- 해당 감사자 결과는 통계에서 제외 (but 보존)

## 참조

- 공통 스키마 원본: `codereview-orchestrator/references/finding-schema.md`
- severity 판정: `docs/severity-rules.md`
