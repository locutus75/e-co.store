import { prisma } from './src/lib/prisma';

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'llm_config_anthropic' } });
  if (row) {
    const config = JSON.parse(row.value);
    console.log('Anthropic Analysis Model:', config.modules?.analysis?.model);
    console.log('Anthropic Assistant Model:', config.modules?.assistant?.model);
  } else {
    console.log('No Anthropic config found in DB.');
  }
}

main().finally(() => prisma.$disconnect());
