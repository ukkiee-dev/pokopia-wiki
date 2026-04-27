/* eslint-disable no-console */
/**
 * Scraper CLI 엔트리포인트 — Phase 9 선결 코드.
 *
 * 사용법:
 *   pnpm --filter @pokopia-wiki/scraper scrape --source serebii \
 *     --page <pageId> [--dry-run] [--use-fixture] [--limit N]
 *   pnpm --filter @pokopia-wiki/scraper scrape --list-pages
 *
 * 옵션:
 *   --source <site>      대상 소스 (serebii / pokopiaGuide / pokopoko / namuwiki).
 *                        현재 'serebii' 만 지원 (Phase 9).
 *   --page <pageId>      파싱 대상 페이지 ID (PARSER 레지스트리 키와 일치).
 *                        --list-pages 로 전체 목록 확인.
 *   --dry-run            DB upsert 를 건너뛰고 파싱 결과만 stdout 통계 + JSON 출력.
 *                        Phase 9 Task 9.1 의 dryrun 검토용.
 *   --use-fixture        실제 네트워크 호출 대신 `__fixtures__/<page>.html` 사용.
 *                        개발/CI 모드.
 *   --limit <N>          파싱된 entity 중 첫 N 개만 처리 (오프셋 0).
 *   --list-pages         등록된 page ID 목록 출력 후 즉시 종료.
 *
 * 종료 코드:
 *   0 — 모든 entity 정상 (failures 0).
 *   1 — 인자 오류 / 파서 미발견 / fetch 실패.
 *   2 — 일부 entity 가 invalid (failures > 0). 격리 디렉토리는 stderr 출력.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createPrismaClient } from '@pokopia-wiki/shared';

import { repoPath } from '#paths';

import { HtmlCache } from './cache/html-cache.js';
import { createFetcher } from './fetchers/factory.js';
import { isolateInvalidEntries, type InvalidEntry } from './loaders/invalid-isolator.js';
import { dispatchLoader, listLoaderPages } from './loaders/registry.js';
import type { Parser, ParseResult } from './parsers/base.js';
import { RobotsChecker } from './robots/checker.js';
import { AbilitiesParser } from './parsers/serebii/abilities.js';
import { AvailablePokemonParser } from './parsers/serebii/available-pokemon.js';
import { BuildingParser } from './parsers/serebii/building.js';
import { CdsParser } from './parsers/serebii/cds.js';
import { CloudIslandsParser } from './parsers/serebii/cloud-islands.js';
import { CollectParser } from './parsers/serebii/collect.js';
import { CookingParser } from './parsers/serebii/cooking.js';
import { CraftingParser } from './parsers/serebii/crafting.js';
import { CustomizationParser } from './parsers/serebii/customization.js';
import { DreamIslandsParser } from './parsers/serebii/dream-islands.js';
import { ElectricityParser } from './parsers/serebii/electricity.js';
import { EnvironmentRewardParser } from './parsers/serebii/environment.js';
import { EventPokedexParser } from './parsers/serebii/event-pokedex.js';
import { FavoritesParser } from './parsers/serebii/favorites.js';
import { FlavorsParser } from './parsers/serebii/flavors.js';
import { FriendshipParser } from './parsers/serebii/friendship.js';
import { FurnitureParser } from './parsers/serebii/furniture.js';
import { GameplayParser } from './parsers/serebii/gameplay.js';
import { HabitatsIndexParser } from './parsers/serebii/habitats-index.js';
import { HideAndSneakParser } from './parsers/serebii/hide-and-sneak.js';
import { HumanRecordsParser } from './parsers/serebii/human-records.js';
import { ItemsParser } from './parsers/serebii/items.js';
import { JumpropeParser } from './parsers/serebii/jumprope.js';
import { LegendaryParser } from './parsers/serebii/legendary.js';
import { LitterParser } from './parsers/serebii/litter.js';
import { LocationDetailParser } from './parsers/serebii/location-detail.js';
import { LocationsIndexParser } from './parsers/serebii/locations-index.js';
import { LostRelicsParser } from './parsers/serebii/lost-relics.js';
import { MagnetRiseParser } from './parsers/serebii/magnet-rise.js';
import { MosslaxParser } from './parsers/serebii/mosslax.js';
import { PaintColorParser, PaintPatternParser } from './parsers/serebii/paint.js';
import { FlowersParser, VegetablesParser } from './parsers/serebii/plants.js';
import { PokedexMilestoneParser } from './parsers/serebii/pokedex-milestone.js';
import { PokemonCenterParser } from './parsers/serebii/pokemon-center.js';
import { QuestsParser } from './parsers/serebii/quests.js';
import { SpecialtyParser } from './parsers/serebii/specialty.js';
import { StampCardParser, StampRewardParser } from './parsers/serebii/stamp-card.js';
import { TeamChallengeParser } from './parsers/serebii/team-challenge.js';
import { TradeParser } from './parsers/serebii/trade.js';
import { UniquePokemonParser } from './parsers/serebii/unique-pokemon.js';
import { WaterParser } from './parsers/serebii/water.js';

// ─────────────────────────────────────────────────────────
//  CLI 인자 파싱 (의존성 추가 회피 위해 minimal manual parser)
// ─────────────────────────────────────────────────────────

type CliArgs = {
  source: string;
  page: string;
  dryRun: boolean;
  useFixture: boolean;
  limit?: number;
};

function parseArgs(argv: ReadonlyArray<string>): CliArgs | null {
  const args: Partial<CliArgs> = { dryRun: false, useFixture: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--source':
        args.source = argv[++i];
        break;
      case '--page':
        args.page = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--use-fixture':
        args.useFixture = true;
        break;
      case '--limit': {
        const value = Number.parseInt(argv[++i] ?? '', 10);
        if (Number.isFinite(value) && value > 0) args.limit = value;
        break;
      }
      default:
        // 무시 (--list-pages 같은 일반 플래그 또는 향후 확장).
        break;
    }
  }
  if (typeof args.source !== 'string' || typeof args.page !== 'string') return null;
  return args as CliArgs;
}

// ─────────────────────────────────────────────────────────
//  파서 레지스트리 — CLI page ID → Parser 인스턴스 팩토리
//
//  대부분 1:1 매핑이지만 두 가지 특수 케이스:
//    1. multi-parser 페이지 (paint, stampcard): default + suffix alias 모두 등록
//       (예: 'paint' = color default, 'paint-color' / 'paint-pattern' alias)
//    2. multi-fixture 페이지 (location-detail): 각 location 을 별도 alias 로 등록
//       (예: 'location-witheredwastelands', 'location-bleakbeach' 등 5 개)
// ─────────────────────────────────────────────────────────

const SEREBII_PARSERS: Record<string, () => Parser<unknown>> = {
  abilities: () => new AbilitiesParser() as Parser<unknown>,
  'available-pokemon': () => new AvailablePokemonParser() as Parser<unknown>,
  availablepokemon: () => new AvailablePokemonParser() as Parser<unknown>,
  building: () => new BuildingParser() as Parser<unknown>,
  cds: () => new CdsParser() as Parser<unknown>,
  cloudislands: () => new CloudIslandsParser() as Parser<unknown>,
  collect: () => new CollectParser() as Parser<unknown>,
  cooking: () => new CookingParser() as Parser<unknown>,
  crafting: () => new CraftingParser() as Parser<unknown>,
  customisation: () => new CustomizationParser() as Parser<unknown>,
  dreamislands: () => new DreamIslandsParser() as Parser<unknown>,
  electricity: () => new ElectricityParser() as Parser<unknown>,
  environmentlevel: () => new EnvironmentRewardParser() as Parser<unknown>,
  eventpokedex: () => new EventPokedexParser() as Parser<unknown>,
  favorites: () => new FavoritesParser() as Parser<unknown>,
  flavors: () => new FlavorsParser() as Parser<unknown>,
  flowers: () => new FlowersParser() as Parser<unknown>,
  friendship: () => new FriendshipParser() as Parser<unknown>,
  furniture: () => new FurnitureParser() as Parser<unknown>,
  gameplay: () => new GameplayParser() as Parser<unknown>,
  'habitats-index': () => new HabitatsIndexParser() as Parser<unknown>,
  hideandsneak: () => new HideAndSneakParser() as Parser<unknown>,
  humanrecords: () => new HumanRecordsParser() as Parser<unknown>,
  importantrequests: () => new QuestsParser() as Parser<unknown>,
  items: () => new ItemsParser() as Parser<unknown>,
  jumprope: () => new JumpropeParser() as Parser<unknown>,
  legendary: () => new LegendaryParser() as Parser<unknown>,
  litter: () => new LitterParser() as Parser<unknown>,
  'location-bleakbeach': () => new LocationDetailParser() as Parser<unknown>,
  'location-palettetown': () => new LocationDetailParser() as Parser<unknown>,
  'location-rockyridges': () => new LocationDetailParser() as Parser<unknown>,
  'location-sparklingskylands': () => new LocationDetailParser() as Parser<unknown>,
  'location-witheredwastelands': () => new LocationDetailParser() as Parser<unknown>,
  'locations-index': () => new LocationsIndexParser() as Parser<unknown>,
  lostrelics: () => new LostRelicsParser() as Parser<unknown>,
  'magnet-rise': () => new MagnetRiseParser() as Parser<unknown>,
  mosslaxboosts: () => new MosslaxParser() as Parser<unknown>,
  paint: () => new PaintColorParser() as Parser<unknown>,
  'paint-color': () => new PaintColorParser() as Parser<unknown>,
  'paint-pattern': () => new PaintPatternParser() as Parser<unknown>,
  pokedexcompletion: () => new PokedexMilestoneParser() as Parser<unknown>,
  'pokemon-center': () => new PokemonCenterParser() as Parser<unknown>,
  specialty: () => new SpecialtyParser() as Parser<unknown>,
  stampcard: () => new StampCardParser() as Parser<unknown>,
  'stampcard-card': () => new StampCardParser() as Parser<unknown>,
  'stampcard-reward': () => new StampRewardParser() as Parser<unknown>,
  teaminitiationchallenge: () => new TeamChallengeParser() as Parser<unknown>,
  trade: () => new TradeParser() as Parser<unknown>,
  uniquepokemon: () => new UniquePokemonParser() as Parser<unknown>,
  vegetables: () => new VegetablesParser() as Parser<unknown>,
  water: () => new WaterParser() as Parser<unknown>,
};

function pickParser(source: string, page: string): Parser<unknown> | null {
  if (source === 'serebii') {
    const factory = SEREBII_PARSERS[page];
    return factory ? factory() : null;
  }
  return null;
}

export function listAvailablePages(): ReadonlyArray<string> {
  return Object.keys(SEREBII_PARSERS).toSorted();
}

// ─────────────────────────────────────────────────────────
//  Fixture 로딩 (--use-fixture 모드)
// ─────────────────────────────────────────────────────────

/**
 * CLI page ID → fixture 파일명 (확장자 제외) 변형 매핑.
 *
 * 대부분 page ID 가 fixture 파일명과 일치하지만 다음 케이스는 매핑 필요:
 *   - alias: availablepokemon → available-pokemon
 *   - multi-parser 공유 fixture: paint-color/paint-pattern → paint,
 *     stampcard-card/stampcard-reward → stampcard
 */
