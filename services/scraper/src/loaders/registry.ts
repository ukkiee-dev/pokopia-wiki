/**
 * Loader Registry — page ID → entity loader 매핑.
 *
 * CLI (`src/index.ts`) 가 dryRun=false 모드에서 본 레지스트리를 조회해 적절한
 * loader 를 dispatch. Phase 9 선결 코드의 마지막 piece.
 *
 * 본 commit 시점 등록된 loader (Batch A 단순 + Pokemon/Specialty + Stamp/Mosslax):
 *   - available-pokemon / availablepokemon → loadPokemon
 *   - specialty                            → loadSpecialty
 *   - mosslaxboosts                        → loadMosslaxBoost
 *   - stampcard / stampcard-card           → loadStampCard
 *   - favorites                            → loadFavoriteCategory
 *   - friendship                           → loadFriendshipTier (Serebii row 없음)
 *   - electricity                          → loadGenerator
 *   - water                                → loadWaterType
 *   - paint-pattern                        → loadPaintPattern
 *   - customisation                        → loadCustomizationItem
 *   - flowers / vegetables                 → loadPlant (둘 다 동일 모델)
 *   - jumprope                             → loadJumpropeTier
 *
 * 미등록 page 는 dispatch 시 "loader not implemented" 명시 + dry-run 으로 fallback
 * 권장. loaders/README.md 의 우선순위 표 참고.
 *
 * 새 loader 추가 절차:
 *   1. loaders/<name>-loader.ts 또는 simple-loaders.ts 에 함수 추가
 *   2. 본 모듈의 dispatchLoader switch + listLoaderPages 에 page ID 매핑 등록
 *   3. CLI 가 자동으로 dispatch 사용
 */

import type { PrismaClient } from '@pokopia-wiki/shared';

import { loadPokemon } from './pokemon-loader.js';
import {
  loadCustomizationItem,
  loadFavoriteCategory,
  loadFriendshipTier,
  loadGenerator,
  loadJumpropeTier,
  loadMosslaxBoost,
  loadPaintPattern,
  loadPlant,
  loadStampCard,
  loadWaterType,
} from './simple-loaders.js';
import { loadSpecialty } from './specialty-loader.js';
import type { UpsertResult } from './upsert-loader.js';

/**
 * Loader dispatch 결과 통합. CLI 가 표시할 통계 + 격리 실패 정보.
 */
export type LoaderDispatchResult = {
  /** 등록된 loader 가 호출되어 결과를 반환했는지. false 면 미구현. */
  invoked: boolean;
  /** loader 호출 결과 (invoked=false 면 undefined). */
  result?: UpsertResult;
  /** 미구현 또는 dispatch 실패 시 명시 메시지. */
  message?: string;
};

/**
 * Page ID → loader 디스패치. parser 출력(`unknown` typed)을 수신해 적절한 loader
 * 호출 + UpsertResult 반환. 본 함수는 type narrowing 을 통과하지 않은 entity 를
 * `as unknown as ...` 캐스팅으로 받는다 — CLI 레벨에서 page ID 가 parser 와
 * loader 페어링을 보장한다고 가정.
 */
export async function dispatchLoader(
  prisma: PrismaClient,
  page: string,
  entities: ReadonlyArray<unknown>,
): Promise<LoaderDispatchResult> {
  switch (page) {
    case 'available-pokemon':
    case 'availablepokemon': {
      const result = await loadPokemon(
        prisma.pokemon as never,
        entities as never,
      );
      return { invoked: true, result };
    }
    case 'specialty': {
      const result = await loadSpecialty(
        prisma.specialty as never,
        entities as never,
      );
      return { invoked: true, result };
    }
    case 'mosslaxboosts': {
      const result = await loadMosslaxBoost(
        prisma.mosslaxBoost as never,
        entities as never,
      );
      return { invoked: true, result };
    }
    case 'stampcard':
    case 'stampcard-card': {
      const result = await loadStampCard(
        prisma.stampCard as never,
        entities as never,
      );
      return { invoked: true, result };
    }
    case 'favorites': {
      const result = await loadFavoriteCategory(
        prisma.favoriteCategory as never,
        entities as never,
      );
      return { invoked: true, result };
    }
    case 'friendship': {
      const result = await loadFriendshipTier(
        prisma.friendshipTier as never,
        entities as never,
      );
      return { invoked: true, result };
    }
    case 'electricity': {
      const result = await loadGenerator(
        prisma.generator as never,
        entities as never,
      );
      return { invoked: true, result };
    }
    case 'water': {
      const result = await loadWaterType(
        prisma.waterType as never,
        entities as never,
      );
      return { invoked: true, result };
    }
    case 'paint-pattern': {
      const result = await loadPaintPattern(
        prisma.paintPattern as never,
        entities as never,
      );
      return { invoked: true, result };
    }
    case 'customisation': {
      const result = await loadCustomizationItem(
        prisma.customizationItem as never,
        entities as never,
      );
      return { invoked: true, result };
    }
    case 'flowers':
    case 'vegetables': {
      const result = await loadPlant(
        prisma.plant as never,
        entities as never,
      );
      return { invoked: true, result };
    }
    case 'jumprope': {
      const result = await loadJumpropeTier(
        prisma.jumpropeTier as never,
        entities as never,
      );
      return { invoked: true, result };
    }
    default:
      return {
        invoked: false,
        message: `loader not implemented for page=${page}; see services/scraper/src/loaders/README.md (TODO list).`,
      };
  }
}

/** 등록된 page ID 목록 — CLI `--list-pages` 에서 loader 지원 여부 표시용. */
export function listLoaderPages(): ReadonlyArray<string> {
  return [
    'available-pokemon',
    'availablepokemon',
    'specialty',
    'mosslaxboosts',
    'stampcard',
    'stampcard-card',
    'favorites',
    'friendship',
    'electricity',
    'water',
    'paint-pattern',
    'customisation',
    'flowers',
    'vegetables',
    'jumprope',
  ];
}
