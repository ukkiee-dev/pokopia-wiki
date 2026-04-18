# Pokemon Pokopia 데이터 수집 계획서

> 관련 문서: [SCHEMA.md](./SCHEMA.md) — DB 스키마 상세 명세
>
> 개정 이력
> - 2026-04-16: 최초 작성
> - 2026-04-17 (오전): 전체 리뷰 반영 (페이지 개수 정정, Phase 번호 재정비, 누락 엔티티 추가, polymorphic reward, 감사 컬럼 공통화, 크롤러 운영 규칙 추가)
> - 2026-04-17 (오후): 스키마 섹션을 `SCHEMA.md`로 분리, 섹션 번호 재조정
> - 2026-04-17 (저녁): 리뷰 피드백 반영 — 누락 페이지(trade/collect/litter) Phase 편입, i18n `source` ENUM/manual·pending 구분 보강, Phase 모호 표현(가구/게임플레이/이벤트/교차 검증) 구체화, pokemon.com rate limit·파싱 실패율 임계치·백업 보존 정책·hotlink 금지 정책 추가, 검증 규칙 예외 명시, 수량 추정 정합성 보정

## 1. 프로젝트 개요

### 목적
Pokemon Pokopia 위키 사이트 구축을 위한 데이터 수집 및 구조화 작업.
다국어(영어/한국어) 지원을 위해 복수 소스에서 데이터를 수집하고 매핑한다.

### 데이터 소스

| 소스 | URL | 역할 | 언어 |
|------|-----|------|------|
| Serebii.net | `serebii.net/pokemonpokopia/` | **주 데이터 소스** (가장 정확) | EN |
| PokopiaGuide.com | `pokopiaguide.com/ko` | **한국어 매핑 소스** (1순위) | KO |
| 포코포코 | `pokopoko.kr` | **한국어 매핑 소스** (2순위) | KO |
| 나무위키 | `namu.wiki/w/Pokémon Pokopia` | **한국어 매핑 소스** (3순위, 403 차단 → 수동 복사) | KO |
| 포켓몬 공식 한국어 DB | `pokemon.com/ko` | **포켓몬 이름 교차 검증** (4순위) | KO |

### 수집 우선순위
1. Serebii에서 전체 영문 데이터 수집
2. PokopiaGuide에서 한국어 명칭 매핑
3. PokopiaGuide에 없는 항목은 포코포코에서 보충
4. 포코포코에도 없는 항목은 나무위키에서 **수동 복사** (Playwright 자동 수집 불가)
5. 포켓몬 공식 한국어명은 포켓몬 공식 DB로 교차 검증
6. 모든 소스에 없는 항목은 미번역(`null`)으로 마킹 후 수동 번역 대상으로 분류

### 기술 스택 참조
- 스크래퍼: Node.js + TypeScript (pnpm), ky, node-html-parser, Playwright
- 저장소: Prisma ORM + homelab PostgreSQL (`pokopia` DB)
- 중간 데이터: `data/parsed/*.json`, HTML 원본 캐시 (TTL 3일)
- 이미지: homelab 외장 SSD

---

## 2. Serebii 사이트맵 - 전체 수집 대상 페이지

총 **46개 페이지**에서 데이터를 수집한다. 일반 이벤트/업데이트 공지(뉴스 페이지)는 제외하되, **이벤트 포켓몬/서식지/아이템 데이터는 수집 대상에 포함**한다.

### 2.1 포켓몬 (6개 페이지)

| 페이지 | 경로 | 핵심 데이터 |
|--------|------|-------------|
| 등장 포켓몬 도감 | `/availablepokemon.shtml` | 번호, 이름, 스페셜티 (최소 199종) |
| 이벤트 포켓몬 도감 | `/eventpokedex.shtml` | 이벤트 전용 포켓몬 (4종 확인) |
| 고유 포켓몬 | `/uniquepokemon.shtml` | 고유 캐릭터 4종 (Peakychu, Mosslax, Smearguru, Prof. Tangrowth) |
| 서식지 | `/habitats.shtml` | 서식지 209종 + 이벤트 서식지 4종 |
| 스페셜티 | `/specialty.shtml` | 33종 스페셜티 정의 및 설명 |
| 전설/환상 포켓몬 | `/legendary.shtml` | 전설 포켓몬 획득 조건 및 효과 |

