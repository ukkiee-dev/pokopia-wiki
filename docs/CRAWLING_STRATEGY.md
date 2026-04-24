# Pokopia Scraper — Crawling Strategy v3.4

> 개정 이력
> - 2026-04-17: 개정 이력 섹션 신설. §29.2 백업 스크립트 경로(`SRC`, crontab 예시)의 `pokopia-scraper` → `pokopia-wiki`로 갱신 — 모노레포 루트 디렉토리명 변경 반영. 사이트명(`PokopiaGuide`)·DB명(`pokopia`)·Zod ENUM(`pokopiaGuide`)·외장 SSD 백업 디렉토리(`pokopia-backup`)·별도 레포(`pokopia-web`)는 별개 식별자이므로 유지.
> - 2026-04-19: v3.3. Phase 2 감사 Warning 반영 — (1) §22.3 `TOKEN_PATTERNS` 확장(Bearer base64 padding, Basic auth, OAuth/OIDC JSON body, Cookie 키 집합 확장 + `\b` 단어 경계, `redactObject` BigInt/순환 참조 fallback). (2) §27.1 zod 4 API로 예시 갱신(`.extend(B.shape)`·`z.url()`·`z.iso.datetime()`). (3) §27.4 `buildSourceMetadata`에 `scrapedAt?: string` 옵셔널 도입 + "1엔티티 1회 호출" 규칙 명시.
> - 2026-04-19 (후속): v3.4. Phase 3 감사 SEC-001/002/003 Critical·Warning 반영 — §22.3 `TOKEN_PATTERNS` 맨 앞에 `https?://api.telegram.org/bot*` 패턴 추가(URL embed 토큰이 기존 Telegram bot token 패턴에 매칭 안 되는 문제 — `bot` 과 digit 사이 `\b` 부재). §13.3.5 Notifier 뼈대에 "메타 키 네이밍 가드"(`sanitizeMeta`) 절차 명시 + 에러 경로(sendTelegram/appendEventLog/sendMacOSBanner catch) 및 `console.log fallback`에서 `redact()` 2차 적용 의무화.

> **핵심 원칙:** 안정성 > 속도. 봇으로 탐지되지 않는 것이 최우선.
> **티어링 원칙:** 사이트 방어 수준에 비례하는 최소 전략만 사용. 과잉 스텔스 = 오히려 시그널.
> **SSoT (Single Source of Truth):** 이 문서가 fetcher·티어·페르소나·안티봇 전략의 단일 진실 소스. `TECH_STACK.md`는 상위 기술 스택(Runtime/Package Manager/Core Libraries/DB 등)만 담당하며 세부 fetcher matrix는 보유하지 않는다. `DATA_COLLECTION_PLAN.md`는 엔티티/페이지 목록/Phase별 수집 스코프 담당이며 Rate·동시성·알림·에러 정책은 본 문서가 SSoT.

> **공통 타입 SSoT:** `Source` 타입은 **§27.1 `SourceSiteEnum`의 `z.infer` 결과를 사용**한다. 본 문서 곳곳의 `Source` 표기는 모두 `SourceSite`와 동치.

---

## 1. 전략 원칙

### 1.1 안정성 최우선

| 원칙 | 의미 |
|------|------|
| 안정성 > 속도 | 며칠 걸려도 차단 안 되는 게 우선 |
| 최소주의 > 과잉 | 방어 수준에 맞는 **최소** 수단만. 스텔스 자체가 탐지 벡터 |
| 네트워크 격리 없으면 페르소나 격리도 없음 | 같은 IP에서 여러 페르소나 운영 **금지** — 시간 분리로 대체 |
| 사람스러움 > 스텔스 | 스텔스 흔적이 오히려 시그널. 진짜 사람처럼 행동 |
| 페일오버 > 무리한 시도 | 3회 실패 = 포기. 다른 소스로 대체 |
| 드라이런 선행 | 페이지 1개 먼저 성공 → 확장. 한 번에 전체 돌리지 않음 |

### 1.2 윤리적/법적 고려

- 스크래핑 목적: 개인 위키 사이트 구축 (**공개 배포 시 법적 재검토 필요**)
- 저작권 주의: 포켓몬 IP는 Pokémon Company/닌텐도 소유. 이미지/텍스트 인용 시 출처 명시 + 팬 작업 면책 조항 필수. 공개 전 DMCA 위험 재평가.
- **수집 시점 메타데이터 의무화 (★ v3.1):** 모든 엔티티는 `sourceUrl`, `sourceSite`, `scrapedAt`, `license`, `copyrightHolder`, `attribution`을 반드시 포함. 사후 공개 시 attribution 자동 생성 + DMCA 대응을 위해 처음부터 설계에 반영 (§27.1 Zod 스키마 + §27.4 SOURCE_DEFAULTS).
- 소스 사이트 부담 최소화 — 낮은 Rate로 분산
- `robots.txt` **Phase 0에서 자동 다운로드 + 파싱 + 회피 목록 생성**. 결과는 `data/robots/<source>.txt` + `data/robots/exclusions.json`에 저장.
- 서버 에러 응답 시 즉시 백오프 + 긴 휴식

### 1.3 소스 티어 분류 (★ v3 신규)

사이트 방어 수준에 따라 티어를 나누고, 티어별 **최소 전략**을 적용한다. 과잉 스텔스는 금지.

| 티어 | 소스 | Fetcher | 스텔스 수준 | 페르소나 | 워밍 | 예상 소요 |
|------|------|---------|-----------|---------|------|---------|
| **T0** | Serebii | `ky` + `node-html-parser` | 없음 (UA만 사람 수준) | 불필요 | 불필요 | 1일 |
| **T1** | PokopiaGuide | Playwright (순정) + 핑거프린트 주입 최소 | 낮음 | 1개 (ko-KR) | 1일 | 3~5일 |
| **T2** | pokopoko (403 확인) | patchright + `ghost-cursor` | 중간 | T1과 **시간 분리** 공유 | 2일 | 성공 시 4~5일 |
| **T3** | namu.wiki (CF) | patchright + Cloudflare challenge 대기 | 높음, **성공 보장 X** | 별도 1개 | 3일 | 성공 시 5~7일, 실패 시 즉시 포기 |

**핵심 규칙:**
- T0는 HTTP 직접 요청. Playwright 쓰지 말 것 (오버엔지니어링).
- T1~T3 모두 **같은 Mac = 같은 공인 IP**이므로 동시에 두 티어를 돌리지 말 것. **시간대 분리** 필수.
- T2/T3 접근 실패 시 즉시 수동 번역/PokopiaGuide 커버리지로 폴백. 우회 시도 금지.

### 1.4 사전 검증 게이트 (★ v3 신규)

구현 시작 전 **반드시** 통과할 것:

1. `pnpm run check:robots` — 모든 소스 robots.txt 다운로드 및 위반 항목 리포트
2. `pnpm run check:access` — 각 소스 1페이지에 실제 접근 시도 (T0는 ky, T1+는 Playwright)
3. `pnpm run check:patchright` — patchright 버전 확인 + bot.sannysoft.com 통과 스크린샷
4. `pnpm run check:network` — 공인 IP 국가/timezone이 페르소나와 일치

**하나라도 실패 시 구현 착수 금지.** 통과 로그는 `data/preflight/<date>/` 에 저장.

---

## 2. 소스 사이트 분석

실제 사이트 접근 테스트 결과 (2026-04-16 확인).

### 2.1 Serebii.net (주 소스, EN)

| 항목 | 분석 결과 |
|------|----------|
| URL | `serebii.net/pokemonpokopia/` |
| 렌더링 | 완전 정적 HTML |
| Anti-bot | 낮음 |
| Fetcher | Playwright request context (HTTP/2 보장) |
| 이미지 패턴 | `/pokemonpokopia/pokemon/small/{번호}.png` |

**페이지별 구조:**

| 페이지 | 컬럼 | 비고 |
|--------|------|------|
| availablepokemon | No. / Pic / Name / Specialty | |
| items | Picture / Name / Description / Tag / Locations | 카테고리별 섹션 |
| habitats | No. / Picture / Name / Description | **포켓몬 매핑은 209개 개별 상세 페이지**에 존재 |
| specialty | Picture / Name / Description | 포켓몬 매핑은 설명 텍스트 내 비구조적 |
| cooking | Picture / Name / Description / Main / Secondary / Specialty | 카테고리별 분리 |
| locations | Picture / Name | 6개 주요 지역 |

**주의사항:**
- CSS class 거의 없음 → 헤더 텍스트 기반 파싱 필요
- 서식지 상세 209 페이지 → 총 250+ 페이지
- 일부 데이터가 텍스트 설명에 비구조적

### 2.2 PokopiaGuide.com (한국어 1순위)

| 항목 | 분석 결과 |
|------|----------|
| URL | `pokopiaguide.com/ko` |
| 렌더링 | **SPA/CSR** (React/Next.js) |
| Anti-bot | 중간 |
| Fetcher | Playwright 필수 |
| 아이템 수 | **1,203개** |
| 한국어 노출 | 이상해씨, 파이리, 꼬부기 등 확인 |

**핵심:** Phase 0에서 API 엔드포인트 역추적 필요. API 발견 시 전략 대폭 단순화.

### 2.3 pokopoko.kr (한국어 2순위)

| 항목 | 분석 결과 |
|------|----------|
| 접근성 | **403 Forbidden** (HTTP 직접 차단) |
| Anti-bot | 높음 |
| Fetcher | Playwright + 고급 스텔스 |

### 2.4 namu.wiki (한국어 3순위)

| 항목 | 분석 결과 |
|------|----------|
| 접근성 | **403 Forbidden** (Cloudflare WAF) |
| Anti-bot | 매우 높음 |
| Fetcher | Playwright + Cloudflare bypass, 성공 보장 없음 |

**현실 판단:** PokopiaGuide가 1,203 아이템 + 포켓몬 전체 커버 → pokopoko/namu.wiki 없어도 90%+ 커버리지 가능.

---

## 3. 탐지 벡터 분석 (4-Layer)

```
Layer 1: 네트워크/HTTP 레벨
  ├── TLS 핑거프린트 (JA3/JA4)
  ├── HTTP 헤더 순서/값/존재 여부
  ├── HTTP/2 vs HTTP/1.1
  ├── IP 평판 (데이터센터 vs 주거용)
  ├── IP 지리 ↔ timezone/locale 일치
  └── 요청 패턴 (간격, 순서, 병렬성)

Layer 2: 브라우저/JS 핑거프린트
  ├── navigator.webdriver
  ├── navigator.plugins
  ├── window.chrome 객체
  ├── WebGL vendor/renderer
  ├── Canvas 핑거프린트
  ├── Audio 핑거프린트
  ├── Font enumeration
  ├── Permission API
  ├── hardwareConcurrency / deviceMemory
  ├── Sec-Ch-Ua-Full-Version-List
  └── CDP (Chrome DevTools Protocol) 흔적

Layer 3: 행동 분석
  ├── 마우스 움직임 (유무 + 곡선 자연스러움)
  ├── 클릭 위치 (요소 중앙 정확 = 봇)
  ├── 스크롤 패턴 (선형 vs 비선형)
  ├── 요청 간 지연 분포
  ├── 페이지 체류 시간 (콘텐츠 길이 대비)
  ├── 포커스/가시성 이벤트
  ├── 키보드 이벤트 (Cmd+F, Tab 등)
  └── 에러 후 행동 (당황한 유저 vs 무한 재시도)

Layer 4: 통계/패턴 분석 (가장 탐지하기 어려움)
  ├── 단위 시간당 요청 수
  ├── 시간대 분포 (24시간 활동 vs 생체리듬)
  ├── 세션 길이 분포
  ├── 프로필 나이 (쿠키/히스토리 축적)
  ├── 자원 로딩 패턴 (analytics 차단 여부)
  └── 페르소나 간 상관관계 (같은 IP에서 여러 페르소나)
```

---

## 4. 스텔스 라이브러리 선택

### 4.1 라이브러리 비교 (2026년 기준)

| 라이브러리 | 상태 | 탐지 우회율 | 비고 |
|-----------|------|----------|------|
| `puppeteer-extra-plugin-stealth` | 오래됨 | **낮음** (Cloudflare 탐지됨) | 단독 사용 **비권장** |
| `playwright-extra` + stealth | 오래됨 | **낮음** | 위와 동일 |
| **`patchright`** | 활발 | **높음** | Playwright 바이너리 직접 패치, 권장 |
| **`rebrowser-patches`** | 활발 | **높음** | Playwright/Puppeteer 소스 패치 |
| `camoufox` | 활발 | **매우 높음** | Firefox 기반, Chromium 계열 사이트에 부적합할 수 있음 |

### 4.2 티어별 라이브러리

| 티어 | 라이브러리 | 이유 |
|------|-----------|------|
| T0 (Serebii) | `ky` | 정적 HTML, 스텔스 불필요 |
| T1 (PokopiaGuide) | `playwright` (순정) + **`fingerprint-injector` + `fingerprint-generator`** | 중간 anti-bot, 과잉 스텔스 금지하되 canvas/audio/fonts 일관성 필수 (§9.1.1) |
| T2 (pokopoko) | `patchright` (Node 포트) | 403 돌파 필요. canvas/audio/fonts는 patchright 내장 처리 |
| T3 (namu.wiki) | `patchright` + CF challenge 대기 | Cloudflare Turnstile, 성공 보장 없음 |

**비권장:** puppeteer-extra-plugin-stealth는 쓰지 않음 (탐지 신호).

### 4.3 patchright 사전 검증 (★ v3 필수)

2026년 시점 `patchright` Node.js 포트의 활성도를 **반드시 사전 확인**. Python 포크와 달리 Node 포트는 유지 관리가 덜 활발할 수 있음.

```bash
pnpm add -D patchright
pnpm run check:patchright
```

검증 체크리스트:
- [ ] `patchright/chromium` import 성공
- [ ] `bot.sannysoft.com` 전체 초록
- [ ] `nowsecure.nl` Cloudflare Turnstile 통과 (T3 사용 시)
- [ ] 최근 6개월 내 릴리스 존재 (npmjs.com 확인)
- [ ] 실제 대상 사이트(pokopoko, namu.wiki) 샘플 접근

**실패 시:**
- T3(namu.wiki) 실패 → 즉시 namu.wiki 수동 번역으로 전환
- T2(pokopoko) 실패 → PokopiaGuide 커버리지에만 의존
- **우회 시도 금지.** 시간/체력 낭비 + 탐지 위험만 증가.

```typescript
// 티어별 import
import { chromium as playwrightChromium } from 'playwright'       // T1
import { chromium as patchrightChromium } from 'patchright'       // T2, T3
// T0는 import 불필요 (ky 사용)
```

---

## 5. 프로필 & 페르소나 시스템

### 5.1 페르소나 정의 (v3 축소)

**핵심 변경:** v2의 4개 페르소나는 같은 공인 IP + 같은 Mac 핑거프린트 때문에 **통계적으로 한 유저로 묶임** → 페르소나 격리 효과 없이 관리 비용만 증가.

v3는 **2개로 축소**하고 **시간 분리**로 격리한다.

```typescript
interface BrowserPersona {
  id: string
  profilePath: string                 // 완전 격리된 디렉토리
  fingerprint: ProfileFingerprint     // 한 번 생성 후 평생 고정
  createdAt: Date
  usedFor: Source[]                   // 이 페르소나를 쓰는 소스
  lastUsed: Date
  healthScore: number                 // 0~100, 탐지 신호 발생 시 감소
  warmedUp: boolean                   // 워밍 완료 여부
  activeHours: { start: number, end: number }  // 시간 분리용
}

// T0 (Serebii)는 페르소나 불필요. ky로 직접 HTTP 요청.

const PERSONAS: BrowserPersona[] = [
  {
    // T1 + T2 공유. 한국어 유저 한 명이 여러 한국 Pokopia 사이트 본다는 시나리오.
    id: 'korean-pokemon-fan',
    profilePath: 'data/browser-profiles/korean-pokemon-fan',
    fingerprint: { locale: 'ko-KR', timezone: 'Asia/Seoul', /* ... */ },
    usedFor: ['pokopiaGuide', 'pokopoko'],
    activeHours: { start: 8, end: 14 },    // 오전~점심
  },
  {
    // T3 전용. Cloudflare 방어 대응 + CF 쿠키 보존 위해 분리.
    id: 'namuwiki-researcher',
    profilePath: 'data/browser-profiles/namuwiki-researcher',
    fingerprint: { locale: 'ko-KR', timezone: 'Asia/Seoul', /* ... */ },
    usedFor: ['namuwiki'],
    activeHours: { start: 19, end: 23 },   // 저녁
  },
]
```

**시간 분리 규칙:**
- 두 페르소나는 `activeHours`가 **겹치지 않음** → 같은 IP에서 두 페르소나가 동시에 활동하는 상황 방지
- `PersonaManager`가 현재 시각에 해당하는 페르소나만 활성화
- T1(PokopiaGuide)와 T2(pokopoko)는 같은 페르소나가 처리하되, 같은 세션 안에서 왕복 금지 (세션 하나에 한 사이트만)

### 5.2 프로필 경로 격리

**중요:** 유저의 실제 Chrome 프로필과 절대 섞이면 안 됨.

```typescript
// 위험: 유저 Chrome 프로필 공유 가능
const context = await chromium.launchPersistentContext(
  '~/Library/Application Support/Google/Chrome',
  { channel: 'chrome' }
)

// 안전: 프로젝트 내 격리 경로
const context = await chromium.launchPersistentContext(
  path.resolve('data/browser-profiles/korean-pokemon-fan'),
  {
    channel: 'chrome',
    headless: false,
  }
)
```

**시작 시 체크:**
- 유저 Chrome이 실행 중이면 경고 (profile lock 충돌 가능)
- 프로필 경로가 절대 `~/Library/` 또는 `~/Application Support/Google/` 하위가 아닌지 검증

### 5.3 핑거프린트 고정 (정체성 vs 버전 특성 분리)

**핵심:** 핑거프린트를 **두 범주**로 분리 관리한다. 이 구분 없이 "평생 고정"만 외치면 §9.2 Chrome 자동 업데이트와 충돌한다. 실유저도 Chrome을 업데이트하므로, **업데이트를 안 따라가는 쪽이 오히려 봇 시그널**.

| 범주 | 생명주기 | 포함 필드 | 저장 위치 |
|------|---------|----------|---------|
| **정체성 — 하드웨어 결정형** | 프로필 생성 시 1회 랜덤화 → **평생 고정** | `platform`, `hardwareConcurrency`, `deviceMemory`, `screen`, `viewport`, `deviceScaleFactor`, `webgl.{vendor,renderer}`, `timezone`, `locale`, `languages` | 페르소나 TS 상수 + 프로필 디렉토리의 `persona.json` |
| **정체성 — canvas/audio/fonts seed** | `FingerprintGenerator` 1회 생성 → **평생 고정** (v3.2: 아래 A3 정리) | `canvas`, `audio`, `fonts` noise seed, `screen` 분포 기반 값, UA 템플릿 | `<profilePath>/fingerprint.json` (§9.1.1) |
| **버전 특성** (소프트웨어) | **세션 시작마다 Chrome 버전에서 파생 재계산** | `userAgent`, `Sec-Ch-Ua`, `Sec-Ch-Ua-Full-Version-List`, `Sec-Ch-Ua-Mobile`, `Sec-Ch-Ua-Platform`, `navigator.userAgentData.brands`, 고엔트로피 값 | 런타임 계산 (영속 X) |

