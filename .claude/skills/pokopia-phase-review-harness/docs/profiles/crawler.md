# Phase Profile: crawler

**적용 범위:** 티어별 fetcher (T0 ky / T1 playwright / T2·T3 patchright), 페르소나 관리, rate limiter, cookie persistence, circadian scheduler, robots.txt checker.

## 대상 아티팩트 패턴

- `src/scrapers/**/*.ts`
- `src/fetchers/**/*.ts`
- `src/scheduling/**/*.ts`
- `src/persona/**/*.ts`

## 감사자 구성

### 필수 감사자 (2명)

| 감사자 이름 | agent_type | 스킬 | 핵심 책무 |
|---|---|---|---|
| codereview-security | `codereview-security-auditor` | `codereview-security-audit` | 헤더/쿠키에 시크릿/API 키 평문 노출, Telegram 토큰 로그 마스킹, 로그 PII 유출, robots.txt 우회 시도 탐지 |
| codereview-performance | `codereview-performance-auditor` | `codereview-performance-audit` | rate limit 설계, 동시성 guard, cooldown 로직, HTTP keep-alive, 메모리 누수 (patchright 세션 정리) |

### 권장 감사자 (1명)

| 감사자 이름 | agent_type | 스킬 | 핵심 책무 |
|---|---|---|---|
| pokopia-ops-runner | `pokopia-ops-conductor` | `pokopia-ops-runner` | Preflight (robots/access/patchright/network/notifier), 페르소나 분리, cookie persistence, healthScore 관리, 드라이런 옵션 완비, 로그 마스킹 실측 |

## Pokopia 특화 Critical 조건

- 과잉 스텔스 (지문 조작, TLS fingerprinting, JS 패치 등 명시적으로 금지된 기법) (**Critical**)
- robots.txt 우회 (**Critical**)
- API 키/토큰/쿠키 평문 로그 (**Critical**)
- rate limiter 미설정 또는 기본값으로 소스 정책 초과 (**Critical**)
- circadian scheduler (새벽 집중 차단 등) 우회 (**Critical**)
- Telegram/macOS 알림에 시크릿 포함 가능성 (**Critical**)
- persona 간 cookie 공유 (페르소나 분리 원칙 위반) (**Critical**)
- healthScore 기반 cooldown 로직 없음 (**Warning**)
- 드라이런 옵션 (`--dry-run --source X --page Y --limit N`) 누락 (**Warning**)

## 재감사 체크포인트

이전 감사에서 rate limit 위반이 지적된 경우, 재감사 시 실제 소스별 요청 간격 실측치를 보고한다. "수정했다"는 선언만으로는 `resolved` 판정 불가.

## 교차 조율 패턴

- `security` ↔ `performance`: rate limit 우회 보안 리스크 ↔ 성능 최적화 욕구 간 상충 해소
- `security` → `ops-runner`: 발견된 로그 유출을 operational guard로 예방 가능한지 논의
- `ops-runner` → 모두: preflight 단계에서 이미 잡혔어야 할 이슈인지 역추적
