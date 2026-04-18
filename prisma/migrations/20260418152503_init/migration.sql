-- CreateEnum
CREATE TYPE "I18nSource" AS ENUM ('pokopiaguide', 'pokopoko', 'namuwiki', 'pokemon_official', 'manual', 'pending');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('Materials', 'Food', 'Furniture', 'Misc', 'Outdoor', 'Utilities', 'Nature', 'Buildings', 'Blocks', 'Kits', 'Key Items');

-- CreateEnum
CREATE TYPE "ItemTagName" AS ENUM ('Decoration', 'Food', 'Relaxation', 'Road', 'Toy');

-- CreateEnum
CREATE TYPE "ItemLocationMethod" AS ENUM ('Natural', 'Craft', 'Shop', 'Trade', 'Dream Island', 'Build Kit', 'Relic Appraisal', 'Pokemon Center', 'Litter');

-- CreateEnum
CREATE TYPE "MealCategory" AS ENUM ('Salad', 'Soup', 'Bread', 'Steak');

-- CreateEnum
CREATE TYPE "CookingRole" AS ENUM ('main', 'sub');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('Main', 'Dream Island', 'Cloud Island', 'Sub');

-- CreateEnum
CREATE TYPE "TimeCondition" AS ENUM ('Day', 'Night', 'Any');

-- CreateEnum
CREATE TYPE "WeatherCondition" AS ENUM ('Sunny', 'Rainy', 'Snowy', 'Cloudy', 'Any');

-- CreateEnum
CREATE TYPE "BuildingKitCategory" AS ENUM ('Residential', 'Infrastructure', 'Decorative', 'Venue', 'Special');

-- CreateEnum
CREATE TYPE "FlavorType" AS ENUM ('Bitter', 'Dry', 'Sour', 'Spicy', 'Sweet', 'None');

-- CreateEnum
CREATE TYPE "PpRestore" AS ENUM ('little', 'some', 'lot');

-- CreateEnum
CREATE TYPE "MoveBoost" AS ENUM ('Leafage', 'Water Gun', 'Cut', 'Rock Smash');

-- CreateEnum
CREATE TYPE "DittoAbilityType" AS ENUM ('Primary', 'Secondary');

-- CreateEnum
CREATE TYPE "EnvironmentRewardType" AS ENUM ('item', 'recipe', 'feature_unlock', 'shop_unlock');

-- CreateEnum
CREATE TYPE "CustomizationCategory" AS ENUM ('Hair', 'Outfit', 'Top', 'Pants', 'Hat', 'Bag', 'Shoes');

-- CreateEnum
CREATE TYPE "HumanRecordCategory" AS ENUM ('Newspaper', 'Diary', 'Magazine', 'Note', 'Letter', 'Paper', 'Photo');

-- CreateEnum
CREATE TYPE "HumanRecordRewardType" AS ENUM ('customization', 'item', 'cd', 'none');

-- CreateEnum
CREATE TYPE "PokedexMilestoneRewardType" AS ENUM ('item', 'recipe', 'feature_unlock');

-- CreateEnum
CREATE TYPE "PlantType" AS ENUM ('BerryTree', 'Wildflower', 'SeashorFlower', 'MountainFlower', 'SkylandFlower', 'DecorativeFlower', 'Hedge', 'Vegetable');

-- CreateEnum
CREATE TYPE "LostRelicSize" AS ENUM ('L', 'S');

-- CreateEnum
CREATE TYPE "JumpropeRewardType" AS ENUM ('item', 'coin');

-- CreateEnum
CREATE TYPE "HideAndSneakRewardType" AS ENUM ('item', 'coin');

-- CreateEnum
CREATE TYPE "IslandRewardType" AS ENUM ('item', 'cd', 'recipe');

-- CreateEnum
CREATE TYPE "EntityImageType" AS ENUM ('pokemon', 'item', 'habitat', 'building_kit', 'cd', 'human_record', 'location', 'paint_color', 'paint_pattern', 'plant', 'customization', 'specialty', 'lost_relic', 'island_variant');

-- CreateTable
CREATE TABLE "pokemon" (
    "id" SERIAL NOT NULL,
    "pokedex_no" INTEGER,
    "is_event" BOOLEAN NOT NULL DEFAULT false,
    "is_unique_character" BOOLEAN NOT NULL DEFAULT false,
    "is_legendary" BOOLEAN NOT NULL DEFAULT false,
    "based_on_species_id" INTEGER,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pokemon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pokemon_i18n" (
    "pokemon_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "pokemon_i18n_pkey" PRIMARY KEY ("pokemon_id","locale")
);

