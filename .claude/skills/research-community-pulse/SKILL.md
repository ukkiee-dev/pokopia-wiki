---
name: research-community-pulse
description: 리서치 팀의 커뮤니티·여론 수집 스킬. Reddit·Hacker News·Twitter/X·Stack Overflow·Amazon/G2 리뷰·전문 포럼에서 실사용자·실무자의 실제 반응과 경험을 조사. 여론 분포 추정(찬성/반대/중립), 바이럴 vs 마이너리티 구분, 감정 톤 분석(기대/체념/분노/냉소), 반복되는 불만·칭찬 패턴, 조작·봇 의심 신호 탐지, 플랫폼별 편향 기록. 주제에 현장 감각·사용자 경험·비공식 반응이 필요할 때 반드시 이 스킬을 사용한다. 커뮤니티 반응은 "사실 증명"이 아닌 "경험·인식"임을 강제로 명시한다.
version: "1.0.0"
---

# 리서치: 커뮤니티·여론 수집

이 스킬은 **실사용자·실무자의 비공식 반응**을 수집하고 여론 분포와 편향을 분석하는 방법을 표준화한다. 커뮤니티 데이터는 사실 증명이 아닌 경험·인식 지표임을 잊지 않는다.

## 왜 커뮤니티인가

공식 발표와 학술 논문은 "이상적 조건"을 다룬다. 실제 사용자·실무자는 다른 얘기를 한다:
- 배터리 12시간(공식) vs 6~8시간(실사용)
- 새 정책 효과(학술) vs 체감 변화 없음(시민)
- 제품 성능(벤치마크) vs "내 환경에서 안 됨"(포럼)

공식 + 학술 + 현장의 3자가 모여야 입체적 이해가 가능.

**하지만:** 커뮤니티 반응은 사실 증명이 아니다. 샘플링 편향·플랫폼 편향·조작이 항상 있음. **"N개 플랫폼 M개 스레드에서 반복 관찰된 경험·인식"**으로 기술하라.

## 플랫폼별 특성

| 플랫폼 | 강점 | 편향 / 함정 | 적합 주제 |
|--------|------|------------|----------|
| **Reddit** (subreddit) | 장문 댓글, 장기 스레드, vote | subreddit별 극단 편향, 알고리즘 | 거의 전분야 |
| **Hacker News** | 업계 실무자, 깊이 있는 토론 | SF 테크 편향, 성인 남성 과다 | 기술, 스타트업, 경제 |
| **Twitter/X** | 실시간, 바이럴 | 봇, 양극화, 짧은 맥락 | 뉴스 반응, 정치 |
| **Stack Overflow** | 실제 문제 해결 경험 | 초심자 질문 비중 | 프로그래밍 |
| **전문 포럼** | 장기 사용자, 전문성 | 찾기 어려움, 샘플 적음 | 취미, 전문 툴 |
| **Amazon / G2 / Glassdoor** | 소비자·직원 경험 | 조작 리뷰, extreme bias | 제품, 서비스, 직장 |
| **YouTube / 블로그 댓글** | 일반 대중 | 맥락 파악 어려움 | 대중 반응 |

## 샘플링 전략

### Step 1: 플랫폼 선택

주제별:
- 기술 제품: Reddit r/programming, HN, Stack Overflow
- 소비재: Reddit 관련, Amazon, G2
- 정책·사회: Twitter/X, Reddit r/politics (지역별)
- 의학·건강: r/AskDocs, 환자 커뮤니티 (**극히 주의**)
- 게임: r/games, Steam 리뷰, 게임별 subreddit
- 직장·회사: Glassdoor, Blind (익명성 높음)

### Step 2: 스레드 샘플링 (한 플랫폼당)

```
1. top upvoted (all-time) 3~5개
2. 최근 (last 30d) 3~5개
3. 반대 검색 ("{T} problem", "{T} issue", "{T} bad") 3~5개
4. 장문 댓글 중심 (1줄 답변·밈은 톤 지표로만)
```

### Step 3: 플랫폼별 편향 기록

각 플랫폼마다:
- 사용자 기반 (지역, 연령, 직업군)
- 알고리즘 동작 (upvote, 추천)
- 정치/가치 편향 (있으면)

## 도구 호출 패턴

### Reddit 검색

```
WebSearch("site:reddit.com \"{T}\"")
WebFetch("https://www.reddit.com/r/{sub}/search?q={T}&restrict_sr=1", 
         "Extract: top posts with title, upvotes, comment count, top 3 comments")
```

Reddit `.json` suffix로 raw 데이터 접근 가능: `https://reddit.com/r/X/top.json?t=year&limit=25`

### Hacker News (Algolia API)

```
WebFetch("https://hn.algolia.com/api/v1/search?query={T}&tags=story",
         "Extract: stories with title, points, comments, URL, date")
```

### Twitter/X

```
WebSearch("site:twitter.com OR site:x.com \"{T}\"")
```

로그인 벽 주의. 공개 검색으로 부족하면 Nitter 같은 프록시 (가용성 변동).

### Stack Overflow

```
WebFetch("https://stackoverflow.com/search?q={T}",
         "Extract: questions, answers, votes, tags")
```

### 제품 리뷰

```
WebSearch("{product} review site:reddit.com")
WebSearch("{product} site:amazon.com reviews")
WebSearch("{product} site:g2.com")
```

## 여론 분포 추정

```
찬성: ~N%
반대: ~M%
중립/혼합: ~K%
```

