import type { AwilixContainer } from 'awilix';
import { createMiddleware } from 'hono/factory';

import type { Cradle } from '#app';

export const diMiddleware = (container: AwilixContainer<Cradle>) =>
  createMiddleware(async (c, next) => {
    c.set('scope', container.createScope());
    await next();
  });
