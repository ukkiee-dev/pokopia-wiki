import { describe, expect, it } from 'vitest';

import { NotFoundException } from '#core/app-exception';

import { exampleRepository } from './example.repository';
import { exampleService } from './example.service';

describe('exampleService', () => {
  const makeService = () => exampleService({ exampleRepository: exampleRepository() });

  it('항목을 생성하고 조회한다', () => {
    const svc = makeService();
    const created = svc.create({ name: 'Alice', email: 'alice@example.com' });

    expect(svc.findById(created.id)).toEqual(created);
  });

  it('존재하지 않는 id면 NotFoundException을 던진다', () => {
    const svc = makeService();
    expect(() => svc.findById('missing')).toThrow(NotFoundException);
  });

  it('생성된 모든 항목을 나열한다', () => {
    const svc = makeService();
    svc.create({ name: 'A', email: 'a@x.com' });
    svc.create({ name: 'B', email: 'b@x.com' });

    expect(svc.findAll()).toHaveLength(2);
  });
});
