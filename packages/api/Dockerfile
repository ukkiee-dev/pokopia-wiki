FROM node:24-alpine AS builder
WORKDIR /repo
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY prisma ./prisma
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/api ./packages/api

RUN pnpm --filter @pokopia-wiki/api build
RUN pnpm deploy --filter=@pokopia-wiki/api --prod /prod-out

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /prod-out/node_modules ./node_modules
COPY --from=builder /prod-out/dist ./dist
COPY --from=builder /prod-out/package.json ./
USER 1000
EXPOSE 3000
CMD ["node", "dist/main.js"]
