import { prisma } from '../src/lib/prisma';

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'llm_config_anthropic' } });
  if (row) {
    const config = JSON.parse(row.value);
    console.log('Fetched Models:', config.fetchedModels);
  }
}

main().finally(() => prisma.$disconnect());
