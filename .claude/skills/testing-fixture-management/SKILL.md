---
name: testing-fixture-management
description: 스크래퍼의 외부 응답을 __fixtures__/에 캡처·마스킹·인덱싱하고, 라이브 vs fixture 회귀 비교를 수행하는 절차. 무음 갱신 절대 금지(사용자 승인 게이트). 셀렉터 드리프트, 컨텐츠 변경, 신규 페이지, 인코딩 드리프트를 분류한다. testing-fixture-keeper 에이전트가 사용. 트리거: "fixture 갱신", "회귀 비교", "스냅샷 비교", "셀렉터 변경 확인", "라이브 diff".
version: "1.0.0"
---

# Fixture Management — 회귀 베이스 캡처·비교 절차

스크래퍼 응답을 fixture로 보존하고 회귀 비교를 수행하는 절차. testing-fixture-keeper 에이전트가 사용한다.

## 절대 규칙

> **fixture는 자동 갱신하지 않는다. 모든 변경은 사용자 승인 게이트를 통과한다.**

자동 갱신은 회귀 검증을 무력화한다. 매일 갱신되는 fixture는 비교 베이스가 아니라 캐시일 뿐이다.

예외: 신규 캡처(아예 없던 fixture)는 자동 추가 가능.

## 디렉토리 구조

```
{package}/__fixtures__/
├── {source}/                # serebii / pokopia-guide / namuwiki / pokemon-official
│   ├── {category}/          # pokemon / item / habitat / cooking / specialty / ...
│   │   ├── 0001.html
│   │   ├── 0001.meta.json
│   │   ├── 0002.html
│   │   └── 0002.meta.json
│   └── INDEX.md             # 자동 생성, 사람이 읽는 카탈로그
└── snapshots/
    ├── 20260417/            # YYYYMMDD, 비교 시점 스냅샷
    └── 20260418/
```

스크래퍼 패키지 (`services/scraper`)에 두는 게 기본. API가 외부 호출하면 `services/api/__fixtures__/`도 가능.

## `.meta.json` 필수 필드

```json
{
  "sourceUrl": "https://serebii.net/pokemon/0001.shtml",
  "capturedAt": "2026-04-17T14:32:11Z",
  "scraperVersion": "0.4.2",
  "selectorVersion": "v3",
  "license": "fan-site",
  "copyrightHolder": "Serebii",
  "attribution": "Used under fair use for fan reference",
  "contentHash": "sha256:abc123...",
  "responseStatus": 200,
  "responseHeaders": {
    "content-type": "text/html; charset=utf-8"
  }
}
```

`license`/`copyrightHolder`/`attribution` 비어있으면 저장 거부.

## 마스킹 규칙

캡처 시점에 적용. 원본 보존하지 않는다.

| 패턴 | 정규식 (예) | 대체 |
|------|------------|------|
| 이메일 | `[\w.+-]+@[\w-]+\.[\w.-]+` | `[REDACTED:email]` |
| 전화번호 | `\+?\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}` | `[REDACTED:phone]` |
| 사용자명 (URL의 /user/x/) | `/user/[\w-]+` | `/user/[REDACTED]` |
| 세션 ID (쿠키, URL) | `(session\|sess\|sid)=[\w-]+` | `$1=[REDACTED]` |
| API 키 | `[\w]{32,}` (긴 영숫자열) | `[REDACTED:key]` |

도메인별 추가 규칙은 `testing-orchestrator/references/scraper-fixture.md`.

마스킹 패턴 미일치로 개인정보 누락 가능성이 있으면 저장 중단하고 사용자에게 패턴 추가 요청.

## 캡처 절차

```
1. 스크래퍼 fetcher가 응답 수신
2. 응답 본문 + 메타 추출
3. 마스킹 적용
4. 라이선스 메타 검증 → 누락 시 저장 거부
5. contentHash 계산
6. {package}/__fixtures__/{source}/{category}/{slug}.{ext} 에 저장
7. {slug}.meta.json 동시 저장
8. INDEX.md 갱신 (없으면 생성)
```

자동화 권고: 스크래퍼 fetcher에 hook 삽입 (코드 수정은 사용자 승인 후).

## INDEX.md 형식

```markdown
# {source} Fixture Index

마지막 갱신: 2026-04-17

| Category | Slug | Captured | Selector Ver | License |
|----------|------|----------|-------------|---------|
| pokemon  | 0001 | 2026-04-17 | v3 | fan-site |
| pokemon  | 0002 | 2026-04-17 | v3 | fan-site |
| item     | berry-1 | 2026-04-15 | v2 | fan-site |
```

