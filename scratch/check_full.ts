import { prisma } from '../src/lib/prisma';

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'llm_config_anthropic' } });
  if (row) {
    const config = JSON.parse(row.value);
    console.log(JSON.stringify(config.modules, null, 2));
  } else {
    console.log('No config');
  }
}

main().finally(() => prisma.$disconnect());
