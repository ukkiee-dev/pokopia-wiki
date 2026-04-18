# 리포트 통합 가이드

4명 감사자의 YAML 산출물을 단일 Markdown 리포트로 병합하는 절차.

## 입력

```
_workspace/codereview/{timestamp}/
├── 01_architect_findings.yaml
├── 02_security_findings.yaml
├── 03_performance_findings.yaml
└── 04_style_findings.yaml
```

각 파일은 `finding-schema.md` 규격. 리더가 순차 Read.

## 출력

사용자 지정 경로 또는 기본 `CODE_REVIEW_REPORT.md`. 최종 리포트 구조:

```markdown
# Code Review Report

## 요약
[한 단락: 전체 발견 수, 영역별 카운트, 최고 심각도]

## 심각도 집계
| 심각도 | 아키텍처 | 보안 | 성능 | 스타일 | 합계 |
|-------|---------|------|------|--------|------|
| critical | ...

## 교차 영역 이슈 (⚠️ 최우선)
[related_findings가 연결된 발견들 — 복수 감사자가 동의한 이슈]

## Critical & High 발견
[영역별로 critical → high 순으로 나열]

### 🏛️ 아키텍처
...

### 🔒 보안
...

### ⚡ 성능
...

### 🎨 스타일
...

## Medium 발견 (요약)
[표 형태로 간단히]

## Low / Info 발견 (집계)
[카운트와 대표 예시 1~2개]

## 검토 필요 (상충 / 저신뢰)
[감사자 간 판단 상충, 또는 confidence: low 발견]

## 부록
- 리뷰 범위: ...
- 감사자별 파일 수: ...
- 생성 시각: ...
```

## 통합 절차

### Step 1: 파싱

각 YAML을 Read하여 리스트로 병합:

```
all_findings = []
for auditor in [architect, security, performance, style]:
    yaml_data = yaml_parse(read(f"0{N}_{auditor}_findings.yaml"))
    if yaml_data == null:
        mark_as_failed(auditor)  # 리포트 상단에 "X 감사 실패" 명시
        continue
    all_findings.extend(yaml_data.findings)
```

**파싱 실패 처리:**
- 1회 SendMessage로 해당 감사자에게 재생성 요청
- 재실패 시 원본 YAML을 그대로 리포트 부록에 첨부, "구조화 실패" 태그

### Step 2: 교차 이슈 탐지

`related_findings`가 명시된 발견 + 발견되지 않았지만 **파일:line이 ±10 이내 겹치는** 발견을 교차 이슈로 묶는다.

```
cross_cutting_groups = []
for f in all_findings:
    if f.related_findings not empty:
        group = [f] + [find(id) for id in f.related_findings]
        cross_cutting_groups.append(group)

# 위치 기반 추가 탐지
for f1, f2 in pairs(all_findings):
    if f1.auditor != f2.auditor:
        if same_file(f1, f2) and abs(f1.line - f2.line) <= 10:
            if no_existing_group_contains(f1, f2):
                cross_cutting_groups.append([f1, f2])
```

각 그룹은 리포트 상단의 "교차 영역 이슈" 섹션에 표시.

### Step 3: 정렬

1. **교차 이슈 먼저** — 심각도 최대값 기준 정렬
2. **영역별 섹션** — 각 영역 내에서 severity 순(critical → info), 동률이면 confidence 순(high → low)
3. **같은 파일의 발견은 인접 배치** — 수정 시 한 번에 처리할 수 있도록

### Step 4: 요약 섹션 생성

- 전체 발견 수
- 영역×심각도 매트릭스 (표)
- 최고 심각도 3개 발견의 제목
- 교차 이슈 개수

**예시 요약 문단:**
```
총 47개 발견: architecture 12, security 8, performance 15, style 12.
critical 2건(보안), high 9건. 6개 교차 이슈 중 3건이 보안+성능 영역.
최우선: SEC-001(SQL injection), SEC-003(하드코딩된 시크릿), PERF-007(핫패스 N+1).
```

### Step 5: Critical & High 본문

각 발견을 다음 형식으로:

```markdown
#### [{ID}] {title}

**심각도:** {severity} | **신뢰도:** {confidence} | **위치:** `{file}:{line}`

```
{snippet}
```

**문제:** {description}

**영향:** {impact}

**권장 수정:**
{recommendation}

{related_findings가 있으면 "관련: [IDs]" 추가}
```

### Step 6: Medium 요약 테이블

Medium은 본문 대신 테이블:

```markdown
| ID | 제목 | 파일 | 라인 | 권장 |
|----|------|------|------|------|
| ARCH-005 | ... | src/... | 42 | 요약 |
```

### Step 7: Low/Info 집계

영역별로 개수와 대표 예시 1~2개만:

```markdown
### 스타일 Low/Info (23건)
- 매직 넘버 반복 (12건) — ESLint `no-magic-numbers` 규칙 권장
- JSDoc 누락 (8건) — 공개 API에 한정
- 대표 예시: `STYLE-045` src/utils/time.ts:12 `86400` 매직 넘버
```

### Step 8: 검토 필요 섹션

- 감사자 간 상충: A가 문제라 지적했지만 B가 반대 의견
- `confidence: low` 발견들

별도 섹션으로 분리 — 사용자 판단에 맡김.

## 병합 규칙

### 동일 이슈 중복 제거

두 감사자가 동일 이슈를 보고했을 때(file+line+유사 title):
- 더 구체적인 쪽을 본문에, 다른 쪽을 "also reported by" 주석으로 병합
- severity는 더 높은 쪽 채택
- recommendation은 양쪽을 결합

### 상충하는 판단

- A: "이 방식이 문제" vs B: "이 방식이 적절"
- 삭제하지 않음. "검토 필요" 섹션에 둘 다 기록
- 출처 명시: "architect-auditor는 X를 권고, style-auditor는 Y를 권고"

### ID 충돌 방지

감사자별 접두사(ARCH/SEC/PERF/STYLE)로 이미 분리되어 있음. 통합 리포트는 원본 ID 유지.

## 리포트 품질 검증

리포트 생성 후 자가 점검:

- [ ] 모든 critical/high가 본문에 있는가
- [ ] 교차 이슈 섹션에 related_findings가 반영되었는가
- [ ] 심각도 집계 표의 합계가 전체 발견 수와 일치하는가
- [ ] 모든 발견에 파일:line이 있는가
- [ ] 감사 실패(파싱 오류 등)가 리포트에 명시되었는가
- [ ] `_workspace/` 중간 산출물이 보존되었는가

## 사용자에게 보고

리포트 경로 + 3~5줄 요약:

```
리포트: CODE_REVIEW_REPORT.md

- 총 47개 발견: critical 2, high 9, medium 18, low 15, info 3
- 최우선: SQL injection(SEC-001), 하드코딩된 시크릿(SEC-003)
- 교차 이슈 6건 — 보안+성능 영역에 집중
- 검토 필요 3건(감사자 간 판단 상충)
- 중간 산출물: _workspace/codereview/20260417-1032/
```