**A3 (v3.2) 정리 — canvas/audio/fonts는 `ProfileFingerprint`에 포함하지 않는다:**
- v3.1까지 `canvasSeed`, `audioSeed`, `fonts`를 `ProfileFingerprint`에 넣었으나 §9.1.1 `attachFingerprint`가 이 필드를 덮어쓰지 않아 **dead field**였다.
- v3.2부터 canvas/audio/fonts seed는 **`fingerprint-generator`가 단 1회 생성해 `<profilePath>/fingerprint.json`에 영속**한다. 페르소나 수명 동안 같은 파일을 로드 → **실질적 평생 고정**.
- `ProfileFingerprint`는 "하드웨어 결정형" 정체성만 담는다. 두 파일은 각자 영속되고 §9.1.1 `attachFingerprint`에서 합쳐 주입.

```typescript
interface ProfileFingerprint {
  // ── 하드웨어 결정형 정체성 (평생 고정, persona.json에 직렬화) ─────
  platform: 'MacIntel'
  hardwareConcurrency: number          // M4 = 10
  deviceMemory: 16
  screen: { width, height, availHeight, availWidth }
  viewport: { width, height }
  deviceScaleFactor: 2
  webgl: { vendor: 'Apple Inc.', renderer: 'Apple M4' }
  timezone: 'Asia/Seoul'
  locale: 'ko-KR' | 'en-US'
  languages: string[]

  // ── canvas/audio/fonts는 <profilePath>/fingerprint.json이 출처. §9.1.1 참조. ──
  // ── 버전 특성: 직렬화하지 않음. 런타임에 getSystemChromeVersion()에서 파생. ──
}

// 세션 시작 훅에서 두 번에 나눠 주입
await injectIdentityFingerprint(page, persona.fingerprint)
await injectVersionFingerprint(page, await detectChromeVersion())
```

**드리프트 정책:** 세션 시작 시 Chrome 메이저 버전이 이전 세션과 다르면 `data/logs/events.jsonl`에 `chrome.version_bump`만 기록하고 **세션 그대로 계속**. 쿠키/히스토리/페르소나 상태 모두 유지. 실유저가 업데이트 후 접속하는 시나리오와 동일 → 탐지기 관점에서 정상.

### 5.4 프로필 워밍 (Phase -2)

새 프로필은 즉시 스크래핑하면 탐지됨. 사전 예열 필수.

**⚠️ v2 금지 항목 (v3에서 제거):**
- ~~Chrome `Bookmarks` 파일 직접 편집~~ → 포맷 변경 시 프로필 손상 위험
- ~~LevelDB/SQLite localStorage 직접 편집~~ → **DB corruption 거의 확실**
- 이 두 조작은 **Chrome이 실행 중일 때만** 안전하며, 그마저도 CDP API 필요

**v3 원칙: Chrome을 실제로 띄워서 브라우저 API로만 조작.** 파일 직접 편집 금지.

```typescript
// patchright(T2/T3) 또는 playwright(T1) 중 적절한 것을 선택
async function warmUpProfile(persona: BrowserPersona, chromium: BrowserType) {
  const context = await chromium.launchPersistentContext(persona.profilePath, {
    channel: 'chrome',
    headless: false,   // 워밍은 반드시 head-ful
    locale: persona.fingerprint.locale,
    timezoneId: persona.fingerprint.timezone,
    viewport: persona.fingerprint.viewport,
  })
  const page = await context.newPage()

  // 1. 북마크: Chrome DevTools Protocol 또는 수동 Ctrl+D 에뮬레이션
  //    간단하게는: 북마크 주입을 포기하고, 대신 history를 자연스럽게 쌓기만 함
  //    (실제 탐지기는 북마크 접근 못함. history/cookies만 관찰 가능)

  // 2. localStorage는 해당 사이트 방문 후 page.evaluate로만 주입
  //    파일 직접 편집 절대 금지
  const commonSites = [
    { url: 'https://www.naver.com', dwellMs: [20000, 60000] },
    { url: 'https://www.youtube.com', dwellMs: [30000, 90000] },
    { url: 'https://news.naver.com', dwellMs: [15000, 45000] },
  ]

  for (const { url, dwellMs } of commonSites) {
    await page.goto(url)
    await page.waitForLoadState('domcontentloaded')
    await humanDwell(...dwellMs)
    await humanScroll(page, 'partial')
    // 필요 시 해당 사이트 도메인에서 localStorage 설정 (API 경유)
    // await page.evaluate(() => localStorage.setItem('theme', 'light'))
  }

  // 3. 타겟 도메인 홈만 방문 (스크래핑 대상 페이지 X)
  const warmupTargets = {
    'korean-pokemon-fan': ['https://www.pokopiaguide.com/ko/'],
    'namuwiki-researcher': ['https://namu.wiki/w/%EB%8C%80%EB%AC%B8'],
  }
  for (const url of warmupTargets[persona.id] ?? []) {
    await page.goto(url)
    await humanDwell(10000, 30000)
  }

  await context.close()  // persistent context가 쿠키/localStorage 자동 저장
  persona.warmedUp = true
}
```

**리퍼러 전략:**
- ~~Google 검색 → 타겟~~ 비추천 (Google 자체 anti-bot + reCAPTCHA 위험)
- **북마크/주소창 직접 입력** 시뮬레이션 (referrer 없음, 자연스러움)
- **Naver 검색** 경유 가능 (한국 페르소나, Google보다 덜 엄격)

**워밍 기간 단축 (v3):**
- v2의 2~3일은 과함. 실측 근거 없음.
- v3: **1일 3세션 × 20~40분** 이면 쿠키/history가 충분히 쌓임. 증거 기반으로 추후 조정.

### 5.5 브라우저 Context 수명 (★ v3.2 공백 보완)

Playwright/patchright 의 `BrowserContext`는 장시간 유지하면 메모리 증가·탭 누수·crashpad 리소스 누적 이슈가 알려져 있다.

| 항목 | 정책 |
|------|-----|
| **Context 생명주기** | **세션당 1개**. 세션 종료 시 `context.close()` + Node 프로세스가 살아있어도 **다음 세션은 새 context**. |
| **BrowserServer(launchPersistentContext) 재사용** | 금지. `launchPersistentContext` 는 매번 새로 호출해 프로필 디렉토리만 재사용하고 브라우저 프로세스는 교체. |
| **Page 수** | 한 세션 내 동시 Page 1~2개(탭 전환 시뮬레이션 제외). 10개 이상 누적되면 `context.close()`. |
| **장기 crawl (T1 15일 시나리오)** | 세션 종료 시마다 context/Browser 프로세스까지 정리 → 다음 세션이 새 Playwright 드라이버로 시작. Chrome 업데이트 자동 반영되는 부수 효과. |
| **메모리 지표 수집** | `session.end` 시 `process.memoryUsage()` 를 `events.jsonl` 에 기록. rss 2GB 초과 시 `warn` 알림. |

---

## 6. 시간 전략 (Circadian Scheduling)

### 6.1 활동 시간대

24시간 내내 스크래핑하는 유저는 없음. 사람은 낮에만 활동.

```typescript
// ★ v3.2: 사용하지 않던 peakHours/weekendBoost/requestsPerSession 제거.
// - peakHours/weekendBoost는 구현 참조 없음 → dead config 삭제.
// - requestsPerSession은 §14.3 RateLimitConfig.navigation.maxPerSession과 이중 정의였다.
//   동일 소스에 두 개의 상이한 범위가 존재해 혼동 유발 → §14.3을 SSoT로 일원화.
const CIRCADIAN = {
  activeHours: { start: 8, end: 23 },

  sessions: {
    minPerDay: 2, maxPerDay: 5,
    durationMin: 15, durationMax: 45,
    interSessionMinHours: 1,
    interSessionMaxHours: 4,
  },
  // 세션당 네비게이션 수 제한은 §14.3 RateLimitConfig를 따른다 (소스별 차등).
}
```

**`interSessionMinHours`/`interSessionMaxHours` 정의 (★ v3.1 명확화):** 이 값은 **같은 소스의 다음 세션까지** 간격이다. 다른 소스로 전환하는 경우는 §6.4 동시성 규칙을 따른다 (별도 최소 30분 gap 등).

### 6.2 세션 구조

```
하루 예시 (Serebii, 1일차):
  09:30~10:00 (30분):  홈 → 포켓몬 목록 → 상세 5개
  13:15~13:35 (20분):  점심 시간대, 아이템 일부
  20:40~21:20 (40분):  저녁 시간대, 서식지 집중

세션 간 휴식: 1~4시간 (실제 사람처럼 다른 일)
```

### 6.3 주간 분산

```
1주차: Serebii (영문 데이터) — 2~3일
2주차: PokopiaGuide (한국어 매핑) — 3~4일
3주차: pokopoko/namu.wiki (가능 시) — 4~7일

총 2~3주에 걸친 스크래핑
```

### 6.4 동시성 규칙 (★ v3.1 신규)

같은 Mac/IP에서 여러 세션이 겹칠 때의 정책. §5.1 페르소나 시간 분리 + §6.1 세션 간격만으로는 미정이었던 세 질문을 해소:
(1) T0(ky) 실행 중 T1+(Playwright) 세션 시작 가능? (2) 같은 페르소나가 두 소스 병행? (3) 서로 다른 소스 세션 전환 gap은?

#### 6.4.1 허용/금지 매트릭스

| 시나리오 | 허용 | 조건 |
|---------|------|-----|
| 같은 소스, 두 세션 동시 | ❌ | `SessionManager`에서 강제 거부 (명백한 탐지 시그널) |
| 같은 페르소나 + 다른 소스 (T1↔T2) | ⚠️ 직렬화 | 이전 세션 **완전 종료** + **2시간 gap** 후 시작 |
| 다른 페르소나 동시 활성 | ❌ | `activeHours` 비겹침(§5.1)으로 구조적 방지. 스케줄러가 현재 시각에 맞는 페르소나만 활성화 |
| T0(ky) ↔ T1+(Playwright) 동시 | ✅ 제한적 | ① 서로 **다른 소스** ② T1+ 세션 시작 시점에 T0 요청이 있었다면 **5분 idle 후** T1+ 시작 (스태거) ③ T1+ 활성 구간 동안 T0 rate **50% 감속** |
| T0 단독 연속 실행 | ✅ | 제약 없음. Serebii 집중 작업 권장 (1일 내 완료) |

#### 6.4.2 소스 전환 gap

다른 소스로 넘어가는 경우 **최소 30분 gap**이 필요하다 (컨텍스트 스위치 비용 + 패턴 방어):

```
예:
  09:30~10:00 Serebii T0 실행
  10:00~10:30 (최소 30분 gap — 이 시간엔 세션 없음)
  10:30~11:10 PokopiaGuide T1 세션 시작 가능
```

T1→T2 전환은 2시간(§6.4.1), T1→T0(다른 소스) 전환은 30분으로 차등.

#### 6.4.3 구현 — `ConcurrencyGuard`

모든 `SessionManager.start()` 호출 전에 이 가드를 통과해야 한다.

**A4 (v3.2) — 레이스/크래시 복구 강화:**
- 파일 락(`proper-lockfile`)으로 `canStart` → `register`를 **원자적으로** 묶는다.
- `ActiveSession`에 `pid`/`hostname` 추가 → **stale 판별**에 `process.kill(pid, 0)` + hostname 일치 검사 사용.
- "부팅 훅이 전체 소거"는 폐기. **살아있는 항목은 보존**하고 dead 항목만 제거한다.
- 타 페르소나 활성 감지는 스케줄러 버그이므로 `critical` 알림 발행.

```typescript
// src/scheduler/concurrency-guard.ts
import fs from 'node:fs/promises'
import os from 'node:os'
import lockfile from 'proper-lockfile'
import { notifyUser } from '@/notifier'
import type { SourceSite as Source } from '@/validators/schemas'  // §27.1 SSoT

interface ActiveSession {
  source: Source
  tier: 0 | 1 | 2 | 3
  personaId?: string
  pid: number
  hostname: string
  startedAt: string
  lastRequestAt: string
}

const STATE_PATH = 'data/state/active-sessions.json'

function isAlive(s: ActiveSession): boolean {
  if (s.hostname !== os.hostname()) return true  // 다른 호스트 상태는 보존 (판단 불가)
  try { process.kill(s.pid, 0); return true }    // signal 0 = 존재 확인
  catch { return false }                          // ESRCH → 죽음
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  await fs.mkdir('data/state', { recursive: true })
  // lockfile.lock 은 대상 파일 존재 가정 → 없으면 빈 파일 생성
  try { await fs.access(STATE_PATH) } catch { await fs.writeFile(STATE_PATH, '[]') }
  const release = await lockfile.lock(STATE_PATH, { retries: { retries: 10, minTimeout: 100, maxTimeout: 1000 } })
  try { return await fn() } finally { await release() }
}

async function readReconciled(): Promise<{ live: ActiveSession[]; reaped: ActiveSession[] }> {
  const raw = await fs.readFile(STATE_PATH, 'utf8').catch(() => '[]')
  const active = JSON.parse(raw) as ActiveSession[]
  const live: ActiveSession[] = []
  const reaped: ActiveSession[] = []
  for (const s of active) (isAlive(s) ? live : reaped).push(s)
  if (reaped.length) await fs.writeFile(STATE_PATH, JSON.stringify(live, null, 2))
  return { live, reaped }
}

export class ConcurrencyGuard {
  /** 부팅 시 1회 호출: 죽은 엔트리만 제거, 살아있는 것은 보존. */
  async reconcileOnBoot(): Promise<void> {
    await withLock(async () => {
      const { reaped } = await readReconciled()
      for (const s of reaped) {
        await notifyUser('scraper.crashed', {
          source: s.source, personaId: s.personaId ?? null, pid: s.pid,
          startedAt: s.startedAt,
        })
      }
    })
  }

  async listActive(): Promise<ActiveSession[]> {
    return withLock(async () => (await readReconciled()).live)
  }

  /** canStart + register를 단일 크리티컬 섹션에서 수행. 레이스 원천 차단. */
  async acquire(args: {
    source: Source
    tier: 0 | 1 | 2 | 3
    persona?: BrowserPersona
  }): Promise<{ ok: true; session: ActiveSession } | { ok: false; reason: string; retryAfterMs?: number }> {
    return withLock(async () => {
      const { live: active } = await readReconciled()

      // Rule 1: 같은 소스 이미 활성
      if (active.some(s => s.source === args.source)) {
        return { ok: false, reason: 'same_source_active' } as const
      }
      // Rule 2: 같은 페르소나 이미 활성
      if (args.persona && active.some(s => s.personaId === args.persona!.id)) {
        return { ok: false, reason: 'same_persona_active' } as const
      }
      // Rule 3: 다른 페르소나 활성 — 스케줄러 버그로 간주, critical 알림
      if (args.persona && active.some(s => s.personaId && s.personaId !== args.persona!.id)) {
        await notifyUser('scheduler.persona_conflict' as any, {
          requested: args.persona.id,
          active: active.map(s => s.personaId).join(','),
        })
        return { ok: false, reason: 'persona_conflict' } as const
      }
      // Rule 4: T0 ↔ T1+ 스태거
      if (args.tier >= 1) {
        const t0 = active.find(s => s.tier === 0)
        if (t0) {
          const since = Date.now() - new Date(t0.lastRequestAt).getTime()
          const gap = 5 * 60 * 1000
          if (since < gap) return { ok: false, reason: 't0_t1_stagger', retryAfterMs: gap - since } as const
        }
      }

      const session: ActiveSession = {
        source: args.source,
        tier: args.tier,
        personaId: args.persona?.id,
        pid: process.pid,
        hostname: os.hostname(),
        startedAt: new Date().toISOString(),
        lastRequestAt: new Date().toISOString(),
      }
      const next = [...active, session]
      await fs.writeFile(STATE_PATH, JSON.stringify(next, null, 2))
      return { ok: true, session } as const
    })
  }

  async touchLastRequest(source: Source): Promise<void> {
    await withLock(async () => {
      const { live } = await readReconciled()
      const idx = live.findIndex(s => s.source === source && s.pid === process.pid)
      if (idx < 0) return
      live[idx].lastRequestAt = new Date().toISOString()
      await fs.writeFile(STATE_PATH, JSON.stringify(live, null, 2))
    })
  }

  async release(source: Source): Promise<void> {
    await withLock(async () => {
      const { live } = await readReconciled()
      const next = live.filter(s => !(s.source === source && s.pid === process.pid))
      await fs.writeFile(STATE_PATH, JSON.stringify(next, null, 2))
    })
  }
}
```

**부팅 순서:** `ConcurrencyGuard.reconcileOnBoot()` → (죽은 세션만 `scraper.crashed` 알림) → 정상 진행. 살아있는 다른 Node 프로세스(동일 Mac에서 사용자가 수동으로 또 돌린 경우)는 건드리지 않음.

**의존성:** `pnpm add proper-lockfile`, `pnpm add -D @types/proper-lockfile`.

**T0 rate 50% 감속 (T1+ 활성 시):** `RateLimiter`가 `ConcurrencyGuard.listActive()`를 주기 조회해 T1+ 활성 여부 확인 → meanDelayMs × 2 적용. 구현 위치는 §14.3 RateLimiter.

---

## 7. 네비게이션 전략

### 7.1 자연스러운 경로

직접 URL 이동 금지. **반드시 링크 클릭으로 이동.**

```typescript
// 봇스러운 직접 URL 이동
await page.goto('https://serebii.net/pokemonpokopia/habitatdex/tallgrass.shtml')

// 사람다운 네비게이션
async function naturalNavigate(page: Page, targetPath: string[]) {
  // 1. 홈에서 시작
  await page.goto('https://www.serebii.net/pokemonpokopia/')
  await humanDwell(3000, 8000)
  await humanScroll(page, 'partial')
  
  // 2. 메뉴 링크 찾아 클릭
  const menuLink = await page.locator('a:has-text("Habitats")').first()
  await humanClick(page, menuLink)
  await page.waitForLoadState('networkidle')
  await humanDwell(5000, 12000)
  
  // 3. 목록에서 타겟 링크 찾기
  await humanScroll(page, 'read-through')
  const targetLink = await page.locator(`a[href$="${targetPath[0]}"]`)
  await targetLink.scrollIntoViewIfNeeded()
  await humanDwell(500, 1500)
  await humanClick(page, targetLink)
}
```

### 7.2 사람 클릭 (Bezier 곡선 + 요소 내 랜덤 위치)

**v2 한계:** `page.mouse.move(x, y)` 단일 호출은 **두 점 사이 직선 텔레포트**. 실제 사람 마우스는 수십~수백 개의 중간 좌표를 거친다. 탐지기의 쉬운 타겟.

**v3: `ghost-cursor-playwright` 사용.** Bezier 곡선 기반 궤적 + 과샘플(overshoot) + 손 떨림 시뮬레이션.

```bash
pnpm add ghost-cursor-playwright
```

```typescript
import { createCursor, installMouseHelper } from 'ghost-cursor-playwright'

// Box-Muller 변환 기반 가우시안 난수 (ghost-cursor 보조용)
function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + z * stddev
}

async function humanClick(page: Page, locator: Locator) {
  const cursor = createCursor(page)
  const box = await locator.boundingBox()
  if (!box) return

  // 요소 내 가우시안 분포 위치 (중심 편향)
  const offsetX = gaussianRandom(box.width / 2, box.width / 6)
  const offsetY = gaussianRandom(box.height / 2, box.height / 6)
  const x = box.x + Math.max(5, Math.min(box.width - 5, offsetX))
  const y = box.y + Math.max(5, Math.min(box.height - 5, offsetY))

  // ghost-cursor가 Bezier 궤적 자동 생성 + 호버 + 클릭
  await cursor.moveTo({ x, y })
  await sleep(50 + Math.random() * 200)   // 호버 지연
  await cursor.click({ x, y })
}
```

**개발 보조:** `installMouseHelper(page)` 호출하면 헤드풀 모드에서 실제 궤적이 시각화됨. 디버깅에 유용.

