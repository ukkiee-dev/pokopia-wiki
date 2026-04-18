---
name: pokopia-doc-consistency
description: Pokopia 4개 핵심 문서(CRAWLING_STRATEGY.md, DATA_COLLECTION_PLAN.md, SCHEMA.md, TECH_STACK.md)의 정합성을 보호한다. 문서를 직접 편집하거나, 신규 Phase/엔티티/ENUM/소스/수량 추정을 도입하거나, 섹션 번호 재조정 시 반드시 이 스킬을 사용한다. TECH_STACK.md에 테스트·CI·관측성 섹션 신설을 금지하고, 문서 간 SSoT 경계를 강제한다.
version: "1.0.0"
---

# Pokopia 문서 정합성 관리

이 스킬은 4개 문서의 **SSoT 경계**를 보호하고 문서 간 **교차 참조 무결성**을 유지한다. 전략·스키마·수집계획·스택 카탈로그가 각자 담당 영역을 침범하지 않도록 감시한다.

## 왜 엄격한 경계가 필요한가

4개 문서가 자유롭게 상호 오버랩하면:
- 동일 정책이 여러 곳에 기술되며 불일치(수량 추정, rate limit, Phase 번호 등) 발생
- 독자가 어느 문서를 신뢰해야 할지 혼동
- 변경 시 누락이 발생(한 곳만 수정하고 다른 곳은 stale)

각 문서의 책임을 고정하고, 참조 가능한 한 곳만 수정하면 나머지는 그 문서를 인용한다.

## SSoT 경계 표

| 문서 | SSoT 대상 | 이 문서에 쓰지 말 것 |
|------|----------|-------------------|
| `CRAWLING_STRATEGY.md` | fetcher·티어·페르소나·rate·동시성·알림·에러·운영·Phase 구조·Zod·robots·백업 | DB 컬럼 상세, 상위 기술 스택 |
| `SCHEMA.md` | DB 엔티티·필드·관계·ENUM·감사 컬럼·polymorphic reward·i18n 테이블 | Phase·수집 방법·크롤링 규칙 |
| `DATA_COLLECTION_PLAN.md` | 페이지 목록·Phase별 수집 스코프·한국어 매핑 우선순위·이미지 수량·검증 규칙·Phase 실행 순서 | fetcher/rate/persona, DB 필드 상세 |
| `TECH_STACK.md` | Runtime·Package Manager·Core Libraries·DB·레포 구조·배포 | 테스트·CI/CD·관측성·운영·스크래핑 윤리·멱등성 (별도 문서로) |

## 🚨 TECH_STACK.md 특별 규칙

**TECH_STACK.md는 스택 카탈로그 문서다.**

사용자 피드백(2026-04-17)에서 명시:
- ❌ Testing 섹션 신설 금지
- ❌ CI/CD 섹션 신설 금지
- ❌ Observability 섹션 신설 금지
- ❌ 스크래핑 윤리/ETL 멱등성 정책 추가 금지
- ✅ 기술 선택, 버전, 선택 근거, 대안 비교만
- ✅ 카탈로그 개선 방향: "결정 미뤄진 항목 확정", "누락된 레이어 추가", "선택 근거/대안 열 보강"

TECH_STACK.md 편집 시 이 규칙을 반드시 통과시킨다. 경계 모호 항목(예: 캐싱 라이브러리 vs 캐싱 정책)은 라이브러리 선택까지만 카탈로그에 포함.

## 워크플로우

### 1. 편집 전 판단

사용자가 문서 편집을 요청하면:
1. 어느 문서가 SSoT인지 식별 (위 표 참조)
2. 변경이 여러 문서에 영향을 주는지 확인 (cross-ref 체크)
3. TECH_STACK에 운영 섹션 추가 시도 여부 확인 → 시도 시 즉시 거부·대안 제안

### 2. 편집 실행

1. 해당 문서의 **개정 이력** 섹션에 엔트리 추가 (날짜 + 변경 요지)
2. 본문 수정
3. Cross-ref 갱신 (다른 문서의 참조가 이 섹션을 가리키는지 확인)
4. 수량·Phase·ENUM 값 동기화

### 3. 편집 후 정합성 체크

아래 체크리스트를 항상 수행:

