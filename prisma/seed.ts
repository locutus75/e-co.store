import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import bcrypt from 'bcrypt';

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Start seeding...');

  // Roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: { name: 'Admin' },
  });

  const employeeRole = await prisma.role.upsert({
    where: { name: 'Employee' },
    update: {},
    create: { name: 'Employee' },
  });

  // User 1: Admin
  const adminHash = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@e-co.store' },
    update: {},
    create: {
      email: 'admin@e-co.store',
      passwordHash: adminHash,
      userRoles: {
        create: { roleId: adminRole.id }
      }
    },
  });

  // User 2: Employee 1
  const employeeHash = await bcrypt.hash('medewerker123', 10);
  const emp1 = await prisma.user.upsert({
    where: { email: 'medewerker1@e-co.store' },
    update: {},
    create: {
      email: 'medewerker1@e-co.store',
      passwordHash: employeeHash,
      userRoles: {
        create: { roleId: employeeRole.id }
      }
    },
  });

  // User 3: Employee 2
  const emp2 = await prisma.user.upsert({
    where: { email: 'medewerker2@e-co.store' },
    update: {},
    create: {
      email: 'medewerker2@e-co.store',
      passwordHash: employeeHash,
      userRoles: {
        create: { roleId: employeeRole.id }
      }
    },
  });

  // Example Category
  const category = await prisma.category.create({
    data: { name: 'Electronics' }
  });

  // Example Brand
  const brand = await prisma.brand.upsert({
    where: { name: 'E-Tech' },
    update: {},
    create: { name: 'E-Tech' }
  });

  // Example Supplier
  const supplier = await prisma.supplier.upsert({
    where: { name: 'Global Supply Co' },
    update: {},
    create: { name: 'Global Supply Co' }
  });

  // Example Product
  await prisma.product.deleteMany({});
  await prisma.product.createMany({
    data: [
      {
        internalArticleNumber: '2061',
        title: '3D Marks - Sleutelhanger Domtoren 3D',
        status: 'new',
        categoryId: category.id,
        supplierId: supplier.id,
        brandId: brand.id,
        assignedUserId: emp1.id,
        seoTitle: 'Buro Ruig - Domtoren sleutelhanger',
        longDescription: 'Deze sleutelhanger van de echte Utrechtse domtoren is verkrijgbaar in 11 kleuren en helpt mee aan een duurzamere wereld.',
        weightGr: 20,
        lengthCm: 8,
        widthCm: 2,
        heightCm: 8,
        mainMaterial: 'Plastic',
        color: 'Oranje',
        readyForImport: 'NEE',
        webshopActive: false,
        systemActive: true,
        critMensSafeWork: 'Ja',
        critMensFairWage: 'Ja',
        critMensSocial: 'Sociale werkplaats Utrecht',
        critMilieuRecyclable: 'Ja',
        critTransportDistance: 10,
        critTransportVehicle: 'Fiets',
        critHandmade: 'Ja',
        critCircular: 'Upcycled materiaal',
      },
      {
        internalArticleNumber: '3441',
        title: 'Zero Waste Club - Theedoek Organisch Katoen',
        status: 'in_review',
        categoryId: category.id,
        supplierId: supplier.id,
        brandId: brand.id,
        assignedUserId: emp1.id,
        webTitle: 'Zero Waste Club Theedoek (40x40 cm)',
        longDescription: 'Luxe theedoek geweven van 100% GOTS organisch katoen.',
        weightGr: 150,
        lengthCm: 40,
        widthCm: 40,
        mainMaterial: 'Katoen',
        color: 'Lichtrood',
        readyForImport: 'JA',
        webshopActive: true,
        systemActive: true,
        critMensSafeWork: 'Ja',
        critMensFairWage: 'Ja',
        critDierCrueltyFree: 'Ja',
        critMilieuPlasticFree: 'Ja',
        critMilieuPackagingFree: 'Geen opgave',
        critTransportDistance: 450,
      }
    ]
  });

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
