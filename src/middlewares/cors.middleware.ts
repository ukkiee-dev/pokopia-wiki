import { cors } from 'hono/cors';

import { env } from '#core/env';

export const corsMiddleware = () => cors({ origin: env.CORS_ORIGIN });
