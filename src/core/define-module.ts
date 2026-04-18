import { asFunction, type BuildResolver } from 'awilix';
import type { Hono } from 'hono';

// Awilix resolver가 주입하는 cradle은 호출 시점에 타입이 결정되므로 any[] 유지
// oxlint-disable-next-line typescript/no-explicit-any
type Factory<T = unknown> = (...args: any[]) => T;

type Config<Providers extends Record<string, Factory>, P extends string, R extends Hono, C> = {
  providers?: Providers;
  controller: (cradle: C) => [P, R];
};

// `controller`는 `[path, hono]` 튜플을 반환해야 함 — `defineController()`로 생성할 것
export const defineModule = <
  const Providers extends Record<string, Factory> = Record<string, never>,
  const P extends string = string,
  R extends Hono = Hono,
  C = unknown,
>(
  config: Config<Providers, P, R, C>,
) => {
  const providers = Object.fromEntries(
    Object.entries(config.providers ?? {}).map(([k, factory]) => [k, asFunction(factory).singleton()]),
  ) as unknown as { [K in keyof Providers]: BuildResolver<ReturnType<Providers[K]>> };

  return {
    providers,
    controller: config.controller,
  };
};
