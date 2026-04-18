---
name: pokopia-page-parser
description: Pokopia HTML 파서와 Zod 스키마 구현. 46개 Serebii 페이지(availablepokemon/items/habitats/habitat 상세 209/cooking/specialty/crafting 등)와 PokopiaGuide SPA·API 응답 파싱, SourceMetadata 주입(buildSourceMetadata), SELECTOR_VERSION 관리, 파싱 실패 시 data/invalid/ 격리, Zod safeParse 검증. 신규 페이지 파서 추가·HTML 구조 변경 대응·Zod 스키마 확장·셀렉터 버전 bump 시 반드시 이 스킬을 사용한다.
version: "1.0.0"
---

# Pokopia 페이지별 파서 구현

이 스킬은 Serebii·PokopiaGuide의 HTML/DOM에서 구조화된 데이터를 추출하는 파서를 표준화된 방식으로 작성한다. Zod 검증과 SourceMetadata 주입을 강제한다.

## 핵심 원칙

1. **파싱 결과는 반드시 Zod safeParse 통과** — raw object 그대로 반환 금지.
2. **SourceMetadata 자동 주입** — `buildSourceMetadata()` 헬퍼로 출처·라이선스 자동 붙임.
3. **셀렉터 버전 관리** — HTML 구조 변경 감지 → `SELECTOR_VERSION` bump → 이전 버전 파일 보존.
4. **파싱 실패율 모니터링** — 24h 롤링 ≥5% 경보, ≥20% 서킷 브레이커.
5. **실패 샘플 보존** — `data/invalid/<source>/<timestamp>/`에 HTML + 파싱 결과 + 에러 저장 (qa-analyst가 분석).

## 왜 이런 규칙인가

Serebii는 CSS class가 거의 없어 헤더 텍스트 기반 파싱이 필요(DATA_COLLECTION_PLAN §2.1). 셀렉터가 취약하므로 실패 샘플을 보존해야 구조 변경을 탐지할 수 있다. Zod 강제는 문자열/숫자 혼동 같은 조용한 버그를 초기에 걸러낸다.

## 파일 구조

```
src/
├── parsers/
│   ├── serebii/
│   │   ├── pokemon.ts           # /availablepokemon.shtml
│   │   ├── items.ts             # /items.shtml
│   │   ├── habitats.ts          # /habitats.shtml (목록)
│   │   ├── habitats-detail.ts   # /habitatdex/{N}.shtml (209 상세)
│   │   ├── specialty.ts         # /specialty.shtml
│   │   ├── cooking.ts           # /cooking.shtml
│   │   ├── crafting.ts          # /crafting.shtml
│   │   ├── furniture.ts         # /furniture.shtml
│   │   ├── cds.ts               # /cds.shtml
│   │   ├── paint.ts             # /paint.shtml
│   │   ├── location-*.ts        # /locations/<slug>.shtml 등
│   │   └── ...                  # 46 페이지 커버
│   ├── pokopia-guide/
│   │   ├── pokemon.ts           # PokopiaGuide pokedex
│   │   ├── items.ts
│   │   └── ...
│   └── shared/
│       ├── table-extractor.ts   # 공통 <table> 파서
│       └── text-normalizer.ts
└── validators/
    ├── schemas.ts               # 전체 Zod 스키마 (§27.1 공통 패턴)
    └── metadata.ts              # buildSourceMetadata 헬퍼
```

## Zod 스키마 (CRAWLING_STRATEGY §27.1)

### 공통 SourceMetadata

```typescript
// src/validators/schemas.ts
import { z } from 'zod'

export const SourceSiteEnum = z.enum(['serebii', 'pokopiaGuide', 'pokopoko', 'namuwiki'])
export type SourceSite = z.infer<typeof SourceSiteEnum>

export const SourceMetadataSchema = z.object({
  sourceSite: SourceSiteEnum,
  sourceUrl: z.string().url(),
  scrapedAt: z.string().datetime(),
  license: z.string().min(1),
  copyrightHolder: z.string().min(1),
  attribution: z.string().min(1),
  derivedFrom: z
    .object({ sourceSite: SourceSiteEnum, sourceUrl: z.string().url() })
    .optional(),
})
export type SourceMetadata = z.infer<typeof SourceMetadataSchema>
```

### 엔티티 스키마 (.merge 패턴)

