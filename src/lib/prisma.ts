import { PrismaClient } from '@prisma/client'
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

// Version key: increment this whenever the Prisma schema changes (new models /
// fields) so the in-process singleton is discarded and rebuilt with the latest
// generated client. Current version: 5 (added chatColor to User).
const DB_VERSION = 5;

const globalForPrisma = global as unknown as { prisma: PrismaClient, __prismaDbVersion?: number }

export const prisma =
  (globalForPrisma.prisma && globalForPrisma.__prismaDbVersion === DB_VERSION) ? globalForPrisma.prisma :
  new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.__prismaDbVersion = DB_VERSION;
}