### 2.2 아이템 & 장식 (15개 페이지)

| 페이지 | 경로 | 핵심 데이터 |
|--------|------|-------------|
| 아이템 목록 | `/items.shtml` | 300+ 아이템 (이름, 설명, 태그, 획득처) |
| 선호 아이템 | `/favorites.shtml` | 47개 선호 카테고리 |
| 가구 | `/furniture.shtml` | 가구 (이름, 설명, 획득처, 플래그, 색상 변경) |
| 꽃 & 식물 | `/flowers.shtml` | 5종 식물 + 6종 장식 꽃 (각 4색 변형) |
| 채소 재배 | `/vegetables.shtml` | 4종 채소 + 성장 메커니즘 |
| 요리 & 레시피 | `/cooking.shtml` | 레시피 (이름, 설명, 재료, 포켓몬 스페셜티 보너스) |
| 음식 맛 | `/flavors.shtml` | 5종 맛 + 음식별 맛 분류 + 효과 |
| 제작 & 레시피 | `/crafting.shtml` | 제작 레시피 (이름, 획득처, 재료) |
| CD & DJ Rotom | `/cds.shtml` | 43개 CD (이름, 설명, 획득처, 원작) |
| 페인팅 | `/paint.shtml` | 18색 + 22종 패턴 + 도색 가능 아이템 |
| 건축 키트 | `/building.shtml` | 건축 키트 종류, 설명, 포켓몬 수용량 |
| 잃어버린 유물 | `/lostrelics.shtml` | 57+ 유물 (L/S 분류, 이름, 설명) |
| 교역소 | `/trade.shtml` | 교역 메커니즘, 아이템 가치, 선호 보너스 |
| 수집 교환 | `/collect.shtml` | 80+ 교환 아이템 (깃털/유물 → 가구) |
| 쓰레기 보상 | `/litter.shtml` | 36 포켓몬-아이템 보상 매핑 |

### 2.3 지역 (8개 페이지)

| 페이지 | 경로 | 핵심 데이터 |
|--------|------|-------------|
| 지역 개요 | `/locations.shtml` | 6개 주요 지역 + 기능 |
| Withered Wastelands | `/locations/witheredwastelands.shtml` | 지역별 상세 |
| Bleak Beach | `/locations/bleakbeach.shtml` | 지역별 상세 |
| Rocky Ridges | `/locations/rockyridges.shtml` | 지역별 상세 |
| Sparkling Skylands | `/locations/sparklingskylands.shtml` | 지역별 상세 |
| Palette Town | `/locations/palettetown.shtml` | 지역별 상세 |
| Dream Islands | `/dreamislands.shtml` | 섬 유형, 보상, 전설 포켓몬 조우 |
| Cloud Islands | `/cloudislands.shtml` | 커스텀 섬, 멀티플레이, 공식 섬 코드 |

### 2.4 메커니즘 (12개 페이지)

| 페이지 | 경로 | 핵심 데이터 |
|--------|------|-------------|
| 게임플레이 | `/gameplay.shtml` | 코어 게임 루프 설명 |
| 디토 능력 | `/abilities.shtml` | 9개 주요 기술 + 3개 보조 기술 + 강화 체계 |
| Magnet Rise | `/magnetrise.shtml` | 비행/건축/파괴 메커니즘 + 96+ 전용 아이템 |
| 환경/안락 레벨 | `/environmentlevel.shtml` | 5단계 안락 등급, Lv1-10 환경 레벨, 보상 |
| Mosslax 부스트 | `/mosslaxboosts.shtml` | 5종 맛별 부스트 효과 + 3단계 강도 |
| 디토 커스터마이징 | `/customisation.shtml` | 15종 헤어 + 20종 의상 + 악세서리 |
| 우정 | `/friendship.shtml` | 우정 게이지, 최고 친구 시스템 |
| 포켓몬 센터 | `/pokemoncenter.shtml` | 건설 요구사항, 내부 기능 (힐링/교역/3D프린터) |
| 도감 완성 | `/pokedexcompletion.shtml` | 10단계 마일스톤 보상 (6~300종) |
| 스탬프 카드 | `/stampcard.shtml` | 주간 스탬프, 4종 등급, 코인 보상 |
| 줄넘기 | `/jumprope.shtml` | 난이도 구간, 일반/대회 보상 |
| 숨바꼭질 | `/hideandsneak.shtml` | 메커니즘, 보상 |

