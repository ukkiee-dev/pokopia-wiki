import { randomUUID } from 'node:crypto';

import { pinoLogger } from 'hono-pino';

import { logger } from '#core/logger';

export const loggerMiddleware = () => pinoLogger({ pino: logger, http: { reqId: randomUUID } });
