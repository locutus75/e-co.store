import { prisma } from '../src/lib/prisma';

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'llm_config_anthropic' } });
  if (row) {
    const config = JSON.parse(row.value);
    config.modules.analysis.model = 'claude-sonnet-4-6-20260401';
    config.modules.assistant.model = 'claude-sonnet-4-6-20260401';
    config.modules.vision.model = 'claude-sonnet-4-6-20260401';
    await prisma.systemSetting.update({
      where: { key: 'llm_config_anthropic' },
      data: { value: JSON.stringify(config) }
    });
    console.log('Updated Anthropic models to claude-sonnet-4-6-20260401');
  } else {
    console.log('No Anthropic config found in DB.');
  }
}

main().finally(() => prisma.$disconnect());
