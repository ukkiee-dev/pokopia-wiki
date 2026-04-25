# Loaders — Phase 9 선결 코드 가이드

본 디렉토리는 파서 출력 entity 를 Prisma 로 멱등 upsert 하는 loader 모듈을 담는다.

## 핵심 모듈

- **`upsert-loader.ts`** — generic `upsertBySourceSlug` helper.
  content_hash 기반 idempotency, 부분 실패 허용. 모든 entity loader 의 베이스.
- **`invalid-isolator.ts`** — 파서 실패 entity 격리 (`data/invalid/<source>/<timestamp>/`).
- **`registry.ts`** — page ID → loader 디스패치 (CLI 가 호출).

## 패턴 1: input.slug 직접 사용

대부분의 파서 출력은 `slug` 필드를 명시적으로 가진다. `simple-loaders.ts` /
`specialty-loader.ts` 의 패턴을 복제 후 model/payload 만 교체.

## 패턴 2: sourceUrl 추출 (Pokemon)

`PokemonInput` 처럼 명시적 slug 필드가 없고 URL 의 마지막 path segment 가 자연키
역할인 경우 `pokemon-loader.ts` 의 `extractSlugFromUrl` 패턴.

## 패턴 3: 2-pass FK 해소 (Cd, Location)

의존 entity 먼저 upsert + ID 룩업 후 본 entity FK 주입.
`cd-loader.ts` (SourceGame → Cd), `location-loader.ts` (parent self-ref).

## 패턴 4: 3-pass M:N replace (Item, Habitat, Recipe)

본 entity upsert + ID 룩업 + nested table deleteMany + createMany replace.
`item-loader.ts` (tags + locations), `habitat-loader.ts` (HabitatPokemon),
`recipe-loader.ts` (ingredients).

## 패턴 5: Polymorphic FK 매핑

reward_type ENUM + reward_ref_id 분기.
`environment-reward-loader.ts` (item / recipe), `human-record-loader.ts`
(item / cd / customization / none), `island-variant-loader.ts` (rewards),
`pokedex-milestone-loader.ts` (item / recipe).

## 룩업 헬퍼

다른 loader 가 FK 해소 시 재사용:

| 헬퍼 | 모듈 | 반환 |
|---|---|---|
| `lookupItemIds` | `item-loader.ts` | slug → Item.id |
| `lookupLocationIds` | `location-loader.ts` | slug → Location.id |
| `lookupPokemonIds` | `pokemon-loader.ts` | slug → Pokemon.id |
| `lookupHabitatIds` | `habitat-loader.ts` | slug → Habitat.id |

## 등록 현황 (registry.ts)

CLI `--list-loaders` 로 확인 가능. 51 page 중 50 page 등록 (98%).

### 등록 완료 (50 page)