```typescript
export const PokemonSchema = z.object({
  pokedexNo: z.number().int().positive().optional(),
  nameEn: z.string().min(1),
  isEvent: z.boolean().default(false),
  isUniqueCharacter: z.boolean().default(false),
  isLegendary: z.boolean().default(false),
  specialties: z.array(z.string()).default([]),
  imageUrl: z.string().url().optional(),
}).merge(SourceMetadataSchema)

export const ItemSchema = z.object({
  nameEn: z.string().min(1),
  description: z.string().default(''),
  category: z.enum([/* ItemCategory ENUM 값들 */]),
  tags: z.array(z.string()).default([]),
  locations: z.array(z.object({
    method: z.string(),
    locationName: z.string().optional(),
    detail: z.string().optional(),
  })).default([]),
  imageUrl: z.string().url().optional(),
  isPaintable: z.boolean().default(false),
  isPatternable: z.boolean().default(false),
  isMagnetRiseOnly: z.boolean().default(false),
}).merge(SourceMetadataSchema)

// 70+ 엔티티 전부 동일 패턴
```

### 한국어 매핑 엔티티

```typescript
export const KoreanPokemonMappingSchema = z.object({
  pokedexNo: z.number().int().positive(),
  nameKo: z.string().min(1),
}).merge(SourceMetadataSchema)
  .refine((v) => v.derivedFrom !== undefined, {
    message: 'derivedFrom required for i18n mapping',
  })
```

## SourceMetadata 주입 헬퍼

```typescript
// src/validators/metadata.ts
import { SOURCE_DEFAULTS } from '@/config/source-metadata'
import type { SourceMetadata, SourceSite } from '@/validators/schemas'

export function buildSourceMetadata(args: {
  sourceSite: SourceSite
  sourceUrl: string
  derivedFrom?: SourceMetadata['derivedFrom']
}): SourceMetadata {
  const defaults = SOURCE_DEFAULTS[args.sourceSite]
  return {
    sourceSite: args.sourceSite,
    sourceUrl: args.sourceUrl,
    scrapedAt: new Date().toISOString(),
    license: defaults.license,
    copyrightHolder: defaults.copyrightHolder,
    attribution: defaults.attribution,
    ...(args.derivedFrom ? { derivedFrom: args.derivedFrom } : {}),
  }
}
```

`SOURCE_DEFAULTS`는 `src/config/source-metadata.ts`에 정의 (CRAWLING_STRATEGY §27.4).

## 파서 표준 템플릿

```typescript
// src/parsers/serebii/pokemon.ts
import { parse as parseHtml } from 'node-html-parser'
import { PokemonSchema } from '@/validators/schemas'
import { buildSourceMetadata } from '@/validators/metadata'
import { saveInvalid } from '@/validators/invalid-store'

export const SELECTOR_VERSION = 1

export async function parsePokemonList(
  html: string,
  sourceUrl: string,
): Promise<Pokemon[]> {
  const root = parseHtml(html)
  const table = root.querySelector('table.dextable')
  if (!table) {
    throw new ParseError('table.dextable not found', { sourceUrl })
  }
  const rows = table.querySelectorAll('tr')
  const results: Pokemon[] = []
  const errors: ZodError[] = []

  for (const tr of rows.slice(1)) {  // 첫 행은 헤더
    const cells = tr.querySelectorAll('td')
    if (cells.length < 4) continue

    const raw = {
      pokedexNo: parseIntOrNull(cells[0].text.trim()),
      nameEn: cells[2].text.trim(),
      imageUrl: resolveUrl(cells[1].querySelector('img')?.getAttribute('src'), sourceUrl),
      specialties: cells[3].text.split(',').map(s => s.trim()).filter(Boolean),
      ...buildSourceMetadata({
        sourceSite: 'serebii',
        sourceUrl,
      }),
    }
    const result = PokemonSchema.safeParse(raw)
    if (result.success) {
      results.push(result.data)
    } else {
      errors.push(result.error)
    }
  }

  if (errors.length > 0) {
    await saveInvalid('serebii', sourceUrl, html, { raw: 'see errors', errors })
    emitEvent('data.integrity_failure', 'high', {
      sourceUrl,
      errorCount: errors.length,
      selectorVersion: SELECTOR_VERSION,
    })
  }

  return results
}
```

## SELECTOR_VERSION 관리

HTML 구조 변경 발견 시:
1. 기존 `parsers/serebii/pokemon.ts` → `parsers/serebii/pokemon.v1.ts` 이름 변경 (원본 보존)
2. 새 `pokemon.ts` 작성, `SELECTOR_VERSION = 2`
3. 이전 캐시 HTML로 v1/v2 각각 파싱 → diff 확인
4. 통과 시 배포, 실패 시 v1 로 롤백

