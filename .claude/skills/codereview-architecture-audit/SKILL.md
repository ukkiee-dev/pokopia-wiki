---
name: codereview-architecture-audit
description: 코드의 아키텍처·모듈 경계·의존성을 감사한다. 레이어 침투, 순환 import, SOLID 위반, god object, 응집도/결합도, 패턴 남용/부족을 점검하고 공통 finding YAML로 기록한다. "아키텍처 리뷰", "구조 감사", "모듈 경계 점검", "의존성 분석", "리팩토링 후보 식별" 요청 시 반드시 사용. 종합 코드 리뷰 팀의 아키텍처 감사자가 호출.
version: "1.0.0"
---

# Architecture Audit

코드베이스의 구조적 결함을 식별하여 `codereview-orchestrator/references/finding-schema.md` 형식의 YAML로 기록한다.

## 감사 절차

### Step 1: 구조 파악

1. 디렉토리 트리 확인 (`ls -R`는 과도하므로 상위 2~3단계만)
2. 프로젝트 매니페스트 확인:
   - TypeScript: `package.json`, `tsconfig.json`
   - Python: `pyproject.toml`, `setup.py`
   - Go: `go.mod`
3. 아키텍처 문서 확인: `CLAUDE.md`, `docs/architecture.md`, `ARCHITECTURE.md`, README의 구조 섹션
4. 레이어 네이밍 규약 파악 — `domain/`, `infra/`, `api/`, `lib/` 등

### Step 2: 의존 방향 분석

import/require 구문을 수집하여 방향성을 확인한다:

- **UI → 도메인 → 인프라** 순 흐름이 기대되는 경우, 역방향 import는 위반
- **도메인이 인프라의 구체 타입을 import** → DIP 위반, interface 도입 권장
- **순환 의존**: A → B → A. 런타임 순환은 앱 기동 실패 유발 → critical
- **hub 파일**: 한 파일이 수십 개 파일에서 import됨 — 과도한 노출 신호

도구가 제한된 환경에서는 `grep "from '\.\./"` 또는 `grep "import.*from"` 결과를 수동 해석.

### Step 3: 파일/클래스 크기 조사

- **god file**: 한 파일이 500줄 초과면 의심, 1000줄+ 는 high
- **god class**: 클래스가 15개+ 메서드 또는 500줄 초과 → SRP 위반 후보
- **long function**: 80줄 초과 함수 → 분해 권장 후보

### Step 4: SOLID 점검

| 원칙 | 위반 신호 |
|------|----------|
| **SRP** (단일 책임) | 한 클래스에서 "A 처리" + "A 저장" + "A 검증" + "A 로깅" 동시 수행 |
| **OCP** (개방/폐쇄) | 새 타입 추가 시마다 기존 switch/if 문 수정 필요 |
| **LSP** (리스코프 치환) | 서브 클래스가 부모의 계약을 어김 (예: 일부 메서드 throw) |
| **ISP** (인터페이스 분리) | 광범위한 인터페이스를 구현하면서 대부분 메서드를 쓰지 않음 |
| **DIP** (의존 역전) | 상위 모듈이 하위의 구체 타입을 직접 import |

### Step 5: 응집도/결합도

- **높은 결합**: 한 모듈이 다른 모듈의 내부 구조(프라이빗으로 기대되는 부분)에 의존
- **낮은 응집**: 한 파일에 완전히 무관한 기능이 섞여 있음
- **데이터 덩어리**: 함수들이 같은 파라미터 집합을 반복 전달 → 파라미터 객체 도입 후보

### Step 6: 패턴 진단

- **필요한데 없음**: 10개 이상 if-else로 된 ad-hoc 라우팅, 복사된 초기화 코드(Factory 후보)
- **불필요하게 있음**: 단 1개 구현만 있는 Strategy, Abstract class 인터페이스가 사실상 concrete와 동일
- **Leaky abstraction**: 인터페이스가 구현 세부(예: DB 트랜잭션)를 노출

