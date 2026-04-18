export const SHARED_PACKAGE_NAME = '@pokopia-wiki/shared' as const;

// Phase 1: Prisma Client re-export (scraper·api가 공유)
export { PrismaClient, Prisma } from './prisma-client';
export type * from './prisma-client';

// Phase 2 (ARCH-003): Prisma 7 runtime adapter factory
export { createPrismaClient, getPrismaClient, resetPrismaClient } from './db/client';
export type { CreatePrismaClientOptions } from './db/client';

// Phase 2 (Task 2.1 + 2.2): Zod 스키마 — SourceMetadata + 핵심 5 엔티티
export * from './validators/schemas';

// Phase 2 (Task 2.3): 소스별 라이선스 기본값
export * from './config/source-metadata';

// Phase 2 (Task 2.3): buildSourceMetadata 헬퍼
export * from './validators/metadata';

// Phase 2 (Task 2.4): 로그 민감정보 마스킹
export * from './logging/redact';