-- CreateTable
CREATE TABLE "legendary_acquisition" (
    "id" SERIAL NOT NULL,
    "pokemon_id" INTEGER NOT NULL,
    "unlock_condition" TEXT NOT NULL,
    "location_id" INTEGER,
    "effect" TEXT NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legendary_acquisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legendary_acquisition_i18n" (
    "legendary_acquisition_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "unlock_condition" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "legendary_acquisition_i18n_pkey" PRIMARY KEY ("legendary_acquisition_id","locale")
);

-- CreateTable
CREATE TABLE "specialty" (
    "id" SERIAL NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialty_i18n" (
    "specialty_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "specialty_i18n_pkey" PRIMARY KEY ("specialty_id","locale")
);

-- CreateTable
CREATE TABLE "pokemon_specialty" (
    "pokemon_id" INTEGER NOT NULL,
    "specialty_id" INTEGER NOT NULL,

    CONSTRAINT "pokemon_specialty_pkey" PRIMARY KEY ("pokemon_id","specialty_id")
);

-- CreateTable
CREATE TABLE "item" (
    "id" SERIAL NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "is_paintable" BOOLEAN NOT NULL DEFAULT false,
    "is_patternable" BOOLEAN NOT NULL DEFAULT false,
    "is_magnet_rise_only" BOOLEAN NOT NULL DEFAULT false,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_i18n" (
    "item_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "item_i18n_pkey" PRIMARY KEY ("item_id","locale")
);

-- CreateTable
CREATE TABLE "item_tag" (
    "item_id" INTEGER NOT NULL,
    "tag" "ItemTagName" NOT NULL,

    CONSTRAINT "item_tag_pkey" PRIMARY KEY ("item_id","tag")
);

-- CreateTable
CREATE TABLE "item_location" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "location_id" INTEGER,
    "method" "ItemLocationMethod" NOT NULL,
    "detail" TEXT,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crafting_recipe" (
    "id" SERIAL NOT NULL,
    "result_item_id" INTEGER NOT NULL,
    "result_quantity" INTEGER NOT NULL DEFAULT 1,
    "unlock_method" TEXT NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crafting_recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crafting_ingredient" (
    "recipe_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "crafting_ingredient_pkey" PRIMARY KEY ("recipe_id","item_id")
);

