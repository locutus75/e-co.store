const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: "postgresql://e_co_store_app:K5G47md%23gd8%212snghyfuDh@localhost:5432/e_co_store?schema=public" });
  await client.connect();
  
  try {
    const res = await client.query('SELECT "value" FROM "SystemSetting" WHERE "key" = $1 LIMIT 1', ['product_form_layout']);
    if(res.rows.length > 0) {
      let layout = JSON.parse(res.rows[0].value);
      
      let patched = false;
      layout.forEach(sec => {
        sec.fields.forEach(f => {
          if (f.id === 'FIELD:critTransportVehicle') {
             f.type = 'picklist';
             f.options = ["Vrachtwagen", "Bestelbus", "Trein", "Boot", "Vliegtuig"];
             patched = true;
          }
        });
      });

      if (patched) {
        await client.query('UPDATE "SystemSetting" SET "value" = $1 WHERE "key" = $2', [JSON.stringify(layout), 'product_form_layout']);
        console.log('Successfully patched layout via pure pg');
      } else {
         console.log('Field not found in layout array');
      }
    } else {
      console.log('No custom layout found in DB, using defaults.');
    }
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