```typescript
export const SELECTOR_VERSION = 2  // bumped 2026-05-15: table class changed
```

## 파싱 실패 샘플 보존 (saveInvalid)

```typescript
// src/validators/invalid-store.ts
export async function saveInvalid(
  source: string,
  sourceUrl: string,
  html: string,
  { parsed, errors }: { parsed: unknown; errors: unknown },
): Promise<void> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = `data/invalid/${source}/${ts}`
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(`${dir}/page.html`, html)
  await fs.writeFile(`${dir}/parsed.json`, JSON.stringify(parsed, null, 2))
  await fs.writeFile(`${dir}/errors.json`, JSON.stringify(errors, null, 2))
  await fs.chmod(`${dir}/page.html`, 0o600)  // 민감 정보 방지
}
```

## 페이지별 구현 힌트 (DATA_COLLECTION_PLAN §2)

### availablepokemon.shtml
- `<table class="dextable">` → 헤더: No. / Pic / Name / Specialty
- 컬럼 4개. Name 안에 링크 없음 (단순 텍스트)
- specialties는 `,` split + trim

### items.shtml
- 카테고리별 섹션 (`<h2>` 헤더 + 다음 table)
- 컬럼: Picture / Name / Description / Tag / Locations
- 카테고리 이름을 섹션 헤더에서 추출 → ENUM 매핑

### habitats.shtml
- 목록: No / Pic / Name / Description
- **포켓몬 매핑은 209개 개별 상세 페이지**(/habitatdex/{N}.shtml)에서 파싱
- 상세 페이지에서 habitat_pokemon 추출

### specialty.shtml
- Picture / Name / Description
- 포켓몬 매핑은 description 텍스트 내 비구조적 → Phase 1에서는 추출 skip, 별도 수동 처리 또는 regex

### cooking.shtml
- 카테고리별 분리 (Salad/Soup/Bread/Steak)
- Picture / Name / Description / Main / Secondary / Specialty
- main/secondary 재료는 item 테이블 FK로 매칭 (loader가 처리)

### habitat 상세 (209개)
- 포켓몬 매핑 (pokemon_id, time_condition, weather_condition)
- 개별 세션에서 동일 파서 209번 실행 (cache 필수)

## PokopiaGuide 파서 특수 사항

SPA/CSR이므로 Playwright로 DOM 렌더 후 `page.content()` → `parseHtml`.

**API 발견 시 (Phase 0):**
- Playwright 내 `context.request.get()` 으로 API 호출 (TLS 핑거프린트 브라우저와 일치 유지)
- 직접 `ky`로 호출 금지 (핑거프린트 다름)
- API 응답은 JSON → Zod `KoreanPokemonMappingSchema.parse`

## 체크리스트 (새 파서 추가 시)

- [ ] 대응 Zod 스키마가 `validators/schemas.ts`에 존재
- [ ] `buildSourceMetadata()` 사용
- [ ] `SELECTOR_VERSION` 상수 정의
- [ ] `safeParse` 실패 시 `saveInvalid` 호출
- [ ] 샘플 HTML(캐시)로 드라이런 테스트 (`--no-fetch --source X`)
- [ ] 5~10개 레코드로 먼저 검증 후 전체
- [ ] 실패율 모니터링 연결
- [ ] `pnpm tsc --noEmit` 통과

## 디버깅 팁

- `parse as parseHtml`로 시작, `page.content()`의 snapshot을 파일로 덤프해서 브라우저에서 열어보기
- `table.dextable` 같은 셀렉터가 맞는지는 실제 캐시 HTML 검증
- 텍스트 기반 파싱이므로 공백·이스케이프 문자 주의 (`&nbsp;`, `&#39;`)
- `text.trim()` 누락으로 비교 실패 빈번

## 금지 사항

- `SourceMetadataSchema` 없이 raw object 반환
- `safeParse` 건너뛰기
- 실패 케이스 `console.log` 만 하고 `saveInvalid` 생략
- 같은 페이지 SELECTOR_VERSION 표시 없이 덮어쓰기
- 직접 `ky`로 PokopiaGuide 호출 (핑거프린트 불일치)

## 참조

- 페이지 목록: `DATA_COLLECTION_PLAN.md §2`
- Zod 스키마 전문: `CRAWLING_STRATEGY.md §27.1`
- SOURCE_DEFAULTS: `CRAWLING_STRATEGY.md §27.4`
- SELECTOR_VERSION 정책: `DATA_COLLECTION_PLAN.md §7.3`