### 2.5 스토리 (2개 페이지)

| 페이지 | 경로 | 핵심 데이터 |
|--------|------|-------------|
| 중요 의뢰 | `/importantrequests.shtml` | 5개 메인 퀘스트 상세 (요구사항, 진행, 보상) |
| 팀 가입 도전 | `/teaminitiationchallenge.shtml` | 9단계 도전 (요구 자원, 뱃지 보상) |

### 2.6 유틸리티 & 인프라 (2개 페이지)

| 페이지 | 경로 | 핵심 데이터 |
|--------|------|-------------|
| 물 메커니즘 | `/water.shtml` | 6종 수원, 확산 패턴, 환경 상호작용 |
| 전기 생산 | `/electricity.shtml` | 4종 발전기, 전력량, 전송 거리 |

### 2.7 수집품 (1개 페이지)

| 페이지 | 경로 | 핵심 데이터 |
|--------|------|-------------|
| 인간 기록 | `/humanrecords.shtml` | 7종 기록 유형 (신문, 일기, 잡지, 메모, 편지, 논문, 사진) + 보상 |

---

## 3. 데이터 스키마

DB 스키마 상세 정의는 별도 문서 [SCHEMA.md](./SCHEMA.md)에서 관리한다.

본 문서는 수집/매핑/운영 관점의 계획에 집중한다. 스키마 관련 모든 결정(엔티티, 필드, 관계, ENUM, 감사 컬럼, polymorphic reward 패턴)은 SCHEMA.md를 단일 출처로 한다.

---

## 4. 한국어 매핑 전략

### 4.1 매핑 우선순위

각 소스는 SCHEMA.md §1.2의 `i18n.source` ENUM과 1:1로 매핑된다.
ENUM 값: `(pokopiaguide, pokopoko, namuwiki, pokemon_official, manual, pending)`

```
1순위: PokopiaGuide.com/ko  → source='pokopiaguide'
   ├── 포켓몬 이름 (공식 한국어명 사용)
   ├── 서식지 이름
   ├── 아이템 이름
   ├── 레시피 이름
   └── 스페셜티 이름

2순위: 포코포코 (pokopoko.kr)  → source='pokopoko'
   ├── PokopiaGuide에 없는 포켓몬/아이템 한국어명
   ├── 한국어 지역명
   └── 메커니즘/시스템 설명

3순위: 나무위키 (namu.wiki) - 수동 복사  → source='namuwiki'
   ├── 상위 소스에 없는 아이템/메커니즘 설명
   ├── 스토리 / 퀘스트 번역
   └── 기타 누락 항목 보충

4순위: 포켓몬 공식 한국어 DB - 포켓몬 이름 교차 검증  → source='pokemon_official'
   └── PokopiaGuide 포켓몬명과 본가 공식명 일치 여부 확인

5순위: 수동 처리 (상태 이원화)
   ├── source='pending'  : 모든 소스에 없어 번역 대기 중인 항목 (번역 큐)
   └── source='manual'   : 담당자가 직접 번역/감수 완료한 항목 (외부 소스 없음)
```

> `pending → manual` 상태 전이: 담당자가 번역을 완료하고 i18n 행의 값을 채운 뒤,
> `source='manual'`, `verified=true`, `verified_by` 기록으로 갱신한다.

### 4.2 매핑 방법

| 기준 | 매칭 키 | 비고 |
|------|---------|------|
| 포켓몬 | 도감 번호 또는 영문 이름 | 공식 한국어명은 본가 시리즈와 동일 (§4.3 교차 검증) |
| 아이템 | 영문 이름 (정규화 후 매칭) | 대소문자/공백 무시 비교 |
| 지역 | 영문 이름 | 지역명은 고유명이므로 직접 매핑 |
| 스페셜티 | 영문 이름 | PokopiaGuide에서 이미 번역 확인됨 |
| 레시피 | 영문 이름 + 재료 조합 | 이름 매칭 우선, 재료 교차 검증 |

