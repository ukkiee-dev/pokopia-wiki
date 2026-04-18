# 스크래퍼 Fixture 패턴

`services/scraper`의 fixture 캡처·마스킹·라이선스·diff 패턴. testing-fixture-keeper 와 augmenter 가 참조.

## 목차
1. [디렉토리 표준](#디렉토리-표준)
2. [캡처 hook 권고 패턴](#캡처-hook-권고-패턴)
3. [마스킹 규칙 카탈로그](#마스킹-규칙-카탈로그)
4. [라이선스·attribution 처리](#라이선스attribution-처리)
5. [의미 단위 diff](#의미-단위-diff)
6. [엣지 케이스 카탈로그](#엣지-케이스-카탈로그)
7. [도메인 특화 (Pokopia)](#도메인-특화-pokopia)

---

## 디렉토리 표준

```
services/scraper/__fixtures__/
├── serebii/
│   ├── pokemon/
│   │   ├── 0001.html
│   │   ├── 0001.meta.json
│   │   ├── 0002.html
│   │   └── 0002.meta.json
│   ├── item/
│   ├── habitat/
│   ├── cooking/
│   └── INDEX.md
├── pokopia-guide/
├── namuwiki/
├── pokemon-official/
└── snapshots/
    ├── 20260417/
    └── archive/
        └── 202603.tar.gz
```

`{slug}` 명명 규칙:
- 포켓몬: pokedex_no zero-pad 4자리 (`0001`)
- 아이템: source_slug 그대로 (`berry-1`)
- 카테고리·서식지: source_slug 그대로

---

## 캡처 hook 권고 패턴

스크래퍼 fetcher에 사이드이펙트로 fixture 저장 hook 삽입. 코드 수정 권고만, 직접 수정은 사용자 승인 후.

```ts
// services/scraper/src/fetcher/with-fixture-capture.ts
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'

interface CaptureOpts {
  source: string
  category: string
  slug: string
  selectorVersion: string
  scraperVersion: string
  license: string
  copyrightHolder: string
  attribution: string
}

export async function captureFixture(
  body: string,
  status: number,
  headers: Record<string, string>,
  opts: CaptureOpts,
) {
  const ext = inferExt(headers['content-type'])
  const dir = `services/scraper/__fixtures__/${opts.source}/${opts.category}`
  await mkdir(dir, { recursive: true })

  const masked = applyMaskingRules(body)
  const contentHash = createHash('sha256').update(masked).digest('hex')

  await writeFile(`${dir}/${opts.slug}.${ext}`, masked)
  await writeFile(`${dir}/${opts.slug}.meta.json`, JSON.stringify({
    sourceUrl: opts.sourceUrl,
    capturedAt: new Date().toISOString(),
    scraperVersion: opts.scraperVersion,
    selectorVersion: opts.selectorVersion,
    license: opts.license,
    copyrightHolder: opts.copyrightHolder,
    attribution: opts.attribution,
    contentHash: `sha256:${contentHash}`,
    responseStatus: status,
    responseHeaders: filterHeaders(headers),
  }, null, 2))
}
```

---

## 마스킹 규칙 카탈로그

캡처 시점에 적용. 원본 보존하지 않음.

```ts
// services/scraper/src/fetcher/masking.ts
const MASK_RULES = [
  // 이메일
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: '[REDACTED:email]' },

  // 전화번호 (국제·한국)
  { pattern: /\+?\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}/g, replacement: '[REDACTED:phone]' },

  // URL 경로의 사용자명
  { pattern: /\/user\/[\w-]+/g, replacement: '/user/[REDACTED]' },
  { pattern: /\/profile\/[\w-]+/g, replacement: '/profile/[REDACTED]' },

  // 세션·CSRF 토큰
  { pattern: /(session|sess|sid|csrf)=[\w-]+/gi, replacement: '$1=[REDACTED]' },

  // API 키 (32자+ 영숫자열)
  { pattern: /\b[a-z0-9]{32,}\b/gi, replacement: '[REDACTED:key]' },

  // IP 주소
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[REDACTED:ip]' },
]

export function applyMaskingRules(body: string): string {
  return MASK_RULES.reduce(
    (acc, { pattern, replacement }) => acc.replace(pattern, replacement),
    body
  )
}
```

마스킹 패턴 미일치로 누락 가능성이 있으면 저장 중단하고 사용자에게 패턴 추가 요청.

### 추가 권고 (도메인별)

- **포켓몬 커뮤니티 사이트**: 사용자 닉네임, 댓글 작성자
- **위키 사이트**: 편집자 IP, 토론 페이지 사용자명
- **공식 사이트**: 일반적으로 PII 적음, 추적 쿠키만 주의

---

## 라이선스·attribution 처리

각 fixture에 메타로 보존:

```json
{
  "license": "fan-site",
  "copyrightHolder": "Serebii",
  "attribution": "Used under fair use for fan reference"
}
```

| Source | 라이선스 분류 | Attribution 권장 문구 |
|--------|-------------|---------------------|
| Serebii | fan-site | "Used under fair use for fan reference" |
| Pokopia Guide | fan-site | "Pokopia Guide community wiki" |
| Namuwiki | CC-BY-NC-SA-2.0-KR | "Source: namu.wiki, CC BY-NC-SA 2.0 KR" |
| Pokemon Official | proprietary | "© Nintendo / Game Freak / The Pokémon Company" |

라이선스 메타 누락 시 저장 거부. fixture-keeper가 자동 검증.

> Pokopia 프로젝트 정책: SCHEMA.md 의 SourceMetadata 와 정합. Phase 7 검증 항목.

---

## 의미 단위 diff

단순 byte diff는 노이즈 (광고, 날짜, 세션 ID)에 묻혀 진짜 변경 놓침. 셀렉터별 추출값 비교:

```ts
// scripts/fixture-diff.ts
import { load } from 'cheerio'

const SELECTORS = {
  serebii: {
    pokemon: {
      pokedex_no: 'h1.pkmn-name + .pokedex-no',
      types:     '.pokedex-info .types > a',
      ability:   '.abilities td:nth-child(2)',
      stats:     '.basestats .stat',
    }
  },
  // ...
}

function extract(html: string, source: string, category: string) {
  const $ = load(html)
  const result: Record<string, string | string[]> = {}
  for (const [field, sel] of Object.entries(SELECTORS[source][category])) {
    result[field] = $(sel).map((_, el) => $(el).text().trim()).get()
  }
  return result
}

function classify(baseline: any, candidate: any) {
  const baselineKeys = Object.keys(baseline)
  const candidateKeys = Object.keys(candidate)

  if (baselineKeys.length !== candidateKeys.length) return 'selector_drift'

  for (const k of baselineKeys) {
    if (JSON.stringify(baseline[k]) !== JSON.stringify(candidate[k])) {
      // 값 차이가 셀렉터로 잡히는 위치인지 vs 컨텐츠인지
      return looksLikeSelectorDrift(baseline[k], candidate[k])
        ? 'selector_drift' : 'content_change'
    }
  }
  return 'noise'
}
```

---

## 엣지 케이스 카탈로그

augmenter가 후보로 제시할 표준 케이스:

| 카테고리 | 케이스 |
|---------|--------|
| HTML 구조 변경 | 셀렉터로 못 찾음 → 명시적 ParseError |
| 빈 페이지 | body 비어있음 |
| 404 응답 | 라이브에서 해당 슬러그 사라짐 |
| 5xx 응답 | upstream 일시 장애 |
| 인코딩 | Shift_JIS 응답 (일본 사이트), EUC-KR (한국) |
| robots.txt 변경 | Disallow 추가 → 크롤 중단 |
| 부분 응답 | 스트리밍 중단, 절반만 받음 |
| 너무 큰 페이지 | 메모리 부담 |
| 중복 셀렉터 매칭 | 같은 셀렉터로 여러 요소 매칭 시 첫 번째? 모두? |
| 동적 컨텐츠 | JS 렌더링 필요한 페이지 (patchright/playwright 영역) |

### 파서 단위 테스트 (fixture 사용)

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parsePokemonPage } from './parser'

const FIXTURE_DIR = 'services/scraper/__fixtures__/serebii/pokemon'

test('extracts pokedex_no from 0001', () => {
  const html = readFileSync(`${FIXTURE_DIR}/0001.html`, 'utf-8')
  const result = parsePokemonPage(html)
  expect(result.pokedex_no).toBe(1)
})

test('throws ParseError on broken selector', () => {
  const broken = '<html><body>no pokedex</body></html>'
  expect(() => parsePokemonPage(broken)).toThrow(/pokedex/i)
})
```

---

## 도메인 특화 (Pokopia)

Pokopia 프로젝트의 SCHEMA.md `SourceMetadata`와 정합:

```json
{
  "sourceUrl": "https://serebii.net/pokemon/0001.shtml",
  "sourceSite": "serebii",
  "license": "fan-site",
  "copyrightHolder": "Serebii",
  "attribution": "Used under fair use for fan reference",
  "scrapedAt": "2026-04-17T14:32:11Z",
  "selectorVersion": "v3"
}
```

추가 메타:
- Phase 7 검증에서 `attribution` 빈 레코드는 실패
- `data/invalid/` 에 보존되는 Zod 실패 케이스도 fixture로 보관 권고
- 한국어 매핑은 `pokopia-i18n-mapper` 영역, fixture-keeper는 raw 보존만

## 안티패턴

- 자동 fixture 갱신 cron
- 마스킹 없이 raw 저장
- 라이선스 메타 누락
- 단순 byte diff
- live HTTP를 테스트마다 호출 (rate limit·차단 위험)
- snapshots/ 무한 누적
