const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'admin@e-co.store' },
    include: {
      userRoles: {
        include: { role: true }
      }
    }
  });
  console.dir(user, { depth: null });
}
main().catch(console.error).finally(() => prisma.$disconnect());
