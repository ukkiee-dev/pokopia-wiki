---
name: codereview-security-audit
description: 코드의 보안 취약점을 감사한다. OWASP Top 10, 인젝션(SQL/command/XSS), 인증·인가 결함, 시크릿 하드코딩, 암호화 오용, SSRF, CSRF, path traversal, 의존성 CVE를 점검하고 공통 finding YAML로 기록한다. "보안 리뷰", "취약점 점검", "시큐리티 감사", "pentest 대비", "OWASP 체크" 요청 시 반드시 사용. 종합 코드 리뷰 팀의 보안 감사자가 호출.
version: "1.0.0"
---

# Security Audit

코드의 보안 취약점을 OWASP Top 10·CWE 기준으로 감사하여 공통 finding YAML로 기록.

## 감사 절차

### Step 1: 위협 표면 파악

1. 진입점 식별:
   - HTTP 핸들러(Express route, Next API route, Fastify 등)
   - CLI 진입점
   - 백그라운드 잡/큐 consumer
   - 파일 업로드/다운로드 엔드포인트
2. 외부 의존성:
   - `package.json`의 dependencies (알려진 취약 라이브러리)
   - 외부 API 호출 위치
   - DB/캐시/큐 접근 지점
3. 데이터 흐름: 사용자 입력 → 처리 → 저장 → 출력의 각 단계 확인

### Step 2: OWASP Top 10 체크

#### A01 Broken Access Control
- 권한 체크 누락 엔드포인트 (인증만 하고 인가는 안 함)
- **IDOR**: `/users/:id` 같은 경로에서 본인 리소스 검증 없음
- 관리자 엔드포인트의 역할 체크 부재
- 쿠키/세션의 `sameSite`, `secure`, `httpOnly` 플래그

#### A02 Cryptographic Failures
- 약한 알고리즘: MD5/SHA1 (서명·비밀번호), DES, ECB 모드
- 고정 IV, 약한 난수(`Math.random()` 대신 `crypto.randomBytes`)
- 평문 저장된 비밀번호, TLS 검증 우회(`rejectUnauthorized: false`)
- 비밀번호 해싱: bcrypt/argon2/scrypt 외 사용 시 의심

#### A03 Injection
- **SQL**: 문자열 연결, `db.raw(...)` + 사용자 입력
- **NoSQL**: MongoDB `$where` 연산자, 쿼리 객체에 입력 그대로 주입
- **Command**: `exec`/`spawn`에 사용자 입력, shell: true
- **LDAP/XPath/Template**: 동적 쿼리/템플릿 렌더링에 입력 삽입
- **Prototype pollution**: `Object.assign`/`merge` 재귀 시 `__proto__`

#### A04 Insecure Design
- 레이트 리밋 부재, 비밀번호 재설정 토큰 만료 없음
- 암호학적 비밀이 필요한데 예측 가능한 값 사용

#### A05 Security Misconfiguration
- DEBUG 모드 프로덕션 활성, 에러 스택 클라이언트 노출
- CORS 와일드카드 `*` + credentials
- 기본 관리자 계정/비밀번호
- 민감 파일 노출(`.env`, `.git`, `backup.sql` 공개 경로)

#### A06 Vulnerable Components
- `package.json`의 고정 오래된 버전
- `yarn.lock`/`package-lock.json` 보존 여부
- 직접 감사 도구 호출은 불가하므로 "버전 확인 + 사용자에게 `npm audit` 실행 권장"

#### A07 Authentication Failures
- JWT `algorithms` 옵션 누락 (알고리즘 혼동 공격)
- 세션 재생성 누락 (로그인 후 session fixation)
- 비밀번호 비교에 `==` 대신 timing-safe 비교 사용 여부
- 계정 잠금/로그인 시도 제한 부재

#### A08 Data Integrity Failures
- 서명 없는 업데이트(자동 업데이트 채널), 서명 없는 직렬화
- 안전하지 않은 역직렬화:
  - `JSON.parse` 자체는 보통 안전
  - 위험: `eval`, `Function` 생성자, `vm.runInContext`, Python 표준 객체 직렬화 모듈의 역직렬화 함수, Java `ObjectInputStream` 등

#### A09 Security Logging
- 로그에 민감 정보(비밀번호, 토큰, 쿠키, PII) 노출
- 감사 로그 부재 (인증 실패, 권한 변경 등)

#### A10 SSRF
- 사용자가 URL을 제어할 수 있는 HTTP 호출
- 내부망(`169.254.169.254` metadata, `localhost`, `10.0.0.0/8`) 차단 부재
- 리다이렉트 follow 무제한

### Step 3: 추가 체크

