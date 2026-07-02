import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
});

async function main() {
  const records = await prisma.$queryRaw<{ key: string, value: string }[]>`SELECT "key", "value" FROM "SystemSetting" WHERE "key" = 'product_form_layout' LIMIT 1`;
  if (records && records.length > 0 && records[0].value) {
    console.log("Layout Setting:", JSON.stringify(JSON.parse(records[0].value), null, 2));
  } else {
    console.log("No custom layout found in database.");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
