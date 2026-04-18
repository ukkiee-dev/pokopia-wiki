---
name: pokopia-tier-crawler
description: Pokopia 스크래퍼의 티어별 fetcher(T0 ky / T1 playwright / T2·T3 patchright) 구현, 페르소나 관리, rate limiter, cookie persistence, robots.txt checker, circadian scheduler, concurrency guard. Serebii/PokopiaGuide/pokopoko/namu.wiki 접근 코드를 작성·수정·리팩토링하거나 FetcherFactory/PersonaManager/SessionManager를 확장할 때 반드시 이 스킬을 사용한다. 과잉 스텔스 금지 원칙을 강제한다.
version: "1.0.0"
---

# Pokopia 티어별 Fetcher 구현

이 스킬은 CRAWLING_STRATEGY.md의 4-티어 전략을 TypeScript 코드로 구현한다. 사이트 방어 수준에 맞는 **최소** 수단만 사용하며, 과잉 스텔스는 오히려 탐지 시그널임을 원칙으로 한다.

## 티어 결정 (SSoT: CRAWLING_STRATEGY §1.3)

| 티어 | 소스 | Fetcher | 워밍 | 페르소나 |
|------|------|---------|------|---------|
| T0 | Serebii | `ky` + `node-html-parser` | 불필요 | 불필요 |
| T1 | PokopiaGuide | `playwright` 순정 + fingerprint-injector | 1일 | korean-pokemon-fan |
| T2 | pokopoko | `patchright` + ghost-cursor | 2일 | T1과 시간 분리 공유 |
| T3 | namu.wiki | `patchright` + CF challenge 대기 | 3일 | namuwiki-researcher (전용) |

**핵심 규칙:**
- T1에서 patchright 금지 (이중 패치 충돌, §4.3)
- T0에서 Playwright 금지 (오버엔지니어링)
- 같은 Mac = 같은 공인 IP → 동시에 두 티어 돌리지 않음, **시간 분리** 필수
- puppeteer-extra-plugin-stealth 사용 금지 (탐지 신호)

## 왜 티어링인가

Serebii는 팬사이트로서 간단한 요청도 허용하지만, namu.wiki는 Cloudflare WAF로 방어한다. 모든 소스에 동일한 스텔스를 적용하면:
1. Serebii에 과잉 복잡성 (낭비)
2. 스텔스 패턴 자체가 탐지 벡터로 노출

사이트별 최소 전략이 안정성 + 효율성 모두 최적.

## 구현 파일 구조

```
src/
├── fetchers/
│   ├── factory.ts           # FetcherFactory — 소스 기반 fetcher 선택
│   ├── ky-fetcher.ts        # T0
│   ├── playwright-fetcher.ts # T1
│   ├── patchright-fetcher.ts # T2, T3
│   └── types.ts             # Fetcher 인터페이스
├── cache/
│   └── html-cache.ts        # TTL 3일 디스크 캐시
├── robots/
│   └── checker.ts           # robots-parser 래퍼
├── personas/
│   ├── manager.ts           # PersonaManager
│   ├── warmer.ts            # ProfileWarmer (API만, 파일 편집 금지)
│   └── data.ts              # 페르소나 정의
├── session/
│   ├── manager.ts           # SessionManager
│   ├── concurrency-guard.ts # proper-lockfile 기반
│   └── scheduler.ts         # CircadianScheduler
├── rate/
│   └── limiter.ts           # RateLimiter (일별 누적 영속화)
└── behavior/
    ├── human-dwell.ts       # 체류 시간 시뮬레이션
    ├── ghost-cursor.ts      # bezier 궤적 래퍼
    └── error-reaction.ts    # 에러 후 행동 시뮬레이션
```

## Fetcher 인터페이스

