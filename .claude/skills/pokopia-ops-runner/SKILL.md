---
name: pokopia-ops-runner
description: Pokopia 스크래퍼 실행과 운영. Preflight(robots/access/patchright/network/notifier), 드라이런(--dry-run --source X --page Y --limit 5), 부분 실행(--phase N --resume), crawl state/cooldown/healthScore 관리, Telegram/macOS 알림 로그 해석, 파싱 실패율 모니터링, 백업 검증(외장 SSD 마운트), 로그 마스킹 감시. 크롤러 시작·중단·재개·에러 대응·장기 운영(최대 4.6주) 모니터링·Phase 별 실행 지휘 시 반드시 이 스킬을 사용한다.
version: "1.0.0"
---

# Pokopia 스크래퍼 실행·운영

이 스킬은 크롤러를 **안전하게** 실행하고 장기 운영 중 이상을 조기 감지하는 방법을 표준화한다. 공격적 실행은 금지, 드라이런 선행이 기본.

## 운영 원칙 (CRAWLING_STRATEGY §1 + §22)

1. **안정성 > 속도** — 며칠 걸려도 차단 안 되는 게 우선
2. **드라이런 선행** — 1 페이지 성공 → Phase 확장. 한 번에 전체 X
3. **페일오버 > 무리한 시도** — 3회 실패 = 포기
4. **페르소나 시간 분리** — 같은 IP에서 두 페르소나 동시 운용 X
5. **cooldown 존중** — 재실행 시에도 cooldown 만료 대기

## 표준 실행 시퀀스

### Step 1: Preflight (Phase -1)

```bash
pnpm run check:robots       # 모든 소스 robots.txt 다운로드, 위반 리포트
pnpm run check:access       # 각 소스 1페이지 접근
pnpm run check:patchright   # patchright 버전 + bot.sannysoft.com + nowsecure.nl
pnpm run check:network      # IP=KR, TZ=Asia/Seoul
pnpm run notifier:test      # Telegram + macOS 알림 엔드투엔드
```

**하나라도 실패 → 구현 착수 금지** (CRAWLING_STRATEGY §1.4).

통과 시 `data/preflight/<date>/` 에 로그/스크린샷 저장.

### Step 2: API Discovery (Phase 0)

```bash
pnpm run discover:pokopiaGuide
# → data/api-discovery.json 생성
# API 발견 시 일정 대폭 단축 (15일 → 5~7일)
```

namu.wiki 탐색 결과에 따라:
- nowsecure.nl 통과 O → T3 계속
- nowsecure.nl 통과 X → **즉시 T3 포기**, 수동 번역 전환

### Step 3: 드라이런

```bash
# 단일 페이지 5개만
pnpm run scrape --dry-run --source serebii --page availablepokemon --limit 5

# 파서 로직만 (캐시 사용, 재요청 없음)
pnpm run scrape --no-fetch --source serebii --page availablepokemon

# 특정 Phase만 dry-run
pnpm run scrape --dry-run --phase 1
```

**드라이런 성공 기준:**
- Zod 검증 100% 통과 (예상 실패 제외)
- `data/parsed/<entity>/<source>.json` 파일 생성 + 수동 검토 적합
- 로그에 에러·경보 없음

### Step 4: 프로덕션 실행

```bash
# Serebii (T0, 약 40~60분)
pnpm run scrape --phase 1
pnpm run scrape --phase 2
# ... Phase 5까지

# PokopiaGuide (T1, 5~15일)
pnpm run scrape --phase 6a
pnpm run scrape --phase 6a --resume  # 재개

# pokopoko (T2, 성공 시만)
pnpm run scrape --phase 6b

# namu.wiki (T3, 성공 시만, 대부분 포기)
pnpm run scrape --phase 6c

# 최종 검증
pnpm run scrape --phase 7
pnpm run validate
```

`--resume`: `data/state/crawl.json` 기반 마지막 완료 페이지 이후부터 재개.

## 모니터링 대시보드

```bash
pnpm run status
```

출력 예:
```
╭─ Pokopia Scraper Status (2026-05-15 14:23) ─────────────────╮
│ Current Phase: 6a (PokopiaGuide, T1)                         │
│ Active Persona: korean-pokemon-fan (healthScore: 88/100)    │
│ Session: #43, started 14:05, requests: 28/50, remaining 22   │
│ Today: 152 requests (limit 200)                              │
│ Cooldowns:                                                   │
│   pokopiaGuide: none                                         │
│   pokopoko: 2026-05-16 06:00 (14h 23m)                       │
│                                                              │
│ Completed Pages: 438 / 1203                                  │
│ Parse Failures (24h): 3 (0.7%)                               │
│ Next Break: 14:45 (dwell: 22 min)                            │
╰─────────────────────────────────────────────────────────────╯
```

## 주요 모니터링 지표

### 1. HealthScore

- 100으로 시작, 에러·탐지 시그널마다 감점
- **< 20 → 페르소나 폐기 권고** (§22.1), 새 워밍 2~3일 필요
- 추세 하락(100 → 80 → 60) 조기 경보 → 원인 분석

### 2. Cooldown

- `data/state/cooldowns.json` 영속
- 재시작 시에도 존중
- 연속 실패 3회 → 해당 소스 24h
- 임계 신호 탐지 → 72h 해당 페르소나

### 3. 알림 로그 (`data/logs/events.jsonl`)

JSONL 포맷, 레벨별 라우팅:
- `info` — 배치 (일일 요약 23:55)
- `warn` — 배치 (시간 단위)
- `high` — 즉시 Telegram
- `critical` — 즉시 Telegram + macOS 소리