## 회귀 비교 절차

```
1. 비교 모드 결정:
   - live-vs-fixture: 라이브에서 새로 받아 기존 fixture와 비교
   - fixture-vs-fixture: 두 시점 fixture 비교 (snapshots/ 활용)
   - capture-only: 비교 없이 신규 캡처만
2. 라이브 모드면 robots.txt + rate limit 준수하며 재캡처
3. 결과를 snapshots/{YYYYMMDD}/ 에 임시 저장
4. 셀렉터별 추출값으로 의미 단위 diff 실행 (단순 byte diff 금지)
5. 변경을 분류 체계로 매핑
6. 갱신 권고서 작성, 사용자 승인 게이트
7. 승인 시 기존 fixture 갱신, snapshots/ 의 임시본 삭제
8. 거부 시 snapshots/ 보존, 기존 fixture 유지
```

## 분류 체계

| 분류 | 정의 | 권장 조치 |
|------|------|----------|
| **selector_drift** | 같은 데이터를 다른 위치에서 추출 (HTML 구조 변경) | 코드의 셀렉터 업데이트 + fixture 갱신 |
| **content_change** | 데이터 자체가 변경 (예: 가격 인상) | fixture 갱신 + 도메인 검토 (의미 변경?) |
| **new_page** | INDEX.md에 없는 페이지 발견 | 신규 캡처 자동 추가 + 도메인 검토 |
| **deleted_page** | 라이브에서 404 | fixture 보존 (역사적 가치) + 코드에서 제외 |
| **encoding_drift** | 같은 컨텐츠 다른 인코딩 | 디코딩 로직 점검 |
| **noise** | 광고·날짜·세션 ID 등 의미 없는 차이 | 마스킹 규칙 추가 |

## 갱신 권고서 형식

```markdown
# Fixture Diff Report — {YYYYMMDD}

## 비교 모드: live-vs-fixture
## 대상: serebii/pokemon/

## 변경 발견: 7건

### selector_drift (3건)
- `0023.html`: `.pokedex-info > .types` → `.pokemon-meta .types-row`
- `0045.html`: 동일 패턴
- `0067.html`: 동일 패턴
- **권장:** 셀렉터 업데이트 → 셀렉터 버전 v3 → v4

### content_change (2건)
- `0001.html`: weight `6.9kg` → `6.9 kg` (공백 변경)
- `0099.html`: 새 ability 추가됨
- **권장:** 갱신 + 도메인 검토

### new_page (1건)
- `0152.html` (INDEX 없음)
- **권장:** 신규 캡처 자동 추가

### deleted_page (1건)
- `0998.html` 라이브 404
- **권장:** fixture 보존, 크롤 대상에서 제외

## 승인 요청
- [ ] selector_drift 3건 갱신
- [ ] content_change 2건 갱신
- [ ] new_page 1건 추가
- [ ] deleted_page 1건 코드 제외
```

## diff 도구

단순 byte diff가 아니라 셀렉터별 추출값 diff:

```bash
pnpm tsx scripts/fixture-diff.ts \
  --source serebii \
  --category pokemon \
  --baseline __fixtures__/serebii/pokemon \
  --candidate snapshots/20260417/serebii/pokemon
```

자세한 사용법은 `testing-orchestrator/references/scraper-fixture.md`.

## snapshots/ 보존 정책

- 기본 30일 보존
- 30일 이전은 압축하여 `snapshots/archive/{YYYYMM}.tar.gz`
- 자동 삭제 금지, 압축만

## 산출물

- 캡처: `{package}/__fixtures__/{source}/{category}/{slug}.{html|json}` + `.meta.json`
- 인덱스: `{package}/__fixtures__/{source}/INDEX.md`
- 비교 임시: `{package}/__fixtures__/snapshots/{YYYYMMDD}/`
- 권고서: `_workspace/testing/{ts}/04_fixture_diff.md`
- 회귀 리포트: `_workspace/testing/{ts}/04_regression_report.md`

## 안티패턴

| 안티패턴 | 이유 |
|---------|------|
| 자동 fixture 갱신 (cron 등) | 회귀 검증 무력화 |
| 마스킹 없이 저장 | 개인정보 누출 위험 |
| 라이선스 메타 생략 | 저작권·사용 조건 추적 불가 |
| 단순 byte diff | 의미 없는 노이즈에 묻혀 진짜 변경 놓침 |
| `snapshots/` 무한 누적 | 디스크 폭증, archive 정책 필요 |
| live 호출에 robots/rate limit 무시 | 차단·법적 리스크 |