const FIXTURE_FILENAME_OVERRIDES: Record<string, string> = {
  availablepokemon: 'available-pokemon',
  'paint-color': 'paint',
  'paint-pattern': 'paint',
  'stampcard-card': 'stampcard',
  'stampcard-reward': 'stampcard',
};

/**
 * page ID → 실제 Serebii URL 매핑. Fixture override 와 별개로 live fetch 시 사용.
 *
 * 대부분 page ID 가 그대로 URL path 와 일치하지만 일부는 매핑 필요:
 *   - availablepokemon → availablepokemon.shtml (alias 흡수)
 *   - paint-color/paint-pattern → paint.shtml (multi-parser 공유)
 *   - location-* → locations/<location>.shtml (sub-path)
 *   - flowers/vegetables → flowers.shtml/vegetables.shtml (별도)
 */
function pageToSerebiiUrl(page: string): string {
  // location-* 변형: locations/<slug>.shtml
  if (page.startsWith('location-') && page !== 'locations-index') {
    const locationSlug = page.replace(/^location-/, '');
    return `https://www.serebii.net/pokemonpokopia/locations/${locationSlug}.shtml`;
  }
  // multi-parser 공유 fixture 의 page ID → 실제 URL 매핑
  const URL_OVERRIDES: Record<string, string> = {
    'paint-color': 'paint',
    'paint-pattern': 'paint',
    'stampcard-card': 'stampcard',
    'stampcard-reward': 'stampcard',
    'available-pokemon': 'availablepokemon',
    'habitats-index': 'habitats',
    'locations-index': 'locations',
  };
  const urlPage = URL_OVERRIDES[page] ?? page;
  return `https://www.serebii.net/pokemonpokopia/${urlPage}.shtml`;
}

