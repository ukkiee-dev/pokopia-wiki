/**
 * validators/schemas barrel.
 *
 * Task 2.2 에서 핵심 5개 엔티티(Pokemon / Item / CookingRecipe / CraftingRecipe / Habitat)
 * 스키마를 도메인별 파일로 분리했다. 나머지 엔티티(PokemonI18n / HabitatPokemon /
 * Specialty / BuildingKit / ...) 는 해당 파서 Phase 에서 점진적으로 추가한다.
 *
 * - `./_base`      : SourceMetadataSchema / SourceSiteEnum
 * - `./pokemon`    : PokemonSchema + PokemonInput
 * - `./item`       : ItemSchema + ItemInput
 * - `./recipe`     : CookingRecipeSchema / CraftingRecipeSchema + 각 type
 * - `./geography`  : HabitatSchema + HabitatInput
 * - `./specialty`  : SpecialtySchema + SpecialtyInput (Phase 8 단계 2)
 * - `./social`     : FavoriteCategorySchema + FavoriteCategoryInput (Phase 8 단계 7)
 * - `./food`       : FoodSchema + FoodInput (Phase 8 단계 10)
 * - `./building`   : BuildingKitSchema + BuildingKitInput (Phase 8 단계 11)
 * - `./ditto-ability` : DittoAbilitySchema + DittoAbilityInput (Phase 8 단계 12)
 * - `./magnet-rise`   : MagnetRiseItemSchema + MagnetRiseItemInput (Phase 8 단계 13)
 * - `./paint`         : PaintColorSchema + PaintPatternSchema (Phase 8 단계 14)
 * - `./utility`       : GeneratorSchema + WaterTypeSchema (Phase 8 단계 15)
 * - `./environment`   : EnvironmentRewardSchema + ShopItemSchema + CurrencySchema (Phase 8 단계 16)
 * - `./pokemon-center`: PokemonCenterSchema (Phase 8 단계 17)
 * - `./friendship`    : FriendshipTierSchema (Phase 8 단계 18, 스키마 only)
 * - `./mosslax`       : MosslaxBoostSchema (Phase 8 단계 19)
 * - `./stamp`         : StampCardSchema + StampRewardSchema (Phase 8 단계 20)
 * - `./minigame`      : JumpropeTierSchema + HideAndSneakRewardSchema (Phase 8 단계 21)
 * - `./reference`     : GameplayReferenceSchema (Phase 8 단계 22, DB 비대상 reference)
 * - `./quest`         : QuestSchema + QuestRequirementSchema (Phase 8 단계 23)
 * - `./team-challenge`: TeamChallengeSchema (Phase 8 단계 24)
 * - `./legendary`     : LegendaryAcquisitionSchema (Phase 8 단계 25)
 * - `./unique-pokemon`: UniquePokemonPatchSchema (Phase 8 단계 26 보강)
 * - `./cd`            : CdSchema (Phase 8 단계 27, source_game/cd_location nested)
 * - `./lost-relic`    : LostRelicSchema (Phase 8 단계 28)
 * - `./human-record`  : HumanRecordSchema (Phase 8 단계 29)
 */

export * from './_base';
export * from './pokemon';
export * from './item';
export * from './recipe';
export * from './geography';
export * from './specialty';
export * from './social';
export * from './food';
export * from './building';
export * from './ditto-ability';
export * from './magnet-rise';
export * from './paint';
export * from './utility';
export * from './environment';
export * from './pokemon-center';
export * from './friendship';
export * from './mosslax';
export * from './stamp';
export * from './minigame';
export * from './reference';
export * from './quest';
export * from './team-challenge';
export * from './legendary';
export * from './unique-pokemon';
export * from './cd';
export * from './lost-relic';
export * from './human-record';
