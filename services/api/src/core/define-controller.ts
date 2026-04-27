import type { Hono } from 'hono';

export const defineController =
  <const P extends string, C, R extends Hono>(path: P, build: (cradle: C) => R) =>
  (cradle: C): [P, R] => [path, build(cradle)];
