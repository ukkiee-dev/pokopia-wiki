# Pokopia Claude 하네스 컨벤션

`.claude/` 디렉토리의 에이전트·스킬·설정 작성 규약. 일관된 역할 분리와 자동 호출 정확도를 위한 최소 표준이다.

본 컨벤션은 `~/homelab/.claude/CONVENTIONS.md`의 체계를 Pokopia 프로젝트 특성에 맞춰 조정한 것이다. Pokopia는 범용 하네스(codereview·datapipeline·research·testing)를 프로젝트 로컬에 유지하는 정책을 채택한다.

최신 감사 리포트: `docs/CLAUDE_HARNESS_REVIEW.md`

---

## 1. 디렉토리 구조

```
.claude/
├── CONVENTIONS.md               ← 이 문서 (하네스 표준)
├── settings.json                ← 프로젝트 공유 설정 (커밋 대상)
├── settings.local.json          ← 개인 로컬 설정 (gitignore)
├── agents/
│   └── {agent-name}.md          ← 모든 에이전트 정의
└── skills/
    └── {skill-name}/
        ├── SKILL.md             ← **반드시 대문자** (Linux 호환성)
        ├── references/          ← 조건부 로딩 참조 문서
        └── assets/              ← 출력 템플릿 (SKILL.md에 로드되지 않음)
```

**중요 규칙**
- 스킬 본체는 반드시 `SKILL.md` (대문자). `skill.md` 소문자 금지.
- 에이전트·스킬 디렉토리명은 kebab-case.
- 에이전트 파일명은 `{name}.md` (kebab-case).
- Pokopia는 **글로벌 스킬 이관 정책을 채택하지 않는다.** 범용 하네스(codereview·datapipeline·research·testing)도 프로젝트 로컬에 유지. 유지 부담은 단일 프로젝트 정합성과 트레이드오프다.

---

## 2. 에이전트 네이밍 체계

에이전트 이름 접미사는 **역할의 성격**을 반영한다. homelab 19개 표준 접미사에 Pokopia 프로젝트 특화 접미사 9개를 추가 허용한다.

### 2.1 표준 접미사 (homelab 호환)

| 접미사 | 역할 정의 | 작업 기준 | Pokopia 대표 에이전트 |
|--------|---------|---------|-------------|
| `-auditor` | **위험 식별** — 보안·규정 위반을 식별 | 위험 기반 | codereview-security-auditor |
| `-reviewer` | **품질·설계 평가** — 기준 대비 적합성 평가 | 기준 기반 | (향후 추가) |
| `-analyst` | **데이터 분석** — 사용량·패턴 분석으로 숫자 생산 | 데이터 기반 | pokopia-qa-analyst |
| `-researcher` | **외부 자료 조사** — 웹·논문·커뮤니티 수집 | 출처 기반 | (Pokopia는 -scholar/-listener/-investigator 대체 사용) |
| `-engineer` | **생성·변경** — 매니페스트·코드·설정을 만들거나 수정 | 산출물 기반 | datapipeline-etl-engineer |
| `-designer` | **설계·레이아웃** — 구조를 설계 | 설계도 기반 | datapipeline-schema-designer |
| `-builder` | **워크플로우·액션 생성 또는 코드 다량 생성** | 파이프라인 기반 | pokopia-code-builder |
| `-architect` | **초기 설계** — 요구사항을 설계 문서로 전환 | 요구사항 기반 | pokopia-schema-architect |
| `-strategist` | **정책·우선순위 수립** | 트레이드오프 기반 | pokopia-doc-strategist |
| `-writer` | **문서·Runbook·리포트 작성** | 서식 기반 | research-synthesis-writer |
| `-orchestrator` | **최상위 오케스트레이터 리더** (Pokopia 특화) | 팀 조율 기반 | codereview-orchestrator, testing-orchestrator |

### 2.2 Pokopia 프로젝트 추가 허용 접미사

