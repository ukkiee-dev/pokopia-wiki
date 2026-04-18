---
name: datapipeline-observability
description: 데이터 파이프라인의 관측성·모니터링을 설계하는 방법론. SLI/SLO(지연·신선도·완전성·정확성), 메트릭 카탈로그, 로그 구조와 상관관계 ID, 알림 규칙·임계·라우팅, 대시보드 3계층, 런북 매핑, 관측성 자체의 건강 지표를 산출한다. "모니터링 설계", "관측성", "observability", "SLO 설계", "데이터 품질 메트릭", "알림 설계", "대시보드 구조", "런북 작성" 같은 요청에 반드시 이 스킬을 사용한다. 단순 메트릭 목록 나열이 아니라 "신호를 어떻게 행동으로 연결할 것인가"를 설계해야 할 때 특히 유용.
version: "1.0.0"
---

# Pipeline Observability Design

데이터 파이프라인의 건강·성능·품질을 지표화하고, 문제 발생 시 빠르게 원인을 좁힐 수 있는 신호 체계와 대응 절차를 설계하는 방법론.

## 작성 목표

산출물은 `_workspace/datapipeline/{ts}/04_observability_design.md`. 구현자가 메트릭 이름과 라벨을 그대로 Prometheus/OTel 등에 옮길 수 있어야 하고, 운영자가 알림과 런북을 대응에 쓸 수 있어야 한다.

## 설계 원칙

- **RED 중심** — 파이프라인은 서비스적 성격. Rate(처리량) / Errors(실패율) / Duration(지연). 리소스 지표(USE: Utilization/Saturation/Errors)는 인프라 계층에서.
- **메트릭은 의사결정에 쓰여야 함** — "있으면 좋은" 메트릭 금지. 각 메트릭은 "임계 초과 시 누가 무엇을 한다"로 연결.
- **지연 ≠ 신선도** — 지연(latency)은 처리 시간, 신선도(freshness)는 데이터가 얼마나 오래됐는가. 둘 다 SLI로 필요.
- **알림은 적게, 의미 있게** — SLO 위협 수준만 알림. 나머지는 대시보드 관찰. 알림 피로(alert fatigue) 방지.
- **상관관계 ID 필수** — 알림에서 로그·트레이스로 1홉에 이동 가능. run_id/task_id/record_key가 전 계층에 관통.
- **런북 없는 알림 금지** — 알림에 대응 절차가 없으면 알림으로서 무용. 1차 대응 절차를 최소한으로라도 작성.
- **관측성 자체도 관측** — 메트릭·로그 파이프라인 자체의 누락·지연을 감지하는 heartbeat 필수.
- **카디널리티 통제** — 라벨에 고카디널리티 값(user_id, path) 사용 금지. run_id는 트레이스용, 메트릭 라벨 아님.

## 워크플로우

### Step 1: 입력 확인

- 리더 브리프의 SLA·온콜 체계·선호 스택 Read
- schema-designer: 스키마 버전·드리프트 감지 메타 컬럼 확인
- etl-engineer: DAG 구조, 단계별 예상 지연/처리량 확인
- validator: 규칙 ID 목록·심각도·실패 라우팅 확인

### Step 2: SLI/SLO 정의

데이터 파이프라인의 4대 SLI:

#### 2-1. 신선도(Freshness)
- 정의: 목적지 테이블에서 "현재 시각 - 최신 이벤트 시각"의 최대값
- SLO 예: p95 < 2시간, p99 < 4시간 (배치 기준). 스트리밍은 p95 < 5분.
- 측정: 목적지 테이블의 max(event_time) 또는 max(ingested_at)

#### 2-2. 지연(Latency)
- 정의: 소스 이벤트 발생 시각부터 목적지 적재까지의 시간
- SLO 예: p95 < 30분
- 측정: `ingested_at - event_time` 분포

#### 2-3. 완전성(Completeness)
- 정의: 예상 행 수 대비 실제 적재 행 수 비율
- SLO 예: 일일 99.5% 이상 적재
- 측정: source count vs destination count (가능한 경우), 또는 baseline 대비 행 수

#### 2-4. 정확성(Accuracy) / 품질
- 정의: validator 규칙 통과율
- SLO 예: critical 규칙 100% 통과, high 규칙 99% 이상
- 측정: validator 규칙별 성공률 집계

각 SLI에 대해:
- 목표 값 (숫자 또는 범위)
- 측정 윈도우 (시간/일/주)
- 에러 예산 (error budget) 계산 방식
- 위협 수준 (목표 대비 몇 %에서 알림)

### Step 3: 메트릭 카탈로그

메트릭별로 다음 필드 정의:

| 필드 | 설명 |
|------|------|
| name | snake_case 메트릭 이름 (예: `pipeline_rows_processed_total`) |
| type | counter / gauge / histogram / summary |
| unit | 명시적 단위 (records, bytes, seconds, ratio) |
| labels | 저카디널리티 차원 (source, stage, rule_id, severity) — run_id 금지 |
| description | 한 줄 설명 |
| owner | 책임 팀 |
| use | "이 메트릭은 무엇에 쓰는가" — 대시보드? 알림? SLO? |