### 4. 파싱 실패율

- 24h 롤링: `(실패 페이지 / 전체 페이지) × 100`
- ≥5% → `warn` 경보 → `code-builder`에 알림
- ≥20% → 서킷 브레이커, 해당 파서 중단

### 5. 백업 상태

```bash
scripts/backup.sh
# 외장 SSD 마운트 검증 → 미마운트 시 exit 2
# data/parsed/, data/cache/, data/browser-profiles/ 백업
# 14일 이상 오래된 백업 제거
```

- 외장 SSD 마운트 상태 확인 의무 (v3.2 D2)
- 백업 실패 시 `warn` 알림, 크롤링 중단은 하지 않음

## 에러 반응 매뉴얼

| 이벤트 | 반응 |
|--------|------|
| 403 | 세션 종료, 24h cooldown, `high` 알림 |
| 429/503 | 지수 백오프 1→2→4s, 3회 실패 시 큐 |
| CAPTCHA | `critical` 알림 + macOS 소리 → 수동 개입 필요 |
| CF challenge 실패 | T3 세션 종료, 72h 페르소나 cooldown |
| 파싱 실패율 ≥20% | 서킷 브레이커, 해당 파서 중단 |
| DNS/네트워크 에러 | 5분 대기, 3회 재시도, 실패 시 `high` |
| 임계 신호 | 즉시 세션 중단, 72h 페르소나 cooldown, `critical` |

## 드라이런 실패 시 대응

1. `data/invalid/<source>/<timestamp>/page.html` 열어서 구조 확인
2. `data/invalid/<source>/<timestamp>/errors.json` 읽고 Zod 에러 파악
3. **`code-builder`에 이관** (repro 케이스: URL + HTML + 기대 출력)
4. 수정 후 같은 명령 재실행 → 통과 확인

## 재개(resume) 동작

```bash
pnpm run scrape --phase 6a --resume
```

내부 로직:
1. `data/state/crawl.json` 읽기 → 마지막 완료 페이지
2. `data/state/cooldowns.json` 읽기 → 만료 안 된 cooldown 대기
3. 완료된 페이지는 건너뛰기 (멱등성)
4. 실패 페이지는 재큐

## 로그 마스킹 감시 (CRAWLING_STRATEGY §22.3)

감시 대상:
- Telegram 봇 토큰 (`\d{7,10}:[A-Za-z0-9_-]{30,}`) → `<TELEGRAM_TOKEN>`
- `Bearer <token>` → `Bearer <REDACTED>`
- `cf_clearance`, `__cf_bm`, `session`, `sid`, `auth` 쿠키값 → `<REDACTED>`

**검증:**
- `events.jsonl` 샘플 100줄에서 위 패턴 raw 노출 여부 확인
- 발견 시 즉시 `code-builder`에 마스킹 로직 수정 요청
- `.env` 내용이 startup 로그에 덤프되는지 확인

## 일일 요약 (§22.2)

매일 23:55 `milestone.daily_summary` 자동 송신 (node-cron 프로세스 내부).

수동 실행:
```bash
pnpm run report:daily
```

내용:
- 오늘 수집한 엔티티 수
- 완료/실패 페이지
- 현재 healthScore, cooldown
- 파싱 실패율

## 사용자 리포트 포맷

```markdown
# Pokopia Scraper Ops Report (YYYY-MM-DD)

## 상태
- 현재 Phase: 6a (PokopiaGuide)
- Day 4 / 예상 10일
- healthScore: 88 (korean-pokemon-fan)

## 진행
- 완료: 438 / 1,203 페이지 (36.4%)
- 예상 완료: 2026-05-22

## 경보
- None

## 이슈
- pokopoko 접근 403 재현 (§2.3) → Phase 6b 시도 예정

## 다음 액션
- 6a 완료 후 incremental QA → qa-analyst
- 6b 드라이런 (patchright)
```

## 백업 복구 리허설 (§29, 분기 1회)

```bash
# 스테이징 환경에서만
pnpm run restore:test --snapshot 2026-04-01
# → 복원 성공 + 데이터 무결성 검증
```

## 체크리스트 (Phase 실행 전)

- [ ] Preflight 통과 (모든 체크 초록)
- [ ] 드라이런 통과 (최소 1 페이지 성공)
- [ ] cooldown 상태 확인 (만료까지 대기하지 않음)
- [ ] healthScore ≥ 50
- [ ] 현재 시각이 페르소나 `activeHours` 안
- [ ] 파싱 실패율 < 5%
- [ ] 외장 SSD 마운트 확인
- [ ] `.env` 토큰 최신 (Telegram 봇 유효)

## 금지 사항

- `--force-fetch` 남발 (캐시 무시 → rate 부담 + 탐지 리스크)
- robots.txt 무시 플래그 (사용자 확인 없이)
- 페르소나 `activeHours` 위반 실행
- 프로덕션 DB에 `TRUNCATE`/`DROP`
- 임계 신호 무시하고 계속 실행
- `.env` 내용 Telegram 송신
- 드라이런 건너뛰고 바로 전체 실행

## 참조

- 운영 정책: `CRAWLING_STRATEGY.md §22`
- 에러 반응: `CRAWLING_STRATEGY.md §11`
- 알림 시스템: `CRAWLING_STRATEGY.md §13.3`
- 드라이런/부분 실행: `CRAWLING_STRATEGY.md §28`
- 백업/복구: `CRAWLING_STRATEGY.md §29`
- Phase 순서: `CRAWLING_STRATEGY.md §17`
- 시작 전 체크리스트: `CRAWLING_STRATEGY.md §25`