Pokopia는 실무 맥락상 다음 접미사를 추가 허용한다. 새 에이전트 추가 시 **가능한 표준 접미사(§2.1)를 우선 고려**하고, 아래 접미사는 실무 의미가 명확할 때만 선택한다.

| 접미사 | 역할 정의 | Pokopia 대표 에이전트 | 표준 접미사로 재분류 시 |
|--------|---------|----------------------|-----------------------|
| `-lead` | 도메인 하네스의 전용 리더 (메인 Claude가 아닌 에이전트 리더) | datapipeline-lead, pokopia-phase-review-lead | -orchestrator로 대체 가능 |
| `-conductor` | 장기 운영·크롤러 실행 담당 | pokopia-ops-conductor | -ops로 대체 가능 |
| `-scholar` | 학술 전문 조사 (researcher의 specialization) | research-academic-scholar | -researcher로 대체 가능 |
| `-listener` | 커뮤니티 반응 수집 (researcher의 specialization) | research-community-listener | -researcher로 대체 가능 |
| `-investigator` | 웹 심층 조사 (researcher의 specialization) | research-web-investigator | -researcher로 대체 가능 |
| `-validator` | 교차 검증 전담 (reviewer의 specialization) | research-cross-validator, datapipeline-validator | -reviewer로 대체 가능 |
| `-observer` | 관측성 설계 전담 (reviewer의 specialization) | datapipeline-observer | -reviewer로 대체 가능 |
| `-augmenter` | 기존 산출물 보강 전담 (engineer의 specialization) | testing-augmenter | -engineer로 대체 가능 |
| `-keeper` | 자산·fixture 관리 전담 (manager의 specialization) | testing-fixture-keeper | -manager로 대체 가능 |
| `-runner` | 실행·검증 분석 전담 (verifier의 specialization) | testing-runner | -verifier로 대체 가능 |
| `-guide` | TDD 사이클 진행·스펙 안내 (tester/architect 혼합) | testing-tdd-guide | -tester 또는 -architect로 대체 가능 |

### 2.3 선택 원칙

1. **결과가 숫자/데이터**면 `-analyst`, **판정(pass/fail)**이면 `-verifier` 또는 `-reviewer`, **위험 찾기**면 `-auditor`.
2. **코드·매니페스트를 생성/수정**하면 `-engineer` 또는 `-builder`, **설계 문서**만 생산하면 `-architect` 또는 `-designer`.
3. **외부 자료 수집**은 `-researcher` (또는 specialization: `-scholar`/`-listener`/`-investigator`).
4. **팀 리더**는 기본적으로 메인 Claude가 수행. 전용 리더 에이전트가 필요하면 `-orchestrator` 또는 `-lead` 사용 (§6 참조).
5. 신규 에이전트는 우선 §2.1 표준 접미사를 시도하고, 실무 의미가 특수할 때만 §2.2 추가 접미사 사용.

---

## 3. 에이전트 색상 (`color` 필드) 체계

색상은 UI에서 에이전트 역할군을 구분하기 위함이다. Claude Code는 6색을 지원한다: `blue`, `cyan`, `green`, `yellow`, `magenta`, `red`.

| 색상 | 역할군 | Pokopia 대표 에이전트 |
|------|-------|-------------|
| `blue` | Reviewer + Operational + Manager (품질 평가·운영·관리) | codereview-architect-auditor, codereview-performance-auditor, codereview-style-auditor, datapipeline-observer, datapipeline-validator, pokopia-ops-conductor, research-cross-validator, testing-fixture-keeper, testing-runner |
| `cyan` | Researcher + Analyst (탐색·분석 의미) | pokopia-qa-analyst, research-web-investigator, research-academic-scholar, research-community-listener |
| `green` | Engineer + Builder + TDD Guide (긍정·생성 의미) | datapipeline-etl-engineer, pokopia-code-builder, testing-augmenter, testing-tdd-guide |
| `magenta` | Designer + Architect + Strategist + Writer + Orchestrator (창의·설계 의미) | codereview-orchestrator, datapipeline-lead, datapipeline-schema-designer, pokopia-doc-strategist, pokopia-schema-architect, research-synthesis-writer, testing-orchestrator |
| `yellow` | Auditor + Debugger (주의·경고 의미) | codereview-security-auditor |
| `red` | Critical·파괴적·시뮬레이션·루프백 판정 (중대 리스크) | pokopia-phase-review-lead |

