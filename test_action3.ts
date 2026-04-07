import 'dotenv/config';

// Mock Next.js cache to prevent revalidation error outside Next.js
declare var jest: any;
jest = require('jest-mock');
jest.mock('next/cache', () => ({
  revalidatePath: () => {}
}));

import { updateProductAction } from './src/app/actions/product';

async function test() {
  const fd = new FormData();
  fd.append("seoTitle", "Test title");
  fd.append("weightGr", "1");
  fd.append("color", "Oranje");

  try {
    await updateProductAction("2061", fd);
    console.log("SUCCESS!");
  } catch(e: any) {
    console.error("FAILED:\n", e.message);
  }
}

test();
