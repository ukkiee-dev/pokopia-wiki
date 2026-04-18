import { serve } from '@hono/node-server';

import { createApp } from '#app';
import { env } from '#core/env';
import { logger } from '#core/logger';

const app = createApp();

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  logger.info(`🚀 Server is running on http://${info.address}:${info.port}`);
});

// 그레이스풀 셧다운 (K8s 파드 종료 시 SIGTERM)
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down...`);
    server.close(() => process.exit(0));
  });
}