**분포 목표**: 특정 색상이 전체의 **40%를 넘지 않도록** 한다. 현재 26개 에이전트 기준: blue 35%, magenta 27%, cyan 15%, green 15%, yellow 4%, red 4%.

신규 에이전트 추가 시 현재 분포를 확인하고 40% 상한을 넘는 색상이 있으면 다른 색상으로 조정한다.

---

## 4. 에이전트 Frontmatter 표준

```yaml
---
name: {agent-name}                  # kebab-case, 3~50자
description: |-                     # 자동 선택을 위한 트리거 키워드 + <example> 블록
  <한 문장 역할 요약>.
  <트리거 키워드 나열>.

  <example>
  Context: <사용자 상황>
  user: "<사용자가 할 법한 요청>"
  assistant: "<어떻게 응답하고 이 에이전트를 호출할지>"
  <commentary>
  <왜 이 에이전트가 적합한지 설명>
  </commentary>
  </example>
model: opus                          # 하네스 전체 일관 — opus 강제
color: {blue|cyan|green|yellow|magenta|red}  # §3 매핑 참조
# tools: 생략 가능 — 전체 권한 기본값
---
```

### 4.1 description 작성 원칙

description은 Claude가 **자동으로 이 에이전트를 선택할지** 결정하는 유일한 근거다. 트리거 오류를 줄이려면 다음을 포함한다:

1. **한 문장 역할 요약** — "Pokopia 스키마 설계 에이전트. Prisma 모델 작성/변경/마이그레이션 담당."
2. **트리거 키워드 나열** — 'schema', '스키마', 'Prisma', '마이그레이션', '엔티티 추가' 등 실제 사용자 표현
3. **2~4개 `<example>` 블록 (권장)** — 아래 템플릿 참조
4. **비트리거 명시** (권장) — "단순 SCHEMA.md 문서 편집은 pokopia-doc-strategist가 담당"
5. **오케스트레이터 리더는 4개 이상의 example 블록 권장**

### 4.2 `<example>` 블록 템플릿

```markdown
<example>
Context: <사용자 상황 — 왜 이 요청이 나왔는가>
user: "<사용자가 할 법한 실제 표현>"
assistant: "<어떻게 응답하고 이 에이전트를 호출할지>"
<commentary>
<왜 이 에이전트가 적합한지, 대안 에이전트와 차이점 설명>
</commentary>
</example>
```

### 4.3 System Prompt 필수 섹션

본문(프롬프트)은 2인칭("You are …") 또는 객관형으로 작성. 필수 섹션:

1. `## 핵심 역할` — 1~2문장 책임 요약
2. `## 프로젝트 이해` — Pokopia 컨텍스트 (4소스, Phase 구조, i18n, SCHEMA SSoT 등 관련 항목)
3. `## 작업 원칙` — 행동 가이드라인 3~5개
4. `## 입력/출력 프로토콜` — 기대 입력과 산출물 형식 (파일 경로 구체적 명시)
5. `## 팀 통신 프로토콜` (에이전트 팀 모드 참여 시) — 수신/발신 대상, 공유 파일
6. `## 에러 핸들링` — 실패 케이스별 대응
7. `## 협업` — 어떤 다른 에이전트와 어떻게 연결되는지
8. `## 금지 사항` — 명시적 Don't 목록 (Pokopia 고유 패턴)

---

## 5. 스킬 Frontmatter 표준