### 4.3 매핑 추적

i18n 테이블에는 `source`, `verified`, `verified_at`, `verified_by` 컬럼이 공통으로 포함된다 (SCHEMA.md §1.2).

| 단계 | 트리거 | 기록되는 컬럼 |
|------|--------|----------------|
| 최초 삽입 | Phase 8 각 소스 파서 실행 | `source=<소스>`, `verified=false` |
| 교차 검증 | Phase 8 pokemon_official 비교 (값 일치) | `verified=true`, `verified_at`, `verified_by` (source 유지) |
| 교차 검증 | Phase 8 pokemon_official 비교 (값 불일치) | 기존 값 → `translation_conflict`, i18n 값은 pokemon_official로 교체, `source='pokemon_official'`, `verified=true` |
| 충돌 해결 | `translation_conflict.resolved_value` 리뷰 확정 | i18n 값 갱신 + `verified=true` + `resolved_*` 기록 |
| 수동 번역 완료 | Phase 8 최종 단계에서 담당자 작업 | `source='manual'`, `verified=true`, `verified_by` |

- 검증 책임자: Phase 8 담당자가 기본, 도메인별(포켓몬/아이템/메커니즘) 리뷰어 별도 지정 가능
- 검증 주기: 최초 수집 후 7일 내 1차, 이후는 게임 업데이트 재크롤링 시 변경분만 재검증
- 미검증(`verified=false`) 비율은 §8.2 커버리지 리포트에 포함한다

### 4.4 소스 간 충돌 처리 워크플로

```
1. 여러 소스에서 같은 엔티티에 대해 다른 한국어 값이 발견되면
   → translation_conflict 테이블에 네 가지 소스 값 기록
2. 기본 규칙: 1순위(PokopiaGuide) 값을 i18n 테이블에 삽입, verified=false
3. 포켓몬 이름에 한해: 포켓몬 공식 DB 값이 PokopiaGuide와 다르면 공식 값을 우선
4. 수동 리뷰 → resolved_value 확정 후
   ├── i18n 테이블 업데이트
   ├── verified=true, verified_at/verified_by 기록
   └── translation_conflict.resolved_* 기록
5. 리뷰 큐 SLA: 충돌 건수가 10개 쌓이거나 수집 후 7일 경과 시 처리
```

### 4.5 나무위키 수동 복사 규칙

- 403 차단으로 Playwright 자동 수집 불가
- 수동 복사 경로: `data/manual/namuwiki/<entity-type>/<slug>.md`
- Markdown 프론트매터에 `entity_type`, `entity_id`, `field`, `source_url`, `copied_at` 기록
- 전용 파서가 해당 디렉토리를 읽어 i18n 테이블에 `source='namuwiki'`, `verified=false`로 삽입

---

## 5. 이미지 수집 계획

### 5.1 수집 대상 이미지 (추정)

| 카테고리 | 수량 (추정) | 소스 |
|----------|------------|------|
| 포켓몬 아이콘 + 변형 | ~250 | Serebii |
| 아이템 아이콘 | ~300 | Serebii |
| 서식지 썸네일 | ~213 | Serebii |
| 가구 아이콘 + 색상 변형 | ~250 | Serebii |
| 건축 키트 썸네일 | ~50 | Serebii |
| CD 아이콘 | 43 | Serebii |
| 유물 아이콘 | ~57 | Serebii |
| 스페셜티 아이콘 | 33 | Serebii |
| 커스터마이징 | ~50 | Serebii |
| 페인트/패턴 | ~40 | Serebii |
| 식물 색상 변형 | ~44 (5 식물 + 6 장식 꽃 × 4색) | Serebii |
| 이벤트 관련 | ~30 | Serebii |
| **합계** | **~1,400장** | |

### 5.2 이미지 저장 구조

이미지 URL은 `entity_image` 테이블(SCHEMA.md §2.25)에서 중앙 관리하며, 파일은 외장 SSD에 다음 구조로 저장한다.

