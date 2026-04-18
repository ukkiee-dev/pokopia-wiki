import { Hono } from 'hono';

import { defineController } from '#core/define-controller';

import type { HealthService } from './health.service';

export const healthController = defineController('/health', ({ healthService }: { healthService: HealthService }) =>
  new Hono().get('/', (c) => c.json(healthService.check())),
);
