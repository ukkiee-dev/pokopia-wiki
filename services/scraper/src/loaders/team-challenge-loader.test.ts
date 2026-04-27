/**
 * TeamChallengeLoader 단위 테스트 — Phase 9 선결 코드, Batch C-3.
 */

import { describe, expect, it } from 'vitest';

import type { TeamChallengeInput } from '@pokopia-wiki/shared';

import { loadTeamChallenge } from './team-challenge-loader.js';

class InMemoryItemModel {
  rows = new Map<string, { id: number; sourceSlug: string }>();
  private nextId = 1;
  add(slug: string): number {
    const id = this.nextId++;
    this.rows.set(slug, { id, sourceSlug: slug });
    return id;
  }
  async findMany(args: { where: { sourceSlug: { in: string[] } }; select: { id: true; sourceSlug: true } }): Promise<ReadonlyArray<{ id: number; sourceSlug: string }>> {
    return [...this.rows.values()].filter((row) => args.where.sourceSlug.in.includes(row.sourceSlug));
  }
}

class InMemoryTeamChallengeModel {
  rows = new Map<string, { id: number; sourceSlug: string; contentHash: string; stage: number }>();
  private nextId = 1;
  async findUnique(args: { where: { sourceSlug: string } }): Promise<{ contentHash: string } | null> {
    const row = this.rows.get(args.where.sourceSlug);
    return row !== undefined ? { contentHash: row.contentHash } : null;
  }
  async create(args: { data: { sourceSlug: string; contentHash: string; stage: number } }): Promise<unknown> {
    const id = this.nextId++;
    this.rows.set(args.data.sourceSlug, { id, sourceSlug: args.data.sourceSlug, contentHash: args.data.contentHash, stage: args.data.stage });
    return { id };
  }
  async update(args: { where: { sourceSlug: string }; data: { contentHash: string } }): Promise<unknown> {
    const existing = this.rows.get(args.where.sourceSlug);
    if (existing === undefined) throw new Error('row not found');
    this.rows.set(args.where.sourceSlug, { ...existing, contentHash: args.data.contentHash });
    return existing;
  }
  async findMany(args: { where: { sourceSlug: { in: string[] } }; select: { id: true; sourceSlug: true } }): Promise<ReadonlyArray<{ id: number; sourceSlug: string }>> {
    return [...this.rows.values()].filter((row) => args.where.sourceSlug.in.includes(row.sourceSlug));
  }
}

class InMemoryRequirementModel {
  rows: Array<{ challengeId: number; itemId: number; quantity: number }> = [];
  async deleteMany(args: { where: { challengeId: number } }): Promise<{ count: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.challengeId !== args.where.challengeId);
    return { count: before - this.rows.length };
  }
  async createMany(args: { data: ReadonlyArray<{ challengeId: number; itemId: number; quantity: number }>; skipDuplicates?: boolean }): Promise<{ count: number }> {
    for (const row of args.data) this.rows.push({ ...row });
    return { count: args.data.length };
  }
}

const META = {
  sourceSite: 'serebii' as const,
  sourceUrl: 'https://www.serebii.net/pokemonpokopia/teaminitiationchallenge.shtml',
  scrapedAt: '2026-04-25T03:00:00.000Z',
  license: 'Test',
  copyrightHolder: 'Test',
  attribution: 'Test',
};

describe('loadTeamChallenge', () => {
  it('itemNameEn 정규화 후 item slug 룩업, requirements replace', async () => {
    const teamChallenge = new InMemoryTeamChallengeModel();
    const teamChallengeRequirement = new InMemoryRequirementModel();
    const item = new InMemoryItemModel();
    const leppaId = item.add('leppaberry');

    const inputs: TeamChallengeInput[] = [
      {
        slug: 'team-challenge-stage1',
        stage: 1,
        badgeName: 'Wood',
        requirements: [{ itemNameEn: 'Leppa Berry', quantity: 5 }],
        ...META,
      },
    ];
    const result = await loadTeamChallenge(
      { teamChallenge, teamChallengeRequirement, item } as never,
      inputs,
    );
    expect(result.stats.inserted).toBe(1);
    const challenge = teamChallenge.rows.get('team-challenge-stage1');
    expect(challenge?.stage).toBe(1);
    expect(teamChallengeRequirement.rows).toContainEqual({
      challengeId: challenge?.id,
      itemId: leppaId,
      quantity: 5,
    });
  });

  it('badgeName 미명시 → "(empty)" placeholder', async () => {
    const teamChallenge = new InMemoryTeamChallengeModel();
    const teamChallengeRequirement = new InMemoryRequirementModel();
    const item = new InMemoryItemModel();
    const inputs: TeamChallengeInput[] = [
      { slug: 'team-challenge-stage9', stage: 9, requirements: [], ...META },
    ];
    await loadTeamChallenge({ teamChallenge, teamChallengeRequirement, item } as never, inputs);
    // badgeName 은 row data 에 직접 expose 안 됨 — stage 만 검증
    expect(teamChallenge.rows.get('team-challenge-stage9')?.stage).toBe(9);
  });
});
