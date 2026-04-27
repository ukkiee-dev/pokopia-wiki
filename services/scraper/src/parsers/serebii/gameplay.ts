/**
 * Serebii `/gameplay.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 22.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/gameplay.shtml
 *
 * 산출:
 *   - **DB 비대상.** GameplayReference 단일 reference document 1 개.
 *     loader / orchestrator 가 `data/parsed/reference/gameplay-mechanics.json`
 *     으로 저장 (본 파서는 산출만 책임).
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문은 prose only:
 *   ```
 *   <p><h1>Pokémon Pokopia Gameplay Mechanics</h1></p>
 *   <p>...intro paragraph...</p>
 *   <table class="tab">
 *     <tr><td class="fooleft" colspan="2"><h2>Create Habitats</h2></td></tr>
 *     <tr><td class="foocontent"><p>...</p><p>...</p></td><td class="picturetd">...</td></tr>
 *     <tr><td class="fooleft" colspan="2"><h2>Crafting</h2></td></tr>
 *     ...
 *   </table>
 *   ```
 *
 * 특이사항:
 *   - **h1 추출**: `main` 영역의 첫 번째 h1 텍스트.
 *   - **intro**: h1 이후 첫 번째 `<p>` (table 외부) — 페이지 메인 요약.
 *   - **sections**: `td.fooleft h2` 가 섹션 제목, 같은 tr 다음 tr 의
 *     `td.foocontent` 안 `<p>` 들이 본문 단락 배열. 3 섹션
 *     (Create Habitats / Crafting / Use Pokémon).
 *
 * 에러 처리:
 *   - h1 미발견: missing-section
 *   - h2 0 개: missing-section + entities 0
 *   - 섹션 본문 0 단락: 섹션 자체는 entities 에 포함하되 paragraphsEn 빈 배열
 *   - Zod 실패: zod-fail
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  GameplayReferenceSchema,
  type GameplayReferenceInput,
  type GameplayReferenceSectionHint,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

const REFERENCE_SLUG = 'gameplay-mechanics';

export class GameplayParser extends Parser<GameplayReferenceInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'gameplay';

  parse(html: string, options: ParseOptions): ParseResult<GameplayReferenceInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: GameplayReferenceInput[] = [];
    const issues: ParseIssue[] = [];

    const titleEn = normalizeText($('main h1').first().text());
    if (titleEn.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no h1 title found in main',
      });
      return { entities, issues };
    }

    const introEn = extractIntroParagraph($);
    const sections = extractSections($);

    if (sections.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no h2 sections found in fooleft headings',
      });
      return { entities, issues };
    }

    const candidate = {
      slug: REFERENCE_SLUG,
      titleEn,
      ...(introEn === undefined ? {} : { introEn }),
      sections,
      ...metadata,
    };

    const result = GameplayReferenceSchema.safeParse(candidate);
    if (result.success) {
      entities.push(result.data);
    } else {
      issues.push({
        kind: 'zod-fail',
        at: `gameplay-reference[${REFERENCE_SLUG}]`,
        message: result.error.issues
          .map((i) => `${i.path.join('.')}:${i.message}`)
          .join('; '),
      });
    }

    return { entities, issues };
  }
}

/**
 * h1 직후 첫 번째 본문 단락 추출. Serebii 가 `<p><h1>...</h1></p>` 형태로 h1 을
 * 감싸는데 cheerio 의 HTML 파서가 평탄화하므로 closest('p') + nextAll 패턴이
 * 안정적이지 않다. main 의 직계 `<p>` 중 헤딩(h1/h2/h3) 을 포함하지 않은 첫 번째
 * 단락을 채택.
 */
function extractIntroParagraph($: CheerioAPI): string | undefined {
  let intro: string | undefined;
  $('main > p').each((_, el) => {
    if (intro !== undefined) return;
    const $el = $(el);
    if ($el.find('h1, h2, h3').length > 0) return;
    const text = normalizeText($el.text());
    if (text.length > 0) intro = text;
  });
  return intro;
}

/**
 * 섹션 추출 — `td.fooleft` 안의 h2 를 섹션 제목으로, 같은 tr 다음 tr 의
 * `td.foocontent` 안 `<p>` 들을 본문 단락으로.
 */
function extractSections($: CheerioAPI): GameplayReferenceSectionHint[] {
  const sections: GameplayReferenceSectionHint[] = [];
  $('td.fooleft h2').each((_, h2) => {
    const $h2 = $(h2);
    const headingEn = normalizeText($h2.text());
    if (headingEn.length === 0) return;

    const $headingTr = $h2.closest('tr');
    const $contentTr = $headingTr.next('tr');
    const $cell = $contentTr.find('td.foocontent').first();
    const paragraphsEn = collectParagraphs($, $cell);

    sections.push({ headingEn, paragraphsEn });
  });
  return sections;
}

/** `td.foocontent` 안의 모든 `<p>` 텍스트를 배열로 수집 (빈 단락 제외). */
function collectParagraphs($: CheerioAPI, $cell: CheerioSelection): string[] {
  const paragraphs: string[] = [];
  $cell.find('p').each((_, p) => {
    const text = normalizeText($(p).text());
    if (text.length > 0) paragraphs.push(text);
  });
  return paragraphs;
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