```
/images
  /pokemon/{pokedex_no 또는 source_slug}/{variant}.png
  /items/{item_id}/{variant}.png
  /habitats/{habitat_no}/{variant}.png
  /furniture/{item_id}/{color}.png
  /building-kits/{kit_id}.png
  /cds/{cd_id}.png
  /relics/{item_id}.png
  /specialties/{specialty_id}.png
  /customization/{category}/{item_id}.png
  /paint/{colors|patterns}/{id}.png
  /plants/{plant_id}/{color}.png
```

### 5.3 저작권 처리

- 이미지 원본 저작권은 포켓몬 컴퍼니/게임프리크 소유
- 외장 SSD 저장은 개인 사용/개발 캐시 목적으로만
- 공개 위키 배포 시 이용 가능 라이선스 여부 선조사 필수
- Serebii 및 PokopiaGuide는 일반적으로 hotlinking을 금지하므로, 외부 공개 위키에서 원본 URL을 직접 노출하는 방식은 **사용하지 않는다**. 대안:
  - 자체 촬영/렌더링 또는 공식 미디어 키트 등 라이선스가 확보된 이미지만 공개
  - 그 외 엔티티는 "이미지 없음" placeholder로 fallback 처리

---

## 6. 수집 단계별 실행 계획

> Phase 5에 `trade`, `collect`, `litter` 3개 페이지를 신규 편입하면서 단계 번호가 전반적으로 재조정되었다(총 48단계).
> 신규 매트릭스/밸류에이션 테이블이 필요한 단계(33~35)는 실행 전에 SCHEMA.md 보강을 선행해야 한다.

### Phase 1: 코어 데이터 (기반 테이블) — 1~4
1. **포켓몬 목록** - `/availablepokemon.shtml` → `pokemon`, `pokemon_i18n`
2. **스페셜티** - `/specialty.shtml` → `specialty`, `specialty_i18n`, `pokemon_specialty`
3. **지역** - `/locations.shtml` + 각 지역 상세 5종 → `location`, `location_i18n`
4. **아이템 전체** - `/items.shtml` → `item`, `item_i18n`, `item_location`(method 기본값), `item_tag`

### Phase 2: 연관 데이터 — 5~10
5. **서식지** - `/habitats.shtml` → `habitat`, `habitat_i18n`, `habitat_pokemon`
6. **가구** - `/furniture.shtml` → `item` 중 `category=Furniture` 행 속성 보강(크기/플래그) + `item_tag` 할당. 색상 변형은 이 단계에서 URL만 수집하고 실제 이미지는 Phase 9의 `entity_image.variant='color_*'`로 처리
7. **선호도** - `/favorites.shtml` → `favorite_category`, `pokemon_favorite`, `item_favorite_tag`
8. **제작 레시피** - `/crafting.shtml` → `crafting_recipe`, `crafting_ingredient`
9. **요리 레시피** - `/cooking.shtml` → `cooking_recipe`, `cooking_ingredient`
10. **음식/맛** - `/flavors.shtml` → `food`(item 1:1 확장, `flavor`/`pp_restore`/`move_boost`)

### Phase 3: 시스템 & 메커니즘 — 11~22
11. **건축 키트** - `/building.shtml` → `building_kit`, `building_kit_material`
12. **디토 능력** - `/abilities.shtml` → `ditto_ability`, `ditto_ability_i18n`
13. **Magnet Rise** - `/magnetrise.shtml` → `item.is_magnet_rise_only` 플래그 업데이트
14. **도색** - `/paint.shtml` → `paint_color`, `paint_pattern`, `paint_recipe`
15. **전기/물** - `/electricity.shtml`, `/water.shtml` → `generator`, `water_type`
16. **환경 레벨** - `/environmentlevel.shtml` → `environment_reward`, `shop_item`, `currency`
17. **포켓몬 센터** - `/pokemoncenter.shtml` → `pokemon_center`, `pokemon_center_material`
18. **우정** - `/friendship.shtml` → `friendship_tier`
19. **Mosslax 부스트** - `/mosslaxboosts.shtml` → `mosslax_boost`
20. **스탬프 카드** - `/stampcard.shtml` → `stamp_card`, `stamp_reward`
21. **줄넘기/숨바꼭질** - `/jumprope.shtml`, `/hideandsneak.shtml` → `jumprope_tier`, `hideandsneak_reward`
22. **게임플레이 개요** - `/gameplay.shtml` → DB 비대상. 구조화 JSON을 `data/parsed/reference/gameplay.json`에 저장(다른 파서·문서가 참조하는 용어 사전 역할)

