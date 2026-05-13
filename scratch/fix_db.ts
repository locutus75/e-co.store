import { prisma } from '../src/lib/prisma';

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'llm_config_anthropic' } });
  if (row) {
    const config = JSON.parse(row.value);
    config.modules.analysis.model = 'claude-3-7-sonnet-20250219';
    config.modules.assistant.model = 'claude-3-7-sonnet-20250219';
    config.modules.vision.model = 'claude-3-7-sonnet-20250219';
    await prisma.systemSetting.update({
      where: { key: 'llm_config_anthropic' },
      data: { value: JSON.stringify(config) }
    });
    console.log('Updated Anthropic models to claude-3-7-sonnet-20250219');
  } else {
    console.log('No Anthropic config found in DB.');
  }
}

main().finally(() => prisma.$disconnect());
