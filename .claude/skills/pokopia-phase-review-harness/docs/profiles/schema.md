# Phase Profile: schema

**적용 범위:** Prisma 스키마 정의, ENUM 추가/변경, 관계 설계, 마이그레이션, 감사 컬럼, 폴리모픽 참조 구조.

## 대상 아티팩트 패턴

- `prisma/schema.prisma`
- `prisma/migrations/**/*.sql`
- `prisma/seed*.ts`

## 감사자 구성

### 필수 감사자 (2명)

| 감사자 이름 | agent_type | 스킬 | 핵심 책무 |
|---|---|---|---|
| pokopia-doc-consistency | `pokopia-doc-strategist` | `pokopia-doc-consistency` | `SCHEMA.md`의 엔티티·필드·관계와 Prisma 모델 일치 여부. 4문서 SSoT 경계 준수 (TECH_STACK 범위 밖 신설 금지 포함) |
| codereview-architecture | `codereview-architect-auditor` | `codereview-architecture-audit` | 레이어 경계 (raw/staging/warehouse/mart), 관계 무결성, 명시적 M:N 조인 테이블, 1:1 확장 테이블 패턴, 순환 의존 |

### 권장 감사자 (1명)

| 감사자 이름 | agent_type | 스킬 | 핵심 책무 |
|---|---|---|---|
| codereview-style | `codereview-style-auditor` | `codereview-style-audit` | 모델 명명 일관성 (`snake_case` vs `camelCase`), ENUM 명명, 감사 컬럼 표준 (`sourceSlug`/`sourceUrl`/`scrapedAt`/`contentHash`/`createdAt`/`updatedAt`) |

## Pokopia 특화 Critical 조건

- `SCHEMA.md` 엔티티 정의를 위반한 필드 누락/이름 변경 (**Critical**)
- 감사 컬럼 표준(`sourceSlug`/`sourceUrl`/`scrapedAt`/`contentHash`) 누락 (**Critical**)
- polymorphic reward 패턴 (`reward_type + reward_ref_id`) 위반 (**Critical**)
- 교차 참조 FK 무결성 위반 (cooking → item, pokemon → specialty 등) (**Critical**)
- ENUM 값이 `SCHEMA.md`에 정의되지 않은 신규 값 (**Warning** — 계획 문서 업데이트 유도)
- 1:1 확장 테이블(food/lost_relic/trade_valuation) 분리 규칙 위반 (**Warning**)

## 재감사 체크포인트

이전 감사 리포트가 주어진 경우, 각 감사자는 이전 finding마다 `resolved` / `partial` / `unresolved` / `regressed` 태그를 붙인다. 특히 스키마 변경은 마이그레이션 파일까지 생성되어야 `resolved`로 판정 — 모델 파일만 수정되고 마이그레이션이 없으면 `partial`.

## 교차 조율 패턴

- `doc-consistency` → `architecture`: SCHEMA.md 위반이 구조 문제인지 명명 문제인지 분류 요청
- `architecture` → `style`: 명명 일관성 지적이 구조적 문제로 격상될 필요 있는지 의견 교환
