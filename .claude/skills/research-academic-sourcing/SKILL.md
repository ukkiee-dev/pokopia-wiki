---
name: research-academic-sourcing
description: 리서치 팀의 학술 소스 수집 스킬. arxiv·Google Scholar·Semantic Scholar·peer-reviewed 저널·기술 표준(RFC/W3C/ISO)·기관 보고서(IMF/OECD)·meta-analysis/systematic review 등 학술적 깊이가 있는 자료를 조사. peer review 상태·인용 수·방법론·n·저자 소속·철회 여부 평가. 증거 계층(meta-analysis > RCT > cohort > case study > opinion) 인식. 주제에 학술적 근거·장기 연구 흐름·방법론 품질이 필요할 때 반드시 이 스킬을 사용한다.
version: "1.0.0"
---

# 리서치: 학술 소스 수집

이 스킬은 **peer review·기술 표준 수준**의 증거를 수집하고 방법론을 평가하는 방법을 표준화한다. 웹 기사와 달리 학술 자료는 증거 계층·재현성·이해관계가 평가의 축.

## 핵심 원칙

1. **증거 계층 인식** — 모든 논문이 같은 무게가 아니다 (meta > RCT > cohort > case > opinion)
2. **peer review 상태 명시** — preprint vs published 구분
3. **방법론 요약** — n, 기간, 대조군, 한계 1~2줄
4. **인용 추적** — 핵심 주장은 원 논문까지 거슬러 확인
5. **철회·수정 확인** — Retraction Watch 등 체크
6. **이해관계 공개** — industry funding, 저자 소속 이해관계

## 증거 계층 (Hierarchy of Evidence)

```
높음 ┌────────────────────────────────────┐
     │ 1. Meta-analysis / Systematic review│
     │ 2. RCT (randomized controlled trial)│
     │ 3. Cohort study (prospective)       │
     │ 4. Case-control                     │
     │ 5. Cross-sectional                  │
     │ 6. Case study / Expert opinion      │
     │ 7. Preprint (peer review 미완)      │
낮음 └────────────────────────────────────┘
```

분야마다 용어 차이:
- CS/공학: RCT 대신 "benchmark", "ablation study"
- 사회과학: RCT + observational
- 의학: PICO 프레임워크
- 경제학: natural experiment, DID, RCT

## 탐색 경로

### 1) 검색 엔트리 포인트

| 도구 | 용도 |
|------|------|
| `arxiv.org` | 물리·수학·CS preprint |
| `scholar.google.com` | 범용 학술 + 인용 추적 |
| `semanticscholar.org` | AI 추출 메타데이터, citation graph |
| `pubmed.ncbi.nlm.nih.gov` | 의학·생명과학 |
| `ssrn.com` | 사회과학·경제·경영 preprint |
| `biorxiv.org`, `medrxiv.org` | 생명·의학 preprint |
| `connectedpapers.com` | 논문 연결 그래프 시각화 |
| 기관 공식 (RFC, IMF, OECD, NBER) | 표준·정책 |

**도구 호출:** WebFetch로 검색 URL (`https://scholar.google.com/scholar?q=...`), WebSearch에 `site:arxiv.org` 조합.

### 2) 쿼리 템플릿

```
1. 주제 직접:        "{T}" systematic review
                     "{T}" meta-analysis
2. 저자 추적:        "{author_name}" "{T}"
3. 인용 역방향:      {paper_title} cited by
4. 반대 방향:        "{T}" replication OR failure to replicate
5. 최신:             "{T}" 2025..2026
6. 분야 교집합:      "{T}" {methodology_keyword}
```

### 3) 필터링 순서

```
검색 결과 → 제목·초록 훑기
  ├── 관련 높음 → 상세 검토
  ├── 인접 → 주제 확장 가능성 메모
  └── 무관 → 드롭
```

## 논문 상세 검토 (각 핵심 논문)

```markdown
- **제목**: 
- **저자 + 소속**: (1저자·교신 + 주요)
- **저널/컨퍼런스**: (top-tier 여부)
- **연도**: 
- **DOI / arxiv ID**: 
- **peer review 상태**: published / preprint / working paper
- **증거 계층**: meta / RCT / cohort / etc.
- **n**: 샘플 크기 (가능 시)
- **방법론 요약**: (2~3줄)
- **핵심 발견**: (3~5줄)
- **한계 (저자 진술)**: 
- **외부 비평**: (후속 논문, blog 반박 등)
- **이해관계**: (funding, 저자 이해관계)
- **인용 수**: ~N (기준일)
- **철회 여부**: 확인 (없음 or 있음+사유)
```

