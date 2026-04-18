---
name: pokopia-quality-gate
description: Pokopia 데이터 품질 게이트. Zod 스키마 실행, Phase별 incremental QA, 교차 참조 검증(cooking 재료→item, pokemon→specialty, crafting result_item→item), 한국어 커버리지 리포트(포켓몬 100%/아이템 90%+/메커니즘 80%+), 번역 충돌 분석, Attribution 완전성 검증(sourceUrl/license/copyrightHolder/attribution), 이미지 누락 탐지, 경계면(JSON↔DB↔SCHEMA↔문서) 불일치 비교. 파싱 완료 직후·Phase 7 최종 검증·수량 실측·데이터 품질 의심 시 반드시 이 스킬을 사용한다.
version: "1.0.0"
---

# Pokopia 품질 게이트 (Quality Gate)

이 스킬은 스크래퍼 산출물의 경계면 정합성을 검증한다. 존재 확인이 아니라 JSON ↔ DB ↔ SCHEMA ↔ 문서 4자 간 **교차 비교**로 버그를 조기에 잡는다.

## 왜 경계면 비교인가

"테이블에 199개 있다"는 존재 확인일 뿐이다. 실제 버그는 경계에서 발생한다:
- 파서 출력 JSON은 맞지만 Prisma 모델에 필드명 불일치 → 로드 누락
- DB에 있지만 SCHEMA.md 정의와 타입 다름 → 향후 마이그레이션 실패
- 문서 수량 "300+"인데 실측 250 → 문서 stale

각 경계에서 2개 소스를 동시에 읽고 **shape·수량·값**을 비교해야 실제 버그를 잡는다.

## QA 실행 타이밍

**Incremental QA (기본):** Phase 완료 직후 즉시.
- Phase 1 (pokemon, specialty, location, item) 완료 → QA
- Phase 2 (habitat, furniture, cooking 등) 완료 → QA
- ...

**전체 QA (Phase 7):** 모든 Phase 완료 후 최종 검증 1회.

Incremental이 중요한 이유: 초기 버그를 후반 Phase에서 발견하면 재작업 범위가 커짐.

## 검증 카테고리 6개

### 1. Zod 스키마 실행 검증

- 파서 직후 + DB 로드 전 2회 검증
- 실패 시 `data/invalid/<source>/<timestamp>/`에 HTML+결과+에러 저장
- 임계치: 10건/시간 초과 시 `critical` 알림 → `ops-conductor` 중단 권고

### 2. DB 교차 참조 (DATA_COLLECTION_PLAN §8.1)

```sql
-- 일반 포켓몬에 specialty 매핑 최소 1개
SELECT p.id, p.source_slug
FROM pokemon p
WHERE p.is_event = false
  AND p.is_unique_character = false
  AND NOT EXISTS (
    SELECT 1 FROM pokemon_specialty ps WHERE ps.pokemon_id = p.id
  );
-- 결과: 0건이어야 함
```

```sql
-- 모든 item에 EN i18n 존재
SELECT i.id, i.source_slug
FROM item i
LEFT JOIN item_i18n ii ON ii.item_id = i.id AND ii.locale = 'en'
WHERE ii.item_id IS NULL;
-- 결과: 0건
```

```sql
-- crafting_recipe.result_item_id가 유효한 item 참조
SELECT cr.id
FROM crafting_recipe cr
LEFT JOIN item i ON i.id = cr.result_item_id
WHERE i.id IS NULL;
-- 결과: 0건 (FK가 자동 enforce하지만 추가 확인)
```

### 3. Polymorphic Reward 검증 (앱 레이어)

`reward_type` + `reward_ref_id` 쌍이 유효한지 테이블 분기로 확인.

