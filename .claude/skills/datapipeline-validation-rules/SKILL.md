---
name: datapipeline-validation-rules
description: 데이터 파이프라인의 검증 규칙을 설계하는 방법론. 스키마 제약, 참조 무결성, 비즈니스 규칙, 통계 기반 이상 탐지, 검증 위치(source/staging/warehouse/mart), 실패 라우팅(block/quarantine/warn/accept), 심각도 매트릭스, 규칙 관리 방식을 산출한다. "데이터 검증 규칙", "데이터 품질", "quality rules", "validation framework", "data quality", "anomaly detection 설계", "quarantine 설계", "SLO 품질" 같은 요청에 반드시 이 스킬을 사용한다. 단순 체크 함수 작성이 아니라 "어떤 규칙을 어디에서 어떻게 강제할 것인가"를 설계해야 할 때 특히 유용.
version: "1.0.0"
---

# Validation Rules Design

데이터 파이프라인의 품질 규칙을 설계하는 방법론. 각 단계에서 어떤 불변을 강제하고, 위반 시 어떻게 대응하며, 어떤 통계적 이상을 감지할지 체계화한다.

## 작성 목표

산출물은 `_workspace/datapipeline/{ts}/03_validation_rules.md`. 구현자가 규칙 카탈로그를 읽고 코드/SQL/DSL로 옮길 수 있어야 하고, 운영자가 심각도·실패 라우팅을 보고 대응할 수 있어야 한다.

## 설계 원칙

- **조기 검증, 상류 우선** — 문제는 들어온 곳에서 잡는다. staging 이전에 차단 가능한 규칙은 최대한 앞으로 이동.
- **차단과 격리 구분** — 차단(block)은 파이프라인 중단(critical만). 격리(quarantine)는 문제 레코드만 분리, 나머지는 통과.
- **규칙은 데이터처럼 관리** — 규칙 목록을 테이블/YAML로 관리하여 배포 없이 수정 가능하게 설계.
- **통계 규칙에는 baseline 필수** — "이상"은 기준이 있어야 한다. rolling window(7d, 30d) 또는 사용자 정의 임계.
- **모든 규칙에 심각도와 라우팅** — 규칙에 "무엇이 일어나야 하는가"가 없으면 의미 없다.
- **침묵 실패 금지** — accept도 집계한다. 실제로 얼마나 위반되는지 측정해야 규칙을 튜닝할 수 있다.
- **규칙이 스키마 제약으로 표현 가능하면 스키마로 이동** — 중복 제거, DB 보장이 파이프라인 검증보다 강하다.

## 워크플로우

### Step 1: 입력 확인

- 리더 브리프의 도메인 지식·품질 SLA를 Read
- schema-designer의 `01_schema_design.md` Read → 이미 스키마 제약으로 표현된 규칙 파악
- etl-engineer의 `02_etl_design.md` Read → 단계 목록 (검증 삽입 위치 후보)

### Step 2: 심각도 매트릭스 정의

규칙의 심각도와 실패 라우팅을 매핑한다:

| 심각도 | 의미 | 기본 라우팅 | 예시 |
|--------|------|-------------|------|
| critical | 파이프라인 안전 위협 | **block** (파이프라인 중단) | 소스 스키마 불일치, 중복 PK |
| high | 비즈니스 영향 큼 | **quarantine** (해당 레코드만 격리) | 필수 FK 누락, 금액 음수 |
| medium | 품질 저하, 다운스트림 영향 가능 | **warn** (로그 + 메트릭) | nullable 필드의 비정상 null 증가 |
| info | 관찰용 | **accept** (집계만) | 설명 필드 길이 증가 |

심각도는 규칙별 판단이지만, 기본 원칙: **critical은 드물게, info는 풍부하게**. 모든 규칙이 critical이면 운영 불가.

### Step 3: 규칙 카탈로그 작성

규칙은 다음 카테고리로 분류하고 각 항목을 카탈로그에 등록:

#### 3-1. 스키마 검증 (대부분 스키마 제약으로 이동 권장)
- 타입 일치
- nullability
- enum 값 범위
- 포맷 (ISO-8601 날짜, 이메일, UUID, URL)
- 길이·정밀도 범위

#### 3-2. 참조 무결성
- FK 대상 존재 (외래키 참조가 실제 존재하는가)
- 고아 레코드 (부모 없는 자식 레코드)
- 조인 테이블 양방향 정합성 (N:M 중 한쪽만 있는 경우 감지)

