---
name: pokopia-i18n-mapper
description: Pokopia 한국어 매핑과 translation_conflict 해결. 4소스(PokopiaGuide/포코포코/나무위키/포켓몬 공식 DB) 매핑 우선순위, i18n.source ENUM(pokopiaguide/pokopoko/namuwiki/pokemon_official/manual/pending), 매칭 키 정규화(normalizeForMatch), 포켓몬 공식명 교차 검증, pending→manual 상태 전이, 나무위키 수동 복사(data/manual/namuwiki/). DATA_COLLECTION_PLAN Phase 8 구현·i18n 레코드 작성·번역 충돌 리뷰 큐 처리·한국어 커버리지 확장 시 반드시 이 스킬을 사용한다.
version: "1.0.0"
---

# Pokopia 한국어 매핑 (i18n Mapper)

이 스킬은 영문(Serebii) 엔티티에 한국어 번역을 매핑하고 소스 간 충돌을 체계적으로 해결한다.

## 왜 4소스인가

단일 소스는 커버리지가 부족하고(PokopiaGuide조차 누락 있음), 공식성도 제한적이다. 우선순위별 4소스 + 교차 검증으로 품질과 커버리지 동시 확보.

| 순위 | 소스 | `i18n.source` | 역할 |
|------|------|--------------|------|
| 1 | PokopiaGuide.com/ko | `pokopiaguide` | 기본 매핑 (포켓몬 100%, 아이템 90%+ 예상) |
| 2 | 포코포코(pokopoko.kr) | `pokopoko` | 1순위 누락분 보충 |
| 3 | 나무위키(namu.wiki) | `namuwiki` | 상위 누락분 보충 (수동 복사) |
| 4 | 포켓몬 공식(pokemon.com/ko) | `pokemon_official` | 포켓몬 이름 교차 검증 전용 |
| 5 | 수동 (2상태) | `manual` / `pending` | 모두 없으면 → pending → 완료 시 manual |

## 매칭 키 (DATA_COLLECTION_PLAN §4.2)

| 엔티티 | 매칭 키 | 신뢰도 |
|--------|--------|-------|
| 포켓몬 | 도감 번호 | 높음 |
| 아이템 | 정규화 영문 이름 | 중간 |
| 서식지 | 서식지 번호 | 높음 |
| 지역 | 영문 이름 | 높음 |
| 스페셜티 | 영문 이름 | 높음 |
| 레시피 | 영문 이름 + 주재료 조합 | 중간 |

### 정규화 함수 (normalizeForMatch)

```typescript
// src/mappers/normalize.ts
export function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "'")      // smart quotes → straight quote
    .replace(/\s+/g, ' ')       // 연속 공백 → 단일 공백
    .replace(/[^\w\s']/g, '')   // 알파넘 + 공백 + apostrophe만 유지
}

// "Oran Berry"  → "oran berry"
// "X–Scissor"   → "xscissor"  (— 제거)
// "Zinc  Ore"   → "zinc ore"
```

**왜:** 소스 간 띄어쓰기·특수문자 차이가 흔함. 하드매칭보다 정규화 후 매칭이 실용적.

## Phase 8 실행 순서 (DATA_COLLECTION_PLAN §6 Phase 8)

```
Phase 41: PokopiaGuide 1차 매핑 → source='pokopiaguide', verified=false
Phase 42: 누락 항목 → 포코포코 보충 → source='pokopoko', verified=false
Phase 43: 나무위키 수동 복사 → source='namuwiki', verified=false
Phase 44: 포켓몬 공식 교차 검증 (포켓몬 이름만)
  ├── 값 일치 → verified=true, verified_at/_by 갱신 (source 유지)
  └── 값 불일치 → translation_conflict 기록 + 공식 값으로 overwrite + source='pokemon_official', verified=true
Phase 45: 다중 소스 충돌 → translation_conflict 큐, 수동 리뷰 (SLA: 10건 or 7일)
Phase 46: 번역 대상 관리
  ├── 어떤 소스에도 없으면 → source='pending'
  └── 담당자 완료 시 → source='manual', verified=true, verified_by
```

## `i18n.source` ENUM (SCHEMA.md §1.2)

```
ENUM(pokopiaguide, pokopoko, namuwiki, pokemon_official, manual, pending)
```

- `pending`: 번역 대기 큐 (소스 없음)
- `manual`: 담당자 직접 번역 완료 (외부 소스 없음)
- `pending → manual` 전이: 값 채움 + `verified=true`, `verified_by` 기록