## 주의해야 할 신호

| 신호 | 의미 | 대응 |
|------|------|------|
| Predatory journal | 품질 의심 저널 | Beall's list 확인, 의심 시 인용 보류 |
| Preprint 단독 | peer review 미완 | "preprint" 명시, 결론 잠정 |
| 높은 인용 but 비판 맥락 | 부정 예시로 인용됨 | 인용 맥락 확인 (긍정 인용인지 부정 인용인지) |
| n 매우 작음 (<30) | 일반화 제한 | 명시 |
| 재현 실패 알려짐 | 원 결론 의문 | 재현 실패 메모 병기 |
| industry funded | 이해관계 | 표기 |
| 20년 이상 된 논문 | 분야 진전 반영 안 됨 | "역사적 자료" 태그 |

## 연구 흐름(연대기) 정리

같은 주제에서 핵심 논문을 시간순으로 배열:

```
2018: A et al. — 가설 제시, 단일 실험실
2021: B et al. — 복제 시도, 부분 확인
2023: C (meta) — n=12 연구 메타분석, 효과 크기 작음
2024: D (preprint) — 새 방법론, 상반 결과 주장
2026: (현재) D의 peer review 진행 중
```

이 흐름이 "현재 합의"인지, "논쟁 중"인지, "초기 가설 단계"인지 판단의 근거.

## 출력 구조

저장 경로: `_workspace/research/{topic-slug}/academic_findings.md`

```markdown
# Academic Findings: {topic}
수집자: research-academic-scholar
수집 일자: YYYY-MM-DD
총 문서: N (meta/review: a, peer-reviewed empirical: b, preprint: c, standard: d)

## 증거 계층 요약

### Top Tier: Meta-analysis / Systematic Review
(있으면 최우선)

### Peer-reviewed Empirical Studies

### Preprints (peer review 미완)

### Technical Standards / Institutional Reports

## 주요 논문 상세

### P1. {Title}
- 저자: ... (Affil)
- 저널: ... (Year)
- DOI/arxiv: ...
- peer review: published
- 증거 계층: RCT
- n: 1,245
- 방법론: (요약)
- 핵심 발견: (3~5줄)
- 한계: ...
- 이해관계: ...
- 인용 수: ~87
- 인용:
  > "원문 발췌"

### P2. ...

## 연구 흐름 (연대기)
- 2018: ...
- 2021: ...
- 2026: ...

## 공백
- "이 주제의 RCT 없음, 관찰 연구만 존재"
- "2020 이후 meta-analysis 없음"

## 철회/수정 확인
- P3 (Smith 2019) — retracted 2022. 원 결론 인용 금지.

## 쿼리 로그
```

## 도구 호출 패턴

### arxiv 검색

```
WebFetch("https://arxiv.org/search/?query={T}&searchtype=all", 
         "Extract: top 10 papers with title, authors, abstract, arxiv ID, year")
```

### Google Scholar 인용 추적

```
WebFetch("https://scholar.google.com/scholar?cites={article_id}",
         "Extract: papers citing this work, their titles, years, arxiv/DOI")
```

### DOI resolution

```
WebFetch("https://doi.org/{DOI}", 
         "Extract: full abstract, methodology, key findings, limitations")
```

### Retraction 확인

```
WebSearch("retraction {paper_title}")
WebFetch("https://retractionwatch.com/?s={T}")
```

## 금지 사항

- preprint를 "연구 결과"로 단언 인용
- 인용 수만으로 품질 판단
- 저널 이름만 보고 신뢰 (predatory 존재)
- 한 논문으로 결론 단정
- 비학술 소스 (기업 블로그, 언론) 인용 — web-investigator 영역
- 철회된 논문 결론 그대로 인용
- 방법론 모르는 채 결과 인용 (메타 수준 요약은 가능하나 세부 수치 단정 금지)

## 학술 ↔ 웹 경계

- **학술**: 피어리뷰·기관 표준·기관 보고서 (IMF/OECD)
- **웹**: 일반 뉴스·기업 프레스·미디어
- **겹치는 영역 (백서·기술 보고서)**: 방법론이 학술 수준(n 공개, 대조군)이면 이 에이전트, 마케팅 성격이면 웹 에이전트

겹치면 양쪽 모두 수집 → cross-validator가 중복 판단.

## 참조

- 에이전트: `.claude/agents/research-academic-scholar.md`
- 오케스트레이터: `.claude/skills/research-conductor/SKILL.md`