```typescript
// src/validators/polymorphic.ts
export async function validateEnvironmentReward(): Promise<Violation[]> {
  const rewards = await prisma.environmentReward.findMany()
  const violations: Violation[] = []

  for (const r of rewards) {
    if (r.rewardRefId === null) continue
    let exists: boolean
    switch (r.rewardType) {
      case 'item':
        exists = (await prisma.item.findUnique({ where: { id: r.rewardRefId } })) !== null
        break
      case 'recipe':
        exists = (await prisma.craftingRecipe.findUnique({ where: { id: r.rewardRefId } })) !== null
        break
      case 'feature_unlock':
      case 'shop_unlock':
        continue  // ref가 의미 없음, note 문자열
    }
    if (!exists) {
      violations.push({
        table: 'environment_reward',
        id: r.id,
        reason: `reward_ref_id ${r.rewardRefId} not found in ${r.rewardType} table`,
      })
    }
  }
  return violations
}
```

같은 패턴을 `pokedex_milestone`, `human_record`, `island_reward`, `jumprope_tier`, `hideandsneak_reward`에 적용.

### 4. 한국어 커버리지 리포트

```typescript
// src/validators/coverage.ts
export async function coverageReport(): Promise<CoverageReport> {
  const pokemon = await pokemonKoCoverage()
  const item = await itemKoCoverage()
  const mechanism = await mechanismKoCoverage()

  return {
    pokemon: {
      total: pokemon.total,
      mapped: pokemon.mapped,
      verified: pokemon.verified,
      pending: pokemon.pending,
      percentage: (pokemon.mapped / pokemon.total) * 100,
      target: 100,
      passes: pokemon.mapped / pokemon.total >= 1.0,
    },
    item: {
      target: 90,
      passes: /* ... */,
      // ...
    },
    // ...
  }
}
```

- 목표: 포켓몬 100%, 아이템 90%+, 메커니즘 80%+
- 미달 시 `source='pending'` 목록을 별도 리포트

### 5. Attribution 완전성 (CRAWLING_STRATEGY §27.3)

```sql
-- 모든 pokemon 레코드에 attribution 필드 완전성
SELECT id, source_slug
FROM pokemon
WHERE source_url IS NULL
   OR source_url = ''
   OR scraped_at IS NULL;
-- 결과: 0건
```

한국어 매핑 레코드는 `derivedFrom`이 JSON 필드라면 조회 쿼리 조정:
```sql
SELECT id FROM pokemon_i18n WHERE locale='ko' AND (derived_from IS NULL OR derived_from = '{}');
```

### 6. 수량 실측 vs 추정 (DATA_COLLECTION_PLAN §10)

```typescript
const expectations = {
  pokemon: { min: 217, description: 'pokemon (일반+이벤트+고유+전설 합계)' },
  // 199 + 4 + 4 + ~10
  habitat: { min: 213, description: 'habitat (일반 209 + 이벤트 4)' },
  item: { min: 300, description: 'item 300+' },
  specialty: { exact: 33 },
  cd: { exact: 43 },
  // ...
}

for (const [entity, exp] of Object.entries(expectations)) {
  const actual = await prisma[entity].count()
  if (exp.exact && actual !== exp.exact) violations.push(`${entity}: expected ${exp.exact}, got ${actual}`)
  if (exp.min && actual < exp.min) violations.push(`${entity}: expected ≥${exp.min}, got ${actual}`)
}
```

## Phase 7 최종 검증 (CRAWLING_STRATEGY §27.3)

Phase 7에서 한 번에 실행:

1. 모든 엔티티 수량 기대치 통과
2. Zod 재검증 (전체 데이터 스냅샷)
3. 교차 참조 0건 위반
4. Polymorphic reward ref 유효
5. Attribution 완전
6. 이미지 누락 리포트 (`phase-7/missing-images.json`)
7. 한국어 커버리지 목표 달성
8. translation_conflict 미해결 항목 리포트

## 경계면 비교 실전 (핵심)

### 잘못된 예

```typescript
// ❌ 존재만 확인
expect(await prisma.pokemon.count()).toBeGreaterThanOrEqual(199)
```

### 올바른 예

