export const SHARED_PACKAGE_NAME = '@pokopia-wiki/shared' as const;

// Phase 1: Prisma Client re-export (scraper·api가 공유)
export { PrismaClient, Prisma } from './prisma-client';
export type * from './prisma-client';

// Phase 2 예정: Zod 스키마, SourceMetadata, redact 유틸
