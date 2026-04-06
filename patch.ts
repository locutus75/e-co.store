import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function run() {
  const records = await prisma.$queryRaw`SELECT "key", "value" FROM "SystemSetting" WHERE "key" = 'product_form_layout' LIMIT 1`;
  if (records && records.length > 0) {
    const layout = JSON.parse(records[0].value);
    
    let found = false;
    layout.forEach(sec => {
      sec.fields.forEach(f => {
        if (f.id === 'FIELD:internalRemarks') found = true;
      });
    });

    if (!found) {
      layout[layout.length - 1].fields.push({
        id: "FIELD:internalRemarks",
        label: "Interne Communicatie",
        type: "textarea",
        width: 12
      });

      const valueString = JSON.stringify(layout);
      await prisma.$executeRaw`UPDATE "SystemSetting" SET "value" = ${valueString} WHERE "key" = 'product_form_layout'`;
      console.log('Successfully patched layout in production DB');
    } else {
      console.log('Already exists');
    }
  } else {
    console.log('No custom layout found, defaults apply');
  }
}
run();
