import { NotFoundException } from '#core/app-exception';

import type { CreateExampleDto } from './dto/create-example.dto';
import type { ExampleRepository } from './example.repository';

export const exampleService = ({ exampleRepository }: { exampleRepository: ExampleRepository }) => ({
  findById: (id: string) => {
    const item = exampleRepository.findById(id);
    if (!item) throw new NotFoundException(`Example ${id} not found`);
    return item;
  },
  findAll: () => exampleRepository.findAll(),
  create: (dto: CreateExampleDto) => exampleRepository.create(dto),
});

export type ExampleService = ReturnType<typeof exampleService>;