```yaml
---
name: {skill-name}
description: "<pushy description>. '트리거키워드1', '트리거키워드2', … 에 반응. <비트리거 명시>."
version: "1.0.0"
---
```

### 5.1 description 작성 원칙 — pushy

스킬 description은 오토 트리거의 유일한 근거이며, 충분히 **적극적("pushy")**이어야 한다.

좋은 예:
```
"Pokopia 구현 Phase 완료 시점에 유형별 감사자 팀을 병렬 구동하고 Critical 이슈 해결까지 루프백을 감독하는 감사 전담 하네스. 'Phase N 검증', 'phase gate' 등 요청 시 반드시 이 스킬을 사용한다. 스키마/파서/크롤러/API/QA/문서 Phase 유형별로 다른 감사자 프로파일을 자동 선택한다. 전면 코드 리뷰 요청은 codereview-orchestrator를 사용."
```

핵심 요소:
- 역할 한 문장
- 트리거 키워드 10~20개 (한/영 혼합 허용)
- 비트리거 명시 ("단순 1회 실행은 vitest 직접 호출이 우선")
- **경계 스킬 병기** (§7 경계 테이블 참조 또는 직접 기술)

### 5.2 버저닝 (semver)

- `version: "1.0.0"` 모든 신규 스킬은 1.0.0으로 시작
- Breaking change (description/워크플로우 대폭 변경, 에이전트 풀 교체) → **major** 증가
- 기능 추가 (새 에이전트, 새 phase, references 추가) → **minor** 증가
- 오타·문구 정리·내부 리팩토링 → **patch** 증가

---

## 6. 오케스트레이터 스킬 필수 섹션

오케스트레이터 스킬(`SKILL.md`)은 다음 7개 섹션을 반드시 포함한다:

| 섹션 | 내용 |
|------|------|
| `## 실행 모드` | 서브 에이전트 / 에이전트 팀 / 파이프라인 / 시나리오별 중 선택 + 이유 |
| `## 에이전트 풀` | subagent_type, model, 역할, 출력 경로를 표로 |
| `## 워크플로우` | Phase별 Agent 호출 + 데이터 전달 방식 |
| `## 에러 핸들링` | 실패 케이스별 대응 (재시도 1회 → 부분 결과) |
| `## 데이터 흐름` | **Mermaid 다이어그램 필수** (에이전트 간 통신·파일 경로 시각화) |
| `## 테스트 시나리오` | 정상 흐름 1 + 에러 흐름 1 이상 |
| `## 금지 사항` | 명시적 Don't 목록 |

**Agent 호출 시 반드시 포함**: `model: "opus"` — 추론 품질을 일정 수준 이상으로 유지.

### 6.1 리더 책임 주체 원칙

오케스트레이터의 리더 역할은 두 가지 방식으로 수행할 수 있다:

**기본값: 리더 = 메인 Claude.**
- 별도 리더 에이전트를 만들지 않는다
- 스킬 SKILL.md에 "리더 = 메인 Claude" 또는 "(리더 = 당신)"으로 명시
- 해당 스킬: `codereview-orchestrator`, `testing-orchestrator`, `research-conductor`, `pokopia-wiki-build`, `datapipeline-orchestrator`

**예외: 리더 전용 에이전트를 만드는 조건** (모두 충족):
1. 리더 자체가 복잡한 의사결정 규칙을 가짐 (예: VERDICT 판정, 루프백 결정)
2. 리더 역할이 다른 하네스에서도 재호출될 가능성
3. 리더의 프로토콜이 상세 문서화가 필요할 만큼 복잡함

현재 이 조건에 해당하는 전용 리더 에이전트: `pokopia-phase-review-lead` (Phase 감사 VERDICT + 루프백 판정), `datapipeline-lead` (파이프라인 4영역 통합 설계 조율)

이 기준에 맞지 않는 신규 전용 리더 에이전트는 만들지 않는다.

### 6.2 실행 모드 선택 기준