### 7.3 뒤로 가기 / 탭 전환

```typescript
// 상세 페이지 방문 후 80% 확률로 목록으로 돌아가기
if (Math.random() < 0.8) {
  await page.goBack()
  await humanDwell(2000, 5000)
}

// 10% 확률로 탭 전환 시뮬레이션 (visibility change)
// ★ v3.1 버그 수정: value 속성 대신 getter를 정의. 일부 탐지기는 getter 존재 여부로 위조를 감지.
//   document.hidden과 document.hasFocus()도 함께 덮어씀 (일관성 유지).
// ★ v3.2 남은 탐지 벡터 주의: 아래 getter는 `.toString()` 결과가
//   "function get() { [native code] }" 이 아님 → 탐지기가 `Object.getOwnPropertyDescriptor(...)
//   .get.toString()` 로 검사하면 JS 함수임이 드러난다. 운영 중 이 벡터로 탐지되면
//   `Function.prototype.toString` 을 프록시로 감싸 native 문자열을 반환하도록 보강.
//   (T0 Serebii에는 브라우저 자체가 없어 해당 없음. T1은 fingerprint-injector가 여러 getter를
//    native-like 로 처리. T2/T3는 patchright 위임이라 우선순위는 낮다.)
if (Math.random() < 0.1) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    })
    ;(document as any).__origHasFocus ??= document.hasFocus.bind(document)
    document.hasFocus = () => false
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('blur'))
  })
  await sleep(5000 + Math.random() * 30000)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    })
    document.hasFocus = (document as any).__origHasFocus ?? (() => true)
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
}
```

### 7.4 서식지 209개 청크 처리

한 세션에 전부 방문 금지. 여러 세션에 분산.

```
세션 1 (Day 1 오전, 30분): 서식지 목록 방문 → 서식지 1~20 둘러보기 (뒤로 가기 활용)
세션 2 (Day 1 저녁, 40분): 서식지 21~50
세션 3 (Day 2 오전): 51~80
세션 4 (Day 2 저녁): 81~120
세션 5 (Day 3 오전): 121~160
세션 6 (Day 3 저녁): 161~209
```

---

## 8. 행동 시뮬레이션

### 8.1 비선형 스크롤

```typescript
async function humanScroll(page: Page, style: 'partial' | 'read-through' | 'skim') {
  await page.evaluate(async (style) => {
    if (style === 'skim') {
      // 훑어보기: 빠른 스크롤
      for (let i = 0; i < 3; i++) {
        window.scrollBy({ top: 400 + Math.random() * 300, behavior: 'smooth' })
        await new Promise(r => setTimeout(r, 300 + Math.random() * 500))
      }
    } else if (style === 'read-through') {
      // 읽기: 느린 스크롤
      for (let i = 0; i < 5; i++) {
        window.scrollBy({ top: 100 + Math.random() * 100, behavior: 'smooth' })
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000))
      }
      // 30% 확률로 뒤로 스크롤
      if (Math.random() < 0.3) {
        window.scrollBy({ top: -200 - Math.random() * 300, behavior: 'smooth' })
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000))
      }
    }
  }, style)
}
```

### 8.2 콘텐츠 길이 기반 체류 시간

```typescript
async function dwellByContent(page: Page) {
  const contentLength = await page.evaluate(() => document.body.innerText.length)
  const readingTimeMs = Math.min(60000, Math.max(5000, contentLength * 15))
  const actualMs = readingTimeMs * (0.5 + Math.random())
  await sleep(actualMs)
}
```

### 8.3 기타 인간 행동

| 행동 | 확률 | 설명 |
|------|-----|------|
| 요소 호버 | 40% | 링크나 이미지 위에 마우스 올리기 |
| 텍스트 선택 | 15% | 읽다가 복사하려는 듯 선택 |
| Cmd+F 검색 | 5% | 특정 단어 찾기 |
| 탭 전환 | 10% | 다른 탭 갔다 옴 (visibility 변경) |
| 긴 휴식 | 10% | 10~30초 아무것도 안 함 |
| 뒤로 가기 | 80% | 상세 → 목록 복귀 |

---

## 9. 핑거프린트 일관성

### 9.1 주입 항목 (v3.1: 티어별 정책 + canvas/audio/fonts 실구현)

**정책 요약:**

| 티어 | 주입 방법 |
|------|---------|
| T0 (ky) | 해당 없음 (브라우저 없음) |
| T1 (playwright 순정) | **`fingerprint-injector` + `fingerprint-generator`** (Apify) — 페르소나 seed 기반 canvas/audio/fonts 일관 주입 |
| T2/T3 (patchright) | **patchright 내장 패치에 위임.** canvas/audio/fonts 수동 주입 금지 (이중 패치 = 탐지 시그널) |
| 공통 (T1/T2/T3) | WebGL1 + **WebGL2** vendor/renderer 보강 (페르소나 일관성) |

#### 9.1.1 T1: fingerprint-injector 통합

`fingerprint-generator`는 실제 브라우저 프로필 분포에서 샘플링해 **일관된** 핑거프린트를 만든다. 페르소나 프로필 디렉토리에 한 번 저장 후 모든 세션에서 재사용.

```typescript
// src/fingerprint/inject.ts  (T1 전용)
import { FingerprintGenerator } from 'fingerprint-generator'
import { FingerprintInjector } from 'fingerprint-injector'
import type { BrowserContext } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const fpGenerator = new FingerprintGenerator()
const fpInjector = new FingerprintInjector()

export async function getOrCreateFingerprint(persona: BrowserPersona) {
  const fpPath = path.join(persona.profilePath, 'fingerprint.json')
  const existing = await fs
    .readFile(fpPath, 'utf8')
    .then(JSON.parse)
    .catch(() => null)
  if (existing) return existing

  // ★ v3.2 B4 수정: minVersion 하드코딩 금지. 현재 시스템 Chrome 기준으로 동적 계산해야
  // 시간이 지나도 구형 프로필만 샘플링되는 문제를 방지.
  const chromeNow = await detectChromeVersion()          // §9.2
  const minMajor = Math.max(120, chromeNow.major - 4)    // 최근 4 메이저 내 샘플링

  const generated = fpGenerator.getFingerprint({
    devices: ['desktop'],
    operatingSystems: ['macos'],
    browsers: [{ name: 'chrome', minVersion: minMajor }],
    locales: [persona.fingerprint.locale],
  })

  // 정체성 필드는 §5.3에서 고정된 페르소나 값으로 덮어씀
  // canvas/audio/fonts seed는 fingerprint-generator 생성값 그대로 (페르소나 수명 동안 일관)
  Object.assign(generated.fingerprint.screen, persona.fingerprint.screen)
  generated.fingerprint.navigator.hardwareConcurrency = persona.fingerprint.hardwareConcurrency
  generated.fingerprint.navigator.deviceMemory = persona.fingerprint.deviceMemory
  generated.fingerprint.navigator.platform = persona.fingerprint.platform
  generated.fingerprint.navigator.language = persona.fingerprint.locale
  generated.fingerprint.navigator.languages = persona.fingerprint.languages

  await fs.writeFile(fpPath, JSON.stringify(generated, null, 2))
  return generated
}

export async function attachFingerprint(
  context: BrowserContext,
  persona: BrowserPersona,
) {
  const fp = await getOrCreateFingerprint(persona)
  await fpInjector.attachFingerprintToPlaywright(context, fp)
}
```

**사용 (T1 세션 진입):**

```typescript
const context = await chromium.launchPersistentContext(persona.profilePath, {
  channel: 'chrome',
  headless: false,
  locale: persona.fingerprint.locale,
  timezoneId: persona.fingerprint.timezone,
})
await attachFingerprint(context, persona)                // canvas/audio/fonts 일관 주입
await injectVersionFingerprint(context, await detectChromeVersion())  // §9.2
```

#### 9.1.2 T2/T3: patchright 위임 + WebGL 조건부 보강

patchright는 내부적으로 canvas/audio/fonts noise를 자체 처리한다. `fingerprint-injector`를 함께 적용하면 **이중 패치**가 발생해 오히려 탐지 벡터가 늘어난다.

**B1 (v3.2) — patchright WebGL 중복 여부를 Phase -1에서 측정한 뒤 분기:**
- patchright 자체가 `UNMASKED_VENDOR/RENDERER_WEBGL`을 이미 위조하고 있으면 본 코드가 **또 덮어쓰는 이중 패치**가 된다.
- `check:patchright` 단계에서 `getParameter(37445/37446)`의 기본 반환값이 실 하드웨어와 다른지 검사하여 `data/preflight/patchright-webgl.json`에 기록한다.
- **결과별 동작:** `{ overridesWebgl: true }` → 본 코드 적용하지 않음. `{ overridesWebgl: false }` → 페르소나 값으로 보강.

```typescript
// src/fingerprint/patchright-webgl.ts  (T2/T3)
import fs from 'node:fs/promises'
import type { BrowserContext } from 'patchright'

async function readPatchrightProbe() {
  return JSON.parse(
    await fs.readFile('data/preflight/patchright-webgl.json', 'utf8')
  ) as { overridesWebgl: boolean }
}

export async function maybeReinforceWebgl(context: BrowserContext, persona: BrowserPersona) {
  const probe = await readPatchrightProbe().catch(() => ({ overridesWebgl: true }))
  if (probe.overridesWebgl) return  // 이중 패치 방지

  await context.addInitScript((fp) => {
    const patch = (Ctor: any) => {
      if (typeof Ctor === 'undefined') return
      const orig = Ctor.prototype.getParameter
      Ctor.prototype.getParameter = function (p: number) {
        if (p === 37445) return fp.webgl.vendor    // UNMASKED_VENDOR_WEBGL
        if (p === 37446) return fp.webgl.renderer  // UNMASKED_RENDERER_WEBGL
        return orig.call(this, p)
      }
    }
    patch((globalThis as any).WebGLRenderingContext)
    patch((globalThis as any).WebGL2RenderingContext)  // v3.1: 누락분 보완
  }, { webgl: persona.fingerprint.webgl })
}
```

**`check:patchright` probe 예:**

```typescript
// scripts/check-patchright.ts 내부
const ctx = await patchright.chromium.launchPersistentContext(/* tmp */)
const page = await ctx.newPage()
const probe = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl')!
  const dbg = (c.getExtension('WEBGL_debug_renderer_info') as any) ?? {}
  return {
    vendor: c.getParameter(dbg.UNMASKED_VENDOR_WEBGL ?? 37445),
    renderer: c.getParameter(dbg.UNMASKED_RENDERER_WEBGL ?? 37446),
  }
})
// 실 Apple M4라면 'Apple Inc.' / 'Apple M4' 계열. patchright가 바꿨다면 generic 값.
await fs.writeFile('data/preflight/patchright-webgl.json', JSON.stringify({
  overridesWebgl: !/Apple M/.test(String(probe.renderer)),
  probe,
}))
```

#### 9.1.3 라이선스

`fingerprint-injector`, `fingerprint-generator` — Apache 2.0 (Apify). 상업적 공개에도 문제 없음.

### 9.2 HTTP 헤더 정책 (v3.1 수정)

**⚠️ v2 치명적 결함:** 수동 헤더 주입(`Sec-Ch-Ua`, `User-Agent` 등)이 **실제 Chromium 엔진 버전과 불일치**하면 `Sec-Ch-Ua-Full-Version-List` mismatch 발생 → 명백한 봇 시그널.

**Chrome 자동 업데이트 정책 (★ v3.1):** §5.3 "정체성 vs 버전 특성 분리"를 전제로, Chrome 메이저 업데이트는 **자연 허용**. 파생 헤더는 **세션 시작마다** 재계산해 신 버전에 맞춘다. 자동 업데이트 suspend 같은 OS 레벨 조작은 하지 않음. "평생 고정"은 정체성 특성에만 해당.

**티어별 원칙:**

| 티어 | 헤더 처리 |
|------|----------|
| **T0 (ky)** | `User-Agent`만 수동 설정(세션 시작 시 Chrome 버전 동적 추출), 나머지는 ky/undici 기본값. |
| **T1/T2/T3 (Playwright/patchright)** | 헤더 **수동 주입 금지**. `channel: 'chrome'`으로 시스템 Chrome 사용 → Chromium 엔진이 자동 발행. |

```typescript
// T0 (ky) 최소 헤더
const T0_HEADERS = {
  'User-Agent': await getSystemChromeUserAgent(),  // 세션 시작마다 재계산
  'Accept-Language': 'en-US,en;q=0.9',
}

// T1+ (Playwright)
const context = await chromium.launchPersistentContext(profilePath, {
  channel: 'chrome',               // 시스템 Chrome 사용 → Sec-Ch-Ua 자동 동기화
  headless: false,
  locale: persona.fingerprint.locale,
  timezoneId: persona.fingerprint.timezone,
  // ❌ userAgent 수동 override 금지
  // ❌ extraHTTPHeaders 금지
})
```

**버전 재검출 주기 (★ v3.1):**

- **세션 시작마다** `detectChromeVersion()` 호출 → 직전 세션 저장값과 diff
- 메이저 버전 변동 시 `data/logs/events.jsonl`에 `chrome.version_bump` 기록 (Telegram 알림 불필요, 정상 상황)
- 세션 내에선 재검출하지 않음 (실유저는 런타임 중 브라우저를 바꾸지 않음)
- `data/state/chrome-version.json`에 `{ major, minor, patch, full, detectedAt }` 영속화

**시스템 Chrome 버전 동적 추출 + 세션 훅:**

```typescript
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
const execFileAsync = promisify(execFile)

// ★ v3.2 B3 수정: Chrome 공식 버전 체계는 MAJOR.MINOR.BUILD.PATCH 순서다.
// v3.1까지 3번째/4번째 필드를 patch/build 로 부여해 의미가 반전돼 있었음.
// `full` 문자열은 우연히 같지만 버전 비교 로직이 한 필드라도 쓰는 순간 틀어짐.
export interface ChromeVersion {
  major: number
  minor: number
  build: number    // 3rd segment (e.g., 7103)
  patch: number    // 4th segment (e.g., 93)
  full: string     // "136.0.7103.93"
}

export async function detectChromeVersion(): Promise<ChromeVersion> {
  const { stdout } = await execFileAsync(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--version'],
    { timeout: 5000 },
  )
  const m = stdout.match(/Chrome\s+(\d+)\.(\d+)\.(\d+)\.(\d+)/)
  if (!m) throw new Error(`Chrome 버전 파싱 실패: ${stdout}`)
  const [, major, minor, build, patch] = m.map(Number)
  return { major, minor, build, patch, full: `${major}.${minor}.${build}.${patch}` }
}

export async function getSystemChromeUserAgent(): Promise<string> {
  const v = await detectChromeVersion()
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v.full} Safari/537.36`
}

// 세션 시작 훅 — SessionManager.start()에서 호출
export async function onSessionStart(): Promise<{ version: ChromeVersion; bumped: boolean }> {
  const current = await detectChromeVersion()
  const statePath = 'data/state/chrome-version.json'
  await fs.mkdir('data/state', { recursive: true })
  const prev = await fs.readFile(statePath, 'utf8')
    .then(s => JSON.parse(s) as ChromeVersion)
    .catch(() => null)
  await fs.writeFile(statePath, JSON.stringify({ ...current, detectedAt: new Date().toISOString() }))
  const bumped = !!prev && prev.major !== current.major
  if (bumped) {
    await appendEventLog({ type: 'chrome.version_bump', from: prev!.full, to: current.full })
  }
  return { version: current, bumped }
}
```

**고엔트로피 값 주입 (addInitScript):**

```typescript
// 세션 시작 시 1회
// ★ v3.2 B5 수정:
// - defineProperty 서술자에 configurable/enumerable 명시 (네이티브 속성과 diff 최소화).
// - Function.prototype.toString.call(getter) 결과가 "[native code]" 로 보이도록 toString 위장.
// - 원본 getHighEntropyValues 도 toString 위장 유지.
await page.addInitScript(({ version }) => {
  if (!('userAgentData' in navigator)) return

  const native = Function.prototype.toString.call(isNaN)  // 네이티브 toString 패턴 샘플

  const makeNative = (fn: Function, name: string) => {
    Object.defineProperty(fn, 'name', { value: name, configurable: true })
    const str = native.replace('isNaN', name)
    Object.defineProperty(fn, 'toString', {
      configurable: true,
      writable: true,
      value: () => str,
    })
    return fn
  }

  const brands = [
    { brand: 'Chromium', version: String(version.major) },
    { brand: 'Google Chrome', version: String(version.major) },
    { brand: 'Not/A)Brand', version: '99' },
  ]
  const fullVersionList = brands.map(b => ({ brand: b.brand, version: version.full }))

  Object.defineProperty(navigator.userAgentData, 'brands', {
    configurable: true,
    enumerable: true,
    get: makeNative(function get brands() { return brands }, 'get brands'),
  })

  const origGet = (navigator.userAgentData as any).getHighEntropyValues.bind(navigator.userAgentData)
  const wrapped = async function getHighEntropyValues(hints: string[]) {
    const base = await origGet(hints)
    return { ...base, fullVersionList, uaFullVersion: version.full }
  }
  ;(navigator.userAgentData as any).getHighEntropyValues = makeNative(wrapped, 'getHighEntropyValues')
}, { version: await detectChromeVersion() })
```

### 9.3 네트워크 일관성 검증

스크래퍼 시작 시 IP 지리가 프로필 timezone/locale과 일치하는지 확인.

```typescript
async function verifyNetworkConsistency(persona: BrowserPersona) {
  const ipInfo = await ky('https://ipapi.co/json/').json<{ country_code, timezone }>()
  
  if (ipInfo.country_code !== 'KR') {
    throw new Error(`IP 불일치: ${ipInfo.country_code}, 페르소나는 KR`)
  }
  if (ipInfo.timezone !== persona.fingerprint.timezone) {
    throw new Error(`Timezone 불일치: IP=${ipInfo.timezone}, 페르소나=${persona.fingerprint.timezone}`)
  }
}
```

---

## 10. 자원 로딩 정책

### 10.1 원칙: 모든 것 로드

```typescript
// 봇스러운: 이미지/CSS/폰트 차단 (속도 최적화)
await page.route('**/*.{png,jpg,css,woff2}', route => route.abort())

// 사람다운: 기본 상태로 모든 자원 로드
// 특히 애널리틱스, 트래킹, CDN은 절대 차단 안 함
```

### 10.2 제한적 차단

```typescript
await page.route('**/*', (route) => {
  const url = route.request().url()
  
  // 대역폭 많이 먹는 비디오만 차단
  if (url.match(/\.(mp4|webm|mov|m3u8)$/i)) {
    return route.abort()
  }
  
  // 그 외 모두 허용 (GA, Facebook pixel, CDN 이미지, 광고 등)
  return route.continue()
})
```

**효과:** Google Analytics, 광고 네트워크 요청이 발생 → 실제 유저처럼 보임.

### 10.3 이미지 수집 (배치 금지)

1,100개 이미지 일괄 다운로드는 명백한 봇 패턴. **페이지 로드 시 브라우저가 자연스럽게 로드한 이미지를 캐시에서 추출.**

