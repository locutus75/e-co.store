"use server";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads", "products");

export async function getProductImagesAction(articleNumber: string) {
  if (!articleNumber) return [];
  const dir = path.join(UPLOADS_DIR, articleNumber);
  if (!fs.existsSync(dir)) return [];
  
  const files = fs.readdirSync(dir);
  return files
    .filter(f => /\.(jpg|jpeg|png|webp|gif|avif|heic)$/i.test(f))
    .map(f => ({
      name: f,
      url: `/uploads/products/${articleNumber}/${f}`
    }));
}

export async function uploadProductImageAction(articleNumber: string, formData: FormData) {
  console.log("=== START UPLOAD ACTION ===");
  console.log("Article Number:", articleNumber);
  
  try {
    if (!articleNumber) {
      console.log("Validation Failed: No article number");
      return { error: "No article number" };
    }

    const files = formData.getAll('images') as File[];
    console.log("Incoming files array length:", files?.length);

    if (!files || files.length === 0) {
      console.log("Validation Failed: No files found");
      return { error: "No files found" };
    }

    const dir = path.join(UPLOADS_DIR, articleNumber);
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }

    for (const file of files) {
      console.log(`Processing file -> Name: "${file.name}", Size: ${file.size}, Type: ${file.type}`);
      if(!file.name || file.size === 0) {
        console.log("File skipped: name is empty or size is 0");
        continue;
      }
      
      const ext = path.extname(file.name);
      const safeName = path.basename(file.name, ext).replace(/[^a-z0-9]/gi, '_').toLowerCase();
      
      const finalFilename = `${articleNumber}-${Date.now()}-${safeName}${ext}`;
      const filePath = path.join(dir, finalFilename);
      
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      fs.writeFileSync(filePath, buffer);
      
      const standaloneDir = path.join(process.cwd(), ".next", "standalone", "public", "uploads", "products", articleNumber);
      if (fs.existsSync(path.join(process.cwd(), ".next", "standalone"))) {
        if (!fs.existsSync(standaloneDir)) fs.mkdirSync(standaloneDir, { recursive: true });
        fs.writeFileSync(path.join(standaloneDir, finalFilename), buffer);
      }
    }

    revalidatePath('/products');
    return { success: true };
  } catch (err: any) {
    console.error("UPLOAD ACTION ERROR", err);
    try {
      fs.writeFileSync(path.join(process.cwd(), "upload_error_debug.log"), `Time: ${new Date().toISOString()}\nError: ${err.message}\nStack: ${err.stack}\n`);
    } catch(e) {}
    return { error: err.message || "Unknown error" };
  }
}

export async function deleteProductImageAction(articleNumber: string, filename: string) {
  if (!articleNumber || !filename) return { error: "Missing parameters" };

  // Secure basename to prevent path traversal
  const safeFilename = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, articleNumber, safeFilename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Ensure mirrored standalone file is also purged
  const standaloneFilePath = path.join(process.cwd(), ".next", "standalone", "public", "uploads", "products", articleNumber, safeFilename);
  if (fs.existsSync(standaloneFilePath)) {
    fs.unlinkSync(standaloneFilePath);
  }

  revalidatePath('/products');
  return { success: true };
}
