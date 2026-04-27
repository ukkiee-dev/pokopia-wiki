# scraper service — tsx 런타임 (api 와 다른 패턴)
#
# 왜 tsx 인가: scraper 는 Prisma Client 를 직접 사용하는데, tsdown 으로 inline
# bundle 하면 shared/src/prisma-client/runtime/client.js 가 require 하는
# @prisma/client-runtime-utils 가 prod node_modules 에서 못 찾힘 (런타임 동적
# require 라 tsdown 이 inline 못 함). tsx 런타임은 .ts 파일을 그대로 실행하므로
# prisma client 가 정상 require chain 으로 @prisma/client 패키지 안의 모듈
# resolve. api 는 prisma client 사용량이 적어 inline 으로 OK.
#
# 향후 정석 fix (별도 PR): shared 에 build script 추가 + prisma client generate
# 결과를 dist 로 명시 export.

FROM node:24-alpine AS builder
WORKDIR /repo
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json prisma.config.ts ./
COPY prisma ./prisma
COPY shared/package.json ./shared/
COPY services/scraper/package.json ./services/scraper/

# Prisma 7 prisma.config.ts 가 env('DATABASE_URL') eager evaluate — 빌드 시 placeholder.
RUN DATABASE_URL=postgres://placeholder@127.0.0.1:5432/x pnpm install --frozen-lockfile

COPY shared ./shared
COPY services/scraper ./services/scraper

# pnpm 10: deploy 는 --legacy 필요 + 내부 install 단계가 다시 prisma generate 호출 → placeholder
RUN DATABASE_URL=postgres://placeholder@127.0.0.1:5432/x \
    pnpm deploy --filter=@pokopia-wiki/scraper --prod --legacy /prod-out

# ── runtime stage (HTTP 노출 없음) ────────────────────────────
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

# tsx 는 devDependency 라 pnpm deploy --prod 에서 제외됨 — 런타임 별도 설치
RUN corepack enable && npm install -g tsx@4

COPY --from=builder /prod-out/node_modules ./node_modules
COPY --from=builder /prod-out/src          ./src
COPY --from=builder /prod-out/scripts      ./scripts
COPY --from=builder /prod-out/package.json ./

USER 1000
# EXPOSE 없음 — worker 는 포트 노출 X
CMD ["tsx", "src/index.ts"]
