/**
 * Serebii `/locations/<slug>.shtml` 상세 페이지 파서 — DATA_COLLECTION_PLAN Phase 1 단계 3b.
 *
 * 대상 페이지 (5 종):
 *   - witheredwastelands / bleakbeach / rockyridges / sparklingskylands / palettetown
 *
 * 산출 엔티티:
 *   - `location` 1 건 — 해당 지역의 **descriptionEn 보강**.
 *     slug / nameEn / type 은 루트 파서(LocationsIndexParser) 가 만든 엔티티와
 *     일치하도록 재생성 → loader 가 upsert 로 `location_i18n(locale='en').description` 을
 *     추가 주입.
 *
 * 본 파서 범위 밖 (별도 파서/단계 처리):
 *   - Interactive Map 이미지 — EntityImage (단계 4 이후 ItemLocation 파서 근처)
 *   - Naturally Occuring Materials / Plants / Items Found / Pokéballs / Treasure / Shop
 *     → `item_location` 관계 (단계 4 이후 `ItemLocation` 파서)
 *   - List of Exclusive Pokémon (Palette Town 전용) → pokemon-location 매핑 전용 파서
 *   - Cloud Island 상세 — 본 파서는 Main 지역 5 개만. Cloud Island 는 로드맵 Task 8.7.
 *
 * HTML 구조 (SELECTOR_VERSION='1' 기준):
 *   ```
 *   <td class="fooleft" colspan="2"><h1>Bleak Beach</h1></td>
 *   ...
 *   <p>Bleak Beach is a ... </p>                       <!-- 1~2 개 소개 문단 -->
 *   <p>Another paragraph ...</p>
 *   <p><h2>Interactive Map</h2></p>                    <!-- 첫 섹션 시작 -->
 *   ```
 *
 * 설명 추출 전략 — substring → 재파싱:
 *   `<h1>` 과 첫 `<h2>` 사이의 HTML 부분문자열을 잘라 별도 cheerio 인스턴스로
 *   재파싱 후 `<p>` 들을 모은다. Serebii 는 `<p><h2>...</h2></p>` 처럼
 *   블록 엘리먼트 중첩 DOM 이 흔해 직접 sibling 순회가 파서별로 결과가 다를 수
 *   있다. substring 재파싱은 구조 의존을 최소화한다.
 *
 * 에러 처리:
 *   - sourceUrl 이 `/locations/<slug>.shtml` 패턴 불일치 → `unexpected-structure` + 엔티티 0
 *   - `<h1>` 누락 / 빈 값 → `missing-section` / `unexpected-structure` + 엔티티 0
 *   - 첫 `<h2>` 없음 → descriptionEn undefined (스키마상 optional 통과)
 *   - Zod 실패 → `zod-fail` + 엔티티 0
 */

import { load } from 'cheerio';

import {
  buildSourceMetadata,
  LocationSchema,
  type LocationInput,
} from '@pokopia-wiki/shared';

import { Parser, type ParseIssue, type ParseOptions, type ParseResult } from '../base.js';

/** `/locations/<slug>.shtml` — 끝 토큰 추출. */
const LOCATION_DETAIL_SLUG_RE = /\/locations\/([a-z0-9]+)\.shtml/i;

export class LocationDetailParser extends Parser<LocationInput> {
  readonly SELECTOR_VERSION = '1';
  readonly sourceSite = 'serebii' as const;
  readonly pageId = 'location-detail';

  parse(html: string, options: ParseOptions): ParseResult<LocationInput> {
    const scrapedAt = options.scrapedAt ?? new Date().toISOString();
    const metadata = buildSourceMetadata({
      sourceSite: 'serebii',
      sourceUrl: options.sourceUrl,
      scrapedAt,
    });

    const entities: LocationInput[] = [];
    const issues: ParseIssue[] = [];

    const slug = extractSlugFromUrl(options.sourceUrl);
    if (slug === null) {
      issues.push({
        kind: 'unexpected-structure',
        message: `sourceUrl does not match /locations/<slug>.shtml: ${options.sourceUrl}`,
      });
      return { entities, issues };
    }

    const $ = load(html);
    const $h1 = $('h1').first();
    if ($h1.length === 0) {
      issues.push({
        kind: 'missing-section',
        at: `location[${slug}]`,
        message: '<h1> not found — not a location detail page',
      });
      return { entities, issues };
    }

    const nameEn = $h1.text().trim();
    if (nameEn.length === 0) {
      issues.push({
        kind: 'unexpected-structure',
        at: `location[${slug}]`,
        message: '<h1> is empty',
      });
      return { entities, issues };
    }

    const descriptionEn = extractDescription(html);

    const candidate = {
      slug,
      nameEn,
      type: 'Main' as const,
      ...(descriptionEn === undefined ? {} : { descriptionEn }),
      ...metadata,
    };

    const result = LocationSchema.safeParse(candidate);
    if (result.success) {
      entities.push(result.data);
    } else {
      issues.push({
        kind: 'zod-fail',
        at: `location[${slug}]`,
        message: result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; '),
      });
    }

    return { entities, issues };
  }
}

/** `/pokemonpokopia/locations/<slug>.shtml` → `<slug>`. 불일치면 null. */
function extractSlugFromUrl(url: string): string | null {
  const match = url.match(LOCATION_DETAIL_SLUG_RE);
  if (!match) return null;
  const [, captured] = match;
  if (captured === undefined || captured.length === 0) return null;
  return captured;
}

/**
 * `<h1>` 와 첫 `<h2>` 사이의 HTML 부분문자열에서 모든 `<p>` 텍스트를 결합.
 *
 * 여러 `<p>` 가 있으면 `\n\n` 구분자로 이어 붙여 i18n.description 에 저장 가능한
 * 자연 텍스트 블록을 만든다 (Palette Town 은 2 개 문단 예시).
 *
 * `<h1>` 또는 첫 `<h2>` 를 HTML 에서 못 찾으면 undefined — 스키마 optional 로
 * 필드 생략.
 */
function extractDescription(html: string): string | undefined {
  const h1Index = html.indexOf('<h1>');
  if (h1Index < 0) return undefined;
  const h2FirstIndex = html.indexOf('<h2>', h1Index);
  if (h2FirstIndex < 0) return undefined;

  const snippet = html.slice(h1Index, h2FirstIndex);
  const $ = load(`<div>${snippet}</div>`);
  const paragraphs: string[] = [];
  $('p').each((_, p) => {
    const text = $(p).text().trim();
    if (text.length > 0) paragraphs.push(text);
  });
  if (paragraphs.length === 0) return undefined;
  return paragraphs.join('\n\n');
}
