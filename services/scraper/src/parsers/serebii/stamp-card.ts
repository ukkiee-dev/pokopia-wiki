/**
 * Serebii `/stampcard.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 20.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/stampcard.shtml
 *
 * 산출 엔티티 (두 파서가 동일 fixture 에서 각각 추출):
 *   - StampCardParser → 1 StampCard (weekly, weekGoal=5)
 *   - StampRewardParser → 5 StampReward (4 stamp 종류 + 1 보너스)
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문 위쪽에 prose, 아래쪽에 단일 `<table class="dextable">`.
 *   ```
 *   <p><h2>List of Stamps</h2></p>
 *   <table class="dextable">
 *     <tr><td class="fooevo">Example Picture</td><td class="fooevo">Stamp</td><td class="fooevo">Coins</td></tr>
 *     <tr><td class="cen"><img src="stamps/basic.png" .../></td><td class="cen">Basic Pokémon</td><td class="cen">50 Coins</td></tr>
 *     <tr>... Evolved Pokémon ... 100 Coins</tr>
 *     <tr>... Legendary Pokémon ... 200 Coins</tr>
 *     <tr>... Mew ... 1000 Coins</tr>
 *   </table>
 *   ```
 *
 * 보너스 reward:
 *   prose "If you manage to then get all 5 stamps filled on the card, you will
 *   also get an additional 1,500 Life Coins" 에서 추출 → tier 5,
 *   requiredStamps=5, coinAmount=1500. weekGoal=5 도 같은 prose 단서.
 *
 * 특이사항:
 *   - **stamp slug**: `stamps/<slug>.png` 의 파일명 토큰 (basic/evolved/legendary/mew).
 *   - **coinAmount 파싱**: "50 Coins" / "1,000 Coins" 정규식 `/^([\d,]+)\s*Coins?$/`.
 *     쉼표 제거 후 정수.
 *   - **prose 추출**: "all N stamps" + "N,NNN Life Coins" 정규식. 추출 실패 시
 *     안전 default (weekGoal=5, bonusCoins=1500) 로 회복.
 *
 * 에러 처리:
 *   - 3 fooevo dextable 미발견: missing-section
 *   - stamp 행 파싱 실패(이미지/이름/coin): unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  StampCardSchema,
  StampRewardSchema,
  type SourceMetadata,
  type StampCardInput,
  type StampRewardInput,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

const CARD_SLUG = 'weekly-stamp-card';

/** "stamps/<slug>.png" — stamp 이미지 토큰. */
const STAMP_IMG_RE = /stamps\/([a-z0-9-]+)\.png/i;

/** "50 Coins" 또는 "1,000 Coins" — coin 셀 텍스트. */
const COIN_LINE_RE = /^([\d,]+)\s*Coins?$/i;

/** prose "all N stamps filled" — weekGoal 추출. */
const WEEK_GOAL_RE = /all\s+(\d+)\s+stamps\s+filled/i;

/** prose "N,NNN Life Coins" 형식 (보너스). */
const BONUS_COINS_RE = /(?:additional|extra|bonus)\s+([\d,]+)\s+Life\s+Coins?/i;

/** 안전 default (현재 fixture 기준). */
const DEFAULT_WEEK_GOAL = 5;
const DEFAULT_BONUS_COINS = 1500;
const BONUS_TIER = 5;

/* ─────────────────────────────────────────────────────────
 *  StampCardParser
 * ───────────────────────────────────────────────────────── */

export class StampCardParser extends Parser<StampCardInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'stampcard';

  parse(html: string, options: ParseOptions): ParseResult<StampCardInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: StampCardInput[] = [];
    const issues: ParseIssue[] = [];

    const weekGoal = extractWeekGoal($) ?? DEFAULT_WEEK_GOAL;
    const candidate = {
      slug: CARD_SLUG,
      weekGoal,
      ...metadata,
    };

    const result = StampCardSchema.safeParse(candidate);
    if (result.success) {
      entities.push(result.data);
    } else {
      issues.push({
        kind: 'zod-fail',
        at: `stamp-card[${CARD_SLUG}]`,
        message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
      });
    }

    return { entities, issues };
  }
}

/* ─────────────────────────────────────────────────────────
 *  StampRewardParser
 * ───────────────────────────────────────────────────────── */