| 작업 성격 | 권장 모드 |
|----------|---------|
| 기본값 | **에이전트 팀** (TeamCreate + SendMessage + TaskCreate) |
| 순수 파이프라인 (단계별 산출물 전달만) | 서브 에이전트 + 파일 기반 |
| 1~2명 충분 + 실시간 토론 불필요 | 서브 에이전트 |
| 장기 핸드오프 필요 (재개성 우선) | 서브 에이전트 + 파일 기반 |
| 시나리오별 동적 선택 | 시나리오별 모드 명시 (testing-orchestrator 참조) |

---

## 7. 오케스트레이터 간 경계 선언 (Routing Guard)

중복 라우팅을 막기 위해 Pokopia의 6개 오케스트레이터 스킬의 경계를 한 곳에 집약한다.

| 이 스킬 | 담당 범위 | 경계 (다른 스킬이 담당) |
|---------|---------|---------------------|
| `pokopia-wiki-build` | Pokopia 위키 구축 최상위 조율 — 다영역 변경, Phase 실행 조율, 신규 소스 도입, 대규모 리팩토링 | 단일 영역 작업은 개별 `pokopia-*` 스킬 직접 사용. Phase 완료 감사는 `pokopia-phase-review-harness`. 전면 코드 감사는 `codereview-orchestrator`. |
| `pokopia-phase-review-harness` | Pokopia Phase 완료 시점 감사 — 유형별 프로파일 + 루프백 판정 | 실제 구현은 `pokopia-schema-prisma`·`pokopia-page-parser` 등 구현 스킬이 담당. 전면 코드 리뷰 요청은 `codereview-orchestrator`. |
| `codereview-orchestrator` | 아키텍처·보안·성능·스타일 4영역 종합 코드 감사 | 단일 영역(보안만/성능만)은 개별 `codereview-*-audit` 스킬 직접 사용. Pokopia Phase 완료 감사는 `pokopia-phase-review-harness`. |
| `research-conductor` | 웹+학술+커뮤니티 3방향 리서치 + 교차 검증 + 종합 보고서 | 단순 사실 확인(1문장 답)은 `WebSearch` 직접 사용. 한 각도만 필요하면 개별 `research-*-*` 스킬 직접 사용. |
| `testing-orchestrator` | 모노레포 테스트 하네스 — 5시나리오(TDD/보강/회귀/실행/복합) 조율 | 단순 1회 vitest 실행은 `vitest` CLI 직접. Phase 감사 내부의 테스트는 `pokopia-phase-review-harness`. |
| `datapipeline-orchestrator` | ETL·스키마·검증·관측성 4영역 파이프라인 설계 | 단일 영역(스키마만/검증만)은 개별 `datapipeline-*` 스킬 직접 사용. 현재 Pokopia 내부 사용 빈도 낮음 — 외부 프로젝트 설계 의뢰 시 주 사용. |

### 7.1 라우팅 결정 트리

사용자 요청 분류:

```
요청이 Pokopia 프로젝트 내 작업인가?
├── YES → 작업이 여러 영역(문서+스키마+코드+QA)에 걸치는가?
│   ├── YES → pokopia-wiki-build
│   └── NO → Phase 완료 감사인가?
│       ├── YES → pokopia-phase-review-harness
│       └── NO → 단일 영역 pokopia-* 스킬 직접
└── NO → 어떤 유형의 작업인가?
    ├── 코드 리뷰 → codereview-orchestrator (또는 단일 codereview-* 스킬)
    ├── 리서치 → research-conductor (또는 WebSearch)
    ├── 테스트 → testing-orchestrator (또는 vitest 직접)
    └── 데이터 파이프라인 설계 → datapipeline-orchestrator
```

---

## 8. 프로젝트 컨벤션 주입 패턴

에이전트가 Pokopia 프로젝트 고유 컨벤션(4소스 우선순위, SCHEMA SSoT, Phase 구조, i18n source ENUM 등)을 따르게 하려면 프롬프트에 **참조 경로를 주입**한다.