#### 3-3. 비즈니스 규칙
- 도메인 불변
  - 수치 범위 (가격 > 0, 수량 ≥ 0)
  - 날짜 순서 (종료일 ≥ 시작일)
  - 조합 제약 (상태 X일 때 필드 Y 필수)
- 크로스 레코드 규칙
  - 합계 일치 (주문 합계 = 아이템 합계)
  - 유일성 (동일 키 중복 불허)
- 상태 전이
  - 허용된 상태 변화 시퀀스
  - 이전 상태 필요 조건

#### 3-4. 통계 기반 이상 탐지
- 볼륨 이상 (일일 행 수가 baseline 대비 ±N%)
- null 비율 변화 (컬럼 null율이 baseline ±N%)
- 고유값 수 변화 (distinct count 변화)
- 분포 드리프트 (수치 컬럼 평균·분산, 범주 컬럼 비율)
- 처리량 이상 (특정 시간대 볼륨 급변)

baseline 정의가 필수. 신규 파이프라인은 "첫 30일 수집 후 baseline 설정, 그 전은 warn만".

#### 3-5. 참조 데이터(lookup) 일치성
- 마스터/코드 테이블에 등록된 값인가
- 미등록 코드의 처리 (격리 / 허용 / 차단)
- lookup 업데이트 주기와의 정합성

#### 규칙 카탈로그 필드

각 규칙은 다음 필드를 가진다:

| 필드 | 설명 |
|------|------|
| rule_id | `VAL-{카테고리}-{순번}` 형식 (예: VAL-SCH-001) |
| category | schema / reference / business / statistical / lookup |
| target | 대상 테이블·컬럼·엔티티 |
| rule | 규칙 표현식 (SQL 또는 DSL 또는 자연어) |
| severity | critical / high / medium / info |
| routing | block / quarantine / warn / accept |
| stage | 실행 위치 (source/staging/warehouse/mart/post-load) |
| frequency | per-record / per-batch / periodic |
| baseline | 통계 규칙의 기준 (해당 시) |
| owner | 규칙 소유 팀/담당자 |
| description | 규칙 목적·비즈니스 맥락 |

### Step 4: 검증 위치 매핑

각 규칙을 파이프라인 어느 단계에서 실행할지 결정:

- **source/staging** — 타입·포맷·스키마 검증. 빠른 실패.
- **staging → warehouse 로드 직전** — 참조 무결성, 비즈니스 규칙 core.
- **warehouse** — 크로스 레코드 규칙, 통계 검증.
- **mart / post-load** — 다운스트림 소비자용 검증.

규칙 하나가 여러 단계에서 실행될 수 있다(심층 방어). 단, 중복이 심하면 오버헤드 증가.

### Step 5: 실패 격리(quarantine) 설계

격리 테이블 스키마:

| 컬럼 | 타입 | 설명 |
|------|------|------|
| quarantine_id | UUID | PK |
| rule_id | VARCHAR | 위반 규칙 |
| severity | VARCHAR | 심각도 |
| source_table | VARCHAR | 원본 테이블 |
| source_row_key | JSONB | 원본 식별자 (PK 값) |
| violating_values | JSONB | 문제 컬럼·값 (PII 마스킹) |
| error_message | TEXT | 검증 실패 메시지 |
| quarantined_at | TIMESTAMP | 격리 시각 |
| run_id | VARCHAR | 파이프라인 실행 ID |
| resolved_at | TIMESTAMP | 해결 시각 (nullable) |
| resolution | VARCHAR | accepted / fixed / discarded |

**격리 데이터 생애 주기:**
- 보존 기간 정의 (예: 90일)
- 해결 절차 정의 (누가 검토, 어떻게 fix, 어떻게 재주입)
- 양 증가 임계 알림 (특정 규칙이 대량 격리하면 차단 승격 검토)

### Step 6: 통계 규칙 baseline 설계

규칙별로:
- 윈도우 (rolling 7d / 30d / 주간 평균)
- 임계 (절대값 / 상대값 / 표준편차 배수)
- 급격한 변화 감지 (y/y, d/d)
- baseline 저장 위치 (메타 DB / feature store)
- baseline 갱신 주기

예:
- "일일 레코드 수는 rolling 14d 평균의 ±30% 이내"
- "column X의 null 비율은 rolling 7d 평균의 ±2 표준편차 이내"
- "distinct customer_id 수는 전일 대비 50% 이상 변하지 않음"

