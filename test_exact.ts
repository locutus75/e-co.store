import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const payload = {
  "seoTitle": "Test title",
  "longDescription": "Deze sleutelhanger is verkrijgbaar in 11 kleuren en helpt mee aan een duurzamere wereld.",
  "color": "Oranje",
  "mainMaterial": null,
  "ingredients": null,
  "allergens": null,
  "supplierContacted": null,
  "critCircular": null,
  "critTransportVehicle": null,
  "critOther": null,
  "weightGr": 1,
  "lengthCm": null,
  "widthCm": null,
  "heightCm": null,
  "volumeMl": null,
  "volumeGr": null,
  "critTransportDistance": null,
  "webshopActive": false,
  "systemActive": false,
  "critMensSafeWork": null,
  "critMensFairWage": null,
  "critMensSocial": null,
  "critDierCrueltyFree": null,
  "critDierFriendly": null,
  "critMilieuPackagingFree": null,
  "critMilieuPlasticFree": null,
  "critMilieuRecyclable": null,
  "critMilieuBiodegradable": null,
  "critMilieuCompostable": null,
  "critHandmade": null,
  "critNatural": null,
  "critMilieuCarbonCompensated": null
};

async function test() {
  try {
    const r = await prisma.product.update({
      where: { internalArticleNumber: '2061' },
      data: payload
    });
    console.log("SUCCESS!");
  } catch(e: any) {
    console.error("FAILED D: \n", e.message);
  }
}

test();
