import { randomUUID } from 'node:crypto';

import type { CreateExampleDto } from './dto/create-example.dto';
import type { ExampleDto } from './dto/example.dto';

// 인메모리 스텁. 프로덕션에서는 DB 어댑터(Drizzle/Prisma 등)로 교체
export const exampleRepository = () => {
  const store = new Map<string, ExampleDto>();

  return {
    findById: (id: string): ExampleDto | undefined => store.get(id),
    findAll: (): ExampleDto[] => Array.from(store.values()),
    create: (dto: CreateExampleDto): ExampleDto => {
      const item: ExampleDto = { id: randomUUID(), ...dto };
      store.set(item.id, item);
      return item;
    },
  };
};

export type ExampleRepository = ReturnType<typeof exampleRepository>;
