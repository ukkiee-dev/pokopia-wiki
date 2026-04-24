/**
 * Geography 도메인 Zod 스키마 스모크 테스트.
 *
 * 현재 커버: `LocationSchema` (Phase 8 단계 3).
 * `HabitatSchema` 는 단계 5 (habitats) 구현 시점에 추가.
 *
 * - runtime: safeParse 성공/실패 + LocationTypeEnum 경계값
 * - compile-time: z.infer 결과 slug → Prisma.LocationCreateInput.sourceSlug 호환
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Prisma } from '../../prisma-client';
import {
  HabitatSchema,
  LocationSchema,
  type HabitatInput,
  type LocationInput,
} from './geography';

const SOURCE_META = {
  sourceSite: 'serebii' as const,
  scrapedAt: '2026-04-24T22:00:00.000Z',
  license: 'Fan-use (non-commercial).',
  copyrightHolder: '© The Pokémon Company.',
  attribution: 'Data from Serebii.net',
};

const SOURCE_URL = 'https://www.serebii.net/pokemonpokopia/locations.shtml';

describe('LocationSchema.safeParse()', () => {
  it('accepts a Main location from the locations-index page', () => {
    const result = LocationSchema.safeParse({
      slug: 'witheredwastelands',
      nameEn: 'Withered Wastelands',
      type: 'Main',
      imageUrl:
        'https://www.serebii.net/pokemonpokopia/locations/witheredwastelands.png',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.slug).toBe('witheredwastelands');
    expect(result.data.type).toBe('Main');
    expect(result.data.descriptionEn).toBeUndefined();
    expect(result.data.parentSlug).toBeUndefined();
  });

  it('accepts Cloud Island type (공백 포함 DB 값)', () => {
    const result = LocationSchema.safeParse({
      slug: 'cloudisland',
      nameEn: 'Cloud Island',
      type: 'Cloud Island',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.type).toBe('Cloud Island');
  });

  it('accepts Sub type with parentSlug', () => {
    const result = LocationSchema.safeParse({
      slug: 'palettetown-downtown',
      nameEn: 'Palette Town Downtown',
      type: 'Sub',
      parentSlug: 'palettetown',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.parentSlug).toBe('palettetown');
  });

  it('rejects unknown LocationType value', () => {
    const result = LocationSchema.safeParse({
      slug: 'unknown',
      nameEn: 'Unknown',
      type: 'Underwater',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.includes('type'))).toBe(true);
  });

  it('rejects missing required slug', () => {
    const result = LocationSchema.safeParse({
      nameEn: 'Withered Wastelands',
      type: 'Main',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.includes('slug'))).toBe(true);
  });

  it('rejects missing required type', () => {
    const result = LocationSchema.safeParse({
      slug: 'witheredwastelands',
      nameEn: 'Withered Wastelands',
      sourceUrl: SOURCE_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.includes('type'))).toBe(true);
  });
});

describe('LocationInput — Prisma type compatibility', () => {
  it('LocationInput.slug is assignable to Prisma.LocationCreateInput.sourceSlug', () => {
    expectTypeOf<LocationInput['slug']>().toExtend<Prisma.LocationCreateInput['sourceSlug']>();
  });
});

describe('HabitatSchema.safeParse()', () => {
  const HABITAT_URL = 'https://www.serebii.net/pokemonpokopia/habitats.shtml';

  it('accepts a habitat list entry (slug + habitatNo + description)', () => {
    const result = HabitatSchema.safeParse({
      slug: 'tallgrass',
      habitatNo: 1,
      nameEn: 'Tall Grass',
      descriptionEn: 'Four tufts of tall grass bunched together in a plot.',
      imageUrl: 'https://www.serebii.net/pokemonpokopia/habitatdex/1.png',
      sourceUrl: HABITAT_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.slug).toBe('tallgrass');
    expect(result.data.habitatNo).toBe(1);
    expect(result.data.isEvent).toBe(false);
    expect(result.data.pokemonSlugs).toEqual([]);
  });

  it('accepts event habitat with null habitatNo', () => {
    const result = HabitatSchema.safeParse({
      slug: 'eventhabitat',
      habitatNo: null,
      nameEn: 'Event Habitat',
      isEvent: true,
      sourceUrl: HABITAT_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.habitatNo).toBeNull();
    expect(result.data.isEvent).toBe(true);
  });

  it('rejects missing required slug', () => {
    const result = HabitatSchema.safeParse({
      habitatNo: 1,
      nameEn: 'Tall Grass',
      sourceUrl: HABITAT_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.includes('slug'))).toBe(true);
  });

  it('rejects empty descriptionEn (must be min 1 char when provided)', () => {
    const result = HabitatSchema.safeParse({
      slug: 'tallgrass',
      habitatNo: 1,
      nameEn: 'Tall Grass',
      descriptionEn: '',
      sourceUrl: HABITAT_URL,
      ...SOURCE_META,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.includes('descriptionEn'))).toBe(true);
  });
});

describe('HabitatInput — Prisma type compatibility', () => {
  it('HabitatInput.slug is assignable to Prisma.HabitatCreateInput.sourceSlug', () => {
    expectTypeOf<HabitatInput['slug']>().toExtend<Prisma.HabitatCreateInput['sourceSlug']>();
  });
});