```typescript
// src/fetchers/types.ts
export interface Fetcher {
  fetch(url: string, options?: FetchOptions): Promise<FetchResult>
  close?(): Promise<void>  // playwright/patchright만
}

export interface FetchResult {
  html: string
  status: number
  url: string             // 리다이렉트 후 최종 URL
  headers: Record<string, string>
  fetchedAt: string       // ISO 8601
  fromCache: boolean
  contentHash: string     // sha256
}

export type FetchOptions = {
  forceFetch?: boolean    // 캐시 무시
  persona?: Persona       // T1+에서만
  timeoutMs?: number
}
```

## T0: ky Fetcher (Serebii)

```typescript
// src/fetchers/ky-fetcher.ts
import ky from 'ky'
import { createHash } from 'node:crypto'
import { RobotsChecker } from '@/robots/checker'
import { HtmlCache } from '@/cache/html-cache'

const USER_AGENT = 'PokopiaScraperBot/1.0 (+ukyi.js@gmail.com)'

export class KyFetcher implements Fetcher {
  constructor(
    private robots: RobotsChecker,
    private cache: HtmlCache,
  ) {}

  async fetch(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
    // robots.txt 선검증
    if (!this.robots.isAllowed('serebii', url, USER_AGENT)) {
      throw new RobotsDisallowed(url)
    }

    if (!opts.forceFetch) {
      const cached = await this.cache.get('serebii', url)
      if (cached && !this.cache.isExpired(cached, 3)) {
        return { ...cached, fromCache: true }
      }
    }

    const response = await ky.get(url, {
      timeout: opts.timeoutMs ?? 30_000,
      retry: { limit: 3, statusCodes: [429, 503] },
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      hooks: {
        beforeRequest: [async () => { await sleep(gaussian(3000, 5000)) }],
      },
    })
    const html = await response.text()
    const contentHash = createHash('sha256').update(html).digest('hex')
    const result: FetchResult = {
      html,
      status: response.status,
      url: response.url,
      headers: Object.fromEntries(response.headers.entries()),
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      contentHash,
    }
    await this.cache.set('serebii', url, result)
    return result
  }
}
```

**체크포인트:**
- User-Agent에 연락처 포함 (Serebii 추적 가능성 제공, 선의)
- 요청 간 3~5초 가우시안 지연
- 429/503 응답 시 지수 백오프 (ky 내장)
- HTTP/2 자동 (ky → undici)

## T1: Playwright Fetcher (PokopiaGuide)

```typescript
// src/fetchers/playwright-fetcher.ts
import { chromium } from 'playwright'
import { newInjectedContext } from 'fingerprint-injector'
import { FingerprintGenerator } from 'fingerprint-generator'

export class PlaywrightFetcher implements Fetcher {
  private browser?: Browser

  async fetch(url: string, opts: FetchOptions): Promise<FetchResult> {
    const persona = opts.persona!  // T1에선 필수
    if (!this.browser) {
      this.browser = await chromium.launch({
        channel: 'chrome',  // 실제 Chrome 바이너리
        headless: false,
      })
    }
    const generator = new FingerprintGenerator({
      devices: ['desktop'],
      operatingSystems: ['macos'],
      browsers: [{ name: 'chrome', minVersion: 120 }],
      locales: [persona.locale],  // ko-KR
    })
    const fingerprint = generator.getFingerprint({ seed: persona.fingerprintSeed })
    const context = await newInjectedContext(this.browser, {
      fingerprint,
      newContextOptions: {
        locale: persona.locale,
        timezoneId: persona.timezone,
        viewport: { width: 1440, height: 900 },
        storageState: persona.storageStatePath,
      },
    })
    // persistent context 준비: cookieJar 로드
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    await humanDwell(page, 20_000, 60_000)
    const html = await page.content()
    await context.storageState({ path: persona.storageStatePath })
    // ... FetchResult 구성 (hash, cache 저장)
  }
}
```

