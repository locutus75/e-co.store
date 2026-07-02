import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
});

async function main() {
  const p = await prisma.product.findUnique({
    where: { internalArticleNumber: '16815' }
  });
  console.log("Database Product 16815:", JSON.stringify(p, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
