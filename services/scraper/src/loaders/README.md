# Loaders — Phase 9 선결 코드 가이드

본 디렉토리는 파서 출력 entity 를 Prisma 로 멱등 upsert 하는 loader 모듈을 담는다.

## 핵심 모듈

- **`upsert-loader.ts`** — generic `upsertBySourceSlug` helper.
  content_hash 기반 idempotency, 부분 실패 허용. 모든 entity loader 의 베이스.
- **`invalid-isolator.ts`** — 파서 실패 entity 격리 (`data/invalid/<source>/<timestamp>/`).
- **`pokemon-loader.ts`** — entity loader 패턴 1 (sourceUrl → slug 추출).
- **`specialty-loader.ts`** — entity loader 패턴 2 (input.slug 직접 사용).

## 신규 entity loader 추가 패턴

### 패턴 1: input.slug 직접 사용 (대부분의 entity)

대부분의 파서 출력은 `slug` 필드를 명시적으로 가진다 (specialty, building, food,
ditto-ability, pokedex-milestone 등). `specialty-loader.ts` 복제 후 model/payload
만 교체.

```typescript
import type { SomeEntityInput } from '@pokopia-wiki/shared';
import { upsertBySourceSlug, type SourceSlugKeyedModel, type UpsertResult } from './upsert-loader.js';

type SomeEntityPayload = {
  // Prisma model 의 nullable 아닌 도메인 필드들
  fieldA: string;
  fieldB: number;
  // 감사 컬럼 일부 (sourceSlug/contentHash 는 UpsertLoader 가 주입)
  sourceUrl: string;
  scrapedAt: Date;
};

export async function loadSomeEntity(
  model: SourceSlugKeyedModel<SomeEntityPayload>,
  inputs: ReadonlyArray<SomeEntityInput>,
): Promise<UpsertResult> {
  const items = inputs.map((input) => ({
    sourceSlug: input.slug,
    payload: {
      fieldA: input.fieldA,
      fieldB: input.fieldB,
      sourceUrl: input.sourceUrl,
      scrapedAt: new Date(input.scrapedAt),
    },
    metadata: input,
  }));
  return upsertBySourceSlug(model, items);
}
```

### 패턴 2: sourceUrl 추출 (Pokemon)

PokemonInput 처럼 명시적 slug 필드가 없고 URL 의 마지막 path segment 가 자연키
역할인 경우 `pokemon-loader.ts` 의 `extractSlugFromUrl` 패턴 사용.

### 복잡 entity (FK 해소, M:N 매핑, nested 배열)

다음 entity 들은 단순 1:1 매핑이 안 되므로 별도 처리 필요:

- **Item** — locations / tags / favorites M:N
- **Habitat** — habitat_pokemon / habitat_reward nested
- **CookingRecipe / CraftingRecipe** — ingredients nested + result item FK
- **PaintColor** — paint_recipe ingredients (color FK self-ref)
- **Cd** — sourceGame upsert 우선 + cd_location 매핑
- **Quest** — quest_requirement (item/pokemon nullable FK)
- **TeamChallenge** — team_challenge_requirement
- **IslandVariant** — island_reward nested
- **EnvironmentReward** — location FK 해소
- **PokemonLitterReward** — pokemon + item + habitat FK 모두 해소

이런 loader 는 두 단계 패턴:
1. 의존 entity (예: SourceGame, Currency, Location) 먼저 upsert
2. FK ID 조회 후 본 entity payload 에 주입

## 미구현 (TODO)

| Entity | 우선순위 | 비고 |
|---|---|---|
| Item | 높음 | locations/tags/favorites M:N |
| Habitat | 높음 | nested pokemon/reward |
| Recipe (Cooking/Crafting) | 높음 | ingredients nested |
| Building | 중간 | category/capacity 등 detail page 의존 |
| Food | 중간 | flavor ENUM + moveBoost |
| DittoAbility | 중간 | type ENUM + unlockPokemon FK |
| PaintColor / Pattern | 중간 | recipe self-ref |
| Cd | 중간 | sourceGame nested |
| Generator / WaterType | 낮음 | utility 메타 |
| EnvironmentReward | 중간 | location/item/recipe FK |
| PokemonCenter | 낮음 | location/material |
| FriendshipTier | 낮음 | placeholder schema |
| MosslaxBoost | 낮음 | flavor + level Cartesian |
| StampCard / StampReward | 낮음 | card 1 + reward 5 |
| JumpropeTier | 낮음 | item FK |
| HideAndSneakReward | 낮음 | item FK |
| GameplayReference | 낮음 | DB 비대상 (reference JSON) |
| Quest / QuestRequirement | 중간 | location FK + nested |
| TeamChallenge | 중간 | requirement nested |
| LegendaryAcquisition | 중간 | pokemon/location FK |
| UniquePokemonPatch | 중간 | Pokemon update only |
| LostRelic | 낮음 | item 1:1 확장 |
| HumanRecord | 중간 | location/reward FK |
| CustomizationItem | 낮음 | location FK |
| Plant / PlantVariant | 낮음 | nested variants |
| PokedexMilestone | 낮음 | reward FK |
| TradeValuation / ExchangeRecipe | placeholder | row-level 데이터 부재 |
| PokemonLitterReward | 중간 | pokemon/item/habitat FK |
| EventPokemon / Habitat / Item | 낮음 | (eventId, refId) M:N |
| IslandVariant | 중간 | location FK + reward nested |

각 loader 추가 시 본 README 의 우선순위 표 업데이트 + 단위 테스트 (Prisma in-memory mock).

## CLI 통합

`src/index.ts` 의 PARSER 레지스트리 다음에 LOADER 레지스트리 추가 예정 (Phase 9
후속 작업). 현재 `--dry-run` 은 loader 호출 없이 JSON 파일로 직렬화만 한다.

DB 쓰기 모드 (사용자 직접 실행):
```bash
docker compose -f docker-compose.local.yml up -d   # PostgreSQL 시작
pnpm --filter @pokopia-wiki/scraper scrape \
  --source serebii --page <pageId>                  # live fetch + upsert
```