#### 표준 메트릭 세트

**Rate (처리량):**
- `pipeline_rows_processed_total{source, stage}` — counter
- `pipeline_bytes_processed_total{source, stage}` — counter

**Errors (실패):**
- `pipeline_task_failures_total{stage, reason}` — counter
- `pipeline_validation_failures_total{rule_id, severity}` — counter
- `pipeline_schema_drift_events_total{source}` — counter

**Duration (지연):**
- `pipeline_task_duration_seconds{stage}` — histogram
- `pipeline_end_to_end_latency_seconds{source}` — histogram

**Freshness:**
- `pipeline_data_age_seconds{table}` — gauge (현재 - max(event_time))
- `pipeline_last_successful_run_age_seconds{pipeline}` — gauge

**Quality:**
- `pipeline_validation_pass_rate{rule_id}` — gauge (0~1)
- `pipeline_quarantine_rows_current{table}` — gauge
- `pipeline_quarantine_rows_added_total{rule_id}` — counter

**Observability heartbeat:**
- `pipeline_metrics_last_update_seconds{pipeline}` — gauge
- `pipeline_heartbeat_timestamp{pipeline}` — gauge

### Step 4: 로그 구조 표준

구조화 JSON 로그. 공통 필드:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| timestamp | ISO-8601 UTC | 필수 | 로그 시각 |
| level | info/warn/error/fatal | 필수 | 로그 레벨 |
| pipeline | string | 필수 | 파이프라인 이름 |
| run_id | string | 필수 | 실행 ID |
| task_id | string | 필수 | 태스크 ID (DAG 노드) |
| stage | string | 필수 | 파이프라인 단계 |
| source | string | 조건부 | 관련 소스 |
| message | string | 필수 | 사람이 읽는 메시지 |
| error_code | string | 에러 시 | 분류 코드 |
| rule_id | string | 검증 시 | 위반 규칙 |
| record_key | object | 조건부 | 관련 레코드 식별자 |
| duration_ms | number | 조건부 | 작업 소요 시간 |

**PII 마스킹:** 로그에 원본 값 노출 금지. 민감 값은 해시 또는 마스킹.

**로그 레벨 정책:**
- error/fatal: 실패 + 상세 컨텍스트
- warn: 품질 저하 신호 (validator medium 이상)
- info: 태스크 시작/완료, 체크포인트 업데이트
- debug: 프로덕션 비활성 (필요 시 런타임 활성화 가능)

**보존 정책:** error/warn은 90일, info는 14일, debug는 7일 권장. 조직·규제에 따라 조정.

### Step 5: 상관관계 ID 전략

- **run_id** — 파이프라인 실행 단위. 배치 1회, 스트리밍 세션 등.
- **task_id** — DAG 노드 단위. 재시도는 같은 task_id + 새로운 attempt.
- **record_key** — 레코드 단위. 격리·재주입 시 추적.
- **schema_version** — 소스/목적지 스키마 버전.

로그·메트릭·트레이스 모두에 run_id 관통. 알림에서 log query로 1홉에 진입.

### Step 6: 알림 규칙

알림별로:

| 필드 | 설명 |
|------|------|
| alert_id | `ALERT-{카테고리}-{순번}` |
| trigger | 메트릭/로그 조건 (PromQL/SQL) |
| severity | page / ticket / notify |
| window | 관찰 윈도우 (5분/1시간/1일) |
| suppression | 억제 규칙 (상위 알림 발동 시 하위 억제) |
| routing | 채널 (PagerDuty / Slack / 이메일) |
| runbook_url | 대응 절차 링크 |
| owner | 책임 팀 |

**severity 정의:**
- **page** — 즉시 호출. SLO 위반 임박, critical 실패. 예: "freshness SLO 99% 위반 임박".
- **ticket** — 영업일 내 대응. high 실패, quarantine 급증. 예: "quarantine rows +500% in 1h".
- **notify** — 채널 공지. medium 경고, 추세 변화. 예: "validation medium failure rate up".

**초기 알림 수는 10개 이하로.** 운영 중 필요에 따라 확장. 너무 많은 초기 알림은 신뢰 붕괴.

**기본 권장 알림 세트:**
1. 파이프라인 실행 실패 (task failure) — page
2. freshness SLO 위협 — page
3. validator critical 규칙 위반 — page
4. schema drift 감지 — ticket
5. quarantine 급증 (규칙별 baseline 대비) — ticket
6. heartbeat 부재 (관측성 자체 장애) — page
7. 파이프라인 처리량 급감 (예: -50% vs 일주일 평균) — ticket
8. validator high 규칙 실패율 상승 — ticket

### Step 7: 대시보드 3계층

**Layer 1: 건강 개요 (Executive/Overview)**
- SLI/SLO 현황 (4대 지표 각각)
- 에러 예산 잔량
- 오늘의 실패/경고 수
- 파이프라인별 상태 (green/yellow/red)

