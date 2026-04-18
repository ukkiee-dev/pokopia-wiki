# Pokemon Pokopia 데이터베이스 스키마

> 관련 문서: [DATA_COLLECTION_PLAN.md](./DATA_COLLECTION_PLAN.md) — 수집/매핑/운영 계획
>
> 개정 이력
> - 2026-04-17 (오후): DATA_COLLECTION_PLAN.md 3장/4장에서 분리 신설
> - 2026-04-17 (저녁): DATA_COLLECTION_PLAN.md Phase 5 단계 33~35(교역/수집 교환/쓰레기 보상) 대응 테이블 추가 — `trade_valuation`, `exchange_recipe`, `pokemon_litter_reward` (§2.27)

이 문서는 Prisma `schema.prisma` 작성의 기준 명세다. 실제 필드명/타입은 Prisma 컨벤션(camelCase, `@id`, `@relation` 등)에 맞춰 최종 조정한다.

---

## 1. 설계 원칙

### 1.1 다국어 (i18n)

모든 사용자 노출 텍스트(이름, 설명, 본문 등)는 별도 번역 테이블로 분리한다.

```
[엔티티 테이블] ←─ 1:N ──→ [번역 테이블]
  id (PK)                     entity_id (FK)
  ...고유 속성들...            locale (EN/KO/...)
                               name
                               description
                               source / verified / verified_at / verified_by
```

`locale`은 향후 `ja` 등 확장 가능성을 고려하여 ENUM 대신 TEXT + 애플리케이션 레벨 검증(또는 `locale` 참조 테이블)로 관리한다.

### 1.2 공통 감사/메타 컬럼

모든 원본 엔티티 테이블(i18n 제외)은 다음 컬럼을 공통 포함한다.

| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `source_slug` | TEXT UNIQUE | Serebii URL/이름 기반 고유 키 (예: `bulbasaur`, `apricorn`) |
| `source_url` | TEXT | 원본 페이지 URL |
| `scraped_at` | TIMESTAMP | 최종 수집 시점 |
| `content_hash` | TEXT | 원본 HTML 섹션의 SHA-256 (diff 감지용) |
| `created_at` | TIMESTAMP DEFAULT now() | 레코드 생성 시점 |
| `updated_at` | TIMESTAMP | 레코드 최종 수정 시점 |

i18n 테이블 공통 확장 컬럼:

| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `source` | ENUM(pokopiaguide, pokopoko, namuwiki, pokemon_official, manual, pending) | 번역 출처 |
| `verified` | BOOL DEFAULT false | 수동 검증 여부 |
| `verified_at` | TIMESTAMP (nullable) | 검증 시점 |
| `verified_by` | TEXT (nullable) | 검증자 |

### 1.3 Polymorphic Reward 패턴

복수 테이블(`environment_reward`, `pokedex_milestone`, `human_record`, `island_reward`, `jumprope_tier`, `hideandsneak_reward`)에서 공통 사용.

```
reward_type : ENUM(item, recipe, feature_unlock, customization, cd, coin, none)
reward_ref_id : INT (nullable, type에 따라 해석)
```

`reward_type`과 `reward_ref_id`의 참조 정합성은 애플리케이션 레이어에서 검증하거나 Postgres CHECK 제약으로 enforce 한다.

### 1.4 M:N 관계 컨벤션

명시적 조인 테이블을 사용하고 복합 PK(`@@id([...])`)를 지정한다. 조인 테이블에 속성이 없더라도 Prisma implicit M:N 대신 explicit을 기본으로 한다 (감사 컬럼 추가 여지 확보).

---

## 2. 엔티티 스키마

### 2.1 포켓몬 코어