| Page ID | Loader | 처리 entity |
|---|---|---|
| `available-pokemon` / `availablepokemon` | `pokemon-loader` | Pokemon |
| `specialty` | `specialty-loader` | Specialty |
| `mosslaxboosts` | `simple-loaders` | MosslaxBoost |
| `stampcard` / `stampcard-card` | `simple-loaders` | StampCard |
| `favorites` | `simple-loaders` | FavoriteCategory |
| `friendship` | `simple-loaders` | FriendshipTier (placeholder) |
| `electricity` | `simple-loaders` | Generator |
| `water` | `simple-loaders` | WaterType |
| `paint-pattern` | `simple-loaders` | PaintPattern |
| `customisation` | `simple-loaders` | CustomizationItem |
| `flowers` / `vegetables` | `simple-loaders` | Plant |
| `jumprope` | `simple-loaders` | JumpropeTier (rewardRefId backfill 별도) |
| `cds` | `cd-loader` | Cd + SourceGame |
| `paint` / `paint-color` | `paint-color-loader` | PaintColor + paint_recipe |
| `items` / `furniture` | `item-loader` | Item + tags + locations |
| `locations-index` / `location-*` | `location-loader` | Location |
| `flavors` | `item-extension-loaders` | Food |
| `lostrelics` | `item-extension-loaders` | LostRelic |
| `trade` | `item-extension-loaders` | TradeValuation (placeholder) |
| `building` | `building-loader` | BuildingKit (목록만) |
| `stampcard-reward` | `stamp-reward-loader` | StampReward |
| `hideandsneak` | `minigame-reward-loader` | HideAndSneakReward |
| `pokedexcompletion` | `pokedex-milestone-loader` | PokedexMilestone |
| `cooking` | `recipe-loader` | CookingRecipe + ingredients |
| `crafting` | `recipe-loader` | CraftingRecipe + ingredients |
| `teaminitiationchallenge` | `team-challenge-loader` | TeamChallenge + requirements |
| `environmentlevel` | `environment-reward-loader` | EnvironmentReward |
| `pokemon-center` | `pokemon-center-loader` | PokemonCenter + materials |
| `importantrequests` | `quest-loader` | Quest |
| `humanrecords` | `human-record-loader` | HumanRecord |
| `dreamislands` / `cloudislands` | `island-variant-loader` | IslandVariant + rewards |
| `habitats-index` | `habitat-loader` | Habitat + HabitatPokemon |
| `legendary` | `legendary-loader` | LegendaryAcquisition |
| `uniquepokemon` | `unique-pokemon-loader` | Pokemon update |
| `magnet-rise` | `magnet-rise-loader` | Item update (isMagnetRiseOnly) |
| `eventpokedex` | `event-loader` | EventPokemon |
| `abilities` | `ditto-ability-loader` | DittoAbility (best-effort 매칭) |
| `litter` | `litter-loader` | PokemonLitterReward |

### 미등록 (1 page)

| Page ID | 이유 |
|---|---|
| `gameplay` | GameplayReference — DB 비대상 (reference JSON only) |

### 부분 구현 / 보강 대기

- **JumpropeTier.rewardRefId**: `simple-loaders.loadJumpropeTier` 가 NULL 로 1차
  upsert. `minigame-reward-loader.backfillJumpropeTierRewards` 가 Item 매핑 후
  update. CLI 통합 시 두 단계를 순차 호출 필요.
- **CdLocation**: `cd-loader` 는 Cd 본 entity + SourceGame 만 처리. cd_location
  매핑 (Location FK) 은 별도 backfill 미구현.
- **Event placeholder**: `eventpokedex` page 가 EventPokemon 만 출력 — Event
  자체 placeholder upsert 가 별도 필요.
- **EventHabitat / EventItem**: parser 가 row-level 데이터 없음 (placeholder
  schema only). 향후 외부 데이터 보강 시 별도 loader.
- **ExchangeRecipe**: `collect` page parser 가 row 없는 placeholder (currency
  매핑 부재). 별도 외부 데이터 보강 후 loader 추가.
- **BuildingKit detail**: `building` page 는 목록만, category/capacity/materials
  는 detail 페이지 후속.
- **Pokemon source_slug**: available-pokemon parser 가 page URL 을 sourceUrl 로
  사용 → 모든 Pokemon 이 같은 sourceSlug. parser 측 수정 필요 (별도 작업).
- **PokemonI18n / *I18n**: 모든 i18n 테이블은 본 loader 범위 외. Phase 11+ 한국어
  매핑 단계.
- **DittoAbility unlockTextEn**: best-effort indexOf 매칭 — 정확도 향후 NLP 또는
  운영 매핑으로 보강.

## CLI 통합

```bash
docker compose -f docker-compose.local.yml up -d   # PostgreSQL 시작
pnpm --filter @pokopia-wiki/scraper scrape \
  --source serebii --page <pageId>                  # live fetch + upsert
pnpm --filter @pokopia-wiki/scraper scrape --list-loaders   # DB upsert 지원 page
pnpm --filter @pokopia-wiki/scraper scrape --list-pages     # 전체 page (loader 마커)
```

## 추가 개발 가이드

새 loader 추가 시:
1. `loaders/<name>-loader.ts` 작성 (패턴 1~5 중 선택)
2. 단위 테스트 `loaders/<name>-loader.test.ts` (in-memory mock)
3. `registry.ts` 의 `dispatchLoader` switch + `listLoaderPages` 에 page ID 추가
4. 본 README 의 등록 현황 표 갱신