**주의:**
- `channel: 'chrome'` 필수 (Chromium 기본 바이너리 식별자 다름)
- `headless: false` 기본 (headless 탐지)
- 유저 Chrome 프로필 격리 (`~/Library/Application Support/Google/Chrome` 하위 금지)
- `fingerprint-injector` 는 T1 전용. T2/T3는 patchright 내장 처리.

## T2/T3: patchright Fetcher

```typescript
// src/fetchers/patchright-fetcher.ts
import { chromium as patchright } from 'patchright'

export class PatchrightFetcher implements Fetcher {
  // T1과 유사하지만 fingerprint-injector 생략 (이중 패치 방지)
  // ghost-cursor 적용
  // CF challenge 대기 로직 (T3)
  async fetch(url: string, opts: FetchOptions): Promise<FetchResult> {
    const browser = await patchright.launch({ channel: 'chrome', headless: false })
    const context = await browser.newContext({
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      storageState: opts.persona!.storageStatePath,
    })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded' })

    // T3: Cloudflare challenge 대기
    if (opts.persona!.id === 'namuwiki-researcher') {
      await waitForCloudflareClear(page, { maxWaitMs: 60_000 })
    }

    // ghost-cursor 마우스 이동
    const cursor = createCursor(page)
    await cursor.move(randomPositionInViewport(page))
    await humanScroll(page)
    // ...
  }
}
```

**patchright 사전 검증 의무 (CRAWLING_STRATEGY §4.3):**
- 구현 전 `pnpm run check:patchright`
- bot.sannysoft.com 전체 초록 + nowsecure.nl 통과 (T3 사용 시)
- 실패 시 해당 티어 포기, 수동 대체로 전환

## 캐시 (HtmlCache)

```typescript
// src/cache/html-cache.ts
export class HtmlCache {
  async get(source: string, url: string): Promise<FetchResult | null>
  async set(source: string, url: string, result: FetchResult): Promise<void>
  isExpired(cached: FetchResult, ttlDays: number): boolean {
    const age = Date.now() - new Date(cached.fetchedAt).getTime()
    return age > ttlDays * 24 * 3600 * 1000
  }
}
```

파일 위치: `data/cache/<source>/<url-hash>.html`, 메타: `.meta.json`. Git 추적 제외.

## RobotsChecker (CRAWLING_STRATEGY §26)

- Phase -1에서 모든 소스 robots.txt 다운로드, `data/robots/<source>.txt` 저장
- 모든 fetch 전 `isAllowed(source, url, userAgent)` 호출
- **`undefined` 반환 시 `false` 취급** (보수적 스킵, v3.2 D4)
- 24시간 이상 실행 중인 소스는 세션 시작마다 `reloadIfChanged()` 호출

## PersonaManager

2개 페르소나:
- `korean-pokemon-fan` — T1/T2 공유, `ko-KR`, Asia/Seoul, `activeHours: 08:00~14:00`
- `namuwiki-researcher` — T3 전용, `ko-KR`, Asia/Seoul, `activeHours: 19:00~23:00`

**격리 규칙:**
- `storageStatePath`, `browserProfilePath`가 유저 Chrome 프로필과 완전 분리
- 시간대 겹치지 않음 (ConcurrencyGuard 파일락으로 코드 레벨 강제)

```typescript
// src/personas/data.ts
export const PERSONAS = {
  'korean-pokemon-fan': {
    id: 'korean-pokemon-fan',
    locale: 'ko-KR',
    timezone: 'Asia/Seoul',
    fingerprintSeed: 'kpf-v1',
    storageStatePath: 'data/browser-profiles/kpf/storage.json',
    browserProfilePath: 'data/browser-profiles/kpf/',
    activeHours: { start: 8, end: 14 },  // 24h clock
    usedFor: ['T1', 'T2'],
  },
  'namuwiki-researcher': {
    id: 'namuwiki-researcher',
    locale: 'ko-KR',
    timezone: 'Asia/Seoul',
    fingerprintSeed: 'nwr-v1',
    storageStatePath: 'data/browser-profiles/nwr/storage.json',
    browserProfilePath: 'data/browser-profiles/nwr/',
    activeHours: { start: 19, end: 23 },
    usedFor: ['T3'],
  },
}
```