표준 참조 경로:
- `CRAWLING_STRATEGY.md` — 크롤링 전략 SSoT
- `DATA_COLLECTION_PLAN.md` — Phase 계획 SSoT
- `SCHEMA.md` — 데이터 모델 SSoT
- `TECH_STACK.md` — 기술 스택 + 디렉토리 책임
- `.claude/skills/codereview-orchestrator/references/finding-schema.md` — 공통 finding YAML 스키마 (phase-review-harness가 재사용)
- `.claude/skills/codereview-orchestrator/references/severity-matrix.md` — 심각도 기준
- `.claude/skills/pokopia-phase-review-harness/references/profiles/{type}.md` — Phase 유형별 감사자 프로파일

에이전트 프롬프트 예시:
```
프로젝트 컨벤션:
- SCHEMA SSoT: SCHEMA.md
- Phase 구조: DATA_COLLECTION_PLAN.md
공통 finding 스키마 준수: .claude/skills/codereview-orchestrator/references/finding-schema.md
```

---

## 9. 범용 하네스 로컬 유지 정책

Pokopia는 homelab과 달리 **범용 하네스(codereview·datapipeline·research·testing)를 프로젝트 로컬에 유지**한다.

**이유:**
- 프로젝트 내부 표준과의 긴밀한 결합 필요 (finding-schema, severity-matrix 등 공유 참조가 Pokopia 기준)
- 현재 Pokopia가 주 사용자이며 다른 프로젝트 병행 수요 낮음
- 글로벌 이관 시 버전 충돌·참조 깨짐 리스크

**트레이드오프:**
- 다른 프로젝트에서 재사용 불가 (동일 스킬을 복사·동기화해야 함)
- Pokopia 종료 시 하네스 재배치 필요

**향후 재검토 조건:**
- Pokopia 외에 동일 범용 하네스를 2개 이상 프로젝트에서 사용하기 시작하면 글로벌 이관 재검토
- 이 경우 `~/.claude/skills/` 이관 + Pokopia 특화 부분을 `references/pokopia-adapter.md`로 분리

---

## 10. 설정 파일

| 파일 | 용도 | git |
|------|------|-----|
| `.claude/settings.json` | 팀 공유 설정 (훅, 권한 등) | 커밋 |
| `.claude/settings.local.json` | 개인 로컬 설정 (허용 명령어 등) | gitignore |

**원칙**: `settings.json`은 최소화. 훅은 프로젝트 전체 수준에서 꼭 필요한 것만 추가. 사용자 개인 권한 허용(`Bash(git *)` 등)은 `settings.local.json`으로 분리한다.

---

## 11. `_workspace/` 하위 규약

하네스는 중간 산출물을 `_workspace/`에 저장한다. 스킬별 디렉토리 구조:

```
_workspace/
├── codereview/{YYYYMMDD-HHMM}/            # codereview-orchestrator
│   ├── 00_input/scope.md
│   ├── 01_architect_findings.yaml
│   ├── 02_security_findings.yaml
│   ├── 03_performance_findings.yaml
│   └── 04_style_findings.yaml
├── testing/{YYYYMMDDHHmm}/                # testing-orchestrator
│   ├── 00_input/
│   ├── 02_tdd_*
│   ├── 03_augment_*
│   ├── 04_fixture_*
│   ├── 05_run.json
│   └── REPORT.md
├── research/{topic-slug}/                 # research-conductor
│   ├── config.md
│   ├── web_findings.md
│   ├── academic_findings.md
│   ├── community_findings.md
│   ├── validation_report.md
│   └── report.md
├── audit/phase-{N}/{YYYYMMDD-HHMM}/       # pokopia-phase-review-harness
│   ├── 00_input/
│   │   ├── scope.md
│   │   └── profile.md
│   ├── 0{i}_{auditor}_findings.yaml
│   ├── loopback_directive.md (LOOP_REQUIRED 시)
│   └── REPORT.md
└── (기타 pokopia-wiki-build 임시 산출물)
```

