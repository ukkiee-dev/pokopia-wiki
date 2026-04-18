# Phase Profile: parser

**적용 범위:** HTML 파서, Zod 스키마, 소스별 파싱 로직, `SourceMetadata` 주입, 셀렉터 버전 관리.

## 대상 아티팩트 패턴

- `src/parsers/**/*.ts`
- `src/schemas/**/*.ts` (Zod)
- `src/types/source-metadata.ts`
- `data/invalid/**/*.json` (파싱 실패 샘플)

## 감사자 구성

### 필수 감사자 (2명)

| 감사자 이름 | agent_type | 스킬 | 핵심 책무 |
|---|---|---|---|
| pokopia-quality-gate | `pokopia-qa-analyst` | `pokopia-quality-gate` | Zod safeParse 커버리지, 파싱 실패율, 교차 참조 실측 (cooking 재료 → item, pokemon → specialty, crafting result_item → item), 필드 누락률, Attribution 완전성 |
| pokopia-i18n-mapper | `general-purpose` (스킬 참조) | `pokopia-i18n-mapper` | 한국어 매핑 우선순위, `i18n.source` ENUM 준수, 포켓몬 공식명 교차 검증, pending→manual 전이, translation_conflict 처리 |

### 권장 감사자 (2명)

| 감사자 이름 | agent_type | 스킬 | 핵심 책무 |
|---|---|---|---|
| codereview-performance | `codereview-performance-auditor` | `codereview-performance-audit` | 정규식 복잡도 (ReDoS), 불필요한 DOM 순회, 파서 캐싱 누락, 대용량 HTML에서의 메모리 사용 |
| codereview-style | `codereview-style-auditor` | `codereview-style-audit` | 셀렉터 상수화, `SELECTOR_VERSION` 버전 bump 누락, 반복 코드 추출, 타입 안전성 (`any` 남용) |

## Pokopia 특화 Critical 조건

- Zod `safeParse` 실패 시 `data/invalid/` 격리 로직 누락 (**Critical**)
- `SourceMetadata` 주입 누락 (`buildSourceMetadata` 미호출) (**Critical**)
- 파싱 실패율 임계 초과 (소스별 기준: Serebii 5%, PokopiaGuide 3%, pokopoko 10%, namu.wiki 15%) (**Critical**)
- 한국어 커버리지 목표 미달 (포켓몬 100%, 아이템 90%, 메커니즘 80%) (**Critical**)
- 교차 참조 깨짐 (parser가 만든 cooking.ingredient_item_slug가 item 테이블에 없음) (**Critical**)
- Attribution 필드 누락 (`sourceUrl`/`license`/`copyrightHolder`/`attribution`) (**Critical**)
- `SELECTOR_VERSION` bump 없이 셀렉터 변경 (**Warning**)

## 재감사 체크포인트

이전 파싱 실패율이 임계를 넘었다면, 재감사 시 동일 샘플에 대한 실측값을 반드시 보고한다. 수치 비교 없이 "개선됨"으로 판정 금지.

## 교차 조율 패턴

- `quality-gate` → `i18n-mapper`: 파싱된 필드에 한국어 매핑이 누락되면 i18n에 알림
- `i18n-mapper` → `quality-gate`: translation_conflict 다수 발견 시 교차 참조 전반 점검 요청
- `performance` ↔ `style`: ReDoS 방어와 정규식 가독성 트레이드오프 논의