## 충돌 해결 워크플로 (DATA_COLLECTION_PLAN §4.4)

```
1. 여러 소스에서 같은 엔티티에 대해 다른 한국어 값 발견
   → translation_conflict에 네 가지 소스 값 기록
2. 기본 규칙: 1순위(PokopiaGuide) 값을 i18n에 삽입, verified=false
3. 포켓몬 이름 예외: 공식 DB 값이 PokopiaGuide와 다르면 공식 값 우선
4. 수동 리뷰 → resolved_value 확정 후
   ├── i18n 테이블 업데이트
   ├── verified=true, verified_at/verified_by
   └── translation_conflict.resolved_* 기록
5. SLA: 충돌 10건 누적 or 7일 경과 시 리뷰 처리
```

### translation_conflict 스키마 (SCHEMA.md §2.26)

```prisma
model TranslationConflict {
  id                   Int       @id @default(autoincrement())
  entityType           String
  entityId             Int
  field                String    // 'name', 'description'
  pokopiaguideValue    String?
  pokopokoValue        String?
  namuwikiValue        String?
  pokemonOfficialValue String?
  resolvedValue        String?
  resolvedBy           String?
  resolvedAt           DateTime?
  @@map("translation_conflict")
}
```

## 구현 구조

```
src/
└── mappers/
    ├── pokopia-guide.ts   # Phase 41
    ├── pokopoko.ts        # Phase 42
    ├── namuwiki-manual.ts # Phase 43 (data/manual/namuwiki/ 읽기)
    ├── pokemon-official.ts # Phase 44
    ├── normalize.ts       # 정규화 함수
    ├── conflict.ts        # translation_conflict 기록/조회
    └── coverage.ts        # 커버리지 계산 (qa-analyst와 공유)
```

## PokopiaGuide 매핑 (1순위)

```typescript
// src/mappers/pokopia-guide.ts
import { prisma } from '@/db'
import { PlaywrightFetcher } from '@/fetchers/playwright-fetcher'
import { buildSourceMetadata } from '@/validators/metadata'

export async function mapPokemonKo(): Promise<void> {
  const englishPokemon = await prisma.pokemon.findMany({
    where: { /* KO i18n 없는 포켓몬 */ },
  })

  for (const p of englishPokemon) {
    if (!p.pokedexNo) continue
    const guideUrl = `https://www.pokopiaguide.com/ko/pokedex/${p.pokedexNo}`
    const pageData = await fetchPokopiaGuidePokemon(p.pokedexNo)
    if (!pageData) continue

    const koMapping = KoreanPokemonMappingSchema.parse({
      pokedexNo: p.pokedexNo,
      nameKo: pageData.nameKo,
      ...buildSourceMetadata({
        sourceSite: 'pokopiaGuide',
        sourceUrl: guideUrl,
        derivedFrom: {
          sourceSite: 'serebii',
          sourceUrl: p.sourceUrl,
        },
      }),
    })

    await prisma.pokemonI18n.upsert({
      where: { pokemonId_locale: { pokemonId: p.id, locale: 'ko' } },
      create: {
        pokemonId: p.id,
        locale: 'ko',
        name: koMapping.nameKo,
        source: 'pokopiaguide',
        verified: false,
      },
      update: {/* 기존 유지, 새 source가 아니면 덮어쓰지 않음 */},
    })
  }
}
```

## 나무위키 수동 복사 (3순위)

```
data/manual/namuwiki/<entity-type>/<slug>.md
```

Markdown 프론트매터:
```yaml
---
entity_type: pokemon
entity_id: 25
field: description
source_url: https://namu.wiki/w/Pikachu
copied_at: 2026-05-01T10:00:00Z
---