**보존 정책:**
- 세션 종료 후에도 보존 (감사 추적·재개용)
- 사용자가 명시적으로 정리 요청 시만 삭제
- `.gitignore`에 `_workspace/` 포함 (커밋 대상 아님)

**`.meta.json` 표준 (권장):**
각 하네스 디렉토리에 실행 메타데이터 저장하면 사후 분석 용이:

```json
{
  "skill": "codereview-orchestrator",
  "version": "1.0.0",
  "started_at": "2026-04-18T10:23:00Z",
  "completed_at": "2026-04-18T10:45:00Z",
  "status": "completed|failed|interrupted",
  "agents_used": ["architect-auditor", "security-auditor"],
  "outputs": ["CODE_REVIEW_REPORT.md"],
  "errors": []
}
```

---

## 12. 변경 이력 관리

- 스킬 frontmatter의 `version` 필드로 semantic versioning 추적 (§5.2)
- 에이전트 정의에는 version 필드를 두지 않음 (스킬의 일부로 간주)
- 주요 변경은 커밋 메시지에 `[claude-harness]` 태그로 식별
- CONVENTIONS.md 자체 변경은 맨 하단 "변경 이력" 섹션에 기록

---

## 13. 감사 주기

`.claude/` 디렉토리는 **6개월마다** 정기 감사한다. 추가로 **Pokopia Phase 완료 시점**마다 해당 Phase에서 사용된 하네스 로그를 가볍게 리뷰한다.

### 13.1 정기 감사 체크리스트

- [ ] `CONVENTIONS.md` 최신 상태 (신규 에이전트/스킬 반영)
- [ ] 모든 에이전트 frontmatter: `name`, `description`, `model`, `color` 필수 필드 존재
- [ ] 모든 에이전트 description에 `<example>` 블록 2개 이상 (오케스트레이터 리더는 4개 이상)
- [ ] 모든 스킬 frontmatter: `name`, `description`, `version` 필수 필드 존재
- [ ] `SKILL.md` 파일명 대문자 일관성 (Glob로 `**/skill.md` 0건 확인)
- [ ] 에이전트 네이밍 체계 준수율 >90% (§2 접미사 체계)
- [ ] color 분포 중 특정 색이 40% 초과하지 않음
- [ ] 오케스트레이터 스킬 7개 필수 섹션 모두 존재 (§6)
- [ ] 고아 에이전트 없음 (모든 에이전트가 어딘가에서 호출됨)
- [ ] 중복 스킬 없음
- [ ] 오케스트레이터 경계 선언 테이블이 CONVENTIONS.md §7에 최신 반영
- [ ] 모든 Agent 호출에 `model: "opus"` 명시
- [ ] `_workspace/` 하위 하네스 산출물이 최근 6개월 내 갱신됨 (사용 증거)
- [ ] `settings.json` vs `settings.local.json` 분리 적절
- [ ] 문서 SSoT 경계 (CRAWLING_STRATEGY.md 등)와 하네스 경계 충돌 없음

### 13.2 Phase 완료 시 경량 리뷰

Pokopia Phase N 완료 직후:
- 해당 Phase에서 `_workspace/audit/phase-{N}/`에 실제 감사 로그가 남았는지 확인
- 사용되지 않은 에이전트/스킬이 있는지 간단 체크
- Phase 관련 업데이트(DATA_COLLECTION_PLAN §N, CRAWLING_STRATEGY 변경 등)가 하네스에 반영되었는지

---

## 변경 이력

- **2026-04-18 v1.0.0:** 초기 작성. homelab CONVENTIONS 체계 기반으로 Pokopia 특화 (범용 하네스 로컬 유지, Pokopia 추가 접미사 9개 허용, 오케스트레이터 경계 테이블 §7 통합).
