# Severity Rules — Phase Audit

감사자가 finding을 생성할 때 `severity` 필드에 적용할 판정 기준. Pokopia 도메인 특화 Critical 조건을 codereview-orchestrator의 일반 기준 위에 덧붙인다.

## 3단계 심각도

### Critical — 블로킹 + 루프

Phase 통과를 막고 구현자에게 수정을 요구하는 수준. `VERDICT: LOOP_REQUIRED`로 이어진다.

**일반 기준 (codereview-orchestrator 참조):**
- 인증·인가 결함, 인젝션, 시크릿 하드코딩, 암호화 오용
- SQL/API 성능 치명 (N+1, 타임아웃 유발)
- 순환 import, 레이어 경계 붕괴
- 데이터 무결성 위반

**Pokopia 특화 Critical:**

| 조건 | 근거 문서 |
|---|---|
| SCHEMA.md 엔티티/필드 정의 위반 | SCHEMA.md |
| DATA_COLLECTION_PLAN Phase별 요구사항 미이행 | DATA_COLLECTION_PLAN.md |
| 4문서(CRAWLING/DATA/SCHEMA/TECH) SSoT 경계 위반 | pokopia-doc-consistency |
| TECH_STACK.md에 테스트/CI/관측성 섹션 신설 | user memory: feedback_tech_stack_scope |
| 교차 참조 깨짐 (cooking→item, pokemon→specialty, crafting result_item→item) | pokopia-quality-gate |
| 파싱 실패율 임계 초과 (Serebii 5%, PokopiaGuide 3%, pokopoko 10%, namu.wiki 15%) | pokopia-quality-gate |
| Attribution 필드(`sourceUrl`/`license`/`copyrightHolder`/`attribution`) 누락 | 저작권 요구 |
| SourceMetadata 주입 누락 (`buildSourceMetadata` 미호출) | pokopia-page-parser |
| Zod safeParse 실패 시 `data/invalid/` 격리 로직 누락 | pokopia-page-parser |
| 한국어 커버리지 목표 미달 (포켓몬 100% / 아이템 90% / 메커니즘 80%) | pokopia-i18n-mapper |
| 과잉 스텔스 (지문 조작 등 명시적 금지 기법) | pokopia-tier-crawler |
| robots.txt 우회 | pokopia-tier-crawler |
| persona 간 cookie 공유 / 시크릿 로그 노출 | pokopia-ops-runner |
| circadian scheduler 우회 | pokopia-tier-crawler |

### Warning — 기록 + 통과

리포트에 기록하지만 Phase는 통과. 다음 Phase나 별도 작업으로 이어질 후보.

**일반 기준:**
- 성능 최적화 여지 (명백한 N+1 아님)
- 스타일 일관성 이슈
- 문서 개선 제안
- 재사용 가능 패턴 간과

**Pokopia 특화 Warning:**
- `SELECTOR_VERSION` bump 없는 셀렉터 변경
- healthScore 기반 cooldown 로직 없음
- 드라이런 옵션 (`--dry-run --source X --page Y --limit N`) 누락
- 1:1 확장 테이블 분리 규칙 위반 (food/lost_relic/trade_valuation)
- 4문서 간 용어 불일치 (의미 충돌 아님)
- 수량 추정치와 실측 괴리 30% 이상

### Info — 로그만

리포트 본문에는 집계만 표시. 참고 사항·관찰 노트.

**일반 기준:**
- 마이너 스타일 지적
- 미래 개선 아이디어
- 정보성 관찰

## 판정 시 유의사항

1. **감사자 재량 존중:** 리더는 감사자의 severity를 재평가하지 않는다. 상충 시 양측 기록.
2. **근거 명시:** Critical 판정 시 `rule` 필드에 이 문서의 어떤 항목인지 참조 (예: `rule: "schema-md-violation"`).
3. **재감사 시 태그:** 이전 감사 리포트가 주어진 경우 각 finding에 `prev_status: resolved|partial|unresolved|regressed` 추가.
4. **신뢰도:** low `confidence`는 severity와 별개. Critical이지만 confidence=low면 리포트 "검토 필요" 섹션으로 분리.
5. **임계값 회피 금지:** Critical을 피하려 임계값을 임의로 완화하는 수정은 `regressed`로 판정.

## 참조

- codereview 일반 severity: `codereview-orchestrator/references/severity-matrix.md`
- finding 스키마: `docs/finding-schema.md`