## ConcurrencyGuard (§6.4, v3.2 A4)

`proper-lockfile` 사용. 세션 시작 전 `canStart()` 체크.

```typescript
import lockfile from 'proper-lockfile'

async function acquireSession(persona: Persona) {
  const release = await lockfile.lock(`data/locks/persona-${persona.id}.lock`, {
    stale: 30_000,
    retries: 0,  // 다른 세션이 활성이면 즉시 실패
  })
  // ...작업...
  await release()
}
```

전체 `data/locks/global-session.lock` 도 획득 → 두 페르소나 동시 활성 금지.

## RateLimiter (일별 누적 영속화)

```typescript
// src/rate/limiter.ts
export class RateLimiter {
  constructor(
    private source: string,
    private rps: number,  // requests per second (float)
    private dailyLimit: number,
  ) {}
  
  async acquire(): Promise<void> {
    // 일별 카운터 체크 (data/state/rate/{source}.json)
    // RPS 간격 대기 (가우시안 jitter 포함)
  }
}
```

소스별 rate (DATA_COLLECTION_PLAN §7.1):
- Serebii: 1 req / 2s
- PokopiaGuide: 1 req / 1s
- pokopoko: 1 req / 1s
- pokemon.com/ko: 1 req / 2s
- 호스트별 concurrency = 1

## CircadianScheduler

페르소나별 `activeHours` 기반 세션 시작 허용/거부. 현재 시각이 범위 밖이면 대기 또는 스킵.

## 에러 반응 (§11)

| 에러 | 반응 |
|------|------|
| 403 | 즉시 세션 종료, 24h cooldown, `high` 알림 |
| 429/503 | 지수 백오프(1→2→4s), 최대 3회, 실패 시 큐 |
| CF challenge 실패 | 세션 종료, 24h cooldown (T3는 72h) |
| DNS/네트워크 | 5분 대기, 3회 재시도 |
| 파싱 실패율 ≥20% | 서킷 브레이커 (crawl state에 기록) |

**"사람답게 떠나기"**: 에러 후 즉시 재시도 X. 3~10초 지연 + 다른 페이지로 이동 후 세션 종료.

## 체크리스트 (새 fetcher 추가 시)

- [ ] 티어 결정: 방어 수준 vs 오버엔지니어링 균형
- [ ] robots.txt 검증 통합
- [ ] HtmlCache 통합 (TTL 3일)
- [ ] User-Agent에 연락처 포함
- [ ] 요청 간 지연 (가우시안)
- [ ] 에러 반응 정책 (§11) 준수
- [ ] RateLimiter 적용
- [ ] PersonaManager 통합 (T1+)
- [ ] ConcurrencyGuard 획득
- [ ] `pnpm tsc --noEmit` 통과
- [ ] 드라이런 테스트 (`--dry-run --source X --page Y --limit 5`)

## 금지 사항

- 스텔스 과잉 (T0에 Playwright, T1에 patchright)
- headless 모드 (탐지됨)
- 유저 Chrome 프로필 경로 사용
- 페르소나 시간대 겹침
- CF 우회 무한 재시도 (3회 실패 = 수동 전환)
- User-Agent에서 연락처 제거

## 참조

- 티어 SSoT: `CRAWLING_STRATEGY.md §1.3`
- 라이브러리 선택: `CRAWLING_STRATEGY.md §4`
- 페르소나: `CRAWLING_STRATEGY.md §5`
- 에러 반응: `CRAWLING_STRATEGY.md §11`
- Rate Limit: `CRAWLING_STRATEGY.md §14`
- 소스별 최종 전략: `CRAWLING_STRATEGY.md §15`
- 구현 아키텍처: `CRAWLING_STRATEGY.md §23`
