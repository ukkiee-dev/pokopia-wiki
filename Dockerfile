FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm deploy --legacy --prod /prod-out

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /prod-out/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
USER 1000
EXPOSE 3000
CMD ["node", "dist/main.js"]
