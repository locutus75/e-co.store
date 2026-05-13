const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'llm_module_defaults' } });
    console.log('llm_module_defaults:', row?.value);
    
    const providers = ['openai', 'anthropic', 'gemini'];
    for (const p of providers) {
      const pRow = await prisma.systemSetting.findUnique({ where: { key: `llm_config_${p}` } });
      console.log(`llm_config_${p}:`, pRow?.value);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
