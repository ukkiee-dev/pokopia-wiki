# Phase Profile: qa

**적용 범위:** Phase 7 최종 품질 게이트, 데이터 품질 검증 로직, 교차 참조 실측, 한국어 커버리지 리포트, Attribution 감사.

## 대상 아티팩트 패턴

- `scripts/qa/**/*.ts`
- `src/validation/**/*.ts`
- `_workspace/qa-reports/**/*.md`

## 감사자 구성

### 필수 감사자 (2명)

| 감사자 이름 | agent_type | 스킬 | 핵심 책무 |
|---|---|---|---|
| pokopia-quality-gate | `pokopia-qa-analyst` | `pokopia-quality-gate` | QA 로직 자체의 정확성, 교차 참조 검증 완전성, 한국어 커버리지 계산, Attribution 검증, 이미지 누락 탐지, 경계면(JSON↔DB↔SCHEMA↔문서) 불일치 비교 |
| pokopia-doc-consistency | `pokopia-doc-strategist` | `pokopia-doc-consistency` | QA 기준이 SCHEMA.md·DATA_COLLECTION_PLAN.md와 동기화되어 있는지, 수량 추정이 실측과 일치하는지 |

### 권장 감사자 (1명)

| 감사자 이름 | agent_type | 스킬 | 핵심 책무 |
|---|---|---|---|
| codereview-architecture | `codereview-architect-auditor` | `codereview-architecture-audit` | QA 스크립트 모듈 경계, 재사용성, 검증 로직 중복, 게이트 실패 시 라우팅 정책 |

## Pokopia 특화 Critical 조건

- 교차 참조 검증 누락 (cooking→item, pokemon→specialty, crafting result_item→item 중 하나라도 미검증) (**Critical**)
- 한국어 커버리지 미달 (포켓몬 100% / 아이템 90% / 메커니즘 80%) 발견에도 PASS 처리 (**Critical**)
- Attribution 필드 검증 누락 (**Critical**)
- 파싱 실패율 임계 위반 감지 실패 (**Critical**)
- translation_conflict 리뷰 큐 누락 (**Critical**)
- 수량 실측과 SCHEMA.md 추정치 괴리 >30% 미보고 (**Warning**)
- 이미지 누락 탐지 로직 누락 (**Warning**)

## 재감사 체크포인트

QA Phase 자체는 "검증자의 검증자" 성격. 재감사 시 QA 스크립트의 변경이 이전 critical을 실제로 catch하도록 개선되었는지 확인. 단순 로직 변경으로 회피하는 패턴(예: 임계값 완화)은 `regressed`로 판정.

## 교차 조율 패턴

- `quality-gate` → `doc-consistency`: QA가 찾은 수량 괴리를 문서 업데이트로 연결
- `doc-consistency` → `quality-gate`: 문서 변경이 QA 기준에 반영되어야 하는지 통보
- `architecture` → `quality-gate`: QA 스크립트의 재사용성 개선 제안