```typescript
// ✅ JSON ↔ DB 비교
const jsonDex = JSON.parse(await fs.readFile('data/parsed/pokemon/serebii.json', 'utf8'))
const jsonSet = new Set(jsonDex.map((p) => p.pokedexNo))

const dbSet = new Set(
  (await prisma.pokemon.findMany({ select: { pokedexNo: true } }))
    .map((p) => p.pokedexNo)
    .filter(Boolean)
)

const missingInDB = [...jsonSet].filter((n) => !dbSet.has(n))
const unknownInDB = [...dbSet].filter((n) => !jsonSet.has(n))

if (missingInDB.length > 0) {
  violations.push(`DB missing pokedexNo: ${missingInDB.join(',')}`)
}
if (unknownInDB.length > 0) {
  violations.push(`DB has unknown pokedexNo: ${unknownInDB.join(',')}`)
}
```

### DB ↔ SCHEMA 비교 (메타)

Prisma Studio 출력과 SCHEMA.md를 eyeball하는 대신 스크립트로 자동화.

```typescript
// src/validators/schema-drift.ts
// schema.prisma를 AST 파싱 → SCHEMA.md의 모델 목록과 비교
// - SCHEMA에 있고 prisma에 없는 모델 → 경보
// - prisma에 있고 SCHEMA에 없는 모델 → 경보 (doc-strategist 알림)
```

## 파싱 실패율 모니터링 (DATA_COLLECTION_PLAN §7.3)

- 24시간 롤링 윈도우: `(파싱 에러 페이지 수 / 처리 페이지 수) × 100`
- ≥5% → `code-builder`에 경보 (Slack/Telegram 알림 + `warn` 이벤트)
- ≥20% → 해당 파서 서킷 브레이커, `ops-conductor`에 중단 요청

## 검증 실행

```bash
# 전체 검증
pnpm run validate

# Phase별
pnpm run validate --phase 1
pnpm run validate --phase 7  # 최종

# 특정 카테고리만
pnpm run validate --cross-ref
pnpm run validate --coverage
pnpm run validate --attribution
```

## 실패 리포트 포맷

```markdown
# QA Report: Phase 1 (2026-05-15)

## Summary
- Total entities: 5,123
- Zod pass: 5,100 / 5,123 (99.6%)
- Cross-ref violations: 3
- Coverage target met: pokemon ✓, item ✓, mechanism ✗

## Failures

### Zod (23 items)
- source: serebii
  - file: data/invalid/serebii/2026-05-15T10-23-45/page.html
  - errors: description field empty (required)
  - reproduce: ...

### Cross-ref (3 items)
1. pokemon_id=456 missing pokemon_specialty mapping
2. ...

## Action Required
- [code-builder] Fix parser for item description (see data/invalid/serebii/2026-05-15T10-23-45/)
- [doc-strategist] Update item count estimate (actual: 275, doc says 300+)
```

## 체크리스트 (Phase 완료 시 QA)

- [ ] Zod safeParse 100% 통과 (예외 케이스 제외하고)
- [ ] 교차 참조 0건 위반
- [ ] 수량 실측 vs 문서 추정 갭 리포트
- [ ] Attribution 완전성 확인
- [ ] 한국어 커버리지 (Phase 8 이후에만)
- [ ] 이미지 URL 로컬 파일 존재 확인 (Phase 9)
- [ ] `data/reports/coverage_phase{N}_{YYYYMMDD}.md` 생성

## 금지 사항

- DB 데이터 수정 (조회만)
- `data/invalid/` 삭제
- 임계치 완화로 통과 위장
- 경계면 비교 대신 존재 확인만
- 실패 원인 분석 없이 리포트 제출

## 참조

- 검증 규칙: `DATA_COLLECTION_PLAN.md §8.1`
- 커버리지 목표: `DATA_COLLECTION_PLAN.md §8.2`
- Zod 스키마: `CRAWLING_STRATEGY.md §27.1`
- Phase 7 최종 검증: `CRAWLING_STRATEGY.md §27.3`
- Attribution 규칙: `CRAWLING_STRATEGY.md §27.1 + §27.4`
