import { prisma } from './src/lib/prisma';

async function main() {
  const count = await prisma.llmUsageLog.count();
  console.log('Total LLM logs:', count);
  const latest = await prisma.llmUsageLog.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  console.log('Latest log:', latest);
}

main().finally(() => prisma.$disconnect());