- [ ] SCHEMA.md의 `i18n.source` ENUM == CRAWLING_STRATEGY §27.1 `SourceSiteEnum` + extension(manual/pending) == DATA_COLLECTION_PLAN §4.1
- [ ] 엔티티 수량이 DATA_COLLECTION_PLAN §10 vs SCHEMA.md 모델 개수 일관
- [ ] Phase 번호 재조정 시 양 문서의 모든 Phase 레퍼런스 갱신
- [ ] 신규 소스 추가 시: CRAWLING_STRATEGY §1.3, §15, TECH_STACK §2.1 fetcher 표, SCHEMA i18n source ENUM, DATA_COLLECTION_PLAN §4.1 모두 갱신
- [ ] `item_location.method` ENUM과 §2.27 신설 테이블 참조 일관 (Trade/Litter 등)
- [ ] `entity_image.entity_type` ENUM이 실제 관련 테이블과 1:1 매핑
- [ ] Polymorphic reward를 쓰는 테이블 목록(SCHEMA §1.3)과 개별 섹션 reward_type ENUM 합집합 일치

## 흔한 함정과 대응

### 함정 1: Phase 번호 혼동

- DATA_COLLECTION_PLAN의 Phase 1~9 (수집 계획, 엔티티 그룹)
- CRAWLING_STRATEGY의 Phase -2~7 (실행 순서, 워밍/Preflight 포함)

인용 시 반드시 `DATA_COLLECTION_PLAN Phase 1` / `CRAWLING_STRATEGY Phase 1`로 문서명을 명시.

### 함정 2: ENUM 복제

`SourceSite` / `i18n.source` 는 서로 관련되지만 값이 다르다:
- `SourceSite`(Zod): `serebii, pokopiaGuide, pokopoko, namuwiki` (4개)
- `i18n.source`(DB): 위 4개 + `pokemon_official, manual, pending` (7개)

SCHEMA.md의 ENUM 확장 시 CRAWLING_STRATEGY §27.1과 DATA_COLLECTION_PLAN §4.1 모두 참조.

### 함정 3: 수량 stale

DATA_COLLECTION_PLAN §10 수량 추정은 초안이다. 실제 크롤링 후 `qa-analyst`가 실측값을 보고하면 반드시 문서 업데이트. 추정 vs 실측 표시는 "~300 (추정)" / "307 (실측, 2026-05-01)" 같이 구분.

### 함정 4: 신규 기술 스택 도입

새 라이브러리 추가 시:
1. TECH_STACK §2.1 Core Stack 표에 행 추가 (선택 근거 포함)
2. CRAWLING_STRATEGY §23.2 Dependencies에 반영 (운영 레이어)
3. 경계 판단: 라이브러리 선택 자체는 TECH_STACK, 해당 라이브러리의 사용 정책은 CRAWLING_STRATEGY

## 개정 이력 포맷

각 문서 상단의 "개정 이력" 섹션:

```markdown
> 개정 이력
> - 2026-04-16: 최초 작성
> - 2026-04-17 (오전): <요지>
> - 2026-04-17 (오후): <요지>
> - 2026-<mm-dd>: <변경 요지 1~2줄>
```

silent edit 금지. 가벼운 오타 수정도 이력에 "typo fix"로 기록.

## 출력 포맷

정합성 리포트는 아래 구조:

```markdown
# 정합성 리뷰: {topic}
날짜: YYYY-MM-DD

## 변경 요청
{요청 내용}

## 영향 범위
- CRAWLING_STRATEGY.md: §X.Y, §A.B
- SCHEMA.md: §1.2, §2.27
- DATA_COLLECTION_PLAN.md: §4.1
- TECH_STACK.md: (해당 없음)

## 발견된 불일치
1. [심각도: HIGH] SCHEMA.md §1.2 `i18n.source` ENUM에 `pokemon_official` 누락...
2. ...

## 권장 조치
1. ...
2. ...

## 편집 완료
- [x] CRAWLING_STRATEGY.md §X.Y
- [ ] (대기 중, 사용자 확인 필요)
```

## 금지 사항

- `git log` 없이 silent edit
- TECH_STACK에 운영 섹션 추가
- 문서 삭제 (파일 단위 삭제는 사용자 확인 필수)
- 수량 추정 임의 조정 (실측값 있을 때만 업데이트)
- 원본 피드백에 반하는 방향으로 문서 재구성

## 참조

- 사용자 피드백: `~/.claude/projects/-Users-ukyi-workspace-pokopia-wiki/memory/feedback_tech_stack_scope.md`
- 프로젝트 개요: `~/.claude/projects/-Users-ukyi-workspace-pokopia-wiki/memory/project_pokopia_wiki.md`