```typescript
// src/images/map-path.ts
// ★ v3.2 D1: mapUrlToStoragePath 에 경로 traversal/정규화 방어를 강제한다.
//   - 호스트 화이트리스트 + 경로에 ../ , 백슬래시, URL 인코딩 우회 차단
//   - 최종 경로가 반드시 IMAGE_ROOT 하위인지 realpath 비교
//   - 확장자는 허용 리스트만
import path from 'node:path'

const IMAGE_ROOT = path.resolve('data/images')
const ALLOWED_HOSTS = new Set([
  'www.serebii.net', 'serebii.net',
  'www.pokopiaguide.com', 'pokopiaguide.com',
])
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export function mapUrlToStoragePath(rawUrl: string): string | null {
  let u: URL
  try { u = new URL(rawUrl) } catch { return null }
  if (!ALLOWED_HOSTS.has(u.hostname)) return null

  // 인코딩 우회 차단: 디코드 후 ../ 또는 백슬래시 금지
  const decoded = decodeURIComponent(u.pathname)
  if (decoded.includes('..') || decoded.includes('\\') || decoded.includes('\0')) return null

  const ext = path.extname(decoded).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) return null

  // host/path 구조로 저장. path.join 후 경로 봉쇄 검증.
  const rel = path.posix.normalize(decoded).replace(/^\/+/, '')
  const abs = path.resolve(IMAGE_ROOT, u.hostname, rel)
  if (!abs.startsWith(IMAGE_ROOT + path.sep)) return null  // containment guard
  return abs
}

// Playwright 응답 리스너로 이미지 저장
page.on('response', async (response) => {
  const url = response.url()
  if (!/\.(png|jpe?g|webp)$/i.test(url) || response.status() !== 200) return
  const target = mapUrlToStoragePath(url)
  if (!target) return                                      // 화이트리스트 외/위험 경로 스킵
  try { await fs.access(target); return } catch {}        // 이미 있으면 덮어쓰지 않음
  await fs.mkdir(path.dirname(target), { recursive: true })
  const buffer = await response.body()
  await fs.writeFile(target, buffer)
})
```

---

## 11. 에러 반응

### 11.1 분류 및 대응

```typescript
// ★ v3.2 A1 수정: notifyUser 호출 시 이벤트 이름을 §13.3.2 EventType 과 정확히 일치시킨다.
// 직전 버전에서 'block' / 'cloudflare_timeout' / 'captcha' / 'soft_throttle' 로 약칭
// 사용 → EventType 키와 불일치해 SEVERITY_MAP 조회 실패(undefined) + TS 컴파일 실패.
enum ErrorType {
  BLOCK_403, RATE_LIMIT_429, TIMEOUT, CLOUDFLARE_CHALLENGE,
  CAPTCHA, SOFT_THROTTLE, UNKNOWN
}

async function reactToError(page: Page, type: ErrorType, session: Session) {
  switch (type) {
    case ErrorType.BLOCK_403:
    case ErrorType.RATE_LIMIT_429: {
      // ❌ v2: reload() + goBack() 반복 → 명백한 봇 시그널
      // ✅ v3: 사람은 403 보면 당황 → 잠시 멈춤 → 사이트를 떠남 (재시도 안 함)
      await humanDwell(2000, 5000)                // 잠깐 멈칫
      const eventType = type === ErrorType.BLOCK_403 ? 'block.403' : 'block.429'
      await notifyUser(eventType, {               // 즉시 알림 (high)
        source: session.source,
        url: page.url(),
      })
      await session.end({ reason: String(type) }) // 세션 즉시 종료
      // 해당 소스 cooldown 4시간 최소, 발생 빈도에 따라 지수 증가
      await applyCooldown(session.source, { baseMinutes: 240, factor: 2 })
      throw new SessionAbortError(String(type))   // 상위에서 다음 소스로 폴백
    }

    case ErrorType.TIMEOUT:
      // 타임아웃은 네트워크 일시 문제일 수 있음. 1회만 재시도.
      if (!session.alreadyRetriedThisPage) {
        session.alreadyRetriedThisPage = true
        await humanDwell(5000, 10000)
        await page.reload()
      } else {
        throw new SessionAbortError(String(type))
      }
      break

    case ErrorType.CLOUDFLARE_CHALLENGE:
      // challenge 자체는 봇이 아니어도 뜰 수 있음. 통과 대기만.
      await page.waitForFunction(
        () => !document.querySelector('#challenge-running, .cf-challenge-container'),
        { timeout: 60000 }
      ).catch(async () => {
        await notifyUser('cloudflare.challenge_timeout', { url: page.url() })
        throw new SessionAbortError(String(type))
      })
      break

    case ErrorType.CAPTCHA:
      await notifyUser('captcha.detected', {
        message: 'CAPTCHA detected, solve manually in the browser window',
        url: page.url(),
      })
      // headless: false 보장, 최대 5분 대기
      await page.waitForFunction(
        () => !document.querySelector('iframe[src*="captcha"], iframe[src*="turnstile"]'),
        { timeout: 300000 }
      ).catch(async () => {
        await notifyUser('captcha.unresolved', { url: page.url() })
        throw new SessionAbortError('CAPTCHA 미해결, 세션 중단')
      })
      break

    case ErrorType.SOFT_THROTTLE:
      // 점점 느려지는 패턴 — 세션 조기 종료가 안전
      await notifyUser('soft_throttle.detected', { source: session.source })
      await session.end({ reason: String(type) })
      await sleep(randBetween(60, 180) * 60 * 1000)  // 1~3시간 cooldown
      break
  }
}
```

**핵심 변화:**
1. **reload 금지** (CF challenge/timeout 1회만 예외)
2. 403/429는 **세션 즉시 종료** + 알림 + cooldown 자동 증가
3. 모든 에러 시 `notifyUser`가 Telegram/macOS로 알림 송신 (§13.3 참조)
4. 페이지별 재시도는 세션 내에서 1회로 제한 (`alreadyRetriedThisPage`)

### 11.1.1 Fetcher 계층 커스텀 에러 클래스 (★ v3.5 — Phase 4 SSoT)

위 `ErrorType` 이 "페이지에서 **관찰된 시그널**" 의 분류라면, 아래 5종은 `services/scraper/src/fetchers/errors.ts` 에서 `throw` 되는 **호출부 커스텀 에러** 다. 상위 `SessionManager` (Phase 5) 가 `instanceof` 로 분기해 cooldown/재시도 전략을 결정한다.

| 클래스 | 언제 throw | 호출부 권장 반응 |
|---|---|---|
| `SkippedByRobotsError` | `robots.txt` 가 URL 을 차단 (isAllowed=false 또는 undefined 는 보수적으로 false 취급) | 경고 로그 + 스킵, **재시도 금지** (§26.1 D4) |
| `SessionAbortError` | Cloudflare 60s 타임아웃 / 403 차단 감지 / patchright launch 실패 | 세션 즉시 종료 + cooldown (상단 `reactToError` 참조) |
| `RateLimitExceededError` | RateLimiter 일 한도 초과 (§14.3) — `kind: navigation \| direct` | 다음 회계일(UTC+9 자정) 까지 해당 소스 큐잉 해제 |
| `PersonaRequiredError` | T1~T3 생성 시 persona 주입 누락 (FetcherFactory 방어선) | **프로그래밍 오류** — 개발 단계 fail-fast (재시도 금지) |
| `CachePathTraversalError` | HtmlCache 경로 해시 결과가 `data/cache/<source>/` 외부로 해석 (§10.3 D1) | 보안 사고 — 로그 + Notifier high + 세션 종료 |

**설계 원칙:**

- `name` 을 문자열 리터럴로 `override` — `tsc verbatimModuleSyntax` + `isolatedModules` 환경에서 `instanceof` + `name` 양쪽 모두 신뢰.
- 에러 **코드** 와 §13.3.2 `EventType` 은 **분리**. Notifier 이벤트명은 여기 에러 클래스와 1:1 매핑되지 않으며, SessionManager 가 에러 종류를 관찰해 적절한 `EventType` 으로 변환해 `notify()` 한다.
- 위 5종은 `CacheStaleError` / `ChromeVersionUnavailable` 등 "가벼운 fallback 으로 처리 가능" 한 상황을 **에러로 모델링하지 않는 정책**. HtmlCache 는 손상 시 silent null, Chrome 버전은 `FALLBACK_VERSION` 으로 자동 복구한다.
- Fetcher 계층에서 throw 되는 에러는 전부 이 목록에 있어야 한다 — 이 목록에 없는 새 에러 클래스를 추가하면 본 §11.1.1 을 함께 갱신해 SSoT 드리프트를 막는다.

### 11.2 에러 에스컬레이션

```
1차 실패: 현재 세션 내 재시도 (지수 백오프)
2차 실패: 세션 종료 + 긴 휴식 (1~3시간)
3차 실패: 24시간 해당 소스 cooldown
4차 실패: 해당 소스 포기, 페일오버 소스로 대체
```

---

## 12. 자기 탐지 모니터링

### 12.1 탐지 신호 감시

```typescript
// ★ v3.2 A2 수정:
// - evidence/url/at 은 선택 필드로 완화 (호출부 다수가 누락 → TS 컴파일 실패).
// - 최소 evidence 는 helper 로 기본값 주입해 가독성 유지.
interface DetectionSignal {
  type: 'block' | 'challenge' | 'captcha' | 'rate_limit' | 'soft_block' | 'anomaly'
  severity: 'low' | 'medium' | 'high' | 'critical'
  evidence?: string
  url?: string
  at?: Date
}

async function detectBotFlags(page: Page, response: Response): Promise<DetectionSignal[]> {
  const signals: DetectionSignal[] = []
  const at = new Date()
  const url = page.url()
  const push = (s: Omit<DetectionSignal, 'at' | 'url'>) => signals.push({ at, url, ...s })

  // HTTP 상태
  if (response.status() === 403) push({ type: 'block', severity: 'high', evidence: 'http_403' })
  if (response.status() === 429) push({ type: 'rate_limit', severity: 'high', evidence: 'http_429' })

  // Cloudflare challenge
  const content = await page.content()
  if (content.includes('Just a moment...') ||
      content.includes('Checking your browser') ||
      content.includes('cf-challenge')) {
    push({ type: 'challenge', severity: 'high', evidence: 'cf_challenge_markup' })
  }

  // 비정상적으로 작은 응답
  const contentLengthHeader = response.headers()['content-length']
  const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : NaN
  if (Number.isFinite(contentLength) && contentLength < 500) {
    push({ type: 'soft_block', severity: 'medium', evidence: `content_length=${contentLength}` })
  }

  // 봇 차단 키워드
  const botKeywords = ['access denied', 'bot detected', 'automated traffic', 'suspicious activity']
  const lower = content.toLowerCase()
  for (const kw of botKeywords) {
    if (lower.includes(kw)) {
      push({ type: 'block', severity: 'critical', evidence: kw })
    }
  }

  // CAPTCHA
  if (content.includes('captcha') || content.includes('recaptcha') || content.includes('turnstile')) {
    push({ type: 'captcha', severity: 'critical', evidence: 'captcha_markup' })
  }

  return signals
}
```

### 12.2 소프트 Throttle 탐지

응답 시간이 점점 느려지는 패턴 감지.

```typescript
class SoftThrottleDetector {
  private times: number[] = []
  
  record(ms: number) {
    this.times.push(ms)
    if (this.times.length > 20) this.times.shift()
  }
  
  isThrottling(): boolean {
    if (this.times.length < 10) return false
    const recent5Avg = this.times.slice(-5).reduce((a, b) => a + b, 0) / 5
    const prev5Avg = this.times.slice(-10, -5).reduce((a, b) => a + b, 0) / 5
    return recent5Avg > prev5Avg * 2
  }
}
```

### 12.3 Health Score 시스템

각 페르소나의 health 추적.

```typescript
// 탐지 신호마다 감점
// critical: -50, high: -20, medium: -10, low: -5
// 자연 회복: 하루에 +10

if (persona.healthScore < 50) {
  // 해당 페르소나 2주 cooldown
  await cooldownPersona(persona, 14 * 24 * 60 * 60 * 1000)
}
if (persona.healthScore < 20) {
  // 해당 페르소나 폐기, 새 프로필 생성 필요
  await retirePersona(persona)
}
```

---

## 13. CAPTCHA, Challenge 및 알림 시스템

### 13.1 CAPTCHA 티어별 정책

| 소스 티어 | CAPTCHA 대응 |
|----------|-------------|
| **T0/T1** (Serebii, PokopiaGuide) | 세션 중단 + 72시간 해당 소스 cooldown + Telegram 알림 |
| **T2** (pokopoko) | 수동 개입 대기열 → Telegram 알림 → 유저가 브라우저 창에서 직접 풂 |
| **T3** (namu.wiki) | 2회 실패 시 수동 번역 대상으로 분류, 자동화 포기 |

### 13.2 자동 풀이 서비스 비사용

2captcha, Anti-Captcha 등은 사용하지 않음 (윤리 + 비용). Manual fallback으로 해결.

---

### 13.3 알림 시스템 (★ v3 신규)

스크래퍼는 사람이 24시간 지켜볼 수 없음. 2~3주 작업 중 **차단/CAPTCHA/세션 종료 등을 즉시 손에 쥐어야** 한다. Telegram 봇을 1차 채널, macOS 로컬 알림을 보조로 사용한다.

#### 13.3.1 설계 원칙

| 원칙 | 의미 |
|------|------|
| **Severity 기반 라우팅** | 모든 이벤트를 알리면 알림 피로. 중요도에 따라 채널/즉시성 분리 |
| **배칭** | 저빈도 이벤트는 즉시 전송, 고빈도 이벤트는 일정 주기로 집계 전송 |
| **Dedup** | 같은 이벤트 연속 발생 시 1회만 알림 (cooldown 내 중복 억제) |
| **페일세이프** | Telegram 다운 상황에서도 스크래퍼 본체는 계속 동작. 알림은 best-effort |
| **시크릿 안전** | 토큰/chat_id는 `.env`만. 커밋 금지. 부팅 시 존재 확인, 없으면 스크래퍼는 돌되 알림만 비활성 |
| **인젝션 차단** | AppleScript `display notification`에 사용자 입력 직접 삽입 금지. 외부 notifier 사용 |

#### 13.3.2 이벤트 분류

```typescript
// src/notifier/events.ts
export type EventSeverity = 'info' | 'warn' | 'high' | 'critical'

export type EventType =
  // 라이프사이클
  | 'scraper.start'
  | 'scraper.stop'
  | 'phase.start'
  | 'phase.complete'
  | 'session.start'
  | 'session.end'
  // 진행
  | 'milestone.progress'         // N% 도달
  | 'milestone.daily_summary'    // 하루 마감 요약
  // 경고
  | 'rate_limit.approaching'     // 하루 한도 80%
  | 'health.score_dropped'       // 페르소나 점수 -10 이상
  | 'soft_throttle.detected'
  // 차단/탐지
  | 'block.403'
  | 'block.429'
  | 'cloudflare.challenge_timeout'
  | 'captcha.detected'
  | 'captcha.unresolved'
  // 치명적
  | 'persona.retired'            // healthScore < 20
  | 'scraper.crashed'
  | 'network.inconsistency'      // IP/timezone 불일치
  | 'data.integrity_failure'     // Zod 검증 다수 실패
  // ★ v3.2 추가
  | 'scheduler.persona_conflict' // §6.4.3 ConcurrencyGuard Rule 3
  | 'chrome.version_bump'        // §9.2 세션 시작 시 메이저 변동
  | 'robots.changed'             // §26.1 robots.txt 재로드 시 해시 변경

export const SEVERITY_MAP: Record<EventType, EventSeverity> = {
  'scraper.start': 'info',
  'scraper.stop': 'info',
  'phase.start': 'info',
  'phase.complete': 'info',
  'session.start': 'info',
  'session.end': 'info',
  'milestone.progress': 'info',
  'milestone.daily_summary': 'info',
  'rate_limit.approaching': 'warn',
  'health.score_dropped': 'warn',
  'soft_throttle.detected': 'warn',
  'block.403': 'high',
  'block.429': 'high',
  'cloudflare.challenge_timeout': 'high',
  'captcha.detected': 'critical',
  'captcha.unresolved': 'critical',
  'persona.retired': 'critical',
  'scraper.crashed': 'critical',
  'network.inconsistency': 'critical',
  'data.integrity_failure': 'high',
  // ★ v3.2 추가
  'scheduler.persona_conflict': 'critical',
  'chrome.version_bump': 'info',
  'robots.changed': 'warn',
}
```

#### 13.3.3 Severity → 채널 라우팅

| Severity | Telegram | macOS 알림 | 즉시성 | 배칭 |
|----------|----------|-----------|-------|------|
| `info` | 모아서 (30분 주기) | ❌ | 지연 OK | 30분 배치 |
| `warn` | 모아서 (10분 주기) | ❌ | 10분 내 | 10분 배치 |
| `high` | 즉시 | ✅ | 즉시 | 없음 |
| `critical` | 즉시 + 알림음 | ✅ + sound | 즉시 | 없음, dedup도 약화 |

#### 13.3.4 토큰/시크릿 관리

`.env` (루트, `.gitignore` 필수):
```bash
TELEGRAM_BOT_TOKEN=1234567890:ABC...
TELEGRAM_CHAT_ID=123456789
# 선택: 복수 채팅방 (중요도별 분리)
TELEGRAM_CHAT_ID_CRITICAL=       # 비우면 TELEGRAM_CHAT_ID로 폴백
# 선택: 알림 전체 비활성 (실행 중 조용히 하고 싶을 때)
NOTIFICATIONS_ENABLED=true
```

`src/notifier/config.ts`:
```typescript
import 'dotenv/config'
import { z } from 'zod'

const ConfigSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/).optional(),
  TELEGRAM_CHAT_ID: z.string().regex(/^-?\d+$/).optional(),
  TELEGRAM_CHAT_ID_CRITICAL: z.string().regex(/^-?\d+$/).optional(),
  NOTIFICATIONS_ENABLED: z.enum(['true', 'false']).default('true'),
})

export const notifierConfig = (() => {
  const parsed = ConfigSchema.safeParse(process.env)
  if (!parsed.success) {
    console.warn('[notifier] 환경 변수 파싱 실패, 알림 비활성:', parsed.error.flatten())
    return { enabled: false } as const
  }
  const c = parsed.data
  return {
    enabled: c.NOTIFICATIONS_ENABLED === 'true' && !!c.TELEGRAM_BOT_TOKEN && !!c.TELEGRAM_CHAT_ID,
    token: c.TELEGRAM_BOT_TOKEN,
    chatId: c.TELEGRAM_CHAT_ID,
    criticalChatId: c.TELEGRAM_CHAT_ID_CRITICAL ?? c.TELEGRAM_CHAT_ID,
  } as const
})()
```

#### 13.3.5 구현 — `Notifier` 클래스

