import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { defineController } from '#core/define-controller';

import { CreateExampleSchema } from './dto/create-example.dto';
import type { ExampleService } from './example.service';

export const exampleController = defineController(
  '/example',
  ({ exampleService }: { exampleService: ExampleService }) =>
    new Hono()
      .get('/', (c) => c.json(exampleService.findAll()))
      .get('/:id', (c) => c.json(exampleService.findById(c.req.param('id'))))
      .post('/', zValidator('json', CreateExampleSchema), (c) => c.json(exampleService.create(c.req.valid('json')))),
);
