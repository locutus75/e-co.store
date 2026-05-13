import { prisma } from '../src/lib/prisma';

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'llm_module_defaults' } });
  if (row) {
    console.log(row.value);
  } else {
    console.log('No defaults');
  }
}

main().finally(() => prisma.$disconnect());
