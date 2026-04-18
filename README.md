# template-web

Hono + Awilix DI 기반 Node 백엔드 템플릿. 린트·포맷·타입체크·테스트·멀티아치 Docker 빌드 및 homelab(ArgoCD) 자동 배포까지 한 레포에서 연결된다.

## 목차

- [스택](#스택)
- [요구사항](#요구사항)
- [빠른 시작](#빠른-시작)
- [디렉토리 구조](#디렉토리-구조)
- [스크립트](#스크립트)
- [환경변수](#환경변수)
- [모듈 추가하기](#모듈-추가하기)
- [DI 패턴](#di-패턴)
- [요청 스코프와 로거](#요청-스코프와-로거)
- [검증(Validation)](#검증validation)
- [에러 처리](#에러-처리)
- [CORS](#cors)
- [그레이스풀 셧다운](#그레이스풀-셧다운)
- [Path Alias](#path-alias)
- [테스트](#테스트)
- [VS Code 통합](#vs-code-통합)
- [배포](#배포)

## 스택

- **Runtime**: Node 24+
- **Framework**: Hono
- **DI**: Awilix (PROXY 주입)
- **Validation**: Zod + `@hono/zod-validator`
- **Logger**: Pino (dev는 pino-pretty, 요청 스코프는 hono-pino)
- **Linter**: oxlint
- **Formatter**: oxfmt
- **Build**: tsdown (Rolldown)
- **Test**: Vitest
- **Package Manager**: pnpm 10+

## 요구사항

- Node ≥ 24
- pnpm ≥ 10 (`corepack enable` 권장)
- (선택) Docker — 로컬 컨테이너 빌드용

## 빠른 시작

```bash
cp .env.example .env
pnpm install
pnpm dev
```

동작 확인:

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/example \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice","email":"alice@example.com"}'
curl http://localhost:3000/example
```

## 디렉토리 구조

```
src/
├── core/                       # 재사용 빌딩블록
│   ├── app-exception.ts        # AppException + HTTP 서브클래스
│   ├── create-container.ts     # 루트 Awilix 컨테이너 생성 (CradleOf 타입 포함)
│   ├── define-controller.ts    # [path, Hono] 튜플을 만드는 헬퍼
│   ├── define-module.ts        # providers / controller 묶음 헬퍼
│   ├── env.ts                  # 환경변수 (Zod 검증)
│   ├── http-status.ts          # HttpStatus 상수
│   └── logger.ts               # pino 루트 logger
├── filters/
│   └── error.filter.ts         # onError 글로벌 필터
├── middlewares/
│   ├── cors.middleware.ts      # CORS 설정
│   ├── di.middleware.ts        # 요청마다 container.createScope() 세팅
│   └── logger.middleware.ts    # hono-pino 기반 요청 로거 + reqId 부착
├── modules/                    # 비즈니스 모듈 (기능 단위 코로케이션)
│   ├── health/
│   │   ├── health.module.ts
│   │   ├── health.controller.ts
│   │   ├── health.service.ts
│   │   └── health.service.test.ts
│   └── example/
│       ├── dto/
│       │   ├── create-example.dto.ts
│       │   └── example.dto.ts
│       ├── example.module.ts
│       ├── example.controller.ts
│       ├── example.service.ts
│       ├── example.repository.ts
│       └── example.service.test.ts
├── types/
│   └── hono.d.ts               # Hono ContextVariableMap 확장 (c.var.scope)
├── app.ts                      # 앱 배선 (DI + 라우트 + 미들웨어)
└── main.ts                     # 서버 라이프사이클
```

## 스크립트

```bash
pnpm dev            # tsx watch, .env 자동 로드
pnpm build          # tsdown → dist/main.js (ESM, node24, sourcemap)
pnpm start          # 프로덕션 실행
pnpm test           # vitest watch
pnpm test:run       # vitest 1회 (CI용)
pnpm lint           # oxlint
pnpm lint:fix       # oxlint --fix
pnpm format         # oxfmt
pnpm format:check   # oxfmt --check
pnpm type-check     # tsc --noEmit
```

CI의 `quality` 잡은 `lint` + `format:check` + `type-check` 세 가지를 순차 실행한다.

## 환경변수

`.env.example`을 복사해 `.env` 생성. 모든 변수는 `src/core/env.ts`에서 Zod로 검증되며, 누락·오타 시 앱이 시작 자체에 실패한다.

| 이름          | 타입                                                         | 기본값        | 설명                                                          |
| ------------- | ------------------------------------------------------------ | ------------- | ------------------------------------------------------------- |
| `NODE_ENV`    | `development \| production \| test`                          | `development` | 로거 포맷과 에러 응답 상세 수준 결정                          |
| `PORT`        | `number`                                                     | `3000`        | 서버 포트                                                     |
| `LOG_LEVEL`   | `fatal \| error \| warn \| info \| debug \| trace \| silent` | `info`        | pino 필터 레벨                                                |
| `CORS_ORIGIN` | `*` \| 쉼표 구분 origin 리스트 \| 빈 문자열                  | `*`           | `*`: 모두 허용 / 리스트: 해당 origin만 / 빈 문자열: CORS 차단 |

## 모듈 추가하기

1. `src/modules/<name>/` 생성
2. `dto/*.dto.ts` — Zod 스키마로 DTO 정의, 타입은 `z.infer<>`로 추출
3. `<name>.repository.ts` — 데이터 접근 (팩토리 함수)
4. `<name>.service.ts` — 비즈니스 로직 (팩토리 함수)
5. `<name>.controller.ts` — `defineController`로 라우트 정의
6. `<name>.module.ts` — `defineModule`로 providers + controller 묶기
7. (권장) `<name>.service.test.ts` — 서비스 단위 테스트를 서비스 파일 옆에 코로케이션
8. `src/app.ts`의 `modules` 배열과 `.route()` 체인에 추가

```ts
// src/app.ts
const modules = [healthModule, exampleModule, fooModule] as const;
// ...
.route(...fooModule.controller(container.cradle));
```

모듈을 `modules` 배열에 추가하는 순간 `CradleOf<typeof modules>`가 각 모듈의 provider 타입을 자동 합성하므로, 컨트롤러/서비스 측 destructure의 타입 추론이 바로 따라온다.

## DI 패턴

Awilix `InjectionMode.PROXY`. 팩토리 함수의 첫 인자 destructure가 곧 의존성 선언.

**서비스/리포지토리 (팩토리 함수)**

```ts
export const myService = ({ logger, myRepository }: Cradle) => ({
  doSomething: () => myRepository.findAll(),
});
export type MyService = ReturnType<typeof myService>;
```

- `defineModule`이 내부적으로 `asFunction(factory).singleton()`으로 등록한다.
- 루트 `Cradle` 타입은 `src/app.ts`의 `CradleOf<typeof modules> & typeof globals`로 자동 조립된다.
- 전역 싱글턴(logger 등)은 `app.ts`의 `globals` 객체에 추가하면 `asValue`로 등록된다.

## 요청 스코프와 로거

`loggerMiddleware`(`src/middlewares/logger.middleware.ts`)가 `hono-pino`로 요청마다 `randomUUID` `reqId`가 부착된 스코프 로거를 `c.var.logger`에 세팅하고, `diMiddleware`(`src/middlewares/di.middleware.ts`)가 `container.createScope()`를 만들어 `c.var.scope`에 세팅한다. Hono `ContextVariableMap`은 `src/types/hono.d.ts`에서 확장되어 있어 두 값 모두 타입 안전하게 접근된다.

`app.ts`의 미들웨어 등록 순서는 `loggerMiddleware` → `corsMiddleware` → `diMiddleware`로, 이 순서를 뒤집지 말 것 — 로거가 먼저 붙어야 CORS/DI 단계에서 발생하는 로그에도 `reqId`가 포함된다.

```ts
export const myController = defineController('/my', ({ myService }: Cradle) =>
  new Hono().get('/', (c) => {
    c.var.logger.info({ at: 'myController' }, 'incoming'); // reqId 자동 포함
    const scoped = c.var.scope.resolve('myService'); // 필요시 요청 스코프에서 재-resolve
    return c.json(scoped.doSomething());
  }),
);
```

## 검증(Validation)

요청 입력은 `@hono/zod-validator`로 검증한다. DTO는 Zod 스키마를 단일 소스로 삼고 타입은 `z.infer<>`로 파생한다.

```ts
new Hono().post(
  '/',
  zValidator('json', CreateExampleSchema),
  (c) => c.json(exampleService.create(c.req.valid('json'))), // c.req.valid('json')은 CreateExampleDto
);
```

검증 실패 시 zod-validator가 400 응답을 자동 반환한다.

## 에러 처리

`src/core/app-exception.ts`의 `AppException` 서브클래스를 던지고, `src/filters/error.filter.ts`의 `errorFilter`가 JSON 응답으로 변환한다.

제공 서브클래스: `BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException`.

```ts
throw new NotFoundException(`Example ${id} not found`);
```

응답 포맷:

```jsonc
// AppException — status는 각 서브클래스가 지정 (e.g. 404)
{ "error": "Example abc not found" }

// 미처리 예외 (NODE_ENV=development)
{ "error": "Internal Server Error", "message": "...", "stack": "..." }

// 미처리 예외 (production)
{ "error": "Internal Server Error" }
```

상태 코드는 `src/core/http-status.ts`의 `HttpStatus` 상수를 쓰며, `AppException`의 status 타입이 2xx를 자동으로 배제한다.

## CORS

`corsMiddleware`는 `env.CORS_ORIGIN`을 그대로 `hono/cors`에 넘긴다. 세 가지 모드:

- `CORS_ORIGIN=*` — 모두 허용 (기본값)
- `CORS_ORIGIN=https://a.com,https://b.com` — 해당 origin만 허용
- `CORS_ORIGIN=` (빈 문자열) — CORS 차단

## 그레이스풀 셧다운

`src/main.ts`가 `SIGTERM`/`SIGINT`를 받으면 `server.close()`로 진행 중 요청을 종료한 뒤 프로세스를 끝낸다. K8s 파드 종료 시 `terminationGracePeriodSeconds` 동안 무중단 드레이닝이 가능하다.

## Path Alias

`package.json`의 Node `imports` 필드로 `#*` → `./src/*.ts` 매핑. 크로스-디렉토리 import는 모두 `#` 접두사를 쓴다.

```ts
import { logger } from '#core/logger';
import type { Cradle } from '#app';
```

tsconfig에는 별도 `paths` 설정이 없다. `moduleResolution: "bundler"`가 `package.json#imports`를 직접 해석하고, tsdown도 동일 리졸버를 쓰므로 타입/번들/런타임 3자에서 한 소스로 경로가 해석된다.

## 테스트

- **위치 규칙**: `src/**/*.{test,spec}.ts` — 테스트 대상 파일 옆에 코로케이션
- **레벨**: 현재 템플릿은 서비스 단위 테스트 중심. 팩토리 함수에 fake repository를 주입해 순수 로직만 검증한다.
- **globals**: `vitest.config.ts`에서 `globals: false` — `describe`/`it`/`expect`는 명시적으로 import 해야 한다.

```bash
pnpm test          # watch 모드
pnpm test:run      # 1회 실행 (CI)
```

## VS Code 통합

`.vscode/extensions.json`이 `oxc.oxc-vscode`를 권장한다. `.vscode/settings.json`에 저장 시 oxc 포맷/린트 자동 실행이 설정되어 있어, 레포를 열고 권장 확장을 설치하면 별도 설정 없이 저장마다 포맷/린트가 작동한다.

## 배포

### Docker 이미지

멀티스테이지 Dockerfile:

- **builder**: `node:24-alpine` → `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm deploy --legacy --prod /prod-out`로 프로덕션 전용 `node_modules` 추출
- **runtime**: `node:24-alpine`, `USER 1000` (비-root), `EXPOSE 3000`, `ENV NODE_ENV=production`

로컬 빌드·실행:

```bash
docker build -t template-web .
docker run --rm -p 3000:3000 --env-file .env template-web
```

### CI/CD 파이프라인 (`.github/workflows/ci.yml`)

`main`에 푸시되면 다음 잡이 순차/병렬로 실행된다:

1. **config** — 레포 이름을 앱 이름으로 쓰고, `.app-config.yml`(health/icon/description)을 파싱하며 homelab에 setup 되어 있는지 확인
2. **quality** — `pnpm lint`, `pnpm format:check`, `pnpm type-check`
3. **build** — Docker Buildx로 **linux/amd64 + linux/arm64** 멀티아치 이미지 빌드 → GHCR(`ghcr.io/<owner>/<repo>:latest` 및 `:<sha>`) 푸시
4. **update-manifest** — 외부 `ukkiee-dev/homelab` 레포의 ArgoCD 매니페스트 이미지 태그를 `<sha>`로 갱신 → ArgoCD가 자동 동기화
5. **sync-config** — `.app-config.yml`이 이번 푸시에 변경되었으면 homelab 앱 카탈로그 메타데이터(health/icon/description) 동기화

빌드 실패 시 Telegram Bot으로 알림이 전송된다. homelab에 앱 매니페스트가 아직 등록되지 않았다면 config 잡이 notice를 남기고 **build 이후 잡을 전부 스킵**하므로, 최초 배포는 별도 `create-app` 워크플로우로 등록을 선행해야 한다.

### `.app-config.yml`

레포 루트에 두면 homelab 대시보드에 해당 앱이 등록된다:

```yaml
health: /health # K8s probe 및 대시보드 헬스체크 경로
icon: box # 대시보드 아이콘 식별자
description: 템플릿 앱 # 대시보드 설명
```

변경 시 `sync-config` 잡이 homelab 카탈로그에 자동 반영한다.

### 헬스체크 엔드포인트

`GET /health`는 `{ status, uptime, timestamp }`를 반환한다. K8s liveness/readiness probe와 `.app-config.yml`의 `health` 경로 양쪽에서 동일하게 사용된다.
