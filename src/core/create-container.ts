import { asValue, createContainer, InjectionMode, type AwilixContainer, type Resolver } from 'awilix';

type InferCradle<T> = {
  [K in keyof T]: T[K] extends Resolver<infer U> ? U : never;
};

type ProvidersOf<M> = M extends { providers: infer P } ? P : never;

export type CradleOf<Modules extends readonly ModuleWithProviders[]> = Modules extends readonly [
  infer First,
  ...infer Rest extends readonly ModuleWithProviders[],
]
  ? InferCradle<ProvidersOf<First>> & CradleOf<Rest>
  : unknown;

type ModuleWithProviders = {
  providers: Record<string, Resolver<unknown>>;
};

export const createRootContainer = <
  const Modules extends readonly ModuleWithProviders[],
  const Globals extends Record<string, unknown> = Record<string, never>,
>(
  modules: Modules,
  globals?: Globals,
): AwilixContainer<CradleOf<Modules> & Globals> => {
  const container = createContainer<CradleOf<Modules> & Globals>({
    injectionMode: InjectionMode.PROXY,
  });
  for (const m of modules) {
    if (Object.keys(m.providers).length > 0) {
      container.register(m.providers as Parameters<typeof container.register>[0]);
    }
  }
  if (globals) {
    const resolved: Record<string, Resolver<unknown>> = {};
    for (const [k, v] of Object.entries(globals)) {
      resolved[k] = asValue(v);
    }
    container.register(resolved as Parameters<typeof container.register>[0]);
  }
  return container;
};
