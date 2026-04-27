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

RUN pnpm --filter @pokopia-wiki/scraper build
# pnpm 10: deploy 는 --legacy 필요 + 내부 install 단계가 다시 prisma generate 호출 → placeholder
RUN DATABASE_URL=postgres://placeholder@127.0.0.1:5432/x \
    pnpm deploy --filter=@pokopia-wiki/scraper --prod --legacy /prod-out

# ── runtime stage (HTTP 노출 없음) ────────────────────────────
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /prod-out/node_modules ./node_modules
COPY --from=builder /prod-out/dist          ./dist
COPY --from=builder /prod-out/package.json  ./

USER 1000
# EXPOSE 없음 — worker 는 포트 노출 X
CMD ["node", "dist/index.js"]