```typescript
// src/notifier/index.ts
import ky from 'ky'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { notifierConfig } from './config'
import { SEVERITY_MAP, type EventType } from './events'

const execFileAsync = promisify(execFile)

type EventPayload = Record<string, string | number | boolean | null>

interface QueuedEvent {
  type: EventType
  payload: EventPayload
  at: Date
}

// ★ v3.2 B6: dedup 상태를 디스크에 영속화해 스크래퍼 재시작 시 폭주 방지.
// ★ v3.2 B7: high/critical 송신을 fire-and-forget + 백그라운드 워커로 분리해 파이프라인 블로킹 제거.
const DEDUP_STATE_PATH = 'data/state/notifier-dedup.json'
const QUEUE_HIGH_MAX = 500  // 백프레셔: 큐가 이보다 크면 오래된 info/warn 부터 drop

export class Notifier {
  private queue: QueuedEvent[] = []
  private immediateQueue: QueuedEvent[] = []
  private lastSentAt: Partial<Record<EventType, number>> = {}
  private warnFlushTimer?: NodeJS.Timeout
  private infoFlushTimer?: NodeJS.Timeout
  private immediateWorker?: Promise<void>
  private stopping = false

  constructor(private config = notifierConfig) {
    if (!this.config.enabled) {
      console.warn('[notifier] 비활성 상태 — 알림 송신 없음')
      return
    }
    // dedup 상태 복구 (best-effort)
    this.loadDedup().catch(e => console.warn('[notifier] dedup 복구 실패:', e.message))
    // 배치 flush
    this.warnFlushTimer = setInterval(() => this.flushBatched('warn'), 10 * 60 * 1000)
    this.infoFlushTimer = setInterval(() => this.flushBatched('info'), 30 * 60 * 1000)
    // 즉시 송신 백그라운드 워커
    this.immediateWorker = this.runImmediateWorker()
  }

  private async loadDedup(): Promise<void> {
    const raw = await fs.readFile(DEDUP_STATE_PATH, 'utf8').catch(() => '{}')
    const obj = JSON.parse(raw) as Record<string, number>
    // 24h 지난 항목은 버림 → 파일이 무한 성장하지 않음
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    for (const [k, v] of Object.entries(obj)) if (v > cutoff) (this.lastSentAt as any)[k] = v
  }

  private async persistDedup(): Promise<void> {
    await fs.mkdir('data/state', { recursive: true })
    await fs.writeFile(DEDUP_STATE_PATH, JSON.stringify(this.lastSentAt))
  }

  notify(type: EventType, payload: EventPayload = {}): void {
    if (!this.config.enabled) return

    const severity = SEVERITY_MAP[type]
    if (!severity) {
      console.error(`[notifier] SEVERITY_MAP 누락 EventType=${type} — SEVERITY_MAP 정의 확인`)
      return
    }

    // Dedup: critical 제외, 5분 내 같은 이벤트 재발생 시 스킵
    if (severity !== 'critical') {
      const last = this.lastSentAt[type]
      if (last && Date.now() - last < 5 * 60 * 1000) return
    }

    const event: QueuedEvent = { type, payload, at: new Date() }

    if (severity === 'critical' || severity === 'high') {
      this.immediateQueue.push(event)                // 비동기 워커가 소비 — 호출부는 블로킹 X
      this.lastSentAt[type] = Date.now()
      void this.persistDedup()
    } else {
      this.queue.push(event)
      // 백프레셔: info/warn 이 누적되면 오래된 것부터 drop
      if (this.queue.length > QUEUE_HIGH_MAX) this.queue.splice(0, this.queue.length - QUEUE_HIGH_MAX)
    }
  }

  private async runImmediateWorker(): Promise<void> {
    // 간단한 풀링 루프. stopping=true 이고 큐 비면 종료.
    while (!this.stopping || this.immediateQueue.length > 0) {
      const event = this.immediateQueue.shift()
      if (!event) { await sleep(200); continue }
      await this.sendImmediate(event).catch(e => console.error('[notifier] immediate 실패:', e.message))
    }
  }

  private async sendImmediate(event: QueuedEvent): Promise<void> {
    const severity = SEVERITY_MAP[event.type]
    const text = this.formatText([event])
    const chatId =
      severity === 'critical' ? this.config.criticalChatId : this.config.chatId

    // 1) Telegram — critical만 알림음
    await this.sendTelegram(chatId!, text, { withSound: severity === 'critical' }).catch((e) => {
      console.error('[notifier] Telegram 실패:', e.message)
    })

    // 2) macOS 로컬 알림 (high 이상)
    if (severity === 'high' || severity === 'critical') {
      await this.sendMacOS(event).catch((e) => {
        console.error('[notifier] macOS 알림 실패:', e.message)
      })
    }
  }

  private async flushBatched(level: 'info' | 'warn'): Promise<void> {
    const toSend = this.queue.filter((e) => SEVERITY_MAP[e.type] === level)
    if (toSend.length === 0) return
    this.queue = this.queue.filter((e) => SEVERITY_MAP[e.type] !== level)
    const text = this.formatText(toSend, { batch: true, level })
    await this.sendTelegram(this.config.chatId!, text, { withSound: false }).catch((e) => {
      console.error('[notifier] 배치 전송 실패:', e.message)
      this.queue.push(...toSend)  // 실패 시 큐에 되돌림
    })
  }

  private formatText(
    events: QueuedEvent[],
    opts: { batch?: boolean; level?: string } = {},
  ): string {
    const prefix = opts.batch
      ? `🗂 [Pokopia Scraper] ${opts.level?.toUpperCase()} 배치 (${events.length}건)\n\n`
      : `⚠️ [Pokopia Scraper]\n\n`
    const lines = events.map((e) => {
      const time = e.at.toTimeString().slice(0, 5)
      const payloadStr = Object.entries(e.payload)
        .map(([k, v]) => `  ${k}: ${String(v).slice(0, 200)}`)
        .join('\n')
      return `[${time}] ${e.type}\n${payloadStr}`
    })
    return prefix + lines.join('\n\n')
  }

  // ★ v3.1 버그 수정: 인자 이름을 동작과 일치시킴.
  //   (기존 `silent` 파라미터는 true일 때 오히려 소리가 났음 — 의미 반전)
  //   이제 withSound=true면 소리, false면 무음. 호출부·내부·주석 모두 일관.
  private async sendTelegram(
    chatId: string,
    text: string,
    opts: { withSound: boolean },
  ): Promise<void> {
    const url = `https://api.telegram.org/bot${this.config.token}/sendMessage`
    await ky.post(url, {
      json: {
        chat_id: chatId,
        text,
        disable_notification: !opts.withSound,
        disable_web_page_preview: true,
      },
      timeout: 10_000,
      retry: { limit: 2 },
    })
  }

  // AppleScript 인젝션 방지: execFile + 문자열 상수만 사용
  // 제목/본문은 notification title/body 인자로 분리 전달 (쉘 escape 불필요)
  private async sendMacOS(event: QueuedEvent): Promise<void> {
    const severity = SEVERITY_MAP[event.type]
    const title = 'Pokopia Scraper'
    const subtitle = event.type
    // payload를 안전하게 직렬화
    const body = JSON.stringify(event.payload).slice(0, 200)

    // terminal-notifier 또는 node-notifier 사용 권장 (AppleScript 직접 생성 금지)
    // 미설치 시 fallback: osascript + 안전한 인자 전달
    const script =
      'on run argv\n' +
      '  display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv)' +
      (severity === 'critical' ? ' sound name "Sosumi"' : '') +
      '\nend run'
    await execFileAsync('osascript', ['-e', script, title, subtitle, body])
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    if (this.warnFlushTimer) clearInterval(this.warnFlushTimer)
    if (this.infoFlushTimer) clearInterval(this.infoFlushTimer)
    // 백그라운드 워커가 남은 immediateQueue 를 비우고 종료할 때까지 대기
    if (this.immediateWorker) await this.immediateWorker
    await this.flushBatched('warn')
    await this.flushBatched('info')
    await this.persistDedup().catch(() => {})
  }
}

// 싱글톤
export const notifier = new Notifier()
// 호출부는 fire-and-forget. await 불필요.
export const notifyUser = (type: EventType, payload?: EventPayload) => notifier.notify(type, payload)
```

**호출부 변경 (v3.2):** `await notifyUser(...)` → `notifyUser(...)` (반환 `void`). 기존 `await` 는 무해하지만 불필요. §11.1 코드는 await 를 써도 즉시 반환되어 문제 없음.

**보안 핵심:**
- `osascript -e <script> <arg1> <arg2> <arg3>` 형태로 AppleScript에 **arg 전달** — 쉘 escape 불필요 (v2의 `.replace(/"/g, '\\"')` 방식은 개행/백슬래시 복합 공격에 취약)
- 본문은 `JSON.stringify` + 200자 슬라이스로 길이 공격 방어

#### 13.3.6 시작 시 검증 프로시저

```typescript
// src/index.ts (스크래퍼 부팅)
// ★ v3.2 B8: Telegram API 는 HTTP 200 + `{ ok: false }` 패턴도 있으므로
// ok 필드를 반드시 검증한다. 401/404 등은 ky throwHttpErrors(기본 true)가 잡아줌.
async function verifyNotifier() {
  if (!notifierConfig.enabled) {
    console.log('[notifier] 비활성. 알림 없이 진행.')
    return
  }
  const url = `https://api.telegram.org/bot${notifierConfig.token}/getMe`
  const me = await ky.get(url, { timeout: 5000 }).json<{
    ok: boolean
    description?: string
    error_code?: number
    result?: { username: string }
  }>()
  if (!me.ok || !me.result?.username) {
    throw new Error(`[notifier] getMe 실패: ${me.error_code ?? '-'} ${me.description ?? 'unknown'}`)
  }
  console.log(`[notifier] Telegram bot @${me.result.username} 연결 확인`)
  // 부팅 알림 (배치 우회)
  notifier.notify('scraper.start', { node: process.version, pid: process.pid })
}
```

#### 13.3.7 알림을 유발할 주요 지점

| 코드 위치 | 이벤트 |
|----------|-------|
| `src/index.ts` 부팅 | `scraper.start` |
| `src/index.ts` 종료 훅 (SIGINT/SIGTERM) | `scraper.stop` |
| `PhaseRunner.run()` 진입/완료 | `phase.start`, `phase.complete` |
| `SessionManager.start/end` | `session.start`, `session.end` |
| `DetectionMonitor` 신호 발생 | `block.*`, `captcha.*`, `cloudflare.*` |
| `HealthScorer` 점수 -10 이상 하락 | `health.score_dropped` |
| `RateLimiter` 하루 한도 80% 도달 | `rate_limit.approaching` |
| `PersonaManager.retire()` | `persona.retired` |
| `CrashHandler` uncaughtException | `scraper.crashed` |
| `verifyNetworkConsistency()` 실패 | `network.inconsistency` |
| Zod 검증 실패 건수 임계 초과 | `data.integrity_failure` |
| 하루 23:55 크론 | `milestone.daily_summary` |
| Phase 완료 시 진척률 | `milestone.progress` |

#### 13.3.8 운영 시나리오 예시

```
[09:02] scraper.start                → Telegram "🚀 Pokopia Scraper 시작"
[09:15] session.start (serebii)      → 배칭 (info, 30분 후 발송)
[10:47] block.403 (serebii)          → 즉시 🚨 + macOS 알림 + 소리 없음
[10:47] session.end (cooldown 4h)    → 배칭 합류
[10:48] (배치 flush) 6건 info + 2건 warn 요약
[15:22] captcha.detected             → 🚨🚨 즉시 + macOS 알림 + Sosumi 소리
         → 유저가 Mac 앞에서 브라우저 창에 CAPTCHA 해결
[15:24] session resumes              → 배칭
[23:55] milestone.daily_summary      → "오늘 requests: 147, blocks: 1, captcha: 1"
```

#### 13.3.9 테스트 프로시저

```bash
pnpm run notifier:test
# 내부적으로:
#   1) getMe 핑
#   2) info 이벤트 1건 (배치 플러시 강제)
#   3) warn 이벤트 1건 (배치)
#   4) high 이벤트 1건 (즉시)
#   5) critical 이벤트 1건 (즉시 + macOS 소리)
# → 각 단계에서 폰/Mac 알림 도착 확인
```

---

## 14. Rate Limiting v3 (수치 재계산)

### 14.1 카운트 정의 (v3.1: navigation vs resource 분리)

v3까지는 "요청(request)" 단위가 모호했다. v3.1부터는 **사람 기준으로 카운트**:

| 카운터 | 정의 | 제한 목적 |
|--------|------|----------|
| **navigation** | `page.goto()` 또는 링크 클릭으로 발생하는 **최상위 페이지 전환**. "사람이 페이지를 본 횟수"와 동일 | rate 제한의 주 대상 |
| **resource** | 페이지 로드에 수반되는 CSS/JS/이미지/analytics **자동** 요청 — **카운트하지 않음** (브라우저가 알아서) | 모니터링만 (비정상 리소스 폭증 감지 용도) |
| **direct fetch** | `ky.get()` 등으로 스크래퍼가 **직접 발생시키는 보조 요청** (예: Serebii T0 이미지 수집) | navigation과 별도 쿼터 |

원칙: **사람처럼 보이려면 사람 기준**. 이미지 1,100장이 페이지 안에서 자동 로드되는 건 사람도 의식 안 함 → 카운트 X. 그러나 T0 Serebii처럼 `page` 없이 직접 이미지만 내려받을 땐 별도 `direct fetch` 카운터로 추적.

### 14.2 티어별 Rate (v3.1 개정)

| 소스 | 엔진 | 페이지 수 | 평균 지연 | navigation/세션 | **navigation/일** | **direct fetch/일** | 소요일 |
|------|------|---------|---------|---------------|------------------|---------------------|-------|
| **T0 Serebii** | ky | 252 (43 + 209 서식지 상세) | 3~5초 | N/A (일괄) | **300** | **1,500** (이미지 ~1,100 + 여유) | **1일 (40~60분)** |
| **T1 PokopiaGuide** | playwright | ~1,400 (1,203 아이템 + 200 포켓몬) | 20~60초 | 40 | **120** | — (페이지 로드에 편승) | **12~15일** (API 미발견) / **5~7일** (API 발견) |
| **T2 pokopoko** | patchright | 확인 필요 (Phase 0) | 30~90초 | 20 | **40** | — | 성공 시 5~7일 |
| **T3 namu.wiki** | patchright + CF | 선택적 10~30 | 60~180초 | 7 | **15** | — | 성공 시 1~3일 (부분만) |

**PokopiaGuide 커버리지 축소 옵션:** 포켓몬 200종 + 주요 아이템 300~500개만 매핑 → **5~7일 가능**. 전수 스크래핑은 API 발견 시에만 권장.

### 14.3 RateLimitConfig (v3.1 개정)

```typescript
interface RateBudget {
  maxPerSession: number
  maxPerDay: number
  meanDelayMs: number
  stddevDelayMs: number
}

interface RateLimitConfig {
  navigation: RateBudget
  directFetch?: RateBudget           // Serebii 이미지처럼 별도 직접 요청만
  sessionDurationMs: { min: number; max: number }
  interSessionMs: { min: number; max: number }
  maxRetries: number
  retryBaseDelayMs: number
  // 하루 누적 카운트 영속화 (v3) — 카운터별 파일
  stateDir: string                   // data/state/rate/<source>/
}

const RATE_LIMITS: Record<Source, RateLimitConfig> = {
  serebii: {
    navigation: {
      maxPerSession: 100,
      maxPerDay: 300,
      meanDelayMs: 4000,
      stddevDelayMs: 1500,
    },
    directFetch: {
      maxPerSession: 500,
      maxPerDay: 1500,
      meanDelayMs: 1000,
      stddevDelayMs: 400,
    },
    sessionDurationMs: { min: 5 * 60 * 1000, max: 30 * 60 * 1000 },
    interSessionMs: { min: 30 * 60 * 1000, max: 2 * 60 * 60 * 1000 },
    maxRetries: 2,
    retryBaseDelayMs: 10 * 60 * 1000,
    stateDir: 'data/state/rate/serebii/',
  },
  pokopiaGuide: {
    navigation: {
      maxPerSession: 40,
      maxPerDay: 120,
      meanDelayMs: 25000,
      stddevDelayMs: 10000,
    },
    // directFetch 없음 — 이미지는 페이지 로드에 편승
    sessionDurationMs: { min: 20 * 60 * 1000, max: 60 * 60 * 1000 },
    interSessionMs: { min: 60 * 60 * 1000, max: 4 * 60 * 60 * 1000 },
    maxRetries: 2,
    retryBaseDelayMs: 15 * 60 * 1000,
    stateDir: 'data/state/rate/pokopiaGuide/',
  },
  pokopoko: {
    navigation: {
      maxPerSession: 20,
      maxPerDay: 40,
      meanDelayMs: 50000,
      stddevDelayMs: 20000,
    },
    sessionDurationMs: { min: 20 * 60 * 1000, max: 45 * 60 * 1000 },
    interSessionMs: { min: 2 * 60 * 60 * 1000, max: 6 * 60 * 60 * 1000 },
    maxRetries: 1,
    retryBaseDelayMs: 30 * 60 * 1000,
    stateDir: 'data/state/rate/pokopoko/',
  },
  namuwiki: {
    navigation: {
      maxPerSession: 7,
      maxPerDay: 15,
      meanDelayMs: 100000,
      stddevDelayMs: 40000,
    },
    sessionDurationMs: { min: 20 * 60 * 1000, max: 30 * 60 * 1000 },
    interSessionMs: { min: 4 * 60 * 60 * 1000, max: 8 * 60 * 60 * 1000 },
    maxRetries: 1,
    retryBaseDelayMs: 60 * 60 * 1000,
    stateDir: 'data/state/rate/namuwiki/',
  },
}
```

**하루 누적 카운트 영속화:**
- `<stateDir>/navigation.json`, `<stateDir>/direct-fetch.json`에 `{ date: 'YYYY-MM-DD', count: N }` 저장
- 카운터별 분리 → navigation 한도 도달해도 direct fetch는 계속 (및 반대)
- 스크래퍼 재시작 후에도 오늘 이미 쓴 요청 수 기억. 자정 자동 리셋
- 각 카운터 80% 도달 시 `rate_limit.approaching` 알림 (§13.3.7) — payload에 어느 카운터인지 명시

### 14.4 Rate Calibration (Phase 0에서 샘플 기반 초기화)

**자동 상향 조정은 위험** (탐지 유발). 대신 Phase 0에서 **하향 보정**만 수행:

```typescript
// src/rate/calibrate.ts
// Phase 0에서 각 소스 3~5 페이지 샘플링 → 응답시간/에러율 측정
interface CalibrationSample {
  source: Source
  observedMeanMs: number
  observedP95Ms: number
  errorRate: number                 // 0~1
  sampledAt: string
  samples: number
}

// 보정 규칙:
// - observedP95Ms > config.meanDelayMs × 2  → 해당 소스 meanDelayMs를 observedP95Ms × 1.5로 상향
// - errorRate > 5%                           → maxPerDay를 0.5배로 하향
// - errorRate > 10%                          → 해당 소스 스킵 결정 (수동 승인 필요)
// 자동 상향 (더 공격적) 은 절대 하지 않음
```

결과는 `data/preflight/rate-calibration.json`에 저장. 이후 세션은 보정된 config를 사용.

실제 스크래핑 중 측정값이 예상 대비 크게 어긋나면(P95 > 3배 등) `soft_throttle.detected` 이벤트 자동 발행(§12.2, §13.3.7) → 수동 조정 트리거. **런타임 자동 조정 없음**.

---

## 15. 소스별 최종 전략

### 15.1 Serebii (T0) — 1일

```
페르소나: 불필요 (HTTP 직접 요청)
Fetcher: ky + node-html-parser
워밍: 불필요
세션: N/A — 연속 실행 가능, 단 요청 간 3~5초 지연
요청 간격: 3~5초 (gaussian)
헤더: User-Agent 동적(시스템 Chrome 버전) + Accept-Language만
이미지: 응답에서 URL 수집 → 별도 ky 요청으로 저장 (동일 rate)
리스크: 매우 낮음 (Serebii는 팬사이트 허용적)
예상 실행 시간: 252페이지 × 평균 4초 = ~17분 + 이미지 1,100장 × 1초 = ~20분 = 총 40~60분
주의: robots.txt 사전 확인. `User-Agent`에 실제 연락처(이메일 또는 프로젝트 URL) 포함 권장
```

### 15.2 PokopiaGuide (T1) — 5~15일 (API 발견 여부에 따라)

```
페르소나: korean-pokemon-fan
Fetcher: playwright 순정 (patchright 불필요, 오히려 위험)
워밍: 1일 (Naver + YouTube + pokopiaguide 홈)
세션/일: 2~3개, 각 40~80분
요청/세션: 30~50
페이지 체류: 20~60초 (SPA 로딩 + 읽기)

Phase 0 API discovery 결과에 따라:
  A. REST/GraphQL/BaaS 발견 → Playwright context에서 동일 방식으로 호출
     (TLS/핑거프린트 일치 위해 direct curl 금지)
     → 처리 속도 2~3배. 5~7일.
  B. API 없음 → DOM 파싱만 → 10~15일
