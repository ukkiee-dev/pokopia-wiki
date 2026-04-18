---
name: pokopia-schema-prisma
description: Pokopia 프로젝트의 prisma/schema.prisma 파일 작성·변경·마이그레이션. SCHEMA.md의 70+ 엔티티를 Prisma 모델로 변환, i18n 공통 테이블 패턴, polymorphic reward(reward_type + reward_ref_id), 감사 컬럼(sourceSlug/sourceUrl/scrapedAt/contentHash/createdAt/updatedAt), 명시적 M:N 조인 테이블, 1:1 확장 테이블(food/lost_relic/trade_valuation), ENUM 선언. 신규 엔티티 추가·관계 변경·ENUM 확장·마이그레이션 생성 시 반드시 이 스킬을 사용한다.
version: "1.0.0"
---

# Pokopia Prisma 스키마 작성

이 스킬은 SCHEMA.md의 설계를 `prisma/schema.prisma`로 구현하는 방법을 표준화한다. Prisma 컨벤션에 맞추되 SCHEMA.md의 설계 결정은 그대로 보존한다.

## 핵심 원칙

1. **SCHEMA.md가 진실** — 설계 변경은 먼저 SCHEMA.md에서 합의, 그 다음 schema.prisma.
2. **일관된 패턴** — 엔티티마다 즉흥 결정 금지. 감사 컬럼·i18n·M:N·polymorphic reward를 표준으로.
3. **애플리케이션 검증 우선** — polymorphic reward·다국어 locale 등은 DB CHECK 대신 앱 레이어 검증.
4. **모노레포 루트가 마이그레이션 단일 관리** (TECH_STACK §5.2).

## 감사 컬럼 (모든 원본 엔티티 공통, i18n 제외)

```prisma
model Pokemon {
  id           Int      @id @default(autoincrement())
  // 도메인 필드
  pokedexNo    Int?     @unique
  isEvent      Boolean  @default(false)
  // ...
  // ↓ 감사 컬럼 (공통)
  sourceSlug   String   @unique
  sourceUrl    String
  scrapedAt    DateTime
  contentHash  String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  // 관계
  translations PokemonI18n[]
  specialties  PokemonSpecialty[]
  habitats     HabitatPokemon[]
  @@map("pokemon")
}
```

**왜 공통:** 모든 엔티티가 Serebii/PokopiaGuide 등에서 수집되므로 출처·시점·변경 탐지 필드가 필요. 이 6개를 공통으로 강제해서 누락 리스크 제거.

## i18n 테이블 패턴

```prisma
enum I18nSource {
  pokopiaguide
  pokopoko
  namuwiki
  pokemon_official
  manual
  pending
}

model PokemonI18n {
  pokemonId   Int
  locale      String     // 'en' | 'ko' | 'ja'(향후) — ENUM 금지
  name        String
  description String?
  source      I18nSource
  verified    Boolean    @default(false)
  verifiedAt  DateTime?
  verifiedBy  String?
  pokemon     Pokemon    @relation(fields: [pokemonId], references: [id])
  @@id([pokemonId, locale])
  @@map("pokemon_i18n")
}
```

- `locale`은 String (ENUM 확장 리스크 회피)
- `(entityId, locale)` 복합 PK로 중복 방지
- 모든 i18n 테이블이 동일 패턴을 따른다

## 명시적 M:N 조인 테이블

implicit M:N 금지. 감사 컬럼 확장 여지 확보.

```prisma
model PokemonSpecialty {
  pokemonId   Int
  specialtyId Int
  pokemon     Pokemon   @relation(fields: [pokemonId], references: [id])
  specialty   Specialty @relation(fields: [specialtyId], references: [id])
  @@id([pokemonId, specialtyId])
  @@map("pokemon_specialty")
}
```

## Polymorphic Reward 패턴

SCHEMA §1.3에 정의된 공통 패턴. `environment_reward`, `pokedex_milestone`, `human_record`, `island_reward`, `jumprope_tier`, `hideandsneak_reward`에 적용.

```prisma
enum EnvironmentRewardType {
  item
  recipe
  feature_unlock
  shop_unlock
}

model EnvironmentReward {
  id           Int                    @id @default(autoincrement())
  locationId   Int
  level        Int
  rewardType   EnvironmentRewardType
  rewardRefId  Int?
  note         String?
  location     Location               @relation(fields: [locationId], references: [id])
  // 감사 컬럼…
  @@map("environment_reward")
}
```

**주의:**
- `rewardRefId`는 Int 참조. FK 제약 걸지 않음(복수 테이블 참조 때문).
- 참조 정합성은 애플리케이션(`qa-analyst` + `validators/`)에서 검증.
- 각 테이블마다 `reward_type` ENUM이 다를 수 있음 (island_reward는 item/cd/recipe만).

## 1:1 확장 테이블 패턴

`food`, `lost_relic`, `trade_valuation`은 `item`의 1:1 확장.

```prisma
model Food {
  itemId     Int        @id
  flavor     FoodFlavor
  ppRestore  PpRestore
  moveBoost  MoveBoost?
  item       Item       @relation(fields: [itemId], references: [id])
  @@map("food")
}
```

- `itemId`가 FK + PK 동시
- 확장 테이블은 본 item의 종속성

## ENUM 변환 규칙

Prisma ENUM은 식별자 규칙을 따라야 한다. 공백·하이픈 포함 시 변환:

