import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcrypt';

async function main() {
  const email = 'dev@local';
  const password = 'password123';
  const passwordHash = await bcrypt.hash(password, 10);

  // Zorg dat de ADMIN rol bestaat
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' }
  });

  // Maak de dev gebruiker aan of werk deze bij
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      passwordHash,
      chatColor: '#22c55e'
    }
  });

  // Koppel de ADMIN rol aan de gebruiker
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: adminRole.id
      }
    },
    update: {},
    create: {
      userId: user.id,
      roleId: adminRole.id
    }
  });

  console.log(`\nSucces! Je kunt nu inloggen met:`);
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