### Step 7: 규칙 관리 방식

규칙을 어떻게 저장·수정할지:
- **DB 테이블** — 규칙을 `validation_rules` 메타 테이블에 저장, UI 또는 SQL로 수정. 배포 없음.
- **YAML/JSON 설정** — 파이프라인 저장소의 설정 파일. 코드 리뷰 가능, 배포 필요.
- **코드** — 규칙을 함수로 구현. 복잡 규칙에 적합. 배포 필요.

권장: 단순 규칙은 DB/YAML, 복잡 규칙은 코드. 어느 레이어에 어떤 방식을 쓸지 표로 명시.

### Step 8: 사후 수정·재검증 절차

- 규칙 수정 후 과거 데이터 재검증이 필요한가
- 규칙 추가 시 기존 quarantine 재분류 절차
- 규칙 완화/강화 시 downstream 영향 평가

## 산출물 템플릿

```markdown
# 03 Validation Rules

## 가정(Assumptions)
- 품질 SLA: ...
- baseline 데이터 가용성: ...
- 격리 데이터 보존: ...

## 심각도 매트릭스
| 심각도 | 라우팅 | 기준 | 예시 |
|--------|--------|------|------|
| critical | block | ... | ... |
| high | quarantine | ... | ... |
| medium | warn | ... | ... |
| info | accept | ... | ... |

## 규칙 카탈로그

### 스키마 검증
| rule_id | target | rule | severity | routing | stage | description |
|---------|--------|------|----------|---------|-------|-------------|
| VAL-SCH-001 | ... | ... | ... | ... | ... | ... |

### 참조 무결성
(동일 형식)

### 비즈니스 규칙
(동일 형식)

### 통계 기반 이상 탐지
| rule_id | target | metric | baseline | threshold | severity | routing |
|---------|--------|--------|----------|-----------|----------|---------|
| VAL-STA-001 | ... | ... | rolling 14d | ±30% | medium | warn |

### 참조 데이터 일치성
(동일 형식)

## 검증 위치 매핑
| 단계 | 실행 규칙 |
|------|-----------|
| source | VAL-SCH-* (일부) |
| staging | VAL-SCH-*, VAL-REF-*, VAL-BUS-* (레코드 단위) |
| warehouse | VAL-BUS-* (크로스 레코드), VAL-STA-* |
| mart | VAL-LKP-* |

## 격리(Quarantine) 스키마
(quarantine 테이블 DDL 또는 컬럼 명세)

## 격리 데이터 생애 주기
- 보존 기간: ...
- 해결 절차: ...
- 양 증가 임계: ... 초과 시 차단 승격 검토

## 통계 baseline 전략
- 윈도우: ...
- 갱신 주기: ...
- 저장 위치: ...
- 신규 파이프라인 초기 정책: ...

## 규칙 관리 방식
| 규칙 카테고리 | 저장 방식 | 변경 절차 |
|---------------|-----------|-----------|
| schema | YAML | PR 리뷰 |
| business | DB 테이블 | UI 수정 + 승인 |
| statistical | DB 테이블 | ... |

## 사후 수정 절차
- 규칙 수정 시 과거 재검증: ...
- quarantine 재분류: ...

## 대안 및 트레이드오프
### 대안 A: 전방위 검증 (많은 규칙)
- 장점: 높은 품질 보장
- 단점: 처리 오버헤드, 운영 부담
- 적합 조건: ...

### 대안 B: 선택적 검증 (핵심 규칙만)
- ...

## 열린 질문
```

## 팀 협업 체크리스트

- [ ] schema-designer와 제약 중복 제거 합의 (DB 제약으로 이동할 규칙 분리)
- [ ] etl-engineer와 검증 삽입 지점 합의 (stage 경계)
- [ ] observer에게 규칙 ID·심각도·알림 우선순위 공유
- [ ] quarantine 테이블을 schema-designer에게 전달 (스키마 문서에 반영)
- [ ] "열린 질문"을 리더에게 SendMessage

## 금지 사항

- 모든 규칙을 critical + block 설정 (운영 불가)
- 규칙을 코드에 하드코딩하고 관리 계획 미제시
- baseline 없는 통계 임계
- quarantine 데이터의 생애 주기 미정의
- 검증 실패 원인 추적 불가능한 포맷 (rule_id·컬럼·값 필수)
- 규칙 수정 시 과거 데이터 재검증 계획 생략
