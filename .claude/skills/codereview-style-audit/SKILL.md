---
name: codereview-style-audit
description: 코드의 스타일·가독성·일관성을 감사한다. 명명 규칙, 린터 준수, 주석 품질, 죽은 코드/중복, 타입 안전성(any 남용), 매직 넘버, 함수 길이, 에러 처리 스타일을 점검하고 공통 finding YAML로 기록한다. "스타일 리뷰", "가독성 감사", "네이밍 점검", "린트 강화", "죽은 코드 제거" 요청 시 반드시 사용. 종합 코드 리뷰 팀의 스타일 감사자가 호출.
version: "1.0.0"
---

# Style Audit

코드의 스타일·가독성·일관성을 감사한다. 린터가 이미 잡는 이슈가 아닌 **의미 수준** 문제에 집중.

## 원칙

- 린터가 잡는 문제는 개별 나열 대신 "린터 규칙 적용 권장"으로 집계
- 일관성 > 개인 선호 — 프로젝트 기존 관습을 존중
- 자동화 가능한 fix는 `automatable: true`로 표시
- 대량 반복 패턴은 `affected_count`로 집계

## 감사 절차

### Step 1: 프로젝트 규약 파악

1. 린터 설정:
   - TS/JS: `eslint.config.*`, `.eslintrc.*`, `.prettierrc`
   - Python: `pyproject.toml` ruff/black, `.flake8`
   - Go: `.golangci.yml`
2. `CLAUDE.md`, `CONTRIBUTING.md`의 스타일 섹션
3. 기존 코드 관습 파악 (camelCase vs snake_case, import 순서, 파일명 규칙)

### Step 2: 네이밍

#### 변수/함수
- 의도 불명: `data`, `tmp`, `foo`, `obj`, `x`, `res`, `val`
- 약어 남용: `usr`, `btn`, `calc` (단, 프로젝트 관습이 허용하면 OK)
- Boolean 네이밍: `flag`, `check`, `value` → `isActive`, `hasPermission`, `shouldRetry`
- 함수: 동사형, 반환 의도 반영 (`getUser` vs `fetchUser` vs `findUser`)

#### 클래스/파일
- 클래스: PascalCase, 명사형
- 파일명 컨벤션 일관성 (`kebab-case.ts` vs `camelCase.ts` 혼재 금지)
- 단어 복수/단수 일관성 (`user.service.ts` vs `users-service.ts`)

### Step 3: 타입 안전성

#### TypeScript
- `any` 사용 빈도 (비율로 집계)
- `as` 강제 캐스팅 (특히 `as any`, `as unknown as X`)
- `@ts-ignore`/`@ts-expect-error` 사용 이유 주석 없음
- Optional 체이닝 남용: `x?.y?.z?.w?.v` (구조적 문제 신호)
- 타입 단언 대신 타입 가드 가능한 경우

#### Python
- `Any`, `type: ignore` 남용
- 타입 힌트 누락 (공개 함수)

### Step 4: 함수/파일 크기

- 함수 > 80줄: high 후보
- 파일 > 500줄: medium (architect와 교차 확인)
- 중첩 깊이 > 4: medium
- 파라미터 > 5개: 객체로 묶기 권장

### Step 5: 죽은 코드/중복

- 사용되지 않는 export (정적 분석의 한계 인지, `confidence: medium`)
- 주석 처리된 코드 블록 (삭제 권장)
- 복사-붙여넣기 중복: 3회 이상 반복되는 5+줄 블록
- 동일 로직이 여러 파일에 복제

### Step 6: 주석 품질

- **무의미**: `// increment counter` 앞에 `counter++`
- **불일치**: 주석이 코드를 오해하게 함 (코드 변경 시 주석 갱신 안 됨)
- **방치된 TODO/FIXME/HACK**: 날짜/이슈 번호 없는 것
- **JSDoc/docstring 누락**: 공개 API (export 함수/클래스)
- **사문화된 주석**: 30줄 주석으로 이미 사라진 기능 설명

### Step 7: 매직 넘버/문자열

- `if (age > 18)` → `ADULT_AGE_THRESHOLD = 18`
- `setTimeout(..., 86400000)` → `MILLIS_IN_DAY` 또는 `24 * 60 * 60 * 1000`
- 반복 문자열 리터럴: `"application/json"` 수십 곳 → 상수화

예외: 0, 1, -1, 2, 빈 문자열 등 자명한 값은 제외.

### Step 8: 에러 처리 일관성

- 빈 `catch` 블록 (에러 삼킴)
- 에러 타입 불일치 (일부는 `Error`, 일부는 string, 일부는 custom class)
- 에러 메시지 일관성 (영문/한글 혼재, 포맷 불일치)
- Rethrow 시 컨텍스트 손실 (`throw e` vs `throw new WrappedError(e)`)

### Step 9: 포매팅

린터/포매터 설정이 있으면 개별 위반 나열 안 함 — "린터 --fix 일괄 적용" 권장.

