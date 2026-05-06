import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.systemSetting.findMany();
  console.log('All Settings:');
  settings.forEach(s => {
    console.log(`Key: ${s.key}`);
    console.log(`Value: ${s.value}`);
    console.log('---');
  });
}

main().finally(() => prisma.$disconnect());
