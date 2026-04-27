import { describe, expect, it } from 'vitest';

import { healthService } from './health.service';

describe('healthService', () => {
  it('ok 상태와 uptime, timestamp를 반환한다', () => {
    const result = healthService().check();

    expect(result.status).toBe('ok');
    expect(typeof result.uptime).toBe('number');
    expect(typeof result.timestamp).toBe('string');
  });
});