### Phase 4: 콘텐츠 데이터 — 23~26
23. **스토리/퀘스트** - `/importantrequests.shtml` → `quest`, `quest_requirement`
24. **팀 도전** - `/teaminitiationchallenge.shtml` → `team_challenge`, `team_challenge_requirement`
25. **전설 포켓몬** - `/legendary.shtml` → `legendary_acquisition`
26. **고유 포켓몬** - `/uniquepokemon.shtml` → `pokemon` 업데이트 (`is_unique_character`, `based_on_species_id`)

### Phase 5: 수집품 & 획득 시스템 — 27~35
27. **CD** - `/cds.shtml` → `cd`, `source_game`, `cd_location`
28. **유물** - `/lostrelics.shtml` → `lost_relic` (item 1:1 확장)
29. **인간 기록** - `/humanrecords.shtml` → `human_record`
30. **커스터마이징** - `/customisation.shtml` → `customization_item`
31. **꽃/채소** - `/flowers.shtml`, `/vegetables.shtml` → `plant`, `plant_variant`
32. **도감 완성** - `/pokedexcompletion.shtml` → `pokedex_milestone`
33. **교역소** - `/trade.shtml` → 기존 `item_location`에 `method=Trade` 행 추가 + 신규 `trade_valuation(item_id, base_value, favorite_bonus_multiplier)` 테이블 (**SCHEMA 보강 선행**)
34. **수집 교환** - `/collect.shtml` → `currency`(feather 등) 참조 + 신규 `exchange_recipe(cost_currency_id, cost_amount, result_item_id, required_env_level, source_location_id)` 테이블 (**SCHEMA 보강 선행**). `item_location`에 `method=Trade`도 병행 등록
35. **쓰레기 보상** - `/litter.shtml` → `item_location`에 `method=Litter` 행 추가 + 신규 `pokemon_litter_reward(pokemon_id, item_id, drop_rate, habitat_id nullable)` 매트릭스 (**SCHEMA 보강 선행**)

### Phase 6: 이벤트 데이터 — 36~38
36. **이벤트 포켓몬** - `/eventpokedex.shtml` → `event`, `event_pokemon`
37. **이벤트 서식지** - `/habitats.shtml` 이벤트 섹션(`is_event=true`) → `event_habitat`
38. **이벤트 아이템** - 소스 한정 열거: `/eventpokedex.shtml`의 이벤트별 보상 목록, `/items.shtml`에서 이벤트 플래그가 표기된 항목, 공식 업데이트 뉴스 페이지(해당 이벤트에 한정) → `event_item`. 그 외 "기타" 범주는 채택하지 않음

### Phase 7: Dream/Cloud Island 상세 — 39~40
39. **Dream Islands** - `/dreamislands.shtml` → `island_variant`, `island_reward`
40. **Cloud Islands** - `/cloudislands.shtml` → `island_variant`

### Phase 8: 한국어 매핑 — 41~46
41. PokopiaGuide.com/ko에서 i18n 1차 매핑 (`source='pokopiaguide'`, `verified=false`)
42. 누락 항목 포코포코(pokopoko.kr)에서 보충 (`source='pokopoko'`, `verified=false`)
43. 나무위키 수동 복사 기반 보충 (`source='namuwiki'`, `verified=false`)
44. 포켓몬 공식 한국어 DB로 포켓몬 이름 교차 검증. 결과별 분기:
    - **값 일치**: 기존 i18n 행의 `verified=true`, `verified_at`, `verified_by` 갱신 (`source` 유지)
    - **값 불일치**: `translation_conflict` 레코드 생성 후 i18n 행의 값을 공식 DB 값으로 덮어쓰기, `source='pokemon_official'`, `verified=true`