- **Path traversal**: `fs.readFile(req.params.path)`, `path.join` 후 `..` 검증 없음
- **XSS**: `innerHTML` 직접 대입, React의 unsafe HTML 렌더링 prop 계열, Vue `v-html`, 템플릿 미이스케이프
- **Open redirect**: `res.redirect(req.query.url)` 검증 없이
- **CSRF**: 상태 변경 요청에 CSRF 토큰 또는 SameSite 쿠키 확인
- **ReDoS**: `/^(a+)+$/`, `/^([a-zA-Z0-9_-])+@/` 등 catastrophic backtracking

### Step 4: 시크릿 스캔

- 하드코딩된 API 키, 토큰, 비밀번호
- `.env` 커밋 흔적 (`.gitignore`에 있는지)
- 로그/에러 메시지에 시크릿 노출
- `console.log(process.env)` 같은 디버그 잔재

## 발견 기록 규칙

- ID: `SEC-NNN` (001부터)
- 필드: `codereview-orchestrator/references/finding-schema.md` 준수
- 심각도: `codereview-orchestrator/references/severity-matrix.md`의 보안 영역 기준
- **보안 전용 필드 필수 사용:**
  - `cwe`: CWE ID (확실한 경우만)
  - `exploit_complexity`: low/medium/high
  - `attack_vector`: local/remote/network

### description 작성

- 구체적 공격 시나리오: "공격자가 X를 입력하면 Y 발생"
- 전제 조건 명시: "인증된 사용자라면", "관리자 계정이 탈취되면"
- 이론적 CVE 나열 금지 — 실제 악용 가능성 기술

### recommendation 작성

- 구체적 패치 코드 (1~5줄)
- 대안 라이브러리/API 이름
- **실제 공격 페이로드/POC는 포함하지 않음** — 수정 방향만
- defense in depth 제안 (단일 방어에 의존 지양)

## 교차 이슈 시그널

| 발견 | 공유 대상 | 메시지 |
|------|----------|--------|
| ReDoS 패턴 | performance-auditor | "정규식이 catastrophic backtracking 가능, 성능 관점 중첩 이슈" |
| 대량 요청 유발 엔드포인트 | performance-auditor | "rate limit 없는 엔드포인트, DoS 가능 + 성능 부하" |
| 레이어 침투로 인한 공격 표면 | architect-auditor | "경계 위반이 공격 벡터의 근본 원인" |
| 인증 미들웨어 구조 | architect-auditor | "인증 로직이 여러 파일에 분산, 누락 체크 어려움" |

## 출력 예시

```yaml
auditor: security
scope:
  mode: all
  files_reviewed: 87
  files_skipped: 0
generated_at: 2026-04-17T10:35:00Z
findings:
  - id: SEC-001
    severity: critical
    category: security
    title: HTTP 핸들러에서 사용자 입력이 raw SQL 문자열 연결
    location:
      file: src/api/search.ts
      line: 34
      snippet: |
        const q = `SELECT * FROM items WHERE name LIKE '%${req.query.q}%'`;
        return db.raw(q);
    description: |
      req.query.q가 이스케이프 없이 raw SQL에 삽입된다.
      공격자가 페이로드를 주입하여 전체 테이블 덤프,
      또는 UNION 기반 인젝션으로 다른 테이블 조회, DROP 가능.
    impact: |
      - 데이터 전수 유출 (items + 조인 가능한 테이블)
      - 무결성 파괴(DROP, UPDATE 가능)
      - 인증 우회(users 테이블 접근으로 이어짐)
    recommendation: |
      parameterized query로 교체:
        db.select('*')
          .from('items')
          .where('name', 'like', `%${req.query.q}%`);  // 값만 바인딩
      또는 Prisma/TypeORM 같은 ORM 사용. 추가로 입력 검증:
        zod.string().max(100).parse(req.query.q)
    confidence: high
    cwe: CWE-89
    exploit_complexity: low
    attack_vector: remote
    related_findings: []
```

## 스캔 제외

- 테스트 픽스처의 "가짜 비밀번호"는 대상 아님(단, production 경로에서 사용되면 대상)
- 라이브러리 내부 코드(node_modules/)는 감사하지 않음 — 버전 기반 CVE 체크만
- 예시/문서 코드는 별도 표시

## 협업

- **critical 발견 시 리더에게 즉시 SendMessage** — 완료 대기 없이 선제 알림
- 실제 공격 POC/페이로드는 리포트에 쓰지 않음
- 시크릿 raw 값은 반드시 마스킹 후 보고 (예: `sk_live_****`)
- `npm audit`/`pip-audit` 결과는 직접 실행 불가하므로 사용자에게 실행 권장

## 금지 사항

- 실제 익스플로잇 코드 작성
- 불확실한 CVE 번호 추측
- 프로젝트가 검증하지 못할 추측성 공격 시나리오
- `severity: critical` 인플레이션 (정말로 즉각 대응 필요한 경우만)
