# Phase Profile: docs

**적용 범위:** 4개 SSoT 문서(`CRAWLING_STRATEGY.md`, `DATA_COLLECTION_PLAN.md`, `SCHEMA.md`, `TECH_STACK.md`) 및 관련 부속 문서 변경.

## 대상 아티팩트 패턴

- `CRAWLING_STRATEGY.md`
- `DATA_COLLECTION_PLAN.md`
- `SCHEMA.md`
- `TECH_STACK.md`
- `docs/**/*.md`
- `README.md`

## 감사자 구성

### 필수 감사자 (1명)

| 감사자 이름 | agent_type | 스킬 | 핵심 책무 |
|---|---|---|---|
| pokopia-doc-consistency | `pokopia-doc-strategist` | `pokopia-doc-consistency` | 4문서 간 정합성 (엔티티·Phase·수량·ENUM·소스 정의가 서로 모순 없음), 섹션 번호 재조정, SSoT 경계 (TECH_STACK.md에 테스트/CI/관측성 섹션 금지) 준수 |

### 권장 감사자 (1명)

| 감사자 이름 | agent_type | 스킬 | 핵심 책무 |
|---|---|---|---|
| codereview-style | `codereview-style-auditor` | `codereview-style-audit` | 제목 계층, 링크 무결성, 용어 일관성, 맞춤법, 코드 블록 언어 태그, 표 포맷 |

## Pokopia 특화 Critical 조건

- 4문서 중 어느 하나가 다른 문서에서 정의한 엔티티/Phase/ENUM/소스를 모순되게 변경 (**Critical**)
- 신규 Phase/엔티티/ENUM/소스/수량 추정을 SSoT 문서가 아닌 부속 문서에 도입 (**Critical**)
- TECH_STACK.md에 테스트·CI·관측성·운영 섹션 추가 (**Critical** — 범위 밖 금지)
- 섹션 번호 재조정 후 목차 링크 깨짐 (**Critical**)
- 크롤링 대상 수량 추정이 최근 실측과 30% 이상 괴리 (**Warning**)
- 4문서 간 용어 불일치 (예: "엔티티" vs "테이블" vs "모델") (**Warning**)

## 재감사 체크포인트

문서 변경의 `resolved` 판정은 모순된 다른 문서까지 함께 업데이트되어야 가능. "한쪽만 수정" 상태는 `partial`.

## 교차 조율 패턴

- `doc-consistency` → `style`: 용어 일관성 지적이 단순 표기 문제인지 의미 충돌인지 분류 요청
- `style` → `doc-consistency`: 표/목차 포맷 변경이 의미 변화를 만드는지 확인 요청