45. 다중 소스 충돌 → `translation_conflict`, 수동 리뷰 큐 처리 (§4.4 SLA 준수)
46. 번역 대상 관리:
    - 어떤 소스에도 없는 항목: `source='pending'`으로 마킹하여 번역 큐에 적재
    - 담당자 번역 완료 시: `source='manual'`, `verified=true`, `verified_by` 기록

### Phase 9: 이미지 수집 — 47~48
47. 각 엔티티의 이미지 URL 수집 → `entity_image` 삽입 (엔티티 생성 Phase별 후속 작업으로 병합 가능)
48. 외장 SSD 다운로드 + `content_hash` 산출 + `is_primary` 지정

---

## 7. 크롤러 운영 규칙

### 7.1 요청 제어
- **Rate limit**
  - Serebii: 1 req / 2s
  - PokopiaGuide: 1 req / 1s
  - 포코포코(pokopoko.kr): 1 req / 1s
  - 포켓몬 공식 한국어 DB(pokemon.com/ko): 1 req / 2s (공식 서버는 보수적으로)
  - 나무위키(namu.wiki): 자동 수집 불가(§7.4), 수동 복사만 허용
- **User-Agent**: `PokopiaScraperBot/1.0 (+ukyi.js@gmail.com)` — 식별 가능한 봇 명시
- **robots.txt**: 각 사이트 준수. 거부 경로는 수집 대상에서 제외
- **동시성**: 호스트별 concurrency = 1
- **재시도**: 429/503 응답 시 지수 백오프 (1s → 2s → 4s, 최대 3회), 실패 시 큐에 남기고 다음 주기 재시도

### 7.2 캐시 & 멱등성
- 원본 HTML → `data/cache/<host>/<path>.html`, TTL 3일
- 파서는 캐시 우선, 캐시 미스 시에만 네트워크 요청
- `content_hash`를 계산하여 변경 시에만 DB 반영 (`updated_at` 갱신)

### 7.3 셀렉터 버전 관리
- 파서 모듈에 `SELECTOR_VERSION` 상수 유지
- 구조 변경 감지 시 버전 bump + 이전 버전 파일 보존 (`parsers/<name>.v2.ts`)
- 파싱 실패율 임계치
  - `≥5%`: 경보 발송 (Slack 또는 PagerDuty)
  - `≥20%`: 해당 파서 자동 중단(서킷 브레이커) 후 수동 확인 요구
  - 실패율 산정: `(파싱 에러 페이지 수 / 해당 파서 처리 페이지 수)` × 100, 24시간 롤링 윈도우

### 7.4 나무위키 우회
- Playwright 403으로 자동 수집 불가
- 수동 복사 전용: `data/manual/namuwiki/<entity-type>/<slug>.md`
- 프론트매터에 `entity_type`, `entity_id`, `field`, `source_url`, `copied_at` 기록
- 전용 파서가 `source='namuwiki'`, `verified=false`로 i18n 삽입

### 7.5 저작권 고려
- 이미지 파일: 포켓몬 컴퍼니/게임프리크 저작권 → 자체 배포 금지
- Serebii/PokopiaGuide 이미지는 원본 URL hotlinking도 회피 (§5.3 이미지 저작권 정책과 동일)
- 텍스트 번역: PokopiaGuide/포코포코/나무위키 각 사이트 이용 약관 검토
- 공개 위키 노출 시 라이선스 조사 및 출처 표기 정책 선행

---

## 8. 데이터 품질 관리

### 8.1 검증 규칙
- 모든 **일반** `pokemon`(`is_event=false AND is_unique_character=false`)에 최소 1개의 `specialty` 매핑 존재
  - 예외: 이벤트 포켓몬(`is_event=true`), 고유 캐릭터(`is_unique_character=true`)는 specialty 매핑이 없을 수 있음