**이 추정의 신뢰 한계:**
- N개 플랫폼 × M개 스레드 샘플
- 전체 모집단(일반 대중) 일반화 주의
- 플랫폼별 편향 이미 기록

절대 "압도적 다수", "거의 모두"처럼 단정하지 않음. 항상 "샘플에서 관찰된".

## 감정 톤 분석

| 톤 | 특징 |
|----|------|
| **기대** | "waiting for", "hope", 긍정 미래 | 
| **체념** | "oh well", "nothing we can do" |
| **분노** | CAPS, 반복 감탄사, 격한 표현 |
| **냉소** | 빈정거림, "of course they did" |
| **혼란** | 질문, "anyone else?", "am I the only one?" |
| **축하** | 긍정 감탄, 공유 욕구 |

**주도 톤(primary tone)** + **빈도** 기록.

## 반복 패턴 탐지

같은 불만이 **여러 독립 스레드·계정·플랫폼**에서 반복되면 신호 강화.

```
칭찬 패턴:
- "배터리 오래 간다" — r/X (3 스레드), r/Y (2), HN (1) 합계 6 언급
- "UI 직관적" — r/X (2), Twitter (여럿, 추정 20+)

불만 패턴:
- "업데이트 후 느려짐" — r/X (5), Reddit 전체 (15+), Glassdoor 직원 리뷰 (3)
- "고객지원 응답 늦음" — 여러 플랫폼 반복
```

## 조작·봇 의심 신호

| 신호 | 의미 |
|------|------|
| 동일 문구 다계정 반복 | astroturfing 가능성 |
| 신규 계정 집중 긍정 리뷰 | 조작 리뷰 |
| 대량 bot-like 댓글 | 자동화 캠페인 |
| suspiciously coordinated timing | 조작 |

발견 시 **경고 표시** + 원본 스크린샷/아카이브 링크 (web.archive.org).

## 출력 구조

저장 경로: `_workspace/research/{topic-slug}/community_findings.md`

```markdown
# Community Findings: {topic}
수집자: research-community-listener
수집 일자: YYYY-MM-DD
플랫폼: Reddit, HN, Stack Overflow (3개)
총 스레드: N (장문 댓글 M)

## 여론 분포 (샘플 기반 추정)

- 긍정적: ~N% (근거 스레드: F1, F3, F7)
- 부정적: ~M%
- 중립/혼합: ~K%

**신뢰 한계**: N개 플랫폼 M개 스레드 샘플. 일반 대중 추정은 아님.

## 주도 감정 톤

- **기대** (신제품 주제 공통)
- **체념** (가격 인상 관련)
- 플랫폼별 차이: r/A는 분노, r/B는 냉소

## 반복 칭찬 패턴

### P1. "{패턴}"
- 관찰: r/X (3), HN (1), G2 (20+ 리뷰)
- 대표 인용: F3

### P2. ...

## 반복 불만 패턴

### N1. "{패턴}"
- 관찰: r/X (5), Glassdoor 직원 (3)
- 플랫폼별 심각도 차이

## 대표 발언 (익명 처리)

### F1. Reddit r/X (up: 1.2k, 2026-03)
> "발췌 3~5 문장"
- URL: ...
- 톤: 부정
- 댓글 수: 340

### F3. HN (points: 245)
> "..."

## 전문가·당사자 의심 발언
- "X사 전 엔지니어 주장" HN 댓글 — **검증 불가, 참고용**

## 편향 경고
- r/X는 A 성향 유저 중심 (플랫폼 편향)
- Twitter/X는 알고리즘 최근 변경 → 샘플링 신뢰도 저하

## 조작 의심
- Amazon 리뷰 중 신규 계정 집중 긍정 (N건) — astroturfing 가능성

## 쿼리 로그
```

## 흔한 함정

### 함정 1: 한 플랫폼 ≠ 전체 여론

r/programming에서 본 의견이 전체 개발자 여론은 아니다. Reddit 사용자 자체가 특정 편향.

**대응:** 반드시 2개 이상 플랫폼 교차 확인. 플랫폼 편향 명시.

### 함정 2: 업보트 = 다수 의견 착각

업보트는 early voting + 알고리즘 부스팅. 조용한 다수가 반대 의견일 수 있음.

**대응:** 업보트 많은 글만이 아니라 반대 키워드로도 검색.

### 함정 3: 극단 반응 위주 샘플링

분노한 사람이 글을 더 많이 쓴다. 만족한 다수는 조용함.

**대응:** "만족" 키워드로도 별도 검색. 분포 추정에 반영.

### 함정 4: 밈·짧은 단문을 주요 근거로

밈은 톤 지표로만. 사실·경험 근거로는 장문 댓글이 우선.

### 함정 5: 음모론 채택

특정 subreddit의 극단 주장을 중립적 자료처럼 제시 금지.

## 금지 사항

- 개별 유저 식별·타겟
- Reddit 고추천 댓글 = 사실로 단언
- 한 플랫폼 여론을 전체로 일반화
- 커뮤니티로 학술/공식 사실 대체
- 밈·단문을 주요 근거
- 음모론·허위 정보를 검증 없이 전달
- 감정 톤을 데이터 증거로 승격
- 민감 주제(건강, 정치)에서 극단 의견 over-representation

## 참조

- 에이전트: `.claude/agents/research-community-listener.md`
- 오케스트레이터: `.claude/skills/research-conductor/SKILL.md`