### Step 7: 테스트 경계

- 단위 테스트가 불가능한 설계인지 확인
- 모듈이 DB/네트워크 없이 테스트 가능한지
- 테스트 파일이 없거나 통합 테스트만 있으면 `recommendation`에 테스트 구조 개선 포함

## 발견 기록 규칙

- ID: `ARCH-NNN` (001부터 순차)
- 필드는 `codereview-orchestrator/references/finding-schema.md` 준수
- 심각도: `codereview-orchestrator/references/severity-matrix.md`의 아키텍처 영역 기준

### description 작성 지침

- "이 모듈은 나쁘다" 대신 "{구체적 책임 A}와 {책임 B}가 동일 클래스에 혼재, 메서드 X와 Y가 그 증거"
- import 경로/라인을 명시
- 의존 그래프 일부를 텍스트로 표현 가능: `A → B → C → A (순환)`

### recommendation 작성 지침

- 단기 수정(리네임 / 이동) + 중장기 수정(리팩토링 로드맵)을 분리
- 수정 비용이 큰 경우 "단계적 접근" 제시 (예: "1. interface 추출 → 2. 구현 교체 → 3. 기존 호출부 마이그레이션")
- 구체적 파일 경로 명시

## 교차 이슈 시그널

다음 발견은 다른 감사자와 공유:

| 발견 | 공유 대상 | 메시지 |
|------|----------|--------|
| 경계 침투로 공격 표면 확장 | security-auditor | "X.ts의 Y 경계가 인증 없이 노출, 보안 관점 확인" |
| 구조적으로 반복 I/O 유발 | performance-auditor | "A 레이어가 반복 호출되는 구조, N+1 가능성" |
| god file 식별 | style-auditor | "B.ts 1800줄, 스타일 수준 이슈도 풍부할 것" |

## 출력 예시

```yaml
auditor: architect
scope:
  mode: diff
  base: main
  files_reviewed: 47
  files_skipped: 0
generated_at: 2026-04-17T10:32:00Z
findings:
  - id: ARCH-001
    severity: high
    category: architecture
    title: 도메인 레이어가 Prisma 클라이언트를 직접 참조
    location:
      file: src/domain/pokemon-service.ts
      line: 4
      snippet: |
        import { prisma } from '../infra/db';
    description: |
      도메인 서비스가 ORM 클라이언트를 직접 import. DIP 위반.
      도메인 로직이 Prisma 구현에 결합되어 단위 테스트 시 mock 필요.
    impact: |
      - 단위 테스트 불가 (DB 없으면 실행 불가)
      - ORM 교체/업그레이드 시 도메인 코드 대거 수정
      - 17개 도메인 파일이 동일 패턴, 누적 부채 큼
    recommendation: |
      1단계: src/domain/ports/pokemon-repository.ts 인터페이스 정의
      2단계: src/infra/prisma/pokemon-repository.ts 구현
      3단계: 서비스가 인터페이스에 의존하도록 생성자 주입
      예시:
        class PokemonService {
          constructor(private repo: PokemonRepository) {}
        }
    confidence: high
    related_findings: []
```

## 감사 범위 제한

- 매니페스트 파일(`package.json`, lock files) 자체는 의존성 관리 섹션에서만 참조
- 외부 라이브러리 내부 구조는 감사하지 않음
- 생성 코드(generated/, build/, dist/)는 제외
- 테스트 파일은 별도 관점(테스트 가능성)으로만 참조

## 협업

- critical 발견 시 리더에게 즉시 SendMessage
- 완료 시 리더에게 "아키텍처 감사 완료, N건 발견, critical M건" 알림
- 다른 감사자의 질의에 즉시 응답 (예: style-auditor가 god file 확인 요청)

## 범위 과다 대응

- 파일 수 > 200: 핵심 모듈(진입점, 도메인 레이어) 전수 + 나머지 샘플링 30%
- scope 필드에 `files_skipped`와 샘플링 여부 명시
- 리포트에 "전수 감사 아님" 표기