| SCHEMA.md 값 | Prisma ENUM 값 | 매핑 방향 |
|-------------|---------------|---------|
| `Key Items` | `Key_Items` | 앱에서 역매핑 필요 |
| `Build Kit` | `Build_Kit` | 동일 |
| `Dream Island` | `Dream_Island` | 동일 |

또는 `@@map`으로 DB 컬럼명 지정:

```prisma
enum ItemLocationMethod {
  Natural
  Craft
  Shop
  Trade
  Dream_Island  @map("Dream Island")
  Build_Kit     @map("Build Kit")
  Relic_Appraisal @map("Relic Appraisal")
  Pokemon_Center  @map("Pokemon Center")
  Litter
}
```

위 방식이 더 안전. DB에 스페이스 포함 값 저장, Prisma Client에서는 `Dream_Island` 심볼 사용.

## 네이밍 컨벤션

| 대상 | 컨벤션 | 예 |
|------|-------|-----|
| 모델 이름 | PascalCase | `Pokemon`, `PokemonI18n` |
| Prisma 필드 | camelCase | `pokedexNo`, `sourceSlug` |
| DB 컬럼 | snake_case (via `@map`) | `pokedex_no`, `source_slug` |
| DB 테이블 | snake_case (via `@@map`) | `pokemon`, `pokemon_i18n` |
| ENUM 이름 | PascalCase | `I18nSource`, `ItemCategory` |

모든 모델에 `@@map("snake_case_name")` 명시.

## 인덱싱 가이드

```prisma
model Pokemon {
  // ...
  @@index([category])                // qa-analyst가 쿼리
  @@index([isEvent, isUniqueCharacter])
}
```

- `sourceSlug` UNIQUE (모든 엔티티)
- FK는 Prisma가 자동 인덱스 생성하지 않을 수 있음 (버전 확인 필요)
- Phase 7 교차 참조 쿼리가 자주 쓰는 필드에 인덱스 추가

## 마이그레이션 절차

```bash
# 1) schema.prisma 수정
# 2) 개발 환경 마이그레이션 생성
pnpm prisma migrate dev --name add_trade_valuation

# 3) 생성된 SQL 검토 (prisma/migrations/YYYYMMDD_add_trade_valuation/migration.sql)

# 4) 프로덕션 적용 (절대 --force 금지)
pnpm prisma migrate deploy
```

### 위험한 변경 — 선행 조치

| 변경 | 필요 조치 |
|------|----------|
| 컬럼 DROP | 데이터 백업 + 사용처 확인 + 사용자 승인 |
| ENUM 값 제거 | 기존 레코드에서 해당 값 사용 여부 확인 |
| FK 관계 변경 | 기존 데이터 무결성 검증 |
| `@default` 변경 | 기존 NULL 행 처리 방침 |

## 기존 엔티티 재사용 패턴

- **`item`은 상위 카테고리**. Furniture, Food, Lost Relic, Key Item 등은 전부 `item.category`로 분류하고, 필요 시 1:1 확장 테이블(`food`, `lost_relic`)로 추가 속성.
- **이미지는 `entity_image` 단일 테이블**. 각 엔티티에 `imageUrl` 단일 필드 금지 (SCHEMA §2.25).
- **번역 충돌은 `translation_conflict`에 polymorphic 기록** (entity_type + entity_id TEXT/INT pair).

## 체크리스트 (스키마 작성/변경 시)

- [ ] SCHEMA.md와 엔티티·필드·관계 일치
- [ ] 감사 컬럼 6개 공통 포함 (원본 엔티티)
- [ ] i18n 테이블 확장 컬럼 포함 (source, verified, verified_at, verified_by)
- [ ] M:N은 명시적 조인 테이블 + 복합 PK
- [ ] Polymorphic reward는 애플리케이션 검증으로 남김 (CHECK 없음)
- [ ] `@@map` / `@map` 으로 snake_case DB 이름 지정
- [ ] ENUM 값 중 공백·하이픈 → `@map` 유지
- [ ] UNIQUE 인덱스 (sourceSlug 등) 적용
- [ ] 마이그레이션 이름은 의미 기반
- [ ] `pnpm prisma format` 통과
- [ ] `pnpm prisma validate` 통과

## 공유 스키마 전략 (scraper ↔ api)

TECH_STACK §5.2: 모노레포(`pokopia-wiki`) 루트의 `prisma/schema.prisma`를 단일 소스로 두고, `shared`가 생성된 Prisma Client를 re-export. scraper·api 모두 `@pokopia-wiki/shared`에서 `PrismaClient`를 import한다.

- Prisma generator `output`을 `shared/src/prisma-client/`로 설정
- 각 패키지 `package.json`에 `"@pokopia-wiki/shared": "workspace:*"` 의존성 선언
- 마이그레이션은 루트에서 `pnpm prisma migrate dev`로 단일 관리

Git submodule·수동 복사·별도 npm 패키지 같은 레포 분리 시절의 옵션은 workspace 공유로 대체되어 더 이상 사용하지 않는다.

## 금지 사항

- SCHEMA.md 건너뛰고 schema.prisma만 편집 (SSoT 위반)
- 프로덕션 DB에 `--force` 적용
- implicit M:N 사용
- 복수 엔티티에 `imageUrl` 개별 필드 추가 (entity_image 단일 소스 위반)
- CHECK 제약으로 polymorphic reward 참조 강제 (유지보수 악몽)

## 참조

- 설계 원칙: `SCHEMA.md §1`
- 엔티티 전체 목록: `SCHEMA.md §2`
- ERD: `SCHEMA.md §3`
- 공유 전략: `TECH_STACK.md §5.2`
