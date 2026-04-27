/**
 * SpecialtyLoader 단위 테스트 — Phase 9 선결 코드.
 *
 * input.slug 를 직접 sourceSlug 로 사용하는 패턴 (Pokemon 의 URL 추출과 대비)
 * 검증.
 */

import { describe, expect, it } from 'vitest';

import type { SpecialtyInput } from '@pokopia-wiki/shared';

import { loadSpecialty } from './specialty-loader.js';
import type { SourceSlugKeyedModel } from './upsert-loader.js';

type SpecialtyPayload = { sourceUrl: string; scrapedAt: Date };

class InMemorySpecialtyModel implements SourceSlugKeyedModel<SpecialtyPayload> {
  rows = new Map<
    string,
    SpecialtyPayload & { sourceSlug: string; contentHash: string; updatedAt?: Date }
  >();

  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }

  async create(args: { data: SpecialtyPayload & { sourceSlug: string; contentHash: string } }): Promise<unknown> {
    this.rows.set(args.data.sourceSlug, { ...args.data });
    return args.data;
  }

  async update(args: {
    where: { sourceSlug: string };
    data: SpecialtyPayload & { contentHash: string; updatedAt?: Date };
  }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, { ...existing, ...args.data });
    return args.data;
  }
}

function buildInput(slug: string): SpecialtyInput {
  return {
    slug,
    nameEn: slug,
    sourceSite: 'serebii',
    sourceUrl: `https://www.serebii.net/pokemonpokopia/specialty.shtml#${slug}`,
    scrapedAt: '2026-04-25T03:00:00.000Z',
    license: 'Test',
    copyrightHolder: 'Test',
    attribution: 'Test',
  } as SpecialtyInput;
}

describe('SpecialtyLoader', () => {
  it('input.slug → sourceSlug 직접 사용 (Pokemon URL 추출과 다른 패턴)', async () => {
    const model = new InMemorySpecialtyModel();
    const result = await loadSpecialty(model, [buildInput('grow'), buildInput('search')]);
    expect(result.stats.inserted).toBe(2);
    expect(model.rows.has('grow')).toBe(true);
    expect(model.rows.has('search')).toBe(true);
  });

  it('payload 에 도메인 컬럼 없음 (Specialty 는 감사 컬럼 + i18n 만)', async () => {
    const model = new InMemorySpecialtyModel();
    await loadSpecialty(model, [buildInput('grow')]);
    const row = model.rows.get('grow');
    expect(row?.sourceUrl).toContain('specialty.shtml#grow');
    expect(row?.scrapedAt).toBeInstanceOf(Date);
  });

  it('재호출 시 contentHash 일치 → unchanged', async () => {
    const model = new InMemorySpecialtyModel();
    const inputs = [buildInput('grow')];
    await loadSpecialty(model, inputs);
    const second = await loadSpecialty(model, inputs);
    expect(second.stats.unchanged).toBe(1);
    expect(second.stats.inserted).toBe(0);
  });
});