#### `pokemon` — 포켓몬 기본 정보
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | 고유 ID |
| `pokedex_no` | INT (nullable) | 포코피아 도감 번호 (#001~#199+, 이벤트/고유 캐릭터는 null 허용) |
| `is_event` | BOOL | 이벤트 전용 여부 |
| `is_unique_character` | BOOL | 고유 NPC 캐릭터 여부 (Peakychu 등) |
| `is_legendary` | BOOL | 전설/환상 여부 |
| `based_on_species_id` | FK (self, nullable) | 고유 캐릭터가 기반으로 하는 종 |

> 이미지는 `entity_image` 테이블(§2.25)로 통합 관리.

#### `pokemon_i18n`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `pokemon_id` | FK | |
| `locale` | TEXT | |
| `name` | TEXT | |
| `description` | TEXT (nullable) | |

#### `legendary_acquisition`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `pokemon_id` | FK UNIQUE | 전설 포켓몬 참조 |
| `unlock_condition` | TEXT | 해금 조건 요약 (영문 원본) |
| `location_id` | FK (nullable) | 조우 지역 |
| `effect` | TEXT | 획득 후 부여 효과 (영문 원본) |

`legendary_acquisition_i18n`에 condition/effect의 번역을 저장.

#### `specialty` / `specialty_i18n` / `pokemon_specialty`
- `specialty`: id, icon 관련 메타
- `pokemon_specialty`: M:N 조인, 복합 PK `(pokemon_id, specialty_id)`

---

### 2.2 아이템 테이블 그룹

#### `item`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `category` | ENUM | Materials, Food, Furniture, Misc, Outdoor, Utilities, Nature, Buildings, Blocks, Kits, Key Items |
| `is_paintable` | BOOL | |
| `is_patternable` | BOOL | |
| `is_magnet_rise_only` | BOOL | Magnet Rise 전용 아이템 여부 |

> `category`에서 "Lost Relics"는 제거됨. `lost_relic` 1:1 확장 테이블(§2.20)에서 관리.

#### `item_i18n`
(공통 i18n 패턴)

#### `item_tag` — M:N 태그
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `item_id` | FK | |
| `tag` | ENUM(Decoration, Food, Relaxation, Road, Toy) | |
| PK | `(item_id, tag)` | |

#### `item_location` — 획득처 (1:N)
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `item_id` | FK | |
| `location_id` | FK (nullable) | |
| `method` | ENUM | Natural, Craft, Shop, Trade, Dream Island, Build Kit, Relic Appraisal, Pokemon Center, Litter |
| `detail` | TEXT | 추가 조건 |

> `method`에서 "Event"는 제거. 이벤트 경로는 `event_item`(§2.21)에서 관리.

---

### 2.3 제작 & 요리

#### `crafting_recipe`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `result_item_id` | FK | |
| `result_quantity` | INT | |
| `unlock_method` | TEXT | |

#### `crafting_ingredient`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `recipe_id` | FK | |
| `item_id` | FK | |
| `quantity` | INT | |
| PK | `(recipe_id, item_id)` | |

#### `cooking_recipe`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `result_item_id` | FK | 완성 음식 아이템 |
| `meal_category` | ENUM(Salad, Soup, Bread, Steak) | |
| `bonus_specialty_id` | FK (nullable) | 보너스 조건 스페셜티 |

> `move_boost`는 결과물인 `food`에만 저장(단일 Truth).
> `main_ingredient_id`는 제거. 대신 `cooking_ingredient.role`로 통합.

#### `cooking_ingredient`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `recipe_id` | FK | |
| `item_id` | FK | |
| `quantity` | INT | |
| `role` | ENUM(main, sub) | |

---

### 2.4 지역

#### `location`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `type` | ENUM(Main, Dream Island, Cloud Island, Sub) | |
| `parent_id` | FK (self, nullable) | 상위 지역 |

#### `location_i18n`
(공통 i18n)

---

### 2.5 서식지

#### `habitat`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `habitat_no` | INT (nullable) | 서식지 번호 (#001~#209, 이벤트는 null) |
| `is_event` | BOOL | |

#### `habitat_i18n`
(공통 i18n)

#### `habitat_pokemon`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `habitat_id` | FK | |
| `pokemon_id` | FK | |
| `time_condition` | ENUM(Day, Night, Any) (nullable) | |
| `weather_condition` | ENUM(Sunny, Rainy, Snowy, Cloudy, Any) (nullable) | |
| PK | `(habitat_id, pokemon_id, time_condition, weather_condition)` | |

---

### 2.6 건축

#### `building_kit`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `category` | ENUM(Residential, Infrastructure, Decorative, Venue, Special) | |
| `pokemon_capacity` | INT | |
| `building_points` | INT | |
| `width` | INT | |
| `depth` | INT | |

#### `building_kit_i18n` / `building_kit_material`
(공통 패턴, `building_kit_material`는 `(building_kit_id, item_id)` PK)

---

### 2.7 선호도 & 우정

#### `favorite_category` / `favorite_category_i18n`

#### `pokemon_favorite` — M:N
PK `(pokemon_id, category_id)`

#### `item_favorite_tag` — M:N
PK `(item_id, category_id)`

#### `friendship_tier`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `tier` | INT UNIQUE | 단계 순서 |
| `required_points` | INT | 필요 우정 포인트 |

#### `friendship_tier_i18n` — 단계 이름 및 해금 기능 설명

---

### 2.8 음식 & 맛

#### `food` — item 1:1 확장
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `item_id` | FK/PK | |
| `flavor` | ENUM(Bitter, Dry, Sour, Spicy, Sweet, None) | |
| `pp_restore` | ENUM(little, some, lot) | |
| `move_boost` | ENUM(Leafage, Water Gun, Cut, Rock Smash) (nullable) | |

`move_boost`의 단일 Truth. `cooking_recipe`에서 조회 시 `cooking_recipe → result_item → food` JOIN.

---

### 2.9 디토 능력

#### `ditto_ability`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `type` | ENUM(Primary, Secondary) | |
| `unlock_pokemon_id` | FK | 해금 조건 포켓몬 |
| `unlock_location_id` | FK (nullable) | 해금 장소 |

#### `ditto_ability_i18n`

---

### 2.10 환경 & 상점

#### `environment_reward` — polymorphic reward
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `location_id` | FK | |
| `level` | INT (1~10) | |
| `reward_type` | ENUM(item, recipe, feature_unlock, shop_unlock) | |
| `reward_ref_id` | INT (nullable) | |
| `note` | TEXT | feature_unlock 등 상세 설명 |

#### `shop_item`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `location_id` | FK | |
| `item_id` | FK | |
| `required_env_level` | INT | |
| `price` | INT (nullable) | |
| `currency_id` | FK | |

#### `currency`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `code` | TEXT UNIQUE | coin, pokemetal, feather 등 |

#### `currency_i18n`

---

### 2.11 도색

#### `paint_color` / `paint_color_i18n`
#### `paint_pattern` / `paint_pattern_i18n`

#### `paint_recipe` — 색상 조합
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `result_color_id` | FK | |
| `ingredient_color_id` | FK | |
| `quantity` | INT | |
| PK | `(result_color_id, ingredient_color_id)` | |

---

### 2.12 스토리 & 퀘스트

#### `quest`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `location_id` | FK | |
| `sort_order` | INT | |
| `prerequisite_quest_id` | FK (self, nullable) | 선행 퀘스트 |

#### `quest_i18n`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `quest_id` | FK | |
| `locale` | TEXT | |
| `name` | TEXT | |
| `objective` | TEXT | |
| `walkthrough` | TEXT | Markdown |

#### `quest_requirement`
(item/pokemon FK nullable, quantity INT, description TEXT)

#### `team_challenge`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `stage` | INT (1~9) | |
| `badge_name` | TEXT | |

> 보상 다양화가 필요해지면 polymorphic reward 적용 고려.

#### `team_challenge_requirement`
(challenge_id FK, item_id FK, quantity INT)

---

### 2.13 포켓몬 센터

#### `pokemon_center`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `location_id` | FK | |
| `required_env_level` | INT | |
| `required_pokemon_count` | INT | |

#### `pokemon_center_material`
(center_id FK, item_id FK, quantity INT, PK `(center_id, item_id)`)

---

### 2.14 전기 & 물

#### `generator` / `generator_i18n`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `output_units` | INT | |
| `output_units_alt` | INT (nullable) | 특수 조건 발전량 |
| `is_renewable` | BOOL | |

#### `water_type` / `water_type_i18n`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `spread_radius` | INT | |
| `trench_distance` | INT | |
| `hydrates` | BOOL | |

---

### 2.15 커스터마이징

#### `customization_item`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `category` | ENUM(Hair, Outfit, Top, Pants, Hat, Bag, Shoes) | |
| `unlock_method` | TEXT | |
| `unlock_location_id` | FK (nullable) | |

#### `customization_item_i18n`

---

### 2.16 CD / 음악

#### `cd`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `source_game_id` | FK | |

#### `source_game`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `code` | TEXT UNIQUE | rgby, gs, rs, dp, bw, xy, sm, sv 등 |
| `generation` | INT | 1~9 |

#### `source_game_i18n` / `cd_i18n`

#### `cd_location`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `cd_id` | FK | |
| `location_id` | FK (nullable) | |
| `method` | TEXT | 획득 방법 (글로우 블록, 고정 위치 등) |

---

### 2.17 인간 기록

#### `human_record` — polymorphic reward
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `category` | ENUM(Newspaper, Diary, Magazine, Note, Letter, Paper, Photo) | |
| `location_id` | FK | |
| `reward_type` | ENUM(customization, item, cd, none) | |
| `reward_ref_id` | INT (nullable) | |

#### `human_record_i18n`
(name, description (위치), content (본문, nullable))

---

### 2.18 도감 완성 보상

#### `pokedex_milestone` — polymorphic reward
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `required_count` | INT | (6, 15, 20, ..., 300) |
| `reward_type` | ENUM(item, recipe, feature_unlock) | |
| `reward_ref_id` | INT | |
| `note` | TEXT | |

---

### 2.19 꽃 & 채소

#### `plant`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `type` | ENUM(BerryTree, Wildflower, SeashorFlower, MountainFlower, SkylandFlower, DecorativeFlower, Hedge, Vegetable) | |
| `growth_days` | INT | 일반 성장 소요일 |
| `growth_days_with_grow` | INT | Grow 스페셜티 사용 시 |
| `requires_hydration` | BOOL | |

#### `plant_i18n`

#### `plant_variant`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `plant_id` | FK | |
| `color` | TEXT | |

---

### 2.20 유물

#### `lost_relic` — item 1:1 확장
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `item_id` | FK/PK | |
| `size_class` | ENUM(L, S) | |
| `is_appraised_form` | BOOL | 감정 후 형태 여부 |
| `appraisal_result_item_id` | FK (nullable) | 감정 후 변환 아이템 |
| `appraisal_cost` | INT (nullable) | 감정 비용 |

이름/설명은 상위 `item_i18n` 사용.

---

### 2.21 이벤트 시스템

#### `event`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `start_at` | DATE (nullable) | |
| `end_at` | DATE (nullable) | |
| `is_recurring` | BOOL | |

#### `event_i18n` — 이름/설명

#### `event_pokemon` / `event_habitat` / `event_item`
모두 `(event_id, target_id)` 복합 PK의 M:N 매핑.

---

### 2.22 미니게임 & 주간 콘텐츠

#### `stamp_card`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `week_goal` | INT | 주간 스탬프 목표 수 |

#### `stamp_reward`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `card_id` | FK | |
| `tier` | INT | 4종 등급 |
| `required_stamps` | INT | |
| `coin_amount` | INT | |

#### `jumprope_tier` — polymorphic reward
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `tier` | INT | |
| `required_jumps` | INT | |
| `reward_type` | ENUM(item, coin) | |
| `reward_ref_id` | INT (nullable) | |

#### `hideandsneak_reward` — polymorphic reward
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `condition` | TEXT | |
| `reward_type` | ENUM(item, coin) | |
| `reward_ref_id` | INT | |

---

### 2.23 Mosslax 부스트

#### `mosslax_boost`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `flavor` | ENUM(Bitter, Dry, Sour, Spicy, Sweet) | |
| `level` | INT (1~3) | |
| UNIQUE | `(flavor, level)` | |

#### `mosslax_boost_i18n` — 효과 설명

---

### 2.24 Dream/Cloud Island 상세

#### `island_variant`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `location_id` | FK | Dream 또는 Cloud Island 참조 |
| `difficulty` | INT (nullable) | |
| `guaranteed_legendary_id` | FK (nullable) | 고정 전설 포켓몬 |

#### `island_variant_i18n`

#### `island_reward` — polymorphic reward
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `island_variant_id` | FK | |
| `reward_type` | ENUM(item, cd, recipe) | |
| `reward_ref_id` | INT | |
| `drop_rate` | FLOAT (nullable) | |

---

### 2.25 엔티티 이미지 (Multi-variant)

#### `entity_image`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `entity_type` | ENUM(pokemon, item, habitat, building_kit, cd, human_record, location, paint_color, paint_pattern, plant, customization, specialty, lost_relic, island_variant) | |
| `entity_id` | INT | polymorphic FK (애플리케이션 검증) |
| `variant` | TEXT | `thumb`, `detail`, `color_red`, `pose_sleep` 등 |
| `file_path` | TEXT | 외장 SSD 내 경로 |
| `url` | TEXT | 원본 URL |
| `width` | INT (nullable) | |
| `height` | INT (nullable) | |
| `content_hash` | TEXT | |
| `is_primary` | BOOL | 대표 이미지 여부 |

기존 각 엔티티의 `image_url` 단일 필드는 `v_entity_primary_image` 계산 뷰로 대체 가능.

---

### 2.26 번역 충돌 추적

#### `translation_conflict`
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `entity_type` | TEXT | |
| `entity_id` | INT | |
| `field` | TEXT | `name`, `description` 등 |
| `pokopiaguide_value` | TEXT (nullable) | |
| `pokopoko_value` | TEXT (nullable) | |
| `namuwiki_value` | TEXT (nullable) | |
| `pokemon_official_value` | TEXT (nullable) | |
| `resolved_value` | TEXT (nullable) | |
| `resolved_by` | TEXT (nullable) | |
| `resolved_at` | TIMESTAMP (nullable) | |

`i18n` 테이블 업데이트 시 복수 소스 값이 상이하면 이 테이블에 기록 후 수동 리뷰 (자세한 워크플로는 DATA_COLLECTION_PLAN.md §4.4 참조).

---

### 2.27 교역 & 수집 교환 & 쓰레기 보상

DATA_COLLECTION_PLAN.md Phase 5 단계 33~35 대응.

#### `trade_valuation` — item 1:1 확장, 교역소 가치
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `item_id` | FK/PK | |
| `base_value` | INT | 기본 교역 가치 |
| `favorite_bonus_multiplier` | FLOAT | 포켓몬 선호도 일치 시 보너스 배수 (예: 1.5) |

교역 가능한 아이템만 행을 가진다. `item_location.method='Trade'` 조건과 연계.

#### `exchange_recipe` — 수집 교환 (깃털/유물 → 가구 등)
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `id` | PK | |
| `cost_currency_id` | FK | 지불 통화 (feather 등) |
| `cost_amount` | INT | 지불 수량 |
| `result_item_id` | FK | 획득 아이템 |
| `result_quantity` | INT DEFAULT 1 | 획득 수량 |
| `required_env_level` | INT (nullable) | 해금 환경 레벨 |
| `source_location_id` | FK (nullable) | 교환 가능 지역 |

`shop_item`(§2.10)과의 차이: `shop_item`은 `currency_id` + `price` INT 단일 통화로 구매, `exchange_recipe`는 특정 소모 아이템/통화 조합과 획득 결과물의 N:1 매핑을 표현한다. 통화로 아이템을 구매하는 단순 쇼핑은 `shop_item`, 특수 화폐(깃털·유물)나 수량 조합 교환은 `exchange_recipe`로 분리한다.

#### `pokemon_litter_reward` — 쓰레기 보상 포켓몬-아이템 매트릭스
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| `pokemon_id` | FK | 보상을 주는 포켓몬 |
| `item_id` | FK | 보상 아이템 |
| `habitat_id` | FK (nullable) | 특정 서식지 한정 시 |
| `drop_rate` | FLOAT (nullable) | 드롭 확률 (0.0~1.0, 불명 시 null) |
| PK | `(pokemon_id, item_id, habitat_id)` | 같은 포켓몬·아이템이 서식지별로 다른 드롭률을 가질 수 있으므로 habitat 포함 |

`item_location.method='Litter'` 조건과 연계. `habitat_id`가 null이면 모든 서식지에 공통 적용되는 보상으로 해석한다.

---

## 3. ERD 요약

```
pokemon ──┬── pokemon_i18n
          ├── pokemon_specialty ──── specialty ── specialty_i18n
          ├── pokemon_favorite ──── favorite_category ── favorite_category_i18n
          ├── habitat_pokemon ──── habitat ── habitat_i18n
          ├── legendary_acquisition ── legendary_acquisition_i18n
          ├── event_pokemon ──── event ── event_i18n
          └── entity_image (entity_type='pokemon')

item ──┬── item_i18n
       ├── item_tag
       ├── item_location ──── location ── location_i18n
       ├── item_favorite_tag ──── favorite_category
       ├── crafting_ingredient ──── crafting_recipe
       ├── cooking_ingredient ──── cooking_recipe
       ├── food (1:1 확장)
       ├── lost_relic (1:1 확장)
       ├── trade_valuation (1:1 확장)
       ├── exchange_recipe (via result_item_id) ──── currency
       ├── pokemon_litter_reward (via item_id) ──── pokemon, habitat
       ├── event_item ──── event
       └── entity_image (entity_type='item')

location ──┬── location_i18n
           ├── environment_reward (polymorphic)
           ├── shop_item ──── currency ── currency_i18n
           ├── pokemon_center ── pokemon_center_material
           ├── quest ──── quest_i18n
           ├── event_habitat ──── event
           └── island_variant ── island_reward

building_kit ── building_kit_i18n ── building_kit_material
cd ── cd_i18n ── cd_location ── source_game ── source_game_i18n
human_record (polymorphic reward) ── human_record_i18n
customization_item ── customization_item_i18n
plant ── plant_i18n ── plant_variant
paint_color ── paint_color_i18n ── paint_recipe
paint_pattern ── paint_pattern_i18n
ditto_ability ── ditto_ability_i18n
generator ── generator_i18n
water_type ── water_type_i18n
friendship_tier ── friendship_tier_i18n
mosslax_boost ── mosslax_boost_i18n
stamp_card ── stamp_reward
jumprope_tier (polymorphic reward)
hideandsneak_reward (polymorphic reward)
pokedex_milestone (polymorphic reward)
team_challenge ── team_challenge_requirement
entity_image (polymorphic)
translation_conflict (polymorphic)
```