리스크: 중간
활동 시간대: 08:00~14:00 (persona.activeHours)
```

### 15.3 pokopoko (T2) — 접근 확인 후 결정

```
페르소나: korean-pokemon-fan (T1과 공유하되 시간대 분리)
  — pokopoko는 PokopiaGuide 세션 완전 종료 후 최소 2시간 gap
Fetcher: patchright
워밍: (T1과 페르소나 공유) 추가 불필요
Phase 0 테스트: 403 재현 여부 + patchright로 돌파 가능 여부
성공 시:
  세션/일: 1개, 20~45분
  요청/세션: 15~25
  페이지 체류: 30~60초
  네비게이션: 풀 시뮬레이션 (ghost-cursor)
실패 시: 즉시 포기. PokopiaGuide + 수동 번역으로 폴백. 우회 시도 금지.
리스크: 높음
```

### 15.4 namu.wiki (T3) — 1차 검증 후 결정, 대부분 포기

```
페르소나: namuwiki-researcher (전용)
Fetcher: patchright + CF challenge 대기
워밍: 1일 (3~5세션, namu.wiki 메인 + 무관 문서 3~5개)
  — v2의 3일은 과함, 실측 근거 없음

Phase 0 테스트 (반드시 선행):
  1. patchright로 namu.wiki 메인 접근 → CF 통과 확인
  2. nowsecure.nl 통과 확인
  3. 실제 대상 문서 1개 접근 성공

성공 기준 통과 시:
  대상을 선택적 10~30개 문서로 축소 (Pokemon Pokopia 관련 핵심만)
  세션/일: 1개, 20~30분
  요청/세션: 5~10
  페이지 체류: 60~120초
  cf_clearance 쿠키 보존 중요 (persistent context)
  활동 시간대: 19:00~23:00

실패 시: 즉시 수동 번역 대상으로 분류, 전체 자동화 포기
리스크: 매우 높음
```

### 15.5 실행 순서와 의존성

```
Day 1      : Phase -1 (preflight) + Phase 0 (API discovery, robots.txt)
Day 2      : Phase 1~5 (Serebii T0, 40~60분 실제 소요)
Day 3~17   : Phase 6a (PokopiaGuide T1, API 발견 여부에 따라 5~15일)
Day N, N+1 : Phase 6b (pokopoko T2, 성공 시만)
Day M      : Phase 6c (namu.wiki T3, 성공 시만)
Day last   : Phase 7 (이미지 검증 + 누락 보충 + 수동 번역 항목 리스트 생성)
```

**총 소요 (최대, v3.2 재계산):** 약 **4.6주** (32일) — T2/T3 모두 최대치 포함, PokopiaGuide DOM 전수.
**총 소요 (최소, v3.2 재계산):** 약 **1.2주** (8.25일) — API 발견 + T2/T3 생략 + Serebii 1일.
**총 소요 (중앙값 예상):** 약 **2~2.5주** — API 발견 + T2 시도 후 조기 성공/포기.

---

## 16. 캐싱 전략

### 16.1 HTML 캐시

```
data/cache/
  serebii/
    availablepokemon.shtml.html
    availablepokemon.shtml.meta
    habitatdex/
      tallgrass.shtml.html
      ...
  pokopiaGuide/ ...
```

메타데이터:
```json
{
  "url": "...",
  "fetchedAt": "2026-04-17T10:00:00Z",
  "httpStatus": 200,
  "contentHash": "sha256:...",
  "contentLength": 45231,
  "ttlDays": 3,
  "sourcePersona": "korean-pokemon-fan"
}
```

### 16.2 쿠키 지속

```typescript
import { CookieJar } from 'tough-cookie'
import { FileCookieStore } from 'tough-cookie-file-store'

// 스크래퍼 재시작 간에도 쿠키 유지
const cookieJar = new CookieJar(new FileCookieStore(`data/cookies/${source}.json`))
```

### 16.3 Playwright Persistent Context

`launchPersistentContext` 사용 → 쿠키, localStorage, IndexedDB 자동 저장.

### 16.4 TLS 세션 재사용

Playwright는 브라우저 내부에서 자동 처리. ky 사용 시 undici의 Pool 재사용.

---

## 17. Phase 구조

### 17.1 전체 Phase

```
Phase -2: 프로필 워밍 (1일, 백그라운드)
  - 2개 페르소나(T1+T2 공유, T3 별도) 각각 워밍
  - 파일 직접 편집 금지. Playwright 헤드풀로 자연 브라우징
  - history/cookies 자동 축적

Phase -1: Preflight (사전 테스트)
  - bot.sannysoft.com 등 탐지 테스트 사이트 통과 확인
  - 네트워크 일관성 검증 (IP/timezone/locale)
  - robots.txt 다운로드 + 위반 항목 생성
  - Telegram/macOS 알림 엔드투엔드 테스트

Phase 0: 사전 조사
  - PokopiaGuide API 역추적 (Playwright Network 감시)
  - pokopoko.kr 접근성 테스트 (403 재현)
  - namu.wiki Cloudflare 통과 테스트 (실패 시 즉시 T3 포기)
  - patchright 활성도/버전 확인

Phase 1: 기반 엔티티 (Serebii, T0 ky)
  - pokemon, specialty, location, item

Phase 2: 연관 데이터 (Serebii, T0 ky)
  - habitat (209 상세 페이지 포함), furniture, crafting, cooking, flavors

Phase 3: 시스템 (Serebii, T0 ky)
  - building, favorites, paint, electricity, water, environment

Phase 4: 콘텐츠 (Serebii, T0 ky)
  - quests, team_challenge, legendary, unique_pokemon

Phase 5: 수집품 (Serebii, T0 ky)
  - cd, relics, human_records, customization, plants, pokedex_milestones

Phase 6a: 한국어 매핑 — PokopiaGuide (T1 Playwright)
Phase 6b: 한국어 매핑 — pokopoko (T2 patchright, 접근 성공 시)
Phase 6c: 한국어 매핑 — namu.wiki (T3 patchright+CF, 접근 성공 시)
Phase 6d: 수동 번역 항목 리스트 생성

Phase 7: 이미지 검증 (Serebii에서 수집된 이미지 + PokopiaGuide 이미지 누락 확인)
```

### 17.2 시간 추정 (v3.2 재계산)

| Phase | 소요 시간 (최소) | 소요 시간 (최대) |
|-------|---------------|---------------|
| -2 | 1일 (백그라운드) | 1일 |
| -1 | 0.5일 | 1일 |
| 0 | 0.5일 | 1일 |
| 1~5 (Serebii T0) | 0.25일 (40분~1시간) | 1일 (여유 분산 시) |
| 6a (PokopiaGuide T1) | 5일 (API 발견 시) | 15일 (DOM 파싱 전수) |
| 6b (pokopoko T2) | 0 (스킵) | 5일 |
| 6c (namu.wiki T3) | 0 (스킵) | 5일 |
| 6d (수동 번역) | 0.5일 | 2일 |
| 7 (이미지) | 0.5일 | 1일 |
| **총계** | **8.25일 ≈ 1.2주** | **32일 ≈ 4.6주** |

**v3.2 수정 포인트:** v3.1까지 "최소 ~7일 / 최대 ~3주"로 적혀 있었으나 합산하면 각각 8.25일 / 32일. 특히 **최대치 과소평가(3주 → 4.6주)**. 일정/알림/버퍼 계획은 재계산된 값 기준.

**Phase -2 병행 주의:** Phase -2 워밍은 이름이 "백그라운드"지만 Mac이 꺼져 있으면 진행이 안 된다. 실효 1일을 유지하려면 Phase -1과 **달력 일수**로 겹칠 수 있다 — 그 경우 총 소요 8.25 → 7.25일까지 압축 가능. 압축 여부는 운영자 스케줄에 따라.

---

## 18. 한국어 매핑 전략

### 18.1 매핑 우선순위

```
1순위: PokopiaGuide
   커버리지: 포켓몬 100%, 아이템 90%+ 예상
2순위: pokopoko (접근 성공 시)
   PokopiaGuide 누락분 보충
3순위: namu.wiki (접근 성공 시)
   pokopoko 누락분 보충
4순위: 수동 번역
   자동화 실패 항목
```

### 18.2 매핑 키

| 엔티티 | 매칭 키 | 신뢰도 |
|--------|--------|-------|
| 포켓몬 | 도감 번호 | 높음 |
| 아이템 | 정규화 영문 이름 | 중간 |
| 서식지 | 서식지 번호 | 높음 |
| 지역 | 영문 이름 | 높음 |
| 스페셜티 | 영문 이름 | 높음 |
| 레시피 | 영문 이름 + 주재료 | 중간 |

```typescript
function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s']/g, '')
}
```

---

## 19. PokopiaGuide API Discovery (Phase 0)

```typescript
async function discoverApi() {
  const browser = await patchright.chromium.launch({ headless: false })
  const context = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  })
  const page = await context.newPage()

  const apiCalls: Array<{ url: string, method: string, status: number, response: unknown }> = []

  page.on('response', async (response) => {
    const url = response.url()
    const contentType = response.headers()['content-type'] || ''
    if (contentType.includes('json') || url.includes('api') || url.includes('graphql')) {
      apiCalls.push({
        url,
        method: response.request().method(),
        status: response.status(),
        response: await response.json().catch(() => null),
      })
    }
  })

  const pages = ['/ko/pokedex', '/ko/items', '/ko/habitat', '/ko/crafting']
  for (const path of pages) {
    await page.goto(`https://www.pokopiaguide.com${path}`)
    await page.waitForLoadState('networkidle')
    await humanDwell(5000, 10000)
  }

  await fs.writeFile('data/api-discovery.json', JSON.stringify(apiCalls, null, 2))
  await browser.close()
}
```

**발견 시나리오별 전략:**

| 시나리오 | 전략 |
|---------|------|
| REST API 발견 | Playwright 유지, **브라우저가 API를 부르는 방식** 그대로 사용 (직접 curl 호출은 TLS 핑거프린트 다름) |
| GraphQL 발견 | Playwright 내 fetch로 동일 쿼리 |
| BaaS 발견 | 동일 — 브라우저 context에서만 호출 |
| API 없음 | DOM 파싱 |

---

## 20. 에러 처리 & 복구

### 20.1 Crawl State

```json
{
  "phase": 6,
  "persona": "korean-pokemon-fan",
  "session": {
    "startedAt": "...",
    "requestCount": 15,
    "plannedDuration": 2400000
  },
  "completedPages": ["/ko/pokedex/25"],
  "failedPages": [
    { "url": "...", "error": "403", "retries": 3, "cooldownUntil": "..." }
  ],
  "cooldowns": {
    "pokopiaGuide": "2026-04-20T09:00:00Z"
  },
  "healthScores": {
    "korean-pokemon-fan": 88,
    "namuwiki-researcher": 95
  }
}
```

### 20.2 복구 전략

- **멱등성:** 모든 DB 작업 upsert
- **재개 가능:** state.json 기반
- **부분 실패 허용**
- **Cooldown 존중:** 재실행 시에도 cooldown 기간 지키기

---

## 21. Pre-Production 테스트

### 21.1 탐지 테스트 사이트

```typescript
const DETECTION_TESTS = [
  'https://bot.sannysoft.com/',
  'https://abrahamjuliot.github.io/creepjs/',
  'https://browserleaks.com/canvas',
  'https://browserleaks.com/webgl',
  'https://browserleaks.com/javascript',
  'https://pixelscan.net/',
  'https://iphey.com/',
  'https://nowsecure.nl/',
]

