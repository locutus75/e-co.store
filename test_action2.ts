import 'dotenv/config';
import { updateProductAction } from './src/app/actions/product';

async function test() {
  const fd = new FormData();
  fd.append("seoTitle", "Test title");
  fd.append("weightGr", "20");
  fd.append("webshopActive", "on");

  try {
    await updateProductAction("2061", fd);
    console.log("SUCCESS!");
  } catch(e) {
    console.error("FAILED D: \n", e);
  }
}

test();
