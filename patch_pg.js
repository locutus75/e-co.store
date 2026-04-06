const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: "postgresql://e_co_store_app:K5G47md%23gd8%212snghyfuDh@localhost:5432/e_co_store?schema=public" });
  await client.connect();
  
  try {
    const res = await client.query('SELECT "value" FROM "SystemSetting" WHERE "key" = $1 LIMIT 1', ['product_form_layout']);
    if(res.rows.length > 0) {
      let layout = JSON.parse(res.rows[0].value);
      
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

        await client.query('UPDATE "SystemSetting" SET "value" = $1 WHERE "key" = $2', [JSON.stringify(layout), 'product_form_layout']);
        console.log('Successfully patched layout via pure pg');
      } else {
         console.log('Field already exists in layout array');
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
