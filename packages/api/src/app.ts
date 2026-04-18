import { Hono } from 'hono';

import { createRootContainer, type CradleOf } from '#core/create-container';
import { logger } from '#core/logger';
import { errorFilter } from '#filters/error.filter';
import { corsMiddleware } from '#middlewares/cors.middleware';
import { diMiddleware } from '#middlewares/di.middleware';
import { loggerMiddleware } from '#middlewares/logger.middleware';
import { exampleModule } from '#modules/example/example.module';
import { healthModule } from '#modules/health/health.module';

const modules = [healthModule, exampleModule] as const;
const globals = { logger } as const;

export type Cradle = CradleOf<typeof modules> & typeof globals;

export const container = createRootContainer(modules, globals);

export const createApp = () => {
  const app = new Hono()
    .use('*', loggerMiddleware())
    .use('*', corsMiddleware())
    .use('*', diMiddleware(container))
    .onError(errorFilter)
    .route(...healthModule.controller(container.cradle))
    .route(...exampleModule.controller(container.cradle));
  return app;
};

export type AppType = ReturnType<typeof createApp>;
