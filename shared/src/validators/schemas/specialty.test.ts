/**
 * Specialty Zod 스키마 스모크 테스트 (Phase 8 단계 2).
 *
 * - runtime: safeParse 성공/실패 동작 확인
 * - compile-time: z.infer 결과의 `slug` 가 Prisma.SpecialtyCreateInput.sourceSlug 와
 *   string 레벨에서 호환되는지 expectTypeOf 로 검증 (loader 가 `slug → sourceSlug`
 *   로 key 이름만 바꿔 전달하는 계약).
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Prisma } from '../../prisma-client';
import { SpecialtySchema, type SpecialtyInput } from './specialty';

/** 모든 safeParse 테스트가 공유하는 SourceMetadata 페이로드 (fixture). */
const SOURCE_META = {
  sourceSite: 'serebii' as const,
  scrapedAt: '2026-04-24T07:50:00.000Z',
  license: 'Fan-use (non-commercial).',
  copyrightHolder: '© The Pokémon Company.',
  attribution: 'Data from Serebii.net',
};

const SOURCE_URL = 'https://www.serebii.net/pokemonpokopia/specialty.shtml';

describe('SpecialtySchema.safeParse()', () => {
  it('accepts a complete specialty parse result and preserves metadata', () => {
    const result = SpecialtySchema.safeParse({
      slug: 'appraise',
      nameEn: 'Appraise',
      descriptionEn: "You can show lost relics you've found to Professor Tangrowth.",
      imageUrl: 'https://www.serebii.net/pokemonpokopia/pokedex/specialty/appraise.png',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.slug).toBe('appraise');
    expect(result.data.nameEn).toBe('Appraise');
    expect(result.data.descriptionEn).toContain('lost relics');
    expect(result.data.imageUrl).toBe(
      'https://www.serebii.net/pokemonpokopia/pokedex/specialty/appraise.png',
    );
    expect(result.data.sourceSite).toBe('serebii');
  });

  it('accepts specialty without optional descriptionEn and imageUrl', () => {
    const result = SpecialtySchema.safeParse({
      slug: 'eat',
      nameEn: 'Eat',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.descriptionEn).toBeUndefined();
    expect(result.data.imageUrl).toBeUndefined();
  });

  it('rejects input missing required slug', () => {
    const result = SpecialtySchema.safeParse({
      nameEn: 'Appraise',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.includes('slug'))).toBe(true);
  });

  it('rejects input missing required nameEn', () => {
    const result = SpecialtySchema.safeParse({
      slug: 'appraise',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.includes('nameEn'))).toBe(true);
  });

  it('rejects empty descriptionEn (must be min 1 char when provided)', () => {
    const result = SpecialtySchema.safeParse({
      slug: 'appraise',
      nameEn: 'Appraise',
      descriptionEn: '',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.includes('descriptionEn'))).toBe(true);
  });
});

describe('SpecialtyInput — Prisma type compatibility', () => {
  it('SpecialtyInput.slug is assignable to Prisma.SpecialtyCreateInput.sourceSlug', () => {
    // parser 의 `slug` 는 loader 에서 `sourceSlug` 로 이름만 바꿔 Prisma 에 전달된다.
    // string 레벨 compatibility 만 검증 — 실제 렌더는 loader 테스트 책임.
    expectTypeOf<SpecialtyInput['slug']>().toExtend<Prisma.SpecialtyCreateInput['sourceSlug']>();
  });

  it('SpecialtyInput.nameEn is assignable to Prisma.SpecialtyI18nCreateInput.name', () => {
    // loader 는 parser 의 `nameEn` 을 `specialty_i18n(locale='en').name` 으로 복사한다.
    expectTypeOf<SpecialtyInput['nameEn']>().toExtend<Prisma.SpecialtyI18nCreateInput['name']>();
  });
});
