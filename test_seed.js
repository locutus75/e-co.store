const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    await prisma.product.deleteMany({});
    console.log("Cleared products.");
    
    const p = await prisma.product.create({
      data: {
        internalArticleNumber: '2061',
        title: '3D Marks - Sleutelhanger Domtoren 3D',
        status: 'new',
        seoTitle: 'Buro Ruig - Domtoren sleutelhanger',
        longDescription: 'Deze sleutelhanger is verkrijgbaar in 11 kleuren en helpt mee aan een duurzamere wereld.',
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
        critMensSocial: 'Sociale werkplaats',
        critMilieuRecyclable: 'Ja',
        critTransportDistance: 10,
        critTransportVehicle: 'Fiets',
        critHandmade: 'Ja',
        critCircular: 'Upcycled materiaal',
      }
    });
    console.log("Success! Product id: " + p.id);
  } catch (e) {
    console.error("FAILED DIRTY", e);
  } finally {
    process.exit(0);
  }
}
main();
