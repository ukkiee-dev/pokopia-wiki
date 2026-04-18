import type { AwilixContainer } from 'awilix';

import type { Cradle } from '#app';

declare module 'hono' {
  interface ContextVariableMap {
    scope: AwilixContainer<Cradle>;
  }
}