-- CreateTable
CREATE TABLE "cooking_recipe" (
    "id" SERIAL NOT NULL,
    "result_item_id" INTEGER NOT NULL,
    "meal_category" "MealCategory" NOT NULL,
    "bonus_specialty_id" INTEGER,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cooking_recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cooking_ingredient" (
    "recipe_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "role" "CookingRole" NOT NULL,

    CONSTRAINT "cooking_ingredient_pkey" PRIMARY KEY ("recipe_id","item_id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" SERIAL NOT NULL,
    "type" "LocationType" NOT NULL,
    "parent_id" INTEGER,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_i18n" (
    "location_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "location_i18n_pkey" PRIMARY KEY ("location_id","locale")
);

-- CreateTable
CREATE TABLE "habitat" (
    "id" SERIAL NOT NULL,
    "habitat_no" INTEGER,
    "is_event" BOOLEAN NOT NULL DEFAULT false,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habitat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habitat_i18n" (
    "habitat_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "habitat_i18n_pkey" PRIMARY KEY ("habitat_id","locale")
);

-- CreateTable
CREATE TABLE "habitat_pokemon" (
    "habitat_id" INTEGER NOT NULL,
    "pokemon_id" INTEGER NOT NULL,
    "time_condition" "TimeCondition" NOT NULL DEFAULT 'Any',
    "weather_condition" "WeatherCondition" NOT NULL DEFAULT 'Any',

    CONSTRAINT "habitat_pokemon_pkey" PRIMARY KEY ("habitat_id","pokemon_id","time_condition","weather_condition")
);

-- CreateTable
CREATE TABLE "building_kit" (
    "id" SERIAL NOT NULL,
    "category" "BuildingKitCategory" NOT NULL,
    "pokemon_capacity" INTEGER NOT NULL,
    "building_points" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "building_kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_kit_i18n" (
    "building_kit_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "building_kit_i18n_pkey" PRIMARY KEY ("building_kit_id","locale")
);

-- CreateTable
CREATE TABLE "building_kit_material" (
    "building_kit_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,

    CONSTRAINT "building_kit_material_pkey" PRIMARY KEY ("building_kit_id","item_id")
);

-- CreateTable
CREATE TABLE "favorite_category" (
    "id" SERIAL NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "favorite_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_category_i18n" (
    "category_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "favorite_category_i18n_pkey" PRIMARY KEY ("category_id","locale")
);

-- CreateTable
CREATE TABLE "pokemon_favorite" (
    "pokemon_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,

    CONSTRAINT "pokemon_favorite_pkey" PRIMARY KEY ("pokemon_id","category_id")
);

-- CreateTable
CREATE TABLE "item_favorite_tag" (
    "item_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,

    CONSTRAINT "item_favorite_tag_pkey" PRIMARY KEY ("item_id","category_id")
);

-- CreateTable
CREATE TABLE "friendship_tier" (
    "id" SERIAL NOT NULL,
    "tier" INTEGER NOT NULL,
    "required_points" INTEGER NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friendship_tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendship_tier_i18n" (
    "tier_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "friendship_tier_i18n_pkey" PRIMARY KEY ("tier_id","locale")
);

-- CreateTable
CREATE TABLE "food" (
    "item_id" INTEGER NOT NULL,
    "flavor" "FlavorType" NOT NULL,
    "pp_restore" "PpRestore" NOT NULL,
    "move_boost" "MoveBoost",

    CONSTRAINT "food_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "ditto_ability" (
    "id" SERIAL NOT NULL,
    "type" "DittoAbilityType" NOT NULL,
    "unlock_pokemon_id" INTEGER NOT NULL,
    "unlock_location_id" INTEGER,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ditto_ability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ditto_ability_i18n" (
    "ditto_ability_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "ditto_ability_i18n_pkey" PRIMARY KEY ("ditto_ability_id","locale")
);

-- CreateTable
CREATE TABLE "environment_reward" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "reward_type" "EnvironmentRewardType" NOT NULL,
    "reward_ref_id" INTEGER,
    "note" TEXT,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environment_reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_item" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "required_env_level" INTEGER NOT NULL,
    "price" INTEGER,
    "currency_id" INTEGER NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_i18n" (
    "currency_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "currency_i18n_pkey" PRIMARY KEY ("currency_id","locale")
);

-- CreateTable
CREATE TABLE "paint_color" (
    "id" SERIAL NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paint_color_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paint_color_i18n" (
    "color_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "paint_color_i18n_pkey" PRIMARY KEY ("color_id","locale")
);

-- CreateTable
CREATE TABLE "paint_pattern" (
    "id" SERIAL NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paint_pattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paint_pattern_i18n" (
    "pattern_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "paint_pattern_i18n_pkey" PRIMARY KEY ("pattern_id","locale")
);

-- CreateTable
CREATE TABLE "paint_recipe" (
    "result_color_id" INTEGER NOT NULL,
    "ingredient_color_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "paint_recipe_pkey" PRIMARY KEY ("result_color_id","ingredient_color_id")
);

-- CreateTable
CREATE TABLE "quest" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "prerequisite_quest_id" INTEGER,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_i18n" (
    "quest_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "walkthrough" TEXT NOT NULL,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "quest_i18n_pkey" PRIMARY KEY ("quest_id","locale")
);

-- CreateTable
CREATE TABLE "quest_requirement" (
    "id" SERIAL NOT NULL,
    "quest_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "pokemon_id" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,

    CONSTRAINT "quest_requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_challenge" (
    "id" SERIAL NOT NULL,
    "stage" INTEGER NOT NULL,
    "badge_name" TEXT NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_challenge_requirement" (
    "challenge_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "team_challenge_requirement_pkey" PRIMARY KEY ("challenge_id","item_id")
);

-- CreateTable
CREATE TABLE "pokemon_center" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "required_env_level" INTEGER NOT NULL,
    "required_pokemon_count" INTEGER NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pokemon_center_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pokemon_center_material" (
    "center_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pokemon_center_material_pkey" PRIMARY KEY ("center_id","item_id")
);

-- CreateTable
CREATE TABLE "generator" (
    "id" SERIAL NOT NULL,
    "output_units" INTEGER NOT NULL,
    "output_units_alt" INTEGER,
    "is_renewable" BOOLEAN NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generator_i18n" (
    "generator_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "generator_i18n_pkey" PRIMARY KEY ("generator_id","locale")
);

-- CreateTable
CREATE TABLE "water_type" (
    "id" SERIAL NOT NULL,
    "spread_radius" INTEGER NOT NULL,
    "trench_distance" INTEGER NOT NULL,
    "hydrates" BOOLEAN NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "water_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_type_i18n" (
    "water_type_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "water_type_i18n_pkey" PRIMARY KEY ("water_type_id","locale")
);

-- CreateTable
CREATE TABLE "customization_item" (
    "id" SERIAL NOT NULL,
    "category" "CustomizationCategory" NOT NULL,
    "unlock_method" TEXT NOT NULL,
    "unlock_location_id" INTEGER,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customization_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customization_item_i18n" (
    "customization_item_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "customization_item_i18n_pkey" PRIMARY KEY ("customization_item_id","locale")
);

-- CreateTable
CREATE TABLE "cd" (
    "id" SERIAL NOT NULL,
    "source_game_id" INTEGER NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cd_i18n" (
    "cd_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "cd_i18n_pkey" PRIMARY KEY ("cd_id","locale")
);

-- CreateTable
CREATE TABLE "source_game" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_game_i18n" (
    "source_game_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "source_game_i18n_pkey" PRIMARY KEY ("source_game_id","locale")
);

-- CreateTable
CREATE TABLE "cd_location" (
    "id" SERIAL NOT NULL,
    "cd_id" INTEGER NOT NULL,
    "location_id" INTEGER,
    "method" TEXT NOT NULL,

    CONSTRAINT "cd_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "human_record" (
    "id" SERIAL NOT NULL,
    "category" "HumanRecordCategory" NOT NULL,
    "location_id" INTEGER NOT NULL,
    "reward_type" "HumanRecordRewardType" NOT NULL,
    "reward_ref_id" INTEGER,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "human_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "human_record_i18n" (
    "human_record_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "human_record_i18n_pkey" PRIMARY KEY ("human_record_id","locale")
);

-- CreateTable
CREATE TABLE "pokedex_milestone" (
    "id" SERIAL NOT NULL,
    "required_count" INTEGER NOT NULL,
    "reward_type" "PokedexMilestoneRewardType" NOT NULL,
    "reward_ref_id" INTEGER NOT NULL,
    "note" TEXT,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pokedex_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant" (
    "id" SERIAL NOT NULL,
    "type" "PlantType" NOT NULL,
    "growth_days" INTEGER NOT NULL,
    "growth_days_with_grow" INTEGER NOT NULL,
    "requires_hydration" BOOLEAN NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_i18n" (
    "plant_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "plant_i18n_pkey" PRIMARY KEY ("plant_id","locale")
);

-- CreateTable
CREATE TABLE "plant_variant" (
    "id" SERIAL NOT NULL,
    "plant_id" INTEGER NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "plant_variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lost_relic" (
    "item_id" INTEGER NOT NULL,
    "size_class" "LostRelicSize" NOT NULL,
    "is_appraised_form" BOOLEAN NOT NULL,

    CONSTRAINT "lost_relic_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" SERIAL NOT NULL,
    "start_at" DATE,
    "end_at" DATE,
    "is_recurring" BOOLEAN NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_i18n" (
    "event_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "event_i18n_pkey" PRIMARY KEY ("event_id","locale")
);

-- CreateTable
CREATE TABLE "event_pokemon" (
    "event_id" INTEGER NOT NULL,
    "pokemon_id" INTEGER NOT NULL,

    CONSTRAINT "event_pokemon_pkey" PRIMARY KEY ("event_id","pokemon_id")
);

-- CreateTable
CREATE TABLE "event_habitat" (
    "event_id" INTEGER NOT NULL,
    "habitat_id" INTEGER NOT NULL,

    CONSTRAINT "event_habitat_pkey" PRIMARY KEY ("event_id","habitat_id")
);

-- CreateTable
CREATE TABLE "event_item" (
    "event_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,

    CONSTRAINT "event_item_pkey" PRIMARY KEY ("event_id","item_id")
);

-- CreateTable
CREATE TABLE "stamp_card" (
    "id" SERIAL NOT NULL,
    "week_goal" INTEGER NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stamp_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stamp_reward" (
    "id" SERIAL NOT NULL,
    "card_id" INTEGER NOT NULL,
    "tier" INTEGER NOT NULL,
    "required_stamps" INTEGER NOT NULL,
    "coin_amount" INTEGER NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stamp_reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jumprope_tier" (
    "id" SERIAL NOT NULL,
    "tier" INTEGER NOT NULL,
    "required_jumps" INTEGER NOT NULL,
    "reward_type" "JumpropeRewardType" NOT NULL,
    "reward_ref_id" INTEGER,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jumprope_tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hideandsneak_reward" (
    "id" SERIAL NOT NULL,
    "condition" TEXT NOT NULL,
    "reward_type" "HideAndSneakRewardType" NOT NULL,
    "reward_ref_id" INTEGER NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hideandsneak_reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mosslax_boost" (
    "id" SERIAL NOT NULL,
    "flavor" "FlavorType" NOT NULL,
    "level" INTEGER NOT NULL,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mosslax_boost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mosslax_boost_i18n" (
    "boost_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "mosslax_boost_i18n_pkey" PRIMARY KEY ("boost_id","locale")
);

-- CreateTable
CREATE TABLE "island_variant" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "difficulty" INTEGER,
    "guaranteed_legendary_id" INTEGER,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "island_variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "island_variant_i18n" (
    "variant_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "I18nSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,

    CONSTRAINT "island_variant_i18n_pkey" PRIMARY KEY ("variant_id","locale")
);

-- CreateTable
CREATE TABLE "island_reward" (
    "id" SERIAL NOT NULL,
    "island_variant_id" INTEGER NOT NULL,
    "reward_type" "IslandRewardType" NOT NULL,
    "reward_ref_id" INTEGER NOT NULL,
    "drop_rate" DOUBLE PRECISION,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "island_reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_image" (
    "id" SERIAL NOT NULL,
    "entity_type" "EntityImageType" NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "variant" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "content_hash" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translation_conflict" (
    "id" SERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "pokopiaguide_value" TEXT,
    "pokopoko_value" TEXT,
    "namuwiki_value" TEXT,
    "pokemon_official_value" TEXT,
    "resolved_value" TEXT,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translation_conflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_valuation" (
    "item_id" INTEGER NOT NULL,
    "base_value" INTEGER NOT NULL,
    "favorite_bonus_multiplier" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "trade_valuation_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "exchange_recipe" (
    "id" SERIAL NOT NULL,
    "cost_currency_id" INTEGER NOT NULL,
    "cost_amount" INTEGER NOT NULL,
    "result_item_id" INTEGER NOT NULL,
    "result_quantity" INTEGER NOT NULL DEFAULT 1,
    "required_env_level" INTEGER,
    "source_location_id" INTEGER,
    "source_slug" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pokemon_litter_reward" (
    "id" SERIAL NOT NULL,
    "pokemon_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "habitat_id" INTEGER,
    "drop_rate" DOUBLE PRECISION,

    CONSTRAINT "pokemon_litter_reward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pokemon_pokedex_no_key" ON "pokemon"("pokedex_no");

-- CreateIndex
CREATE UNIQUE INDEX "pokemon_source_slug_key" ON "pokemon"("source_slug");

-- CreateIndex
CREATE INDEX "pokemon_is_event_is_unique_character_idx" ON "pokemon"("is_event", "is_unique_character");

-- CreateIndex
CREATE INDEX "pokemon_is_legendary_idx" ON "pokemon"("is_legendary");

-- CreateIndex
CREATE UNIQUE INDEX "legendary_acquisition_pokemon_id_key" ON "legendary_acquisition"("pokemon_id");

-- CreateIndex
CREATE UNIQUE INDEX "legendary_acquisition_source_slug_key" ON "legendary_acquisition"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "specialty_source_slug_key" ON "specialty"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "item_source_slug_key" ON "item"("source_slug");

-- CreateIndex
CREATE INDEX "item_category_idx" ON "item"("category");

-- CreateIndex
CREATE UNIQUE INDEX "item_location_source_slug_key" ON "item_location"("source_slug");

-- CreateIndex
CREATE INDEX "item_location_item_id_idx" ON "item_location"("item_id");

-- CreateIndex
CREATE INDEX "item_location_method_idx" ON "item_location"("method");

-- CreateIndex
CREATE UNIQUE INDEX "crafting_recipe_source_slug_key" ON "crafting_recipe"("source_slug");

-- CreateIndex
CREATE INDEX "crafting_recipe_result_item_id_idx" ON "crafting_recipe"("result_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "cooking_recipe_source_slug_key" ON "cooking_recipe"("source_slug");

-- CreateIndex
CREATE INDEX "cooking_recipe_result_item_id_idx" ON "cooking_recipe"("result_item_id");

-- CreateIndex
CREATE INDEX "cooking_recipe_meal_category_idx" ON "cooking_recipe"("meal_category");

-- CreateIndex
CREATE UNIQUE INDEX "location_source_slug_key" ON "location"("source_slug");

-- CreateIndex
CREATE INDEX "location_type_idx" ON "location"("type");

-- CreateIndex
CREATE UNIQUE INDEX "habitat_habitat_no_key" ON "habitat"("habitat_no");

-- CreateIndex
CREATE UNIQUE INDEX "habitat_source_slug_key" ON "habitat"("source_slug");

-- CreateIndex
CREATE INDEX "habitat_pokemon_pokemon_id_idx" ON "habitat_pokemon"("pokemon_id");

-- CreateIndex
CREATE UNIQUE INDEX "building_kit_source_slug_key" ON "building_kit"("source_slug");

-- CreateIndex
CREATE INDEX "building_kit_category_idx" ON "building_kit"("category");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_category_source_slug_key" ON "favorite_category"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "friendship_tier_tier_key" ON "friendship_tier"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "friendship_tier_source_slug_key" ON "friendship_tier"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "ditto_ability_source_slug_key" ON "ditto_ability"("source_slug");

-- CreateIndex
CREATE INDEX "ditto_ability_type_idx" ON "ditto_ability"("type");

-- CreateIndex
CREATE UNIQUE INDEX "environment_reward_source_slug_key" ON "environment_reward"("source_slug");

-- CreateIndex
CREATE INDEX "environment_reward_location_id_level_idx" ON "environment_reward"("location_id", "level");

-- CreateIndex
CREATE INDEX "environment_reward_reward_type_idx" ON "environment_reward"("reward_type");

-- CreateIndex
CREATE UNIQUE INDEX "shop_item_source_slug_key" ON "shop_item"("source_slug");

-- CreateIndex
CREATE INDEX "shop_item_location_id_idx" ON "shop_item"("location_id");

-- CreateIndex
CREATE INDEX "shop_item_item_id_idx" ON "shop_item"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "currency_code_key" ON "currency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "currency_source_slug_key" ON "currency"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "paint_color_source_slug_key" ON "paint_color"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "paint_pattern_source_slug_key" ON "paint_pattern"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "quest_source_slug_key" ON "quest"("source_slug");

-- CreateIndex
CREATE INDEX "quest_location_id_sort_order_idx" ON "quest"("location_id", "sort_order");

-- CreateIndex
CREATE INDEX "quest_requirement_quest_id_idx" ON "quest_requirement"("quest_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_challenge_stage_key" ON "team_challenge"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "team_challenge_source_slug_key" ON "team_challenge"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "pokemon_center_source_slug_key" ON "pokemon_center"("source_slug");

-- CreateIndex
CREATE INDEX "pokemon_center_location_id_idx" ON "pokemon_center"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "generator_source_slug_key" ON "generator"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "water_type_source_slug_key" ON "water_type"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "customization_item_source_slug_key" ON "customization_item"("source_slug");

-- CreateIndex
CREATE INDEX "customization_item_category_idx" ON "customization_item"("category");

-- CreateIndex
CREATE UNIQUE INDEX "cd_source_slug_key" ON "cd"("source_slug");

-- CreateIndex
CREATE INDEX "cd_source_game_id_idx" ON "cd"("source_game_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_game_code_key" ON "source_game"("code");

-- CreateIndex
CREATE UNIQUE INDEX "source_game_source_slug_key" ON "source_game"("source_slug");

-- CreateIndex
CREATE INDEX "cd_location_cd_id_idx" ON "cd_location"("cd_id");

-- CreateIndex
CREATE UNIQUE INDEX "human_record_source_slug_key" ON "human_record"("source_slug");

-- CreateIndex
CREATE INDEX "human_record_category_idx" ON "human_record"("category");

-- CreateIndex
CREATE INDEX "human_record_reward_type_idx" ON "human_record"("reward_type");

-- CreateIndex
CREATE UNIQUE INDEX "pokedex_milestone_source_slug_key" ON "pokedex_milestone"("source_slug");

-- CreateIndex
CREATE INDEX "pokedex_milestone_required_count_idx" ON "pokedex_milestone"("required_count");

-- CreateIndex
CREATE INDEX "pokedex_milestone_reward_type_idx" ON "pokedex_milestone"("reward_type");

-- CreateIndex
CREATE UNIQUE INDEX "plant_source_slug_key" ON "plant"("source_slug");

-- CreateIndex
CREATE INDEX "plant_type_idx" ON "plant"("type");

-- CreateIndex
CREATE INDEX "plant_variant_plant_id_idx" ON "plant_variant"("plant_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_source_slug_key" ON "event"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "stamp_card_source_slug_key" ON "stamp_card"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "stamp_reward_source_slug_key" ON "stamp_reward"("source_slug");

-- CreateIndex
CREATE INDEX "stamp_reward_card_id_tier_idx" ON "stamp_reward"("card_id", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "jumprope_tier_tier_key" ON "jumprope_tier"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "jumprope_tier_source_slug_key" ON "jumprope_tier"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "hideandsneak_reward_source_slug_key" ON "hideandsneak_reward"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "mosslax_boost_source_slug_key" ON "mosslax_boost"("source_slug");

-- CreateIndex
CREATE UNIQUE INDEX "mosslax_boost_flavor_level_key" ON "mosslax_boost"("flavor", "level");

-- CreateIndex
CREATE UNIQUE INDEX "island_variant_source_slug_key" ON "island_variant"("source_slug");

-- CreateIndex
CREATE INDEX "island_variant_location_id_idx" ON "island_variant"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "island_reward_source_slug_key" ON "island_reward"("source_slug");

-- CreateIndex
CREATE INDEX "island_reward_island_variant_id_idx" ON "island_reward"("island_variant_id");

-- CreateIndex
CREATE INDEX "entity_image_entity_type_entity_id_idx" ON "entity_image"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "entity_image_entity_type_entity_id_is_primary_idx" ON "entity_image"("entity_type", "entity_id", "is_primary");

-- CreateIndex
CREATE INDEX "translation_conflict_entity_type_entity_id_idx" ON "translation_conflict"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "translation_conflict_resolved_at_idx" ON "translation_conflict"("resolved_at");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_recipe_source_slug_key" ON "exchange_recipe"("source_slug");

-- CreateIndex
CREATE INDEX "exchange_recipe_result_item_id_idx" ON "exchange_recipe"("result_item_id");

-- CreateIndex
CREATE INDEX "exchange_recipe_cost_currency_id_idx" ON "exchange_recipe"("cost_currency_id");

-- CreateIndex
CREATE INDEX "pokemon_litter_reward_pokemon_id_idx" ON "pokemon_litter_reward"("pokemon_id");

-- CreateIndex
CREATE INDEX "pokemon_litter_reward_item_id_idx" ON "pokemon_litter_reward"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "pokemon_litter_reward_pokemon_id_item_id_habitat_id_key" ON "pokemon_litter_reward"("pokemon_id", "item_id", "habitat_id");

-- AddForeignKey
ALTER TABLE "pokemon" ADD CONSTRAINT "pokemon_based_on_species_id_fkey" FOREIGN KEY ("based_on_species_id") REFERENCES "pokemon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_i18n" ADD CONSTRAINT "pokemon_i18n_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legendary_acquisition" ADD CONSTRAINT "legendary_acquisition_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legendary_acquisition" ADD CONSTRAINT "legendary_acquisition_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legendary_acquisition_i18n" ADD CONSTRAINT "legendary_acquisition_i18n_legendary_acquisition_id_fkey" FOREIGN KEY ("legendary_acquisition_id") REFERENCES "legendary_acquisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specialty_i18n" ADD CONSTRAINT "specialty_i18n_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_specialty" ADD CONSTRAINT "pokemon_specialty_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_specialty" ADD CONSTRAINT "pokemon_specialty_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_i18n" ADD CONSTRAINT "item_i18n_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_tag" ADD CONSTRAINT "item_tag_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_location" ADD CONSTRAINT "item_location_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_location" ADD CONSTRAINT "item_location_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crafting_recipe" ADD CONSTRAINT "crafting_recipe_result_item_id_fkey" FOREIGN KEY ("result_item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crafting_ingredient" ADD CONSTRAINT "crafting_ingredient_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "crafting_recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crafting_ingredient" ADD CONSTRAINT "crafting_ingredient_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_recipe" ADD CONSTRAINT "cooking_recipe_result_item_id_fkey" FOREIGN KEY ("result_item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_recipe" ADD CONSTRAINT "cooking_recipe_bonus_specialty_id_fkey" FOREIGN KEY ("bonus_specialty_id") REFERENCES "specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_ingredient" ADD CONSTRAINT "cooking_ingredient_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "cooking_recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_ingredient" ADD CONSTRAINT "cooking_ingredient_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_i18n" ADD CONSTRAINT "location_i18n_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habitat_i18n" ADD CONSTRAINT "habitat_i18n_habitat_id_fkey" FOREIGN KEY ("habitat_id") REFERENCES "habitat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habitat_pokemon" ADD CONSTRAINT "habitat_pokemon_habitat_id_fkey" FOREIGN KEY ("habitat_id") REFERENCES "habitat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habitat_pokemon" ADD CONSTRAINT "habitat_pokemon_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_kit_i18n" ADD CONSTRAINT "building_kit_i18n_building_kit_id_fkey" FOREIGN KEY ("building_kit_id") REFERENCES "building_kit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_kit_material" ADD CONSTRAINT "building_kit_material_building_kit_id_fkey" FOREIGN KEY ("building_kit_id") REFERENCES "building_kit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_kit_material" ADD CONSTRAINT "building_kit_material_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_category_i18n" ADD CONSTRAINT "favorite_category_i18n_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "favorite_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_favorite" ADD CONSTRAINT "pokemon_favorite_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_favorite" ADD CONSTRAINT "pokemon_favorite_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "favorite_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_favorite_tag" ADD CONSTRAINT "item_favorite_tag_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_favorite_tag" ADD CONSTRAINT "item_favorite_tag_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "favorite_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendship_tier_i18n" ADD CONSTRAINT "friendship_tier_i18n_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "friendship_tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food" ADD CONSTRAINT "food_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ditto_ability" ADD CONSTRAINT "ditto_ability_unlock_pokemon_id_fkey" FOREIGN KEY ("unlock_pokemon_id") REFERENCES "pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ditto_ability" ADD CONSTRAINT "ditto_ability_unlock_location_id_fkey" FOREIGN KEY ("unlock_location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ditto_ability_i18n" ADD CONSTRAINT "ditto_ability_i18n_ditto_ability_id_fkey" FOREIGN KEY ("ditto_ability_id") REFERENCES "ditto_ability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_reward" ADD CONSTRAINT "environment_reward_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_item" ADD CONSTRAINT "shop_item_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_item" ADD CONSTRAINT "shop_item_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_item" ADD CONSTRAINT "shop_item_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_i18n" ADD CONSTRAINT "currency_i18n_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paint_color_i18n" ADD CONSTRAINT "paint_color_i18n_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "paint_color"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paint_pattern_i18n" ADD CONSTRAINT "paint_pattern_i18n_pattern_id_fkey" FOREIGN KEY ("pattern_id") REFERENCES "paint_pattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paint_recipe" ADD CONSTRAINT "paint_recipe_result_color_id_fkey" FOREIGN KEY ("result_color_id") REFERENCES "paint_color"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paint_recipe" ADD CONSTRAINT "paint_recipe_ingredient_color_id_fkey" FOREIGN KEY ("ingredient_color_id") REFERENCES "paint_color"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest" ADD CONSTRAINT "quest_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest" ADD CONSTRAINT "quest_prerequisite_quest_id_fkey" FOREIGN KEY ("prerequisite_quest_id") REFERENCES "quest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_i18n" ADD CONSTRAINT "quest_i18n_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_requirement" ADD CONSTRAINT "quest_requirement_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_requirement" ADD CONSTRAINT "quest_requirement_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_requirement" ADD CONSTRAINT "quest_requirement_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_challenge_requirement" ADD CONSTRAINT "team_challenge_requirement_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "team_challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_challenge_requirement" ADD CONSTRAINT "team_challenge_requirement_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_center" ADD CONSTRAINT "pokemon_center_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_center_material" ADD CONSTRAINT "pokemon_center_material_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "pokemon_center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_center_material" ADD CONSTRAINT "pokemon_center_material_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generator_i18n" ADD CONSTRAINT "generator_i18n_generator_id_fkey" FOREIGN KEY ("generator_id") REFERENCES "generator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_type_i18n" ADD CONSTRAINT "water_type_i18n_water_type_id_fkey" FOREIGN KEY ("water_type_id") REFERENCES "water_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customization_item" ADD CONSTRAINT "customization_item_unlock_location_id_fkey" FOREIGN KEY ("unlock_location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customization_item_i18n" ADD CONSTRAINT "customization_item_i18n_customization_item_id_fkey" FOREIGN KEY ("customization_item_id") REFERENCES "customization_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cd" ADD CONSTRAINT "cd_source_game_id_fkey" FOREIGN KEY ("source_game_id") REFERENCES "source_game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cd_i18n" ADD CONSTRAINT "cd_i18n_cd_id_fkey" FOREIGN KEY ("cd_id") REFERENCES "cd"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_game_i18n" ADD CONSTRAINT "source_game_i18n_source_game_id_fkey" FOREIGN KEY ("source_game_id") REFERENCES "source_game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cd_location" ADD CONSTRAINT "cd_location_cd_id_fkey" FOREIGN KEY ("cd_id") REFERENCES "cd"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cd_location" ADD CONSTRAINT "cd_location_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "human_record" ADD CONSTRAINT "human_record_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "human_record_i18n" ADD CONSTRAINT "human_record_i18n_human_record_id_fkey" FOREIGN KEY ("human_record_id") REFERENCES "human_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_i18n" ADD CONSTRAINT "plant_i18n_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_variant" ADD CONSTRAINT "plant_variant_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_relic" ADD CONSTRAINT "lost_relic_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_i18n" ADD CONSTRAINT "event_i18n_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_pokemon" ADD CONSTRAINT "event_pokemon_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_pokemon" ADD CONSTRAINT "event_pokemon_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_habitat" ADD CONSTRAINT "event_habitat_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_habitat" ADD CONSTRAINT "event_habitat_habitat_id_fkey" FOREIGN KEY ("habitat_id") REFERENCES "habitat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_item" ADD CONSTRAINT "event_item_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_item" ADD CONSTRAINT "event_item_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamp_reward" ADD CONSTRAINT "stamp_reward_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "stamp_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mosslax_boost_i18n" ADD CONSTRAINT "mosslax_boost_i18n_boost_id_fkey" FOREIGN KEY ("boost_id") REFERENCES "mosslax_boost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "island_variant" ADD CONSTRAINT "island_variant_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "island_variant" ADD CONSTRAINT "island_variant_guaranteed_legendary_id_fkey" FOREIGN KEY ("guaranteed_legendary_id") REFERENCES "pokemon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "island_variant_i18n" ADD CONSTRAINT "island_variant_i18n_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "island_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "island_reward" ADD CONSTRAINT "island_reward_island_variant_id_fkey" FOREIGN KEY ("island_variant_id") REFERENCES "island_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_valuation" ADD CONSTRAINT "trade_valuation_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_recipe" ADD CONSTRAINT "exchange_recipe_cost_currency_id_fkey" FOREIGN KEY ("cost_currency_id") REFERENCES "currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_recipe" ADD CONSTRAINT "exchange_recipe_result_item_id_fkey" FOREIGN KEY ("result_item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_recipe" ADD CONSTRAINT "exchange_recipe_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_litter_reward" ADD CONSTRAINT "pokemon_litter_reward_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_litter_reward" ADD CONSTRAINT "pokemon_litter_reward_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_litter_reward" ADD CONSTRAINT "pokemon_litter_reward_habitat_id_fkey" FOREIGN KEY ("habitat_id") REFERENCES "habitat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