설정이 없으면:
- 들여쓰기 일관성
- 따옴표 스타일 혼재
- trailing comma 일관성
- 줄바꿈 일관성

### Step 10: 문서화

- README 최신 여부 (CHANGELOG 존재 여부)
- 공개 API JSDoc/docstring 커버리지
- 예시 코드의 실행 가능성

## 발견 기록 규칙

- ID: `STYLE-NNN` (001부터)
- 필드: `codereview-orchestrator/references/finding-schema.md` 준수
- 심각도: `codereview-orchestrator/references/severity-matrix.md`의 스타일 영역 기준
- **스타일 전용 필드 활용:**
  - `automatable` (bool): 린터 규칙으로 자동 수정 가능
  - `affected_count` (int): 동일 패턴 반복 횟수

### 집계형 발견

대량 반복 패턴은 **개별 나열 대신 집계 1건**으로 기록:

```yaml
- id: STYLE-005
  severity: medium
  title: 매직 넘버 반복 (86400000 등 시간 상수)
  location:
    file: multiple
    line: various
    snippet: |
      (예시) src/scheduler.ts:42  setTimeout(fn, 86400000);
      (예시) src/cleanup.ts:17    if (age > 604800000) {}
  description: |
    86400000(1일), 604800000(1주) 등 시간 리터럴이 코드 전반에 산재.
    총 14회 발견.
  impact: |
    - 의미 파악에 계산기 필요
    - 변경 시 누락 위험 (일부만 수정)
    - 테스트 작성 시 상수 참조 불가
  recommendation: |
    const TIME_MS = {
      DAY: 24 * 60 * 60 * 1000,
      WEEK: 7 * 24 * 60 * 60 * 1000,
    } as const;
  confidence: high
  automatable: false
  affected_count: 14
  related_findings: []
```

## 린터 미도입 프로젝트

린터 설정이 없으면 별도 finding으로:

```yaml
- id: STYLE-001
  severity: medium
  title: ESLint + Prettier 미도입
  location:
    file: (project root)
    line: 0
  description: |
    `.eslintrc`, `.prettierrc` 등 린터/포매터 설정 부재.
    스타일 일관성이 수동 검토에 의존.
  impact: |
    - PR마다 스타일 논쟁
    - 자동 검출 가능한 버그 누락
    - 신규 기여자 온보딩 비용
  recommendation: |
    `pnpm add -D eslint prettier @typescript-eslint/*`
    `eslint.config.mjs`에 @typescript-eslint/recommended + prettier 설정
    pre-commit hook 또는 CI에 통합
  confidence: high
  automatable: false
  related_findings: []
```

## 교차 이슈 시그널

| 발견 | 공유 대상 | 메시지 |
|------|----------|--------|
| god file 후보 (>1500줄) | architect-auditor | "X.ts가 1800줄, 구조적 SRP 위반 확인 요청" |
| 복잡한 제어 흐름 | performance-auditor | "순환 복잡도 높음, 성능 이슈 은폐 가능" |

대체로 스타일은 교차 이슈가 적음 — 과도한 통신 자제.

## 출력 예시

```yaml
auditor: style
scope:
  mode: all
  files_reviewed: 87
  files_skipped: 0
generated_at: 2026-04-17T10:45:00Z
findings:
  - id: STYLE-001
    severity: high
    category: style
    title: `any` 타입 남용 — 타입 안전성 42% 손실
    location:
      file: multiple
      line: various
      snippet: |
        src/api/handlers.ts:23  function handle(data: any): any
        src/lib/parser.ts:55    const result: any = JSON.parse(raw);
    description: |
      총 87개 파일 중 36개(42%)에 `any` 사용. JSON 파싱 결과, 외부 API
      응답, 동적 dispatch 등에 집중.
    impact: |
      - TypeScript의 타입 체크가 해당 지점에서 무력화
      - 리팩토링 시 타입 에러로 감지되지 않음
      - 런타임 에러가 타입 레벨에서 예방되지 못함
    recommendation: |
      - JSON 파싱: zod/io-ts로 런타임 검증 + 타입 도출
      - 외부 API: OpenAPI 스키마 → 타입 생성 (openapi-typescript)
      - 동적 dispatch: discriminated union + 타입 가드
      ESLint 규칙 `@typescript-eslint/no-explicit-any` 점진 도입 권장
    confidence: high
    automatable: false
    affected_count: 89
    related_findings: []
```

## 협업

- god file 신호는 architect-auditor에게 먼저 공유
- 린터 규칙 적용으로 대량 해결 가능한 이슈는 개별 나열하지 않고 집계
- 프로젝트 스타일 가이드가 있으면 그것을 기준으로 감사

## 금지 사항

- 2-space vs 4-space 같은 종교 전쟁 유발 발견
- 함수형 vs OOP 선호 강요
- 프로젝트 언어 관습에 없는 외부 기준 적용
- 린터가 이미 잡는 이슈를 모두 나열 (집계만)
