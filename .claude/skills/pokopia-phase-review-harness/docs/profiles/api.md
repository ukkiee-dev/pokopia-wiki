# Phase Profile: api

**적용 범위:** REST/GraphQL/tRPC 엔드포인트, 라우터, 인증·인가 미들웨어, 응답 직렬화, 입력 검증.

## 대상 아티팩트 패턴

- `src/api/**/*.ts`
- `src/routes/**/*.ts`
- `src/middleware/**/*.ts`
- `src/controllers/**/*.ts`
- `src/resolvers/**/*.ts`

## 감사자 구성

### 필수 감사자 (2명)

| 감사자 이름 | agent_type | 스킬 | 핵심 책무 |
|---|---|---|---|
| codereview-security | `codereview-security-auditor` | `codereview-security-audit` | 인증·인가 (보호 엔드포인트 누락), 입력 검증, SQL/NoSQL 인젝션, SSRF, CSRF, 레이트리미트, CORS, 시크릿 노출, 에러 메시지에 내부 정보 노출 |
| codereview-architecture | `codereview-architect-auditor` | `codereview-architecture-audit` | 엔드포인트 경계, 레이어 분리 (controller / service / repository), 응답 shape 일관성, 버전 전략, OpenAPI 스펙 준수 |

### 권장 감사자 (3명)

| 감사자 이름 | agent_type | 스킬 | 핵심 책무 |
|---|---|---|---|
| codereview-performance | `codereview-performance-auditor` | `codereview-performance-audit` | N+1 쿼리, 불필요한 JOIN, 인덱스 누락, 페이지네이션, 응답 크기, 캐싱 전략 |
| pokopia-quality-gate | `pokopia-qa-analyst` | `pokopia-quality-gate` | 응답 데이터 품질 (교차 참조 무결성, Attribution 필드 포함, 한국어 커버리지) |
| codereview-style | `codereview-style-auditor` | `codereview-style-audit` | 엔드포인트 명명 일관성, HTTP 메서드/상태코드 규칙, 에러 응답 포맷 |

## Pokopia 특화 Critical 조건

- Attribution 필드(`sourceUrl`/`license`/`copyrightHolder`/`attribution`) 응답에서 누락 (**Critical** — 저작권·출처 표기 법적 요구)
- 인증 없는 쓰기 엔드포인트 (**Critical**)
- 입력에 대한 Zod 등 스키마 검증 누락 (**Critical**)
- 응답에 내부 경로 / 스택트레이스 / DB 에러 노출 (**Critical**)
- N+1 쿼리 (페이지당 수십~수백 쿼리) (**Critical**)
- CORS `*` with credentials (**Critical**)
- 레이트리미트 미설정 엔드포인트 (**Warning**)
- OpenAPI/스키마와 실제 응답 shape 불일치 (**Warning**)

## 범위 제약

TECH_STACK.md 범위 밖 (테스트·CI·관측성)은 이 감사에서 다루지 않는다. API 엔드포인트 자체의 코드 품질·보안·성능에만 집중.

## 재감사 체크포인트

보안 지적은 재감사 시 동일 엔드포인트에 대한 실제 request/response 샘플로 수정 확인. 선언만으로는 `resolved` 불가.

## 교차 조율 패턴

- `security` ↔ `architecture`: 계층 분리 위반이 만드는 보안 허점 (controller에서 직접 DB 접근 등)
- `security` ↔ `performance`: 레이트리미트 ↔ 캐싱 상충
- `architecture` → `style`: 엔드포인트 네이밍 규칙 위반을 구조적 문제로 격상 여부
- `quality-gate` → `architecture`: 응답 shape 불일치가 레이어 경계 문제인지 검증