(본문)
```

전용 파서가 디렉토리를 읽어 `source='namuwiki'`, `verified=false`로 i18n 삽입.

## 포켓몬 공식 교차 검증 (4순위)

**포켓몬 이름에 한해서만 적용**. 다른 엔티티는 대상 아님.

```typescript
// src/mappers/pokemon-official.ts
export async function crossVerifyPokemonNames(): Promise<void> {
  const withKo = await prisma.pokemonI18n.findMany({
    where: { locale: 'ko' },
    include: { pokemon: true },
  })

  for (const row of withKo) {
    const officialName = await fetchPokemonOfficialKo(row.pokemon.pokedexNo!)
    if (!officialName) continue

    if (officialName === row.name) {
      // 값 일치 → verified=true, source 유지
      await prisma.pokemonI18n.update({
        where: { pokemonId_locale: { pokemonId: row.pokemonId, locale: 'ko' } },
        data: {
          verified: true,
          verifiedAt: new Date(),
          verifiedBy: 'pokemon_official_auto',
        },
      })
    } else {
      // 값 불일치 → translation_conflict + 공식값 덮어쓰기
      await prisma.translationConflict.create({
        data: {
          entityType: 'pokemon',
          entityId: row.pokemonId,
          field: 'name',
          pokopiaguideValue: row.source === 'pokopiaguide' ? row.name : null,
          pokopokoValue: row.source === 'pokopoko' ? row.name : null,
          pokemonOfficialValue: officialName,
          resolvedValue: officialName,   // 공식이 우선
          resolvedBy: 'auto',
          resolvedAt: new Date(),
        },
      })
      await prisma.pokemonI18n.update({
        where: { pokemonId_locale: { pokemonId: row.pokemonId, locale: 'ko' } },
        data: {
          name: officialName,
          source: 'pokemon_official',
          verified: true,
          verifiedAt: new Date(),
          verifiedBy: 'pokemon_official_auto',
        },
      })
    }
  }
}
```

## pending → manual 전이

```typescript
// src/mappers/manual-queue.ts
export async function markPending(): Promise<void> {
  // 어떤 소스에도 없는 엔티티를 pending으로 마킹
  const missingKo = await findEntitiesWithoutKoI18n()
  for (const m of missingKo) {
    await prisma.itemI18n.create({  // 예시: item
      data: {
        itemId: m.id,
        locale: 'ko',
        name: '',        // 빈 값
        source: 'pending',
        verified: false,
      },
    })
  }
}

export async function completeManual(entityType: string, entityId: number, translation: string, translator: string): Promise<void> {
  // 담당자 번역 완료
  await prisma[entityType + 'I18n'].update({
    where: { /* ... */ },
    data: {
      name: translation,
      source: 'manual',
      verified: true,
      verifiedAt: new Date(),
      verifiedBy: translator,
    },
  })
}
```

## 커버리지 리포트 (qa-analyst와 공유)

```sql
-- 포켓몬 KO 커버리지 (verified 포함)
SELECT
  COUNT(DISTINCT p.id) AS total,
  COUNT(DISTINCT CASE WHEN i.source NOT IN ('pending') THEN p.id END) AS mapped,
  COUNT(DISTINCT CASE WHEN i.verified = true THEN p.id END) AS verified,
  COUNT(DISTINCT CASE WHEN i.source = 'pending' THEN p.id END) AS pending
FROM pokemon p
LEFT JOIN pokemon_i18n i ON i.pokemon_id = p.id AND i.locale = 'ko';
```

**목표:**
- 포켓몬: 100%
- 아이템: 90%+
- 메커니즘 설명: 80%+

## 체크리스트 (새 매핑 소스 추가 시)

- [ ] `i18n.source` ENUM에 값 추가 (SCHEMA.md + schema.prisma)
- [ ] CRAWLING_STRATEGY §27.1 `SourceSiteEnum`에 추가 (필요 시)
- [ ] DATA_COLLECTION_PLAN §4.1 우선순위표 업데이트
- [ ] `buildSourceMetadata` SOURCE_DEFAULTS에 라이선스/저작권/attribution 추가
- [ ] 매핑 로직에 `derivedFrom` 포함
- [ ] 충돌 기록 로직 확장 (translation_conflict 컬럼 추가 필요 시)
- [ ] 커버리지 쿼리 갱신

## 금지 사항

- 1순위 기존 값을 2순위로 무조건 덮어쓰기 (충돌 기록 없이)
- 나무위키 자동 수집 시도 (403, §7.4 — 수동 복사만 허용)
- `derivedFrom` 생략
- 정규화 없이 하드매칭
- `pending` 상태 삭제 (수동 큐 유지)

## 참조

- 매핑 전략: `DATA_COLLECTION_PLAN.md §4`
- 충돌 워크플로: `DATA_COLLECTION_PLAN.md §4.4`
- ENUM 정의: `SCHEMA.md §1.2`
- translation_conflict 스키마: `SCHEMA.md §2.26`
- 나무위키 수동 복사: `DATA_COLLECTION_PLAN.md §4.5`, §7.4