async function runPreflight(persona: BrowserPersona) {
  const context = await createStealthContext(persona)
  const page = await context.newPage()
  
  for (const url of DETECTION_TESTS) {
    await page.goto(url)
    await sleep(5000)
    await page.screenshot({ 
      path: `data/preflight/${persona.id}/${new URL(url).hostname}.png`, 
      fullPage: true 
    })
  }
  
  await context.close()
}
```

### 21.2 통과 기준 (bot.sannysoft.com)

| 항목 | 기준 |
|------|------|
| User Agent | 정상 브라우저 UA |
| WebDriver | `false` 또는 `undefined` |
| Chrome | `window.chrome` 존재 |
| Permissions | 정상 응답 |
| Plugins Length | > 0 |
| Languages | 비어있지 않음 |
| WebGL Vendor | 실제 GPU |
| 전체 통과 | 모든 항목 초록 |

**nowsecure.nl** 통과 못 하면 namu.wiki 접근 불가 → namu.wiki 스킵 결정.

---

## 22. Operational Policy

### 22.1 운영 원칙

| 항목 | 정책 |
|------|------|
| 연속 실패 임계 | 3회 → 해당 소스 24시간 cooldown |
| 임계 신호 탐지 | 즉시 세션 중단 + 72시간 해당 페르소나 cooldown |
| 페르소나 시간 분리 | 같은 IP → `activeHours`가 겹치지 않는 페르소나만 운용 |
| 프로필 백업 | 매주 `rsync -a` 외장 SSD 백업 (warmup 시간 보존) |
| 데이터 백업 | 매일 `data/parsed/` 증분 백업 (재스크래핑 방지) |
| 로그 보존 | 요청/응답/에러 모두 `data/logs/` JSONL로 기록 |
| 페르소나 은퇴 | healthScore < 20 → 프로필 폐기 + 새 워밍 시작 |
| 알림 채널 | Telegram 1차, macOS 로컬 2차 (§13.3) |

### 22.2 모니터링

- **CLI 대시보드:** `pnpm run status` — 현재 phase/persona/healthScore/오늘 요청 수/cooldown 상태를 한 화면에 출력
- 일별 요청 수 추적 (`data/state/rate/<source>.json`)
- 탐지 신호 발생 시 즉시 Telegram 알림 (high/critical) + 배치 알림 (info/warn)
- 주요 이벤트 로그: `data/logs/events.jsonl` (세션 시작/종료, 에러, cooldown, 알림 송신 내역)
- 일일 요약: 매일 23:55 `milestone.daily_summary` 자동 송신 — 스크래퍼 프로세스 내부 `node-cron` 으로 발행(프로세스가 살아있지 않을 때는 다음 실행 시 회고 요약으로 대체; 별도 crontab 에 넣지 않음)
- 로그 영속화: 로그 파일은 매일 로테이션, 14일 보존

### 22.3 로그 민감정보 마스킹 (★ v3.2 D3 / v3.3 확장 / v3.4 Telegram URL)

`data/logs/`는 외장 SSD 로 백업되므로 토큰/쿠키/PII 가 그대로 넘어가면 백업 미디어 유출 시 위험. 모든 로그 기록은 아래 마스킹을 거친다.

```typescript
// shared/src/logging/redact.ts
const TOKEN_PATTERNS: Array<[RegExp, string]> = [
  // Telegram API URL — `https://api.telegram.org/bot<TOKEN>/...` 경로 토큰 마스킹.
  // URL 안의 `bot1234567:ABC...` 는 `bot` 과 digit 사이에 \b 가 없어 아래
  // "Telegram bot token" 패턴이 매칭되지 않으므로 URL 전용 규칙이 선행해야 한다.
  // (Phase 3 감사 SEC-001, v3.4).
  [/(https?:\/\/api\.telegram\.org\/bot)[^/\s?#]+/gi, '$1<TELEGRAM_TOKEN>'],
  // Telegram bot token: 7-10자리 숫자 : 30+자 영숫자/-/_
  // 뒷경계는 `(?![A-Za-z0-9_-])` — `-` 가 \w 에 속하지 않아 \b 가 토큰 내부에서
  // 조기 종료하는 문제 회피. 의미는 "토큰 문자 집합 바깥에서 종료"로 동치.
  [/\b\d{7,10}:[A-Za-z0-9_-]{30,}(?![A-Za-z0-9_-])/g, '<TELEGRAM_TOKEN>'],
  // HTTP Authorization: Bearer <jwt|opaque> (base64 padding +/= 포함)
  [/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, 'Bearer <REDACTED>'],
  // HTTP Authorization: Basic <base64(user:pass)>
  [/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic <REDACTED>'],
  // OAuth/OIDC JSON body — 헤더 경유하지 않는 응답 본문에서도 마스킹
  [/"(access_token|refresh_token|id_token)"\s*:\s*"[^"]*"/gi, '"$1":"<REDACTED>"'],
  // 민감 쿠키 값 마스킹 (키 보존):
  //   cf_*, session/sid/auth, csrf/xsrf/_csrf, refresh/jwt/token
  // `\b` 단어 경계 — `token` 같은 짧은 키가 `BOT_TOKEN=` 합성어에 오인 매칭되는 것 방지.
  [
    /\b(cf_clearance|__cf_bm|session|sid|auth|csrf|xsrf|_csrf|refresh|jwt|token)=[^;\s,]+/gi,
    '$1=<REDACTED>',
  ],
]

export function redact(text: string): string {
  let out = text
  for (const [pat, rep] of TOKEN_PATTERNS) out = out.replace(pat, rep)
  return out
}

export function redactObject<T>(obj: T): T {
  try {
    return JSON.parse(redact(JSON.stringify(obj))) as T
  } catch (err) {
    // BigInt / 순환 참조 / non-serializable 은 JSON.stringify 에서 throw.
    // 로그 유실 방지를 위해 fallback 마커 객체 반환 — 호출자가 __redact_error
    // 필드로 마스킹 실패를 관측할 수 있음.
    const reason = err instanceof Error ? err.message : String(err)
    return { __redact_error: reason } as unknown as T
  }
}
```

**v3.3 추가 범위 근거:**

- **Bearer/Basic base64 padding**: RFC 7617/7519 표준 base64 는 `+`, `/`, `=` 를 포함하므로 JWT 가 아닌 opaque 토큰도 누락 없이 매칭.
- **OAuth/OIDC JSON**: Authorization 헤더가 아닌 응답 body(`{"access_token": "..."}`) 로 오는 토큰을 마스킹. key 는 보존하고 value 만 `<REDACTED>` 로 바꿔 디버깅 맥락(어떤 키가 왔는지)은 유지.
- **Cookie 키 집합 확장**: CSRF/XSRF 토큰(위조 방지), refresh/jwt/token(OIDC 계열). `[^;\s,]+` 가 `.` 을 허용하므로 JWT dot-separated 값도 커버.
- **`\b` 단어 경계**: `token` 은 4-5자로 짧아 합성어(`BOT_TOKEN=`, `ACCESS_TOKEN=`) 에 부분 매칭될 위험 → 단어 경계 강제.
- **`redactObject` try-catch**: BigInt 는 `JSON.stringify` 에서 `TypeError: Do not know how to serialize a BigInt` throw, 순환 참조는 `TypeError: Converting circular structure to JSON` throw. 로그 이벤트 유실을 막기 위해 fallback 마커 반환.

**적용 지점:**
- `events.jsonl` append 시 `redactObject(event)` 필수 — 실패 시에도 `__redact_error` 마커 이벤트가 기록되도록 보장
- HTTP 요청/응답 로그를 남길 경우 `headers`·`set-cookie`·`cookie` 전체 마스킹
- 파싱 실패 시 저장하는 원본 HTML(`data/invalid/...`)은 `Set-Cookie`/`Authorization` 이 의미 없으므로 제외 — 하지만 파일 권한 `chmod 600` 적용
- `.env` 내용은 어떤 로그에도 출력 금지 (startup 로그 중 `process.env` 덤프 금지 검토)

**v3.4 에러 경로 2차 redact 의무 (★ Phase 3 감사 SEC-001/003):**
- **성공 경로 `redactObject` 만으로 부족.** 외부 라이브러리(ky HTTPError 등)가 URL·요청 본문을 그대로 메시지에 삽입하면 catch 블록에서 누출된다. 따라서:
  - `sendTelegram` 실패 catch → `console.error(redact(reason))`
  - `appendEventLog` 실패 catch → `console.error(redact(reason))`
  - `sendMacOSBanner` 실패 catch → `console.error(redact(reason))`
  - `console.log fallback` 도 `redact(JSON.stringify(entry))` 로 감싼다 (URL 재조립 리스크)
- 호출자 편의상 `notify(event, meta)` 의 `meta` 에 실수로 토큰이 들어올 경우를 대비해 **메타 키 네이밍 가드**(`sanitizeMeta`) 선행 적용 — 민감 키(`token`/`apiKey`/`authorization`/`password`/`secret`/`credential`/`cookie`/`bearer`) 포함 시 값 전체를 `<REDACTED>` 치환 후 `redactObject` 로 전달. (Phase 3 감사 SEC-002)

---

## 23. 구현 아키텍처

### 23.1 컴포넌트

```
PokopiaScraper
├── FetcherFactory                  # 티어별 fetcher 반환 (ky / playwright / patchright)
├── PersonaManager                  # 2개 페르소나 수명 관리 + 시간 분리
├── ProfileWarmer                   # 워밍 로직 (파일 편집 금지, API만)
├── CircadianScheduler              # 시간대 기반 스케줄링
├── SessionManager                  # 세션 라이프사이클 + 상태 전이
├── ConcurrencyGuard                # 동시성 규칙 강제 (§6.4) — 세션 시작 전 canStart 체크
├── NavigationPlanner               # 네비게이션 경로 생성
├── HumanBehaviorSimulator          # ghost-cursor / 스크롤 / visibility
├── FingerprintInjector             # 최소 주입 (patchright에 대부분 위임)
├── ResourcePolicy                  # 자원 로딩 정책
├── DetectionMonitor                # 자기 탐지 감시
├── SoftThrottleDetector            # 응답 시간 기반 throttle 탐지
├── ErrorReactionSimulator          # "사람답게 떠나기" 정책
├── CaptchaHandler                  # CAPTCHA 대응 (수동 알림)
├── RateLimiter                     # 요청 간격 + 일별 누적 영속화
├── HtmlCache                       # 원본 HTML 캐시
├── CookiePersistence               # 쿠키 디스크 저장
├── HealthScorer                    # 페르소나 health 추적
├── Notifier                        # §13.3 Telegram + macOS 배칭/라우팅
├── DataValidator                   # Zod 스키마 검증 (§27)
├── RobotsChecker                   # robots.txt 준수 확인 (§26)
└── CrawlStateManager               # state.json 관리 + 재개
```

### 23.2 핵심 의존성

```json
{
  "dependencies": {
    "playwright": "^1.x",
    "patchright": "^1.x",
    "ghost-cursor-playwright": "^1.x",
    "fingerprint-injector": "^2.x",
    "fingerprint-generator": "^2.x",
    "ky": "^1.x",
    "node-html-parser": "^6.x",
    "tough-cookie": "^5.x",
    "tough-cookie-file-store": "^2.x",
    "@prisma/client": "^5.x",
    "zod": "^3.x",
    "dotenv": "^16.x",
    "robots-parser": "^3.x",
    "proper-lockfile": "^4.x",
    "node-cron": "^3.x"
  },
  "devDependencies": {
    "@types/proper-lockfile": "^4.x",
    "@types/node-cron": "^3.x"
  }
}
```

**v3.2 추가 의존성 이유:**
- `proper-lockfile` — §6.4.3 `ConcurrencyGuard` 파일 락 (A4)
- `node-cron` — §22.2 `milestone.daily_summary` 프로세스 내 스케줄

### 23.3 라이브러리 선택 이유 (티어별)

| 라이브러리 | 사용 티어 | 선택 이유 |
|-----------|---------|----------|
| `ky` | T0 | 정적 HTML, 스텔스 불필요 |
| `playwright` | T1 | 중간 anti-bot, 과잉 스텔스 지양 |
| `patchright` | T2, T3 | CDP 흔적 제거, Cloudflare 대응 (사전 샘플 검증 필수) |
| `fingerprint-injector` + `fingerprint-generator` | **T1만** | canvas/audio/fonts seed 일관 주입 (§9.1.1). T2/T3는 patchright 내장 처리라 적용 금지 (이중 패치 충돌). Apache 2.0 |
| `ghost-cursor-playwright` | T1, T2, T3 | Bezier 궤적 — `page.mouse.move` 직선 텔레포트 문제 해결 |
| `node-html-parser` | 전체 | 캐시된 HTML 재파싱용 (Playwright 없이 빠르게) |
| `robots-parser` | 전체 | robots.txt 규칙 매칭 (§26) |
| `zod` | 전체 | 환경 변수 + 파싱 결과 검증 (§13.3.4, §27) |

---

## 24. Risk Matrix

| 리스크 | 영향 | 확률 | 대응 |
|--------|------|------|------|
| Serebii HTML 구조 변경 | 높음 | 낮음 | 스냅샷 테스트, 캐시 기반 검증 |
| PokopiaGuide API 없음 | 중간 | 중간 | Playwright DOM 파싱 폴백 |
| pokopoko 접근 불가 | 낮음 | 높음 | PokopiaGuide 커버리지로 대체 |
| namu.wiki 접근 불가 | 낮음 | 매우 높음 | 수동 번역 대체 |
| Cloudflare 스텔스 탐지 | 높음 | 중간 | patchright + 전용 페르소나 + 풀 워밍 |
| CAPTCHA 조우 | 중간 | 높음 | 수동 개입 알림 + cooldown |
| 프로필 폐기 필요 | 중간 | 중간 | 새 프로필 워밍 2~3일 소요 |
| IP/timezone 불일치 | 높음 | 낮음 | 시작 시 verifyNetworkConsistency |
| 페르소나 혼용 실수 | 높음 | 낮음 | 코드 레벨 강제 (persona.usedFor 검증) |
| 유저 Chrome 프로필 오염 | 매우 높음 | 낮음 | 프로필 경로 격리 강제 |
| 서식지 209 과부하 | 중간 | 낮음 | 세션 분산 + 캐싱 |
| Prisma 벌크 upsert 성능 | 낮음 | 중간 | `$executeRaw`로 우회 |

---

## 25. Checklist — 시작 전 확인

### 25.1 환경/의존성
- [ ] Node.js 22.x, pnpm 최신
- [ ] `pnpm install` 완료 (`ky`, `playwright`, `patchright`, `ghost-cursor-playwright`, `zod`, `dotenv`, `robots-parser`, `proper-lockfile`, `node-cron`)
- [ ] `.env` 생성: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NOTIFICATIONS_ENABLED=true`
- [ ] `.env`가 `.gitignore`에 포함됐는지 확인
- [ ] 시스템 Chrome 설치 + 버전 확인 (`channel: 'chrome'` 사용 위함)

### 25.2 사전 검증
- [ ] `pnpm run check:robots` — robots.txt 위반 항목 0건 또는 수동 승인
- [ ] `pnpm run check:access` — 각 소스 1페이지 접근 성공
- [ ] `pnpm run check:patchright` — patchright 버전 확인 + bot.sannysoft.com 전체 초록 + **WebGL probe 기록**(§9.1.2)
- [ ] `pnpm run check:network` — IP=KR, TZ=Asia/Seoul
- [ ] `pnpm run notifier:test` — Telegram/macOS 알림 엔드투엔드 도착 확인
- [ ] `nowsecure.nl` 통과 (namu.wiki 타겟 시) — 실패 시 T3 포기 결정
- [ ] **(v3.2)** `data/preflight/patchright-webgl.json` 존재 확인 — §9.1.2 이중 패치 방지

### 25.3 페르소나
- [ ] 프로필 경로가 유저 Chrome 프로필과 **완전 격리** (`~/Library/Application Support/Google/Chrome` 하위 아님)
- [ ] 2개 페르소나(`korean-pokemon-fan`, `namuwiki-researcher`) 워밍 1일 완료
- [ ] 두 페르소나의 `activeHours`가 겹치지 않음 검증

### 25.4 러너/복구
- [ ] `pnpm run scrape --dry-run --source serebii --page availablepokemon` 성공 (§28)
- [ ] Cooldown/Health score 메커니즘 동작 확인
- [ ] 에러 시나리오 수동 테스트: 403 응답 모의 → 세션 즉시 종료 + 알림 수신 확인
- [ ] CAPTCHA 모의 → macOS 알림 소리 + Telegram critical 수신 확인
- [ ] 쿠키 persistence 동작 확인 (재시작 후 쿠키 유지)
- [ ] 이미지 자동 수집 동작 확인

### 25.5 데이터/백업
- [ ] Zod 스키마 정의 완료 (§27)
- [ ] `data/parsed/` 샘플 파일 Zod 검증 통과
- [ ] `data/` 백업 경로(외장 SSD) 연결 확인
- [ ] **(v3.2)** `scripts/backup.sh` 드라이런 — 외장 SSD 미마운트 시 exit 2 동작 확인 (§29.2)
- [ ] **(v3.2)** `src/logging/redact.ts` 유닛 테스트 — Telegram 토큰/쿠키 마스킹 검증 (§22.3)

---

## 26. robots.txt 자동화 (★ v3 신규)

### 26.1 원칙

- Phase -1에서 모든 소스의 `robots.txt`를 다운로드하여 `data/robots/<source>.txt`에 저장.
- `robots-parser` 라이브러리로 수집 대상 URL마다 `isAllowed(url, userAgent)` 확인.
- `User-Agent` 값은 실제로 송신하는 UA와 동일하게 유지 (일관성).
- 위반 URL은 `data/robots/exclusions.json`에 기록 → 러너가 로드해 **요청 자체를 스킵**.
- 수동 승인 UI: `pnpm run robots:review` → 위반 항목을 터미널에서 한 줄씩 표시, y/N로 무시/포함 결정.
- **★ v3.2 D4 — 재로드 정책:** 크롤링이 **24시간 이상** 걸리는 소스는 세션 시작마다 robots.txt 재로드. 해시(`sha256`) 변경 시 `data/logs/events.jsonl`에 `robots.changed` 기록 + `warn` 알림. 신규 차단 경로가 수집 대상과 겹치면 해당 페이지 자동 스킵 + 알림.
- **★ v3.2 D4 — 기본값 보수화:** `isAllowed` 반환이 `undefined`(규칙 해석 불가)이면 **`false`로 취급**(스킵). v3.1까지 `?? true`로 허용했던 것은 과민 허용.

### 26.2 구현

```typescript
// src/robots/checker.ts
import robotsParser from 'robots-parser'
import ky from 'ky'
import fs from 'node:fs/promises'
import path from 'node:path'

export class RobotsChecker {
  private parsers = new Map<string, ReturnType<typeof robotsParser>>()

  async load(source: string, baseUrl: string): Promise<void> {
    const robotsUrl = new URL('/robots.txt', baseUrl).toString()
    const text = await ky.get(robotsUrl, { timeout: 10_000 }).text().catch(() => '')
    const cachePath = path.resolve(`data/robots/${source}.txt`)
    await fs.mkdir(path.dirname(cachePath), { recursive: true })
    await fs.writeFile(cachePath, text)
    this.parsers.set(source, robotsParser(robotsUrl, text))
  }

  isAllowed(source: string, url: string, userAgent: string): boolean {
    const p = this.parsers.get(source)
    if (!p) throw new Error(`robots.txt not loaded for ${source}`)
    // ★ v3.2 D4: 해석 불가(?? undefined)는 보수적으로 스킵. 이전 기본값 true 는 과민 허용.
    return p.isAllowed(url, userAgent) ?? false
  }

  /** 긴 크롤링 중 재로드. 해시 변경 시 true 반환 → 호출부가 warn 알림 발행. */
  async reloadIfChanged(source: string, baseUrl: string): Promise<boolean> {
    const prevPath = path.resolve(`data/robots/${source}.txt`)
    const prev = await fs.readFile(prevPath, 'utf8').catch(() => '')
    await this.load(source, baseUrl)
    const next = await fs.readFile(prevPath, 'utf8').catch(() => '')
    return prev !== next
  }
}
```

### 26.3 러너 통합

모든 fetcher는 요청 전에 `robots.isAllowed` 확인 → false이면 **요청하지 않고** 스킵 로그를 남긴다. 이 정책은 운영 중에도 유효.

---

## 27. 데이터 검증 전략 (★ v3 신규)

### 27.1 Zod 스키마 (v3.1: 출처 메타데이터 공통화 / v3.3: zod 4 API)

파싱 결과는 모두 Zod 스키마 통과 의무. 실패 시 원본 HTML + 파싱 결과 + 에러 로그를 `data/invalid/<source>/<timestamp>/` 에 저장해 수동 조사.

**구조 원칙:** 출처/라이선스 필드는 공통 `SourceMetadataSchema`로 추출하고 모든 엔티티가 `.extend(B.shape)`로 확장한다. 누락 리스크 제거 + 표준화.

> **zod 4 API 주의 (2026-04-19 반영):** 아래 deprecated API 사용 금지.
> - `.merge(B)` → `.extend(B.shape)`
> - `z.string().url()` → `z.url()`
> - `z.string().datetime()` → `z.iso.datetime()`
>
> 리포지토리에 설치된 zod 버전(`4.3.6` 이상)에서 이전 API 는 deprecated 표시되며,
> IDE 의 strikethrough 로 노출된다. 신규 스키마는 반드시 4 API 로 작성.

```typescript
// shared/src/validators/schemas/_base.ts
import { z } from 'zod'

// ── 공통: 출처 메타데이터 ─────────────────────────
export const SourceSiteEnum = z.enum(['serebii', 'pokopiaGuide', 'pokopoko', 'namuwiki'])
export type SourceSite = z.infer<typeof SourceSiteEnum>

export const SourceMetadataSchema = z.object({
  sourceSite: SourceSiteEnum,
  sourceUrl: z.url(),
  scrapedAt: z.iso.datetime(),
  license: z.string().min(1),
  copyrightHolder: z.string().min(1),
  attribution: z.string().min(1),
  // 한국어 매핑처럼 다른 소스에서 파생된 경우 원본 추적
  derivedFrom: z
    .object({
      sourceSite: SourceSiteEnum,
      sourceUrl: z.url(),
    })
    .optional(),
})
export type SourceMetadata = z.infer<typeof SourceMetadataSchema>

// ── 엔티티 스키마는 공통 메타데이터를 extend(shape) ──────
// shared/src/validators/schemas/pokemon.ts
export const PokemonSchema = z
  .object({
    pokedexNo: z.number().int().positive(),
    nameEn: z.string().min(1),
    imageUrl: z.url(),
    specialties: z.array(z.string()).default([]),
  })
  .extend(SourceMetadataSchema.shape)

// shared/src/validators/schemas/item.ts
export const ItemSchema = z
  .object({
    nameEn: z.string().min(1),
    description: z.string().default(''),
    tags: z.array(z.string()).default([]),
    locations: z.array(z.string()).default([]),
    imageUrl: z.url().optional(),
  })
  .extend(SourceMetadataSchema.shape)

// habitat, specialty, cooking, location, furniture 등 동일 패턴으로 전 엔티티 정의
// 한국어 번역/매핑 전용 엔티티는 derivedFrom을 반드시 포함해야 함 (§27.4 주입 헬퍼 참조)
```

> **DB 반영 범위:** 본 문서는 Zod 스키마 레벨까지만 다룬다. Prisma 컬럼 매핑(컬럼 8개 vs JSONB 단일 컬럼 vs 정규화 FK)은 `schema.prisma` 설계 단계에서 별도 결정 — 메타데이터 필드가 존재한다는 계약만 이 시점에 확정.

### 27.2 검증 실행 규칙

- 단일 엔티티 파싱 직후 `schema.safeParse(data)` 호출
- 실패 시: `data.integrity_failure` 이벤트 (high) + 원본/결과/에러 저장
- 임계 초과 시 (예: 10건/시간) 추가로 critical 알림

### 27.3 Phase 7 최종 검증

- 모든 엔티티 수량 확인 (예: pokemon ≥ 199, habitat ≥ 209, item ≥ 300)
- 교차 참조 검증: cooking 레시피의 재료가 item 테이블에 존재하는가
- 이미지 누락: imageUrl이 있는데 로컬 파일이 없으면 `phase-7/missing-images.json` 생성
- **Attribution 완전성:** 모든 레코드가 `sourceUrl` / `license` / `copyrightHolder` / `attribution` 비어있지 않은지 검증. 한국어 매핑 레코드는 `derivedFrom` 존재 여부도 확인.

### 27.4 소스별 기본 메타데이터 (SOURCE_DEFAULTS)

파서는 엔티티 생성 시 아래 기본값을 자동 주입한다. 사이트 정책 변경 시 이 파일만 수정.

```typescript
// src/config/source-metadata.ts
import type { SourceMetadata, SourceSite } from '@/validators/schemas'

export const SOURCE_DEFAULTS: Record<
  SourceSite,
  Pick<SourceMetadata, 'license' | 'copyrightHolder' | 'attribution'>
> = {
  serebii: {
    license: 'Fan-use (non-commercial). Per Serebii.net content guidelines.',
    copyrightHolder:
      'Game content © The Pokémon Company / Nintendo / GAME FREAK. Original writings © Serebii.net.',
    attribution: 'Data from Serebii.net — https://www.serebii.net/pokemonpokopia/',
  },
  pokopiaGuide: {
    license: 'Fan wiki, license unverified (treat as non-commercial fan-use)',
    copyrightHolder:
      'Game content © The Pokémon Company / Nintendo / GAME FREAK. Korean localization contributions © PokopiaGuide contributors.',
    attribution: 'Korean name mapping from PokopiaGuide — https://www.pokopiaguide.com/ko',
  },
  pokopoko: {
    license: 'Unknown (treat as non-commercial fan-use; re-evaluate before public release)',
    copyrightHolder: 'Game content © The Pokémon Company / Nintendo / GAME FREAK.',
    attribution: 'Korean translation from pokopoko.kr',
  },
  namuwiki: {
    license: 'CC BY-NC-SA 2.0 KR (namu.wiki default)',
    copyrightHolder:
      'Text © namu.wiki contributors (CC BY-NC-SA 2.0 KR). Game content © The Pokémon Company / Nintendo / GAME FREAK.',
    attribution: 'Content from namu.wiki (CC BY-NC-SA 2.0 KR) — https://namu.wiki',
  },
}
```

**주입 헬퍼 (v3.3: `scrapedAt` 옵셔널):**

```typescript
// shared/src/validators/metadata.ts
import { SOURCE_DEFAULTS } from '../config/source-metadata'
import type { SourceMetadata, SourceSite } from './schemas/_base'

export function buildSourceMetadata(args: {
  sourceSite: SourceSite
  sourceUrl: string
  scrapedAt?: string       // ★ v3.3 — 1엔티티 1회 생성 후 재사용 규칙 참조
  derivedFrom?: SourceMetadata['derivedFrom']
}): SourceMetadata {
  const defaults = SOURCE_DEFAULTS[args.sourceSite]
  return {
    sourceSite: args.sourceSite,
    sourceUrl: args.sourceUrl,
    scrapedAt: args.scrapedAt ?? new Date().toISOString(),
    license: defaults.license,
    copyrightHolder: defaults.copyrightHolder,
    attribution: defaults.attribution,
    ...(args.derivedFrom ? { derivedFrom: args.derivedFrom } : {}),
  }
}
```

**호출 규칙 (★ v3.3):**

- **1엔티티 1회 호출** 원칙: 한 엔티티를 여러 레코드(본체 + i18n + 관계 FK)로 분해할 때는 파서가 **엔티티 시작 시점에 `scrapedAt = new Date().toISOString()` 을 한 번 생성**하고, 각 `buildSourceMetadata` 호출에 동일 문자열을 전달한다. ms 단위 drift 로 동일 엔티티 내 레코드별 타임스탬프가 흩어지면 감사·재현성·결합 키 설계가 어긋난다.
- **단일 레코드 파서**는 `scrapedAt` 을 생략해 내부 기본값(호출 시점 UTC ISO) 을 사용한다.
- **테스트**에서는 고정 문자열(`'2026-04-19T00:00:00.000Z'` 등) 을 주입해 스냅샷/결정성 확보.

**사용 예 (한국어 매핑, 엔티티 시작 시 `scrapedAt` 고정):**

```typescript
// 파서가 하나의 Pokemon 엔티티를 파싱할 때
const scrapedAt = new Date().toISOString()          // ★ 엔티티 진입 시 1회

const pokemon = PokemonSchema.parse({
  pokedexNo: 25,
  nameEn: 'Pikachu',
  ...buildSourceMetadata({
    sourceSite: 'serebii',
    sourceUrl: 'https://www.serebii.net/pokemonpokopia/pokemon/025.shtml',
    scrapedAt,
  }),
})

const pokemonKoMapping = KoreanPokemonMappingSchema.parse({
  pokedexNo: 25,
  nameKo: '피카츄',
  ...buildSourceMetadata({
    sourceSite: 'pokopiaGuide',
    sourceUrl: 'https://www.pokopiaguide.com/ko/pokedex/25',
    scrapedAt,                                      // 동일 문자열 재사용
    derivedFrom: {
      sourceSite: 'serebii',
      sourceUrl: 'https://www.serebii.net/pokemonpokopia/pokemon/025.shtml',
    },
  }),
})
```

**공개 시 attribution 페이지 자동 생성 (Phase 7 후):**

```typescript
// 모든 레코드에서 {sourceSite, attribution}을 distinct 집계 → /attribution 페이지 Markdown 생성
// 향후 pokopia-web 레포에서 활용. 본 스크래퍼는 JSON 내보내기만 담당.
```

---

## 28. 드라이런 & 부분 실행 모드 (★ v3 신규)

### 28.1 CLI 옵션

```bash
# 전체 실행 (실제 DB 쓰기, 실제 알림 송신)
pnpm run scrape

# 드라이런: DB 쓰지 않음, 알림 송신하지 않음, 파싱 결과만 console + 파일
pnpm run scrape --dry-run

# 특정 소스/페이지만
pnpm run scrape --source serebii --page availablepokemon
pnpm run scrape --source pokopiaGuide --entity pokemon --limit 10

# 캐시만 사용 (재스크래핑 없이 파서 로직만 검증)
pnpm run scrape --no-fetch --source serebii

# 특정 Phase만
pnpm run scrape --phase 1
pnpm run scrape --phase 6a --resume
```

### 28.2 권장 최초 실행 순서

1. `--dry-run --source serebii --page availablepokemon --limit 5` — 5페이지만 테스트
2. 파싱 결과 `data/parsed/pokemon/serebii.json` 수동 검토
3. Zod 검증 통과 확인
4. 확장: `--source serebii --phase 1`
5. 그 다음: Phase 2~5 순차
6. Phase 6a는 Phase 0 API discovery 이후

### 28.3 `--resume` 의미

- `data/state/crawl.json` 읽고 마지막 완료 페이지 이후부터 재개
- Cooldown이 남아있으면 만료 대기
- 완료 페이지는 재요청하지 않음 (멱등성)

---

## 29. 백업 & 복구 (★ v3 신규)

### 29.1 백업 대상과 주기

| 대상 | 위치 | 주기 | 이유 |
|------|------|------|------|
| `data/parsed/` | 외장 SSD | 매일 증분 (rsync) | 재스크래핑 비용 회피 |
| `data/cache/` | 외장 SSD | 매일 증분 | HTML 원본 — 파싱 로직 회귀 대비 |
| `data/browser-profiles/` | 외장 SSD | 매주 전체 | 워밍 시간 + 쿠키 보존 |
| `data/robots/` | 외장 SSD | 매일 | 감사 추적 |
| `data/logs/` | 외장 SSD | 매일 | 사후 분석 |
| PostgreSQL `pokopia` DB | 기존 cronjob + 외장 SSD pg_dump | 매일 | 최종 적재 결과 |

### 29.2 rsync 스크립트

```bash
#!/bin/bash
# scripts/backup.sh
# ★ v3.2 D2: 외장 SSD 마운트 검증. 마운트 안 된 상태에서 /Volumes/External 경로에
# 쓰면 macOS 는 내장 디스크에 디렉토리를 만들어 버린다 → 백업 목적 상실.
set -euo pipefail

SRC="$HOME/workspace/pokopia-wiki/data"
MOUNT="/Volumes/External"
DST="$MOUNT/pokopia-backup/data-$(date +%Y-%m-%d)"

# 1) 마운트 검증: 디렉토리 존재 + diskutil 로 실제 외부 디스크인지 확인
if [ ! -d "$MOUNT" ]; then
  echo "[backup] $MOUNT 미존재 — 외장 SSD 미연결. 종료." >&2
  exit 2
fi
if ! diskutil info "$MOUNT" >/dev/null 2>&1; then
  echo "[backup] $MOUNT 는 diskutil 이 인식하는 마운트 포인트가 아님. 종료." >&2
  exit 2
fi

# 2) 남은 용량 5GB 미만이면 경고
FREE_KB=$(df -k "$MOUNT" | awk 'NR==2 {print $4}')
if [ "${FREE_KB:-0}" -lt 5000000 ]; then
  echo "[backup] $MOUNT 남은 용량 < 5GB — 정리 필요." >&2
fi

mkdir -p "$DST"
rsync -a --delete \
  --exclude 'parsed/tmp/' \
  --exclude 'cache/*.tmp' \
  "$SRC/" "$DST/"

# 14일 이상 백업 제거 (mtime 기준)
find "$MOUNT/pokopia-backup/" -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
```

`crontab -e`:
```
0 4 * * * /Users/ukyi/workspace/pokopia-wiki/scripts/backup.sh >> /var/log/pokopia-backup.log 2>&1
```

### 29.3 복구 시나리오

| 장애 | 복구 |
|------|------|
| 프로필 corruption | 외장 SSD → `data/browser-profiles/`에 복사 + 1일 재워밍 |
| 파싱 결과 손실 | 외장 SSD `data/parsed/` 복원 → Prisma upsert 재실행 (멱등) |
| DB 장애 | pg_dump에서 restore → `data/parsed/`와 해시 비교 |
| Mac 자체 장애 | 외장 SSD → 새 Mac에서 `pnpm install` → `--resume` |

---

## 30. 변경 이력

### 30.1 v2 → v3

| 항목 | v2 | v3 |
|------|-----|-----|
| 페르소나 수 | 4개 | 2개 (시간 분리) |
| Serebii Fetcher | Playwright + 핑거프린트 | **ky 단순 HTTP** (T0) |
| 워밍 기간 | 2~3일 | 1일 |
| 프로필 북마크/localStorage | 파일 직접 편집 | **Playwright API만** |
| 마우스 클릭 | `page.mouse.move` 직선 | **`ghost-cursor-playwright`** |
| HTTP 헤더 | 수동 상수 주입 | Chromium 엔진 기본값 |
| 403/429 대응 | `reload()` + `goBack()` | **세션 즉시 종료 + cooldown** |
| 알림 시스템 | Telegram/macOS 단일 함수 | **Notifier 클래스 + severity 라우팅 + 배칭** |
| Rate Limit 수치 | PokopiaGuide 3~4일 (비현실적) | 5~15일 (API 여부 반영) |
| robots.txt | 주장만 | **Phase -1 자동 다운로드 + 차단** |
| 데이터 검증 | 언급만 | **Zod 스키마 + 실패 격리** |
| 드라이런 | 없음 | **`--dry-run`, `--source`, `--phase`, `--resume`** |
| 백업 | 프로필만 | **parsed/cache/logs/DB 포함** |
| 총 소요 (최소) | N/A | **~7일 (API 발견 + T2/T3 생략)** |
| 총 소요 (최대) | 2~3주 | **~3주** |

### 30.2 v3 → v3.1

| 항목 | v3 | v3.1 |
|------|-----|-----|
| SSoT 정책 | "TECH_STACK이 진실의 소스" (모순됨) | **CRAWLING_STRATEGY가 fetcher/티어/페르소나 SSoT.** TECH_STACK은 상위 스택만 |
| 핑거프린트 고정 범위 | "평생 고정" (모호) | **정체성 특성만 고정. 버전 특성은 세션 시작마다 재계산** (§5.3) |
| Chrome 자동 업데이트 | 언급 없음 | **자연 허용 + 파생값 자동 동기화** (§9.2) |
| 버전 재검출 주기 | 부팅 시 1회 | **세션 시작마다** (`onSessionStart`) |
| 메이저 버전 bump 시 | 미정 | **세션 계속 진행 + `chrome.version_bump` 이벤트 로그** (알림 X) |
| 버전 상태 파일 | 없음 | `data/state/chrome-version.json` |
| 고엔트로피 값 동기화 | 미언급 | `navigator.userAgentData.brands` / `getHighEntropyValues()` 주입 |
| 출처 메타데이터 | `sourceUrl` + `scrapedAt`만 | **공통 `SourceMetadataSchema`** + `sourceSite`/`license`/`copyrightHolder`/`attribution`/`derivedFrom` (§27.1) |
| 소스별 라이선스/attribution | 미정 | **`SOURCE_DEFAULTS` config + `buildSourceMetadata()` 헬퍼** (§27.4) |
| Phase 7 검증 | 수량/이미지만 | **attribution 완전성 검증 추가** |
| Canvas/Audio/Fonts 핑거프린트 | 주석 언급만 | **T1: `fingerprint-injector` + `fingerprint-generator` (seed 일관)** (§9.1.1) |
| T2/T3 핑거프린트 주입 | 정책 없음 | **patchright 위임 + 이중 패치 금지 명문화** (§9.1.2) |
| WebGL 주입 범위 | WebGL1만 | **WebGL2까지 포함** (§9.1.2) |
| Rate Limit 카운트 정의 | "요청" 단일 단위 (모호) | **navigation / resource / direct fetch 3종 분리** (§14.1) |
| Serebii 이미지 카운트 | 페이지 카운트에 포함? 미정 | **`direct fetch` 별도 쿼터** (`maxPerDay: 1500`) (§14.3) |
| pokopoko/namuwiki 수치 | 범위만 제시 | **명시 값 확정** (40/일, 15/일) (§14.2) |
| Rate 자동 조정 | 미정 | **Phase 0 샘플링 기반 하향 보정만.** 런타임 자동 조정 금지 (§14.4) |
| Notifier `sendTelegram` 파라미터 | `silent` (동작과 의미 반전 — 버그 유발) | **`opts: { withSound }`** 로 재설계, 호출부/내부 일관 (§13.3.5) |
| Notifier `info` 배치 타이머 | 참조 미보관 → 종료 블록/누수 | **`infoFlushTimer` 필드로 보관 + shutdown에서 clearInterval** (§13.3.5) |
| `document.visibilityState` 위조 | `value` 기반 덮어쓰기 (탐지 가능) | **getter 기반 주입 + `document.hidden` / `hasFocus` / blur/focus 이벤트까지** (§7.3) |
| v2 잔재 `english-wiki-reader` 페르소나 이름 | 문서 내 4곳 잔존 | **현행 페르소나(`korean-pokemon-fan`/`namuwiki-researcher`)로 정리** (§5.2, §16.1, §20.1) |
| 동시 세션 규칙 | 암시만 존재, 3개 질문 미정 | **§6.4 신설** — 매트릭스 + `ConcurrencyGuard` 컴포넌트 + T0/T1+ 스태거 + 소스 전환 30분 gap |
| `interSessionMs` 정의 | 모호 | **같은 소스 기준**으로 명확화 (§6.1). 다른 소스 전환 gap은 별도 규칙 |

### 30.3 v3.1 → v3.2

심층 리뷰(2026-04-17)에서 발견된 **치명적 결함 + 설계 공백**을 해소. 컴파일 실패 수준 버그를 우선 제거하고, 동시성·보안·관측성을 실운영 수준으로 끌어올림.

| 분류 | 항목 | v3.1 | v3.2 |
|------|------|------|------|
| **A1 치명** | `notifyUser(...)` 이벤트 이름 | `'block'`, `'cloudflare_timeout'`, `'captcha'`, `'soft_throttle'` (EventType 불일치 → 런타임 `SEVERITY_MAP[type]` undefined + TS 컴파일 실패) | **§13.3.2 EventType 과 정확히 일치**: `'block.403'`/`'block.429'`/`'cloudflare.challenge_timeout'`/`'captcha.detected'`/`'captcha.unresolved'`/`'soft_throttle.detected'` (§11.1) |
| **A2 치명** | `DetectionSignal.evidence` | 필수(`string`)인데 호출부 다수가 누락 → TS 컴파일 실패 | **optional** (`evidence?`, `url?`, `at?`) + `push()` 헬퍼가 공통 필드 주입 (§12.1) |
| **A3 치명** | canvas/audio/fonts seed | `ProfileFingerprint` 필드로 선언하나 `attachFingerprint` 가 사용 안 함 → dead field, "평생 고정" 약속 깨짐 | **`<profilePath>/fingerprint.json` 단일 출처**. `ProfileFingerprint` 는 하드웨어 결정형 필드만. §5.3 표 재정리 |
| **A4 치명** | `ConcurrencyGuard` 동시성 | canStart→register 비원자적, stale pid 판정 불가, 크래시 복구가 "전체 소거" → 살아있는 세션도 제거 | **`proper-lockfile` 파일 락 + `acquire()` 단일 크리티컬 섹션** + `pid`/`hostname` 기반 liveness + `reconcileOnBoot` 이 죽은 것만 reap (§6.4.3) |
| **A5 치명** | §17.2 총계 수치 | 최소 ~7일 / 최대 ~3주 (실제 합 8.25일 / 32일 — 최대치 과소평가) | **최소 8.25일(~1.2주) / 최대 32일(~4.6주)** 로 재계산. §15.5 낙관치도 동일 갱신 |
| **B1 중요** | T2/T3 WebGL 주입 | 무조건 수동 `getParameter` 덮어쓰기 — patchright 가 이미 처리하면 이중 패치 | Phase -1 probe (`data/preflight/patchright-webgl.json`) **결과에 따라 조건부**로만 적용 (§9.1.2) |
| **B2 중요** | visibility 위조 toString 벡터 | 대응 없음 — `Object.getOwnPropertyDescriptor(...).get.toString()` 로 JS 함수임이 드러남 | **주석으로 잔존 벡터 명시 + 필요 시 `Function.prototype.toString` 프록시 보강 지침** (§7.3) |
| **B3 중요** | `ChromeVersion` 필드 순서 | `{major, minor, patch, build}` — Chrome 공식 체계 `MAJOR.MINOR.BUILD.PATCH` 와 patch/build 반전 | `{major, minor, build, patch}` 로 정정 (§9.2) |
| **B4 중요** | `fingerprint-generator` minVersion | `120` 하드코딩 — 시간 지나면 구형 프로필만 샘플 | **동적**: `Math.max(120, detectChromeVersion().major - 4)` (§9.1.1) |
| **B5 중요** | `userAgentData.brands` 서술자 | `{ get }` 만 지정 (configurable/enumerable 기본 false) + toString 위장 없음 | `{ configurable: true, enumerable: true, get }` + `Function.prototype.toString` 네이티브 위장 헬퍼 (§9.2) |
| **B6 중요** | `Notifier` dedup | in-memory only → 재시작 시 알림 폭주 | `data/state/notifier-dedup.json` **영속화**, 24h 이상 만료 (§13.3.5) |
| **B7 중요** | `Notifier` 즉시 송신 | `await sendImmediate` — high/critical 경로가 최대 30초 블로킹 | **`immediateQueue` + 백그라운드 워커** fire-and-forget, `notify()` 반환형 `void` (§13.3.5) |
| **B8 중요** | `getMe` 응답 검증 | `ok` 필드 미확인 — `{ ok: false }` + HTTP 200 패턴에 취약 | **`ok` 필수 검증** + 실패 시 `description`/`error_code` 기반 명시적 에러 (§13.3.6) |
| **C1 정리** | `peakHours`, `weekendBoost` | 정의만, 사용처 없음 | **삭제** (§6.1) |
| **C2 정리** | `requestsPerSession` 이중 정의 | §6.1 글로벌 {20,80} vs §14.3 소스별 (serebii=100 등) 충돌 | **§14.3 `RateLimitConfig`를 SSoT로 단일화**, §6.1 항목 제거 |
| **C3 정리** | `Source` 타입 여러 곳 재정의 | §6.4.3/§14.3 는 `Source`, §27.1 은 `SourceSiteEnum` (정의 불일치) | **§27.1 `SourceSite`를 SSoT**, 다른 곳은 `type Source = SourceSite` 로 import (문서 상단 명시) |
| **C4 정리** | SSoT 경계 모호 | TECH_STACK.md / DATA_COLLECTION_PLAN.md 와 역할 중복 | **문서 상단에 3 문서 역할 명시** — 본 문서는 fetcher/티어/페르소나/Rate/동시성/알림/에러, TECH_STACK은 상위 스택, DATA_COLLECTION_PLAN은 페이지/엔티티 목록 |
| **D1 보안** | `mapUrlToStoragePath` | 미구현·traversal 방어 없음 | 호스트 화이트리스트 + `../`/`\\`/`%00` 차단 + `IMAGE_ROOT` containment 검증 (§10.3) |
| **D2 운영** | `backup.sh` 외장 SSD | 마운트 미검증 — 미연결 시 내장 디스크에 백업 | `diskutil info` + 남은 용량 체크 + 실패 시 exit 2 (§29.2) |
| **D3 보안** | 로그 민감정보 | 마스킹 정책 없음 — 토큰/쿠키가 외장 SSD 로 복사 | `redact()`/`redactObject()` + `events.jsonl` append 필수 적용 (§22.3) |
| **D4 보안** | robots.txt 갱신 | Phase -1 1회만 + `?? true` 허용 기본값 | **세션 시작마다 `reloadIfChanged`** + `?? false` 보수 기본값 + `robots.changed` 알림 (§26.1) |
| **공백** | Playwright context 수명 | 미정 | **세션당 1개**, 종료 시 close, 장기 crawl 에서도 세션 경계마다 교체 — §5.5 신설 |
| **공백** | `milestone.daily_summary` 트리거 | 구현 장소 불명 | **프로세스 내 `node-cron`**, 프로세스 없을 땐 다음 실행 시 회고 요약으로 대체 (§22.2) |
| **공백** | 새 EventType | 없음 | `scheduler.persona_conflict`, `chrome.version_bump`, `robots.changed` 신설 + `SEVERITY_MAP` 갱신 |
| **신규 의존성** | — | — | `proper-lockfile` (A4), `node-cron` (§22.2 daily summary) + 대응 `@types/*` |

**v3.1 → v3.2 이행 체크리스트 (운영자):**
1. `pnpm add proper-lockfile node-cron` + `pnpm add -D @types/proper-lockfile @types/node-cron`.
2. §11.1 `notifyUser` 호출부 전부 EventType 값으로 치환(A1). ripgrep 로 `notifyUser\('(block|captcha|cloudflare_timeout|soft_throttle)'` 검색.
3. `ConcurrencyGuard` 기존 사용처 `canStart()/register()` → `acquire()` / `release()` 리팩터.
4. §22.3 `redact` 를 `events.jsonl` append 경로에 삽입, 유닛 테스트 1개 작성.
5. `scripts/check-patchright.ts` 실행해 `data/preflight/patchright-webgl.json` 생성.
6. `scripts/backup.sh` 드라이런 (외장 SSD 빼고 exit 2 나오는지 확인).
