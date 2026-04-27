/**
 * UpsertLoader 단위 테스트 (Phase 9 선결 코드 — TDD).
 *
 * Prisma model 을 in-memory mock 으로 대체해 멱등 upsert 동작 검증:
 *   - inserted: 신규 sourceSlug → create
 *   - updated: 동일 sourceSlug + 다른 contentHash → update + updatedAt 갱신
 *   - unchanged: 동일 sourceSlug + 동일 contentHash → skip
 *   - failed: Prisma create/update 예외 → failures 누적
 */

import { describe, expect, it, beforeEach } from 'vitest';

import type { SourceMetadata } from '@pokopia-wiki/shared';

import {
  upsertBySourceSlug,
  type SourceSlugKeyedModel,
  type UpsertItem,
} from './upsert-loader.js';

type StubPayload = { name: string; level: number };

class InMemoryModel implements SourceSlugKeyedModel<StubPayload> {
  rows = new Map<string, StubPayload & { sourceSlug: string; contentHash: string; updatedAt?: Date }>();
  failOn: string | null = null;

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: { data: StubPayload & { sourceSlug: string; contentHash: string } }): Promise<unknown> {
    if (args.data.sourceSlug === this.failOn) throw new Error('forced create failure');
    this.rows.set(args.data.sourceSlug, { ...args.data });
    return args.data;
  }

  async update(args: {
    where: { sourceSlug: string };
    data: StubPayload & { contentHash: string; updatedAt?: Date };
  }): Promise<unknown> {
    if (args.where.sourceSlug === this.failOn) throw new Error('forced update failure');
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, { ...existing, ...args.data });
    return args.data;
  }
}

const STUB_METADATA: SourceMetadata = {
  sourceSite: 'serebii',
  sourceUrl: 'https://www.serebii.net/pokemonpokopia/test.shtml',
  scrapedAt: '2026-04-25T03:00:00.000Z',
  license: 'Test',
  copyrightHolder: 'Test',
  attribution: 'Test',
};

function buildItem(sourceSlug: string, payload: StubPayload, contentHash?: string): UpsertItem<StubPayload> {
  const metadata = contentHash !== undefined
    ? { ...STUB_METADATA, contentHash } as SourceMetadata
    : STUB_METADATA;
  return { sourceSlug, payload, metadata };
}

describe('UpsertLoader — 통계', () => {
  let model: InMemoryModel;

  beforeEach(() => {
    model = new InMemoryModel();
  });

  it('빈 배열 — 모든 통계 0', async () => {
    const result = await upsertBySourceSlug(model, []);
    expect(result.stats).toEqual({ inserted: 0, updated: 0, unchanged: 0, failed: 0 });
    expect(result.failures).toEqual([]);
  });

  it('신규 entity — inserted 카운트 + 행 추가', async () => {
    const result = await upsertBySourceSlug(model, [
      buildItem('pikachu', { name: 'Pikachu', level: 25 }),
    ]);
    expect(result.stats.inserted).toBe(1);
    expect(result.stats.updated).toBe(0);
    expect(result.stats.unchanged).toBe(0);
    expect(model.rows.has('pikachu')).toBe(true);
  });

  it('동일 hash 재호출 — unchanged 카운트 + 행 mutation 없음', async () => {
    const item = buildItem('pikachu', { name: 'Pikachu', level: 25 });
    await upsertBySourceSlug(model, [item]);
    const before = JSON.stringify(model.rows.get('pikachu'));
    const second = await upsertBySourceSlug(model, [item]);
    expect(second.stats.unchanged).toBe(1);
    expect(second.stats.updated).toBe(0);
    expect(JSON.stringify(model.rows.get('pikachu'))).toBe(before);
  });

  it('payload 변경 — updated 카운트 + 새 hash + updatedAt 주입', async () => {
    await upsertBySourceSlug(model, [
      buildItem('pikachu', { name: 'Pikachu', level: 25 }),
    ]);
    const second = await upsertBySourceSlug(model, [
      buildItem('pikachu', { name: 'Pikachu', level: 26 }),
    ]);
    expect(second.stats.updated).toBe(1);
    expect(model.rows.get('pikachu')?.level).toBe(26);
    expect(model.rows.get('pikachu')?.updatedAt).toBeInstanceOf(Date);
  });

  it('Prisma 예외 — failed 카운트 + failures 배열 + 다음 entity 진행', async () => {
    model.failOn = 'mew';
    const result = await upsertBySourceSlug(model, [
      buildItem('pikachu', { name: 'Pikachu', level: 25 }),
      buildItem('mew', { name: 'Mew', level: 50 }),
      buildItem('mewtwo', { name: 'Mewtwo', level: 70 }),
    ]);
    expect(result.stats.inserted).toBe(2);
    expect(result.stats.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.sourceSlug).toBe('mew');
    expect(result.failures[0]?.error).toContain('forced');
    // 부분 실패 허용 — pikachu/mewtwo 는 정상 insert
    expect(model.rows.has('pikachu')).toBe(true);
    expect(model.rows.has('mewtwo')).toBe(true);
    expect(model.rows.has('mew')).toBe(false);
  });
});

describe('UpsertLoader — content hash', () => {
  let model: InMemoryModel;

  beforeEach(() => {
    model = new InMemoryModel();
  });

  it('metadata.contentHash 가 있으면 우선 사용 (fixture pre-computed)', async () => {
    const fixedHash = 'abcdef0123456789'.repeat(4);
    await upsertBySourceSlug(model, [
      buildItem('pikachu', { name: 'Pikachu', level: 25 }, fixedHash),
    ]);
    expect(model.rows.get('pikachu')?.contentHash).toBe(fixedHash);
  });

  it('동일 payload + 다른 키 순서 — 같은 hash (stable stringify)', async () => {
    // payload 가 사실상 동일하면 키 순서 무관하게 unchanged.
    await upsertBySourceSlug(model, [
      buildItem('pikachu', { name: 'Pikachu', level: 25 }),
    ]);
    const second = await upsertBySourceSlug(model, [
      // TS 객체 리터럴은 키 순서 보존 — 여기서는 같은 키 순서로도 hash 일치 검증.
      buildItem('pikachu', { level: 25, name: 'Pikachu' } as never),
    ]);
    expect(second.stats.unchanged).toBe(1);
  });
});