/**
 * 실제 네트워크 호출 (RobotsChecker + HtmlCache + KyFetcher 조립). Serebii (T0)
 * 만 지원. 다른 소스는 persona 필요 — Phase 11+ 에서 확장.
 */
async function liveFetch(source: 'serebii', sourceUrl: string): Promise<{
  html: string;
  resolvedUrl: string;
}> {
  const robots = new RobotsChecker();
  const cache = new HtmlCache();
  const fetcher = createFetcher(source, { robots, cache });
  try {
    const result = await fetcher.fetch(sourceUrl);
    return { html: result.html, resolvedUrl: result.url };
  } finally {
    if (fetcher.close !== undefined) await fetcher.close();
  }
}

function loadFixtureHtml(source: string, page: string): { html: string; sourceUrl: string } | null {
  if (source !== 'serebii') return null;
  const filename = FIXTURE_FILENAME_OVERRIDES[page] ?? page;
  const fixturePath = repoPath(
    'services',
    'scraper',
    'src',
    'parsers',
    'serebii',
    '__fixtures__',
    `${filename}.html`,
  );
  try {
    const html = readFileSync(fixturePath, 'utf8');
    const sourceUrl = `https://www.serebii.net/pokemonpokopia/${page}.shtml`;
    return { html, sourceUrl };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────
//  CLI 본체
// ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // --list-pages 단독 처리. loader 등록 여부를 [loader] 마커로 표시 (Phase 9).
  if (process.argv.includes('--list-pages')) {
    const loaderPages = new Set(listLoaderPages());
    const pages = listAvailablePages();
    console.log(
      pages.map((page) => (loaderPages.has(page) ? `${page} [loader]` : page)).join('\n'),
    );
    process.exit(0);
  }

  // --list-loaders: loader 가 등록된 page ID 만 출력 (DB upsert 가능 페이지 확인용).
  if (process.argv.includes('--list-loaders')) {
    console.log([...listLoaderPages()].toSorted().join('\n'));
    process.exit(0);
  }

  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    console.error('Usage: scrape --source <site> --page <pageId> [--dry-run] [--use-fixture] [--limit N]');
    console.error('       scrape --list-pages     # registered page IDs ([loader] = DB upsert 지원)');
    console.error('       scrape --list-loaders   # DB upsert 지원 page ID 만');
    process.exit(1);
  }

  const parser = pickParser(args.source, args.page);
  if (parser === null) {
    console.error(`No parser registered for source=${args.source} page=${args.page}`);
    console.error('Run with --list-pages to see all available page IDs.');
    process.exit(1);
  }

  console.log(
    `[scrape] source=${args.source} page=${args.page} dryRun=${args.dryRun} useFixture=${args.useFixture}`,
  );

  // Fixture 또는 live fetch 로 HTML 확보.
  let html: string;
  let resolvedSourceUrl: string;
  if (args.useFixture) {
    const fixture = loadFixtureHtml(args.source, args.page);
    if (fixture === null) {
      console.error(`[scrape] no fixture found for ${args.source}/${args.page}`);
      process.exit(1);
    }
    html = fixture.html;
    resolvedSourceUrl = fixture.sourceUrl;
  } else {
    if (args.source !== 'serebii') {
      console.error(`[scrape] live fetch supported only for serebii (Phase 9). source=${args.source}`);
      process.exit(1);
    }
    const liveUrl = pageToSerebiiUrl(args.page);
    console.log(`[scrape] live fetching ${liveUrl}`);
    try {
      const fetched = await liveFetch('serebii', liveUrl);
      html = fetched.html;
      resolvedSourceUrl = fetched.resolvedUrl;
    } catch (error: unknown) {
      console.error(`[scrape] live fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  const result: ParseResult<unknown> = parser.parse(html, {
    sourceUrl: resolvedSourceUrl,
    scrapedAt: new Date().toISOString(),
  });

  const limited = args.limit !== undefined
    ? result.entities.slice(0, args.limit)
    : result.entities;

  console.log(
    `[scrape] parsed entities=${result.entities.length} (limited=${limited.length}) issues=${result.issues.length}`,
  );

  // 파서 issues 를 invalid 격리 (zod-fail / unexpected-structure 등).
  const invalid: InvalidEntry[] = result.issues.map((issue, index) => ({
    entity: args.page,
    sourceSlug: issue.at ?? `unknown-${index}`,
    parsedCandidate: { kind: issue.kind, message: issue.message },
    errors: [issue.message],
  }));

  if (invalid.length > 0) {
    const isolation = await isolateInvalidEntries(args.source, invalid);
    console.error(
      `[scrape] isolated ${String(isolation.entries)} invalid entries → ${isolation.directory}`,
    );
  }

  if (args.dryRun) {
    // dry-run 결과를 data/parsed/ 에 JSON 으로 저장 (Phase 9 Task 9.1).
    const outPath = repoPath('data', 'parsed', `${args.source}_${args.page}.json`);
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(limited, null, 2), 'utf8');
    console.log(`[scrape] dry-run wrote ${String(limited.length)} entities → ${outPath}`);
  } else {
    // DB upsert mode: registry 에서 page → loader dispatch. 미등록 page 는 명시적
    // 에러로 dry-run 사용을 안내. PrismaClient 는 본 함수 lifecycle 에 한정 —
    // $disconnect() 로 pool 해제.
    const prisma = createPrismaClient();
    try {
      const dispatch = await dispatchLoader(prisma, args.page, limited);
      if (!dispatch.invoked) {
        console.error(`[scrape] ${dispatch.message ?? 'loader dispatch failed'}`);
        console.error('[scrape] --dry-run 으로 JSON 저장만 가능합니다 (loader 미등록).');
        await prisma.$disconnect();
        process.exit(1);
      }
      const stats = dispatch.result?.stats;
      const failures = dispatch.result?.failures ?? [];
      if (stats !== undefined) {
        console.log(
          `[scrape] upsert stats inserted=${String(stats.inserted)} updated=${String(stats.updated)} unchanged=${String(stats.unchanged)} failed=${String(stats.failed)}`,
        );
      }
      if (failures.length > 0) {
        const upsertInvalid: InvalidEntry[] = failures.map((failure, index) => ({
          entity: args.page,
          sourceSlug: failure.sourceSlug ?? `upsert-fail-${index}`,
          parsedCandidate: { stage: 'upsert', error: failure.error },
          errors: [failure.error],
        }));
        const isolation = await isolateInvalidEntries(args.source, upsertInvalid);
        console.error(
          `[scrape] upsert failures isolated → ${isolation.directory}`,
        );
      }
      await prisma.$disconnect();
      process.exit(invalid.length === 0 && failures.length === 0 ? 0 : 2);
    } catch (error: unknown) {
      console.error(`[scrape] upsert fatal: ${error instanceof Error ? error.message : String(error)}`);
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  process.exit(invalid.length === 0 ? 0 : 2);
}

main().catch((error: unknown) => {
  console.error('[scrape] fatal:', error);
  process.exit(1);
});
