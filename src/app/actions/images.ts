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
  if (!articleNumber) return { error: "No article number" };

  const files = formData.getAll('images') as File[];
  if (!files || files.length === 0) return { error: "No files found" };

  const dir = path.join(UPLOADS_DIR, articleNumber);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  for (const file of files) {
    if(!file.name || file.size === 0) continue;
    
    // Prevent directory traversal attacks
    const ext = path.extname(file.name);
    const safeName = path.basename(file.name, ext).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    // Format: 2061-timestamp-random.jpg
    const finalFilename = `${articleNumber}-${Date.now()}-${safeName}${ext}`;
    const filePath = path.join(dir, finalFilename);
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Write to persistent source directory
    fs.writeFileSync(filePath, buffer);
    
    // Write mirror to standalone directory so NextJS serves it immediately in production mode without a restart
    const standaloneDir = path.join(process.cwd(), ".next", "standalone", "public", "uploads", "products", articleNumber);
    if (fs.existsSync(path.join(process.cwd(), ".next", "standalone"))) {
      if (!fs.existsSync(standaloneDir)) fs.mkdirSync(standaloneDir, { recursive: true });
      fs.writeFileSync(path.join(standaloneDir, finalFilename), buffer);
    }
  }

  revalidatePath('/products');
  return { success: true };
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
