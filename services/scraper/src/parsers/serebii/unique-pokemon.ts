/**
 * Serebii `/uniquepokemon.shtml` 파서 — DATA_COLLECTION_PLAN Phase 1 단계 26.
 *
 * 대상 페이지:
 *   https://www.serebii.net/pokemonpokopia/uniquepokemon.shtml
 *
 * 산출 엔티티 (보강 전용):
 *   - `UniquePokemonPatchInput` × 4 — Professor Tangrowth / Peakychu / Mosslax /
 *     Smearguru
 *
 * **본 파서는 새 엔티티를 만들지 않는다.** loader 가 산출된 slug 목록으로
 * `pokemon.sourceSlug` 매칭 → description / image 보강 (magnet-rise 단계와
 * 동일 패턴).
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   페이지 본문은 단일 `<table class="tab">` 안에 4 개 `td.fooleft h2` 섹션 +
 *   같은 tr 의 다음 tr 의 `td.foocontent` 본문 + `td.picturetd` 이미지로 구성.
 *   quests.ts / legendary.ts 와 동일한 fooleft 헤더 패턴.
 *
 *   ```
 *   <tr><td class="fooleft" colspan="2"><h2>Peakychu</h2></td></tr>
 *   <tr>
 *     <td class="foocontent"><p>Peakychu is an unusual pale Pikachu...</p></td>
 *     <td class="picturetd"><img src="peakychu.png" alt="Peakychu" .../></td>
 *   </tr>
 *   ```
 *
 * 특이사항:
 *   - **slug 결정**: picturetd 의 `<img src="<slug>.png">` 파일명 토큰. Serebii
 *     의 unique pokemon 페이지는 items/ 같은 prefix 없이 root 에 직접 위치.
 *   - **slug fallback**: 이미지 src 매칭 실패 시 nameEn lowercase + 공백 제거.
 *   - **descriptionEn**: 본문 paragraphs join (Markdown-friendly).
 *
 * 에러 처리:
 *   - h2 0 개: missing-section
 *   - nameEn 빈 행: unexpected-structure + skip
 *   - Zod 실패: zod-fail + skip
 */

import { load, type CheerioAPI } from 'cheerio';

import {
  buildSourceMetadata,
  UniquePokemonPatchSchema,
  type SourceMetadata,
  type UniquePokemonPatchInput,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

type CheerioSelection = ReturnType<CheerioAPI>;

/** `<slug>.png` — Serebii unique pokemon 이미지는 root 에 직접 위치. */
const ROOT_IMG_RE = /(?:^|\/)([a-z0-9-]+)\.png$/i;

export class UniquePokemonParser extends Parser<UniquePokemonPatchInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'uniquepokemon';

  parse(html: string, options: ParseOptions): ParseResult<UniquePokemonPatchInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const $ = load(html);
    const entities: UniquePokemonPatchInput[] = [];
    const issues: ParseIssue[] = [];

    const $h2List = $('td.fooleft h2');
    if ($h2List.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no h2 sections found in fooleft headings',
      });
      return { entities, issues };
    }

    $h2List.each((_, h2) => {
      processSection($, $(h2), options.sourceUrl, metadata, entities, issues);
    });

    if (entities.length === 0) {
      issues.push({
        kind: 'missing-section',
        message: 'no unique pokemon rows extracted',
      });
    }

    return { entities, issues };
  }
}

function processSection(
  $: CheerioAPI,
  $h2: CheerioSelection,
  sourceUrl: string,
  metadata: SourceMetadata,
  entities: UniquePokemonPatchInput[],
  issues: ParseIssue[],
): void {
  const nameEn = normalizeText($h2.text());
  if (nameEn.length === 0) {
    issues.push({
      kind: 'unexpected-structure',
      at: 'unique-pokemon[?]',
      message: 'h2 has empty text',
    });
    return;
  }

  const $headingTr = $h2.closest('tr');
  const $contentTr = $headingTr.next('tr');
  const $picImg = $contentTr.find('td.picturetd img').first();
  const $contentCell = $contentTr.find('td.foocontent').first();

  const slug = extractSlug($picImg) ?? slugifyName(nameEn);
  const paragraphs = collectParagraphs($, $contentCell);
  const descriptionEn = paragraphs.length > 0 ? paragraphs.join('\n\n') : undefined;
  const imageUrl = buildImageUrl($picImg, sourceUrl) ?? undefined;

  const candidate = {
    slug,
    nameEn,
    ...(descriptionEn === undefined ? {} : { descriptionEn }),
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...metadata,
  };

  const result = UniquePokemonPatchSchema.safeParse(candidate);
  if (result.success) {
    entities.push(result.data);
    return;
  }
  issues.push({
    kind: 'zod-fail',
    at: `unique-pokemon[${slug}]`,
    message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
  });
}

function extractSlug($img: CheerioSelection): string | null {
  const src = $img.attr('src') ?? '';
  const match = src.match(ROOT_IMG_RE);
  if (match === null) return null;
  const [, captured] = match;
  return captured !== undefined && captured.length > 0 ? captured : null;
}

function collectParagraphs($: CheerioAPI, $cell: CheerioSelection): string[] {
  const paragraphs: string[] = [];
  $cell.find('p').each((_, p) => {
    const text = normalizeText($(p).text());
    if (text.length > 0) paragraphs.push(text);
  });
  return paragraphs;
}

function buildImageUrl($img: CheerioSelection, sourceUrl: string): string | null {
  const src = $img.attr('src');
  if (src === undefined || src.length === 0) return null;
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return null;
  }
}

function slugifyName(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
