# Finding 공통 스키마

모든 감사자(architect/security/performance/style)는 이 스키마로 발견을 기록한다. 리포트 통합 단계에서 파싱·정렬·병합에 사용된다.

## 파일 형식

YAML 단일 파일. 최상위 `findings` 리스트 + 메타데이터.

```yaml
auditor: architect  # architect | security | performance | style
scope:
  mode: diff  # diff | path | all
  base: main  # diff 모드에서 비교 기준
  files_reviewed: 47
  files_skipped: 3
generated_at: 2026-04-17T10:32:00Z
findings:
  - id: ARCH-001
    severity: high
    category: architecture
    title: 도메인 모듈이 인프라 모듈을 직접 import
    location:
      file: src/domain/pokemon.ts
      line: 12
      snippet: |
        import { prisma } from '../infra/db';
    description: |
      도메인 레이어가 Prisma 클라이언트를 직접 참조한다. 이 방향 의존은
      도메인 로직을 인프라 구현에 결합시키며, 테스트 시 DB mock 없이
      단위 테스트가 불가능하다.
    impact: |
      - 도메인 로직 단위 테스트 불가
      - DB 교체 시 도메인 코드 수정 필요
      - 순환 의존 위험(infra → domain → infra)
    recommendation: |
      도메인에 repository 인터페이스를 정의하고, 인프라가 이를 구현하도록
      의존 방향을 뒤집는다(DIP). 구체적 예시:
      - src/domain/pokemon-repository.ts 에 interface 정의
      - src/infra/prisma-pokemon-repository.ts 에서 구현
      - DI 컨테이너 또는 생성자 주입으로 연결
    confidence: high
    related_findings: []  # 교차 이슈 ID 리스트
```

## 필수 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | `{AREA}-{NNN}` 형식. AREA ∈ {ARCH, SEC, PERF, STYLE}. 3자리 숫자 |
| `severity` | enum | `critical` / `high` / `medium` / `low` / `info` |
| `category` | enum | `architecture` / `security` / `performance` / `style` |
| `title` | string | 1줄 요약 (< 80자) |
| `location.file` | string | 프로젝트 루트 기준 상대 경로 |
| `location.line` | number | 주요 라인 (단일 숫자 또는 범위 `12-20`) |
| `location.snippet` | string | 문제 코드 원문 (최대 5줄) |
| `description` | string | 문제의 본질. "무엇이 문제인가"를 구체적으로 |
| `impact` | string | "왜 문제인가" — 실제 영향(유지보수, 공격 벡터, 부하 등) |
| `recommendation` | string | 구체적 수정 방향. 가능하면 예시 코드 포함 |
| `confidence` | enum | `high` / `medium` / `low`. 오탐 가능성을 솔직하게 |

## 영역별 선택 필드

**security 전용:**
- `cwe` (string): CWE ID, 예: `CWE-89`
- `exploit_complexity` (enum): `low` / `medium` / `high`
- `attack_vector` (enum): `local` / `remote` / `network`

**performance 전용:**
- `complexity` (string): 예: `O(n²)`, `O(n log n)`
- `expected_improvement` (string): 예: `10x for N>1000`
- `measurement_hint` (string): 검증 방법 제안

**style 전용:**
- `automatable` (boolean): 린터 규칙으로 자동 수정 가능한지
- `affected_count` (number): 같은 패턴 반복 횟수 (집계형 발견용)

## 교차 이슈(related_findings) 사용법

- 다른 감사자의 finding ID를 리스트로 포함
- 파일·라인이 겹치거나 원인-결과 관계가 있을 때 연결
- 리포트 통합 시 "교차 영역 이슈" 섹션으로 승격

**예시:**
```yaml
- id: PERF-007
  title: 반복문 내 N+1 쿼리
  related_findings: [ARCH-003, SEC-012]
  # ARCH-003: 도메인→인프라 직접 호출이 구조적 원인
  # SEC-012: 동일 경로에서 SQL injection 가능성 존재
```

## ID 규칙

- 3자리 제로 패딩: `ARCH-001`, `SEC-042`, `PERF-099`, `STYLE-123`
- 감사자 내에서 순차 증가
- 한 세션 내 ID 재사용 금지

## 샘플 유효 YAML

```yaml
auditor: security
scope:
  mode: diff
  base: main
  files_reviewed: 12
  files_skipped: 0
generated_at: 2026-04-17T10:35:00Z
findings:
  - id: SEC-001
    severity: critical
    category: security
    title: 템플릿 쿼리에 사용자 입력이 문자열 연결로 삽입됨
    location:
      file: src/api/search.ts
      line: 34
      snippet: |
        const q = `SELECT * FROM users WHERE name = '${req.query.name}'`;
        return db.raw(q);
    description: |
      req.query.name이 이스케이프 없이 raw SQL 문자열에 연결된다.
      전형적인 SQL injection 취약점.
    impact: |
      공격자가 `' OR 1=1 --` 같은 페이로드로 전체 users 테이블을 조회하거나
      DROP TABLE 등 파괴적 명령 실행 가능. 영향: 데이터 유출 + 무결성 파괴.
    recommendation: |
      parameterized query 사용:
        db.select('*').from('users').where('name', req.query.name);
      또는 prepared statement. raw SQL이 필요하면 bind 파라미터 사용.
    confidence: high
    cwe: CWE-89
    exploit_complexity: low
    attack_vector: remote
    related_findings: []
  - id: SEC-002
    severity: high
    category: security
    title: JWT 검증에서 서명 알고리즘 명시 누락
    location:
      file: src/middleware/auth.ts
      line: 18
    description: |
      jwt.verify 호출 시 algorithms 옵션이 없어, 공격자가 `alg: none` 토큰을
      제출하면 통과될 가능성.
    impact: |
      인증 우회. 공격자가 임의 페이로드로 인증 토큰 생성 가능.
    recommendation: |
      jwt.verify(token, secret, { algorithms: ['HS256'] }) 명시.
    confidence: high
    cwe: CWE-347
    exploit_complexity: medium
    attack_vector: remote
    related_findings: []
```

## 파싱 실패 방지

- 여러 줄 문자열은 반드시 `|` (literal block) 사용, `>` (folded)는 지양
- 코드 snippet에 backtick 포함 시 YAML 문자열 이스케이프 주의
- 특수 문자(`:`, `#`, `-`로 시작하는 라인)는 반드시 인용
- 생성 후 YAML 파서로 1회 검증 권장
