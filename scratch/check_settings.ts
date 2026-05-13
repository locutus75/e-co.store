import { prisma } from './src/lib/prisma';

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'llm_module_defaults' } });
  console.log('llm_module_defaults:', row?.value);
  
  const providers = ['openai', 'anthropic', 'gemini'];
  for (const p of providers) {
    const pRow = await prisma.systemSetting.findUnique({ where: { key: `llm_config_${p}` } });
    console.log(`llm_config_${p}:`, pRow?.value);
  }
}

main();