**Layer 2: 단계별 성능 (Engineering)**
- 스테이지별 RED 지표
- 체크포인트·오프셋 진행
- 검증 규칙별 통과율 상위 N
- quarantine 추세

**Layer 3: 드릴다운 (Debug)**
- 특정 run_id의 전 태스크 추적
- 특정 rule_id의 최근 실패 로그
- 특정 파티션의 처리 상세

**필터:** 모든 계층에서 pipeline·source·stage·time range 필터 공통.

### Step 8: 런북 매핑

알림별 런북을 `runbooks/{alert_id}.md` 형식으로 관리. 런북 구조:

```markdown
# {alert_id}: {title}

## 의미
이 알림이 켜진다는 것은 ...

## 영향도
- 다운스트림 영향: ...
- 고객 영향: ...

## 진단
1. 대시보드 링크 열기
2. 확인할 메트릭/로그 쿼리
3. 예상 원인 3가지

## 1차 대응
1. {구체적 명령 또는 절차}
2. ...

## 에스컬레이션
- 15분 내 해결 안 되면 {누구}에게
- 근본 원인 불명 시 {팀} 호출

## 사후
- incident 기록 위치
- 재발 방지 체크
```

설계자는 최소 1개 런북(가장 자주 발동 예상되는 알림, 예: freshness SLO 위반)의 템플릿을 제공. 나머지는 팀이 작성하도록 템플릿 + 인덱스 제공.

### Step 9: 관측성 자체의 건강 지표

메트릭·로그 파이프라인이 고장나면 아무 신호도 오지 않는다(silent failure). 최소 다음을 포함:
- **heartbeat 메트릭** — 파이프라인이 정기적으로 보내는 단순 카운터. "부재"가 이상.
- **메트릭 지연 추적** — 메트릭 수집 시스템이 얼마나 오래 전 데이터를 보여주는가
- **이중화 알림 채널** — 주 채널(Slack) 장애 시 보조(이메일/SMS)

이것 없이는 "모든 것이 정상으로 보이는" 장애가 가능하다.

## 산출물 템플릿

```markdown
# 04 Observability Design

## 가정(Assumptions)
- 스택: Prometheus + Grafana (또는 OpenTelemetry)
- 알림 채널: Slack + PagerDuty
- 보존: ...

## SLI / SLO
| SLI | 정의 | SLO | 측정 | 에러 예산 |
|-----|------|-----|------|-----------|
| freshness | ... | p95 < 2h | ... | 1%/월 |
| latency | ... | ... | ... | ... |
| completeness | ... | ... | ... | ... |
| accuracy | ... | ... | ... | ... |

## 메트릭 카탈로그
| name | type | unit | labels | description | use |
|------|------|------|--------|-------------|-----|
| pipeline_rows_processed_total | counter | records | source, stage | ... | 대시보드 |
| ... | | | | | |

## 로그 구조
- 공통 필드: (표)
- PII 마스킹 정책: ...
- 보존 정책: ...

## 상관관계 ID 전략
- run_id: ...
- task_id: ...
- record_key: ...

## 알림 규칙
| alert_id | trigger | severity | routing | runbook |
|----------|---------|----------|---------|---------|
| ALERT-FRESH-001 | `pipeline_data_age_seconds > threshold` for 15m | page | PagerDuty | runbooks/ALERT-FRESH-001.md |
| ... | | | | |

## 대시보드 레이아웃
### Layer 1: 건강 개요
...

### Layer 2: 단계별 성능
...

### Layer 3: 드릴다운
...

## 런북 인덱스
| alert_id | runbook | 상태 |
|----------|---------|------|
| ALERT-FRESH-001 | runbooks/ALERT-FRESH-001.md | 제공 |
| ALERT-TASK-001 | runbooks/ALERT-TASK-001.md | 템플릿 |

## 관측성 자체의 건강 지표
- heartbeat: ...
- 메트릭 지연 추적: ...
- 이중화 알림 채널: ...

## 대안 및 트레이드오프
### 대안 A: Prometheus 중심
- ...
### 대안 B: OpenTelemetry 중심
- ...

## 열린 질문
```

## 팀 협업 체크리스트

- [ ] validator의 규칙 ID를 메트릭 라벨로 사용 (어휘 통일)
- [ ] etl-engineer의 DAG 태스크 이름을 메트릭 stage 라벨로 사용
- [ ] schema-designer에게 스키마 버전 메타 컬럼 요구 (드리프트 감지)
- [ ] schema-designer의 파티션 키를 대시보드 필터로 노출
- [ ] "열린 질문"을 리더에게 SendMessage

## 금지 사항

- 전방위 수집 ("모든 메트릭 모으기") — 비용·노이즈로 실패
- 알림 없이 대시보드만 설계
- 카디널리티 높은 라벨 (user_id, path, run_id를 메트릭 라벨로)
- 상관관계 ID 없이 로그 설계
- 런북 없는 알림 추가
- 관측성 자체의 건강 지표 생략
- SLO 수치를 근거 없이 제시 (업계 벤치마크 또는 "초기 제안" 명시)
