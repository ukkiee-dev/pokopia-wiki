/**
 * Serebii `/pokemoncenter.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 17.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/pokemoncenter.shtml
 *
 * 산출 엔티티:
 *   - `pokemon_center` (4 area) — Withered Wastelands / Bleak Beach / Rocky Ridges
 *     / Sparkling Skylands. Palette Town · Cloud Island 는 Pokémon Center 가
 *     없거나 별도 단계.
 *   - 각 center 안에 nested `materials` (PokemonCenterMaterial 매핑용 힌트)
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문에 단일 `<table class="dextable">` 가 위치한다.
 *   ```
 *   <table class="dextable">
 *     <tr>
 *       <td class="fooevo">Area</td>
 *       <td class="fooevo">Requirements</td>
 *       <td class="fooevo">Pokémon Required</td>
 *     </tr>
 *     <tr>
 *       <td class="fooinfo">Withered Wastelands</td>
 *       <td class="fooinfo">10 Lumber<br />20 Stones<br />10 Leaves<br />10 Vines</td>
 *       <td class="fooinfo">8</td>
 *     </tr>
 *     ...
 *   </table>
 *   ```
 *
 * 특이사항:
 *   - **Area 셀** 영문 텍스트를 slugify (예: "Withered Wastelands" →
 *     "witheredwastelands"). location.ts 의 LocationSchema slug 와 자연 키 호환.
 *   - **Requirements 셀** 의 `<br />` 분리 라인을 `<qty> <itemNameEn>` 정규식으로
 *     파싱 (예: "10 Lumber" → quantity=10, itemNameEn="Lumber").
 *   - **requiredEnvLevel** 은 페이지 산문 "Environment Level 3" 에서 추출하거나
 *     없으면 기본 3 주입 (모든 area 동일). 본 파서는 prose 정규식으로 추출 시도하되
 *     실패해도 default 값을 사용해 회복 탄력성 확보.
 *
 * 에러 처리:
 *   - 3 fooevo 헤더(Area/Requirements/Pokémon Required) 미발견: missing-section
 *   - locationSlug 빈 행 / Pokémon Required 정수 파싱 실패: unexpected-structure + skip
 *   - Requirements 라인 정규식 실패: 해당 라인만 스킵 (다른 materials 진행)
 *   - Zod 실패: zod-fail + skip
 *   - 엔티티 0: missing-section
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  PokemonCenterSchema,
  type PokemonCenterInput,
  type PokemonCenterMaterialHint,
  type SourceMetadata,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** "10 Lumber" 같은 material 라인 — 정수 + 영문 아이템명. */
const MATERIAL_LINE_RE = /^(\d+)\s+(.+)$/;

/** 페이지 산문에서 "Environment Level N" 추출 — N 에 적용할 default 값. */
const ENV_LEVEL_RE = /Environment\s+Level\s+(\d+)/i;

/** Environment Level 추출 실패 시 안전 기본값 (모든 area 동일하게 Lv 3). */
const DEFAULT_REQUIRED_ENV_LEVEL = 3;

export class PokemonCenterParser extends Parser<PokemonCenterInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'pokemon-center';

  parse(html: string, options: ParseOptions): ParseResult<PokemonCenterInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: PokemonCenterInput[] = [];
    const issues: ParseIssue[] = [];

    const requiredEnvLevel = extractEnvLevelFromProse($) ?? DEFAULT_REQUIRED_ENV_LEVEL;

    const $table = pickCenterTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no pokemon-center dextable (3 fooevo Area/Requirements/Pokémon Required) found',
      });
      return { entities, issues };
    }

    $table.find('tr').each((_, tr) => {
      const $row = $(tr);
      if ($row.children('td.fooevo').length > 0) return;
      processRow($row, requiredEnvLevel, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no pokemon-center rows extracted',
      });
    }

    return { entities, issues };
  }
}

/** 3-fooevo 헤더 + 두 번째 셀 "Requirements" 인 dextable 채택. */
function pickCenterTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 3) return;
    const second = normalizeText($headerCells.eq(1).text());
    if (second === 'Requirements') chosen = $table;
  });
  return chosen;
}

/** 페이지 산문에서 첫 번째 "Environment Level N" 패턴의 N 정수 추출. */
function extractEnvLevelFromProse($: CheerioAPI): number | null {
  const text = $('body').text();
  const match = text.match(ENV_LEVEL_RE);
  if (match === null) return null;
  const value = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(value) && value >= 1 && value <= 10 ? value : null;
}

function processRow(
  $row: CheerioSelection,
  requiredEnvLevel: number,
  metadata: SourceMetadata,
  entities: PokemonCenterInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 3) return;

  const locationNameEn = normalizeText($tds.eq(0).text());
  if (locationNameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'pokemon-center[?]',
      message: 'area cell empty',
    });
    return;
  }

  const locationSlug = slugifyName(locationNameEn);
  const slug = `pokemon-center-${locationSlug}`;

  const requiredPokemonCount = Number.parseInt(normalizeText($tds.eq(2).text()), 10);
  if (!Number.isFinite(requiredPokemonCount) || requiredPokemonCount <= 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: `pokemon-center[${slug}]`,
      message: `Pokémon Required cell not a positive integer: "${normalizeText($tds.eq(2).text())}"`,
    });
    return;
  }

  const materials = parseMaterialsCell($tds.eq(1), slug, issues);

  const candidate = {
    slug,
    locationSlug,
    locationNameEn,
    requiredEnvLevel,
    requiredPokemonCount,
    materials,
    ...metadata,
  };

  const result = PokemonCenterSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `pokemon-center[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/**
 * Requirements 셀의 `<br />` 분리 라인을 추출. cheerio 가 자동으로 `<br>` 을 텍스트
 * 노드 사이에 두므로 셀의 html 을 직접 split.
 */
function parseMaterialsCell(
  $td: CheerioSelection,
  rowAt: string,
  issues: ParseIssue[],
): PokemonCenterMaterialHint[] {
  const html = $td.html() ?? '';
  const lines = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const materials: PokemonCenterMaterialHint[] = [];
  for (const line of lines) {
    const match = line.match(MATERIAL_LINE_RE);
    if (match === null) {
      issues.push({
        kind: 'unexpected-structure',
        at: rowAt,
        message: `material line did not match "<qty> <name>": "${line}"`,
      });
      continue;
    }
    const quantity = Number.parseInt(match[1] ?? '', 10);
    const itemNameEn = match[2]?.trim() ?? '';
    if (!Number.isFinite(quantity) || quantity < 1 || itemNameEn.length === 0) {
      issues.push({
        kind: 'unexpected-structure',
        at: rowAt,
        message: `material line parsed to invalid pair: "${line}"`,
      });
      continue;
    }
    materials.push({ itemNameEn, quantity });
  }
  return materials;
}

/** 영문명 → slug. 공백 제거 (Withered Wastelands → witheredwastelands). */
function slugifyName(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
