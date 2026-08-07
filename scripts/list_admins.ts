import { prisma } from '../src/lib/prisma';

async function main() {
  const admins = await prisma.user.findMany({
    where: {
      userRoles: {
        some: {
          role: {
            name: 'ADMIN'
          }
        }
      }
    },
    select: {
      email: true
    }
  });

  console.log('--- ADMIN ACCOUNTS IN DB ---');
  admins.forEach(a => console.log(a.email));
  console.log('----------------------------');
}

main().catch(console.error).finally(() => prisma.$disconnect());