- 모든 `item`에 EN locale `item_i18n` 레코드 존재
- 모든 `crafting_recipe`의 `result_item_id`가 유효 `item.id` 참조
- 모든 `habitat_pokemon`의 양쪽 FK 유효
- `source_slug` 엔티티별 UNIQUE
- polymorphic reward: `reward_type`에 맞는 `reward_ref_id`가 대응 테이블에 존재
  - **애플리케이션 레이어에서 일관 검증**한다(Postgres CHECK 제약은 사용하지 않음)
  - 근거: `reward_ref_id`가 복수 테이블을 참조해 CHECK 제약으로 커버하려면 테이블 분기 나열이 필요하고, ENUM 확장마다 제약 변경이 발생하므로 유지보수 비용이 높음
- 중복 i18n 금지: `(entity_id, locale)` UNIQUE
- `scraped_at`, `source_url` NOT NULL
- 신규 테이블(`trade_valuation`, `exchange_recipe`, `pokemon_litter_reward`)이 SCHEMA.md에 존재하는지 확인 (Phase 5 단계 33~35 실행 전)

### 8.2 한국어 커버리지 추적
- Phase 8 완료 후 엔티티 유형별 KO 커버리지 리포트 자동 생성
- 목표 커버리지: 포켓몬 100%, 아이템 90%+, 메커니즘 설명 80%+
- 미달 시 `source='pending'` 목록을 별도 리포트로 출력

### 8.3 자동 검증 스크립트
- `pnpm validate` → Prisma schema + DB 쿼리 기반 일관성 검사
- vitest 스위트로 seed 후 assertion 실행
- CI에서 자동 실행, 임계치 미달 시 실패

---

## 9. 업데이트 & 마이그레이션 전략

### 9.1 게임 업데이트 대응
- 주간 자동 재크롤링 (CronCreate 또는 외부 스케줄러)
- `content_hash` diff 감지 시 변경 리포트 생성
- 스키마 변경이 필요한 경우 Prisma migration으로 이력 관리

### 9.2 스냅샷 & 롤백
- 분기별 `data/snapshots/<yyyy-mm-dd>/` 전체 parsed JSON 보관 (홈랩 NAS + 외장 SSD 이중화, 1년 경과분부터 용량 여유에 따라 축출)
- DB 레벨 논리 백업(`pg_dump`) 주간 수행
  - 보존 정책: 최근 8주치 롤링 보관 + 월 1회분을 최근 12개월 별도 보관 (월/주 구조)
  - 저장 위치: 홈랩 NAS의 `backup/postgres/pokopia/`
- 복원 리허설: 분기 1회 스테이징 환경에서 실제 복원 테스트를 수행하여 백업 무결성 확인

---

## 10. 참고: 주요 수량 추정치

| 엔티티 | 추정 수량 |
|--------|----------|
| 포켓몬 (일반) | ~199종 |
| 포켓몬 (이벤트) | 4종 |
| 포켓몬 (고유 캐릭터) | 4종 |
| 포켓몬 (전설/환상) | ~10종 |
| 스페셜티 | 33종 |
| 아이템 (전체) | 300+ |
| 서식지 | 209 + 이벤트 4 |
| 제작 레시피 | ~100+ |
| 요리 레시피 | ~30+ |
| 건축 키트 | ~50 |
| 가구 | ~100 |
| 선호 카테고리 | 47 |
| CD | 43 |
| 유물 | 57+ |
| 인간 기록 | ~50+ |
| 커스터마이징 아이템 | ~50+ |
| 페인트 색상 | 18 |
| 페인트 패턴 | 22+ |
| 식물/꽃 (기본 종) | 5 식물 + 6 장식 꽃 = 11종 |
| 식물/꽃 (색상 변형 포함) | ~44 변형 |
| 채소 | 4종 |
| 지역 | 6 주요 + 2 특수 |
| 도감 마일스톤 | 10 |
| 우정 단계 | ~10 |
| Mosslax 부스트 | 5 flavors × 3 levels = 15 |
| 이벤트 | ~수 개 (게임 업데이트마다 변동) |
| 엔티티 이미지 (multi-variant) | ~1,400+ |
| translation_conflict (예상) | ~100+ |
| **총 엔티티 (추정)** | **~1,400+** |
| **i18n 레코드 (추정)** | **~2,800+ (엔티티 ~1,400 × EN/KO 2 locale)** |
