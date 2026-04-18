import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { AppException } from '#core/app-exception';
import { env } from '#core/env';
import { logger } from '#core/logger';

export const errorFilter: ErrorHandler = (err, c) => {
  if (err instanceof AppException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  logger.error(err, 'Unhandled error');
  const body =
    env.NODE_ENV === 'development'
      ? { error: 'Internal Server Error', message: err.message, stack: err.stack }
      : { error: 'Internal Server Error' };
  return c.json(body, 500);
};