export class StampRewardParser extends Parser<StampRewardInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'stampcard';

  parse(html: string, options: ParseOptions): ParseResult<StampRewardInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: StampRewardInput[] = [];
    const issues: ParseIssue[] = [];

    const $table = pickStampTable($);
    if ($table === null) {
      issues.push({
        kind: 'missing-section',
        message: 'no stamp dextable (3 fooevo Example Picture/Stamp/Coins) found',
      });
      return { entities, issues };
    }

    let tier = 0;
    $table.find('tr').each((_, tr) => {
      const $row = $(tr);
      if ($row.children('td.fooevo').length > 0) return;
      tier += 1;
      processStampRow($, $row, tier, options.sourceUrl, metadata, entities, issues);
    });

    const weekGoal = extractWeekGoal($) ?? DEFAULT_WEEK_GOAL;
    const bonusCoins = extractBonusCoins($) ?? DEFAULT_BONUS_COINS;
    appendBonusReward(weekGoal, bonusCoins, metadata, entities, issues);

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no stamp_reward rows extracted',
      });
    }

    return { entities, issues };
  }
}

function pickStampTable($: CheerioAPI): CheerioSelection | null {
  let chosen: CheerioSelection | null = null;
  $('table.dextable').each((_, table) => {
    if (chosen !== null) return;
    const $table = $(table);
    const $headerCells = $table.find('tr').first().children('td.fooevo');
    if ($headerCells.length !== 3) return;
    const second = normalizeText($headerCells.eq(1).text());
    const third = normalizeText($headerCells.eq(2).text());
    if (second === 'Stamp' && third === 'Coins') chosen = $table;
  });
  return chosen;
}

function processStampRow(
  $: CheerioAPI,
  $row: CheerioSelection,
  tier: number,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: StampRewardInput[],
  issues: ParseIssue[],
): void {
  const $tds = $row.children('td');
  if ($tds.length < 3) return;

  const $picTd = $tds.eq(0);
  const stampNameEn = normalizeText($tds.eq(1).text());
  const coinText = normalizeText($tds.eq(2).text());
  const stampSlug = extractStampSlug($picTd);

  if (stampNameEn.length === 0 || stampSlug === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: `stamp-reward[tier${tier}]`,
      message: 'stamp row missing name or stamps/<slug>.png src',
    });
    return;
  }

  const coinAmount = parseCoinAmount(coinText);
  if (coinAmount === null) {
    issues.push({
      kind: 'unexpected-structure',
      at: `stamp-reward[tier${tier}-${stampSlug}]`,
      message: `coin cell did not match "<n> Coins": "${coinText}"`,
    });
    return;
  }

  const slug = `stamp-reward-tier${tier}-${stampSlug}`;
  const imageUrl = buildImageUrl($picTd, sourceUrl) ?? undefined;

  const candidate = {
    slug,
    cardSlug: CARD_SLUG,
    tier,
    stampNameEn,
    requiredStamps: 1,
    coinAmount,
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...metadata,
  };

  const result = StampRewardSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `stamp-reward[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

/** prose 보너스 ("all 5 stamps filled → 1500 Coins") 를 tier 5 reward 로 추가. */
function appendBonusReward(
  weekGoal: number,
  bonusCoins: number,
  metadata: SourceMetadata,
  entities: StampRewardInput[],
  issues: ParseIssue[],
): void {
  const slug = `stamp-reward-tier${BONUS_TIER}-bonus`;
  const candidate = {
    slug,
    cardSlug: CARD_SLUG,
    tier: BONUS_TIER,
    stampNameEn: 'Full Card Bonus',
    requiredStamps: weekGoal,
    coinAmount: bonusCoins,
    ...metadata,
  };
  const result = StampRewardSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `stamp-reward[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

function extractStampSlug($picTd: CheerioSelection): string | null {
  const src = $picTd.find('img').first().attr('src') ?? '';
  const match = src.match(STAMP_IMG_RE);
  if (match === null) return null;
  const [, captured] = match;
  return captured !== undefined && captured.length > 0 ? captured : null;
}

function parseCoinAmount(text: string): number | null {
  const match = text.match(COIN_LINE_RE);
  if (match === null) return null;
  const value = Number.parseInt((match[1] ?? '').replace(/,/g, ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function extractWeekGoal($: CheerioAPI): number | null {
  const text = $('body').text();
  const match = text.match(WEEK_GOAL_RE);
  if (match === null) return null;
  const value = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function extractBonusCoins($: CheerioAPI): number | null {
  const text = $('body').text();
  const match = text.match(BONUS_COINS_RE);
  if (match === null) return null;
  const value = Number.parseInt((match[1] ?? '').replace(/,/g, ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildImageUrl($picTd: CheerioSelection, sourceUrl: string): string | null {
  const src = $picTd.find('img').first().attr('src');
  if (src === undefined || src.length === 0) return null;
  if (!STAMP_IMG_RE.test(src)) return null;
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return null;
  }
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
