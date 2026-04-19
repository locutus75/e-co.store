const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const analyses = await prisma.productAiAnalysis.findMany({
    where: { score: null, structuredData: { not: null } },
    select: { id: true, structuredData: true },
  });

  console.log(`Found ${analyses.length} analyses without score, backfilling...`);

  let updated = 0;
  for (const a of analyses) {
    try {
      const data = JSON.parse(a.structuredData);
      if (data?.score != null) {
        await prisma.productAiAnalysis.update({
          where: { id: a.id },
          data: { score: Number(data.score) },
        });
        console.log(`  Updated ${a.id}: score = ${data.score}`);
        updated++;
      }
    } catch (e) {
      console.error(`  Failed for ${a.id}:`, e.message);
    }
  }

  console.log(`Done. ${updated} records updated.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
