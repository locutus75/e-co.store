import { prisma } from './src/lib/prisma';

async function main() {
  const logs = await prisma.llmUsageLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log('--- LATEST LLM USAGE LOGS ---');
  logs.forEach(log => {
    console.log(`Time: ${log.createdAt}`);
    console.log(`Provider: ${log.provider}`);
    console.log(`Model: ${log.model}`);
    console.log(`Success: ${log.success}`);
    if (!log.success) {
      console.log(`Error: ${log.errorMsg}`);
    }
    console.log('-----------------------------');
  });
}

main().finally(() => prisma.$disconnect());
