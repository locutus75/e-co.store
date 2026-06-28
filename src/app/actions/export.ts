"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PRISMA_FIELDS } from "@/lib/constants";
import fs from "fs";
import path from "path";

const ROOT_DIR = process.env.APP_ROOT || process.cwd();
const PRODUCTS_DIR = path.join(ROOT_DIR, "public/uploads/products");
const EXPORTS_DIR = path.join(ROOT_DIR, "public/uploads/exports");

// Helper to assert user is Admin
async function assertAdmin() {
  const session = await getServerSession(authOptions);
  const roles = (session?.user as any)?.roles || [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
  if (!isAdmin) {
    throw new Error("Access Denied: Admin role required.");
  }
}

// 1. Get Export Profiles
export async function getExportProfilesAction() {
  await assertAdmin();
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'export_profiles' } });
    if (setting && setting.value) {
      return JSON.parse(setting.value);
    }
  } catch (err) {
    console.error("Error fetching export profiles:", err);
  }
  return [];
}

// 2. Save Export Profiles
export async function saveExportProfilesAction(profiles: any[]) {
  await assertAdmin();
  try {
    await prisma.systemSetting.upsert({
      where: { key: 'export_profiles' },
      create: { key: 'export_profiles', value: JSON.stringify(profiles) },
      update: { value: JSON.stringify(profiles) }
    });
    return { success: true };
  } catch (err: any) {
    console.error("Error saving export profiles:", err);
    return { error: err.message || "Failed to save profiles." };
  }
}

// 3. Get Exportable Fields
export async function getExportableFieldsAction() {
  await assertAdmin();

  // Define standard fields
  const fields = [
    ...PRISMA_FIELDS,
    { key: 'rel_category', label: 'Categorie (Naam)', type: 'relation' },
    { key: 'rel_subcategory', label: 'Subcategorie (Naam)', type: 'relation' },
    { key: 'exportStatus', label: 'Export Status', type: 'string' }
  ];

  // Query distinct custom data keys dynamically from PostgreSQL
  try {
    const customKeys = await prisma.$queryRaw<{ key: string }[]>`
      SELECT DISTINCT jsonb_object_keys("customData"::jsonb) as key 
      FROM "Product" 
      WHERE "customData" IS NOT NULL
    `;
    
    if (customKeys && customKeys.length > 0) {
      customKeys.forEach(k => {
        fields.push({
          key: `custom_${k.key}`,
          label: `Veld (AI/Vrij): ${k.key}`,
          type: 'custom'
        });
      });
    }
  } catch (err) {
    console.warn("Could not query dynamic custom fields:", err);
  }

  return fields;
}

// 4. Get Products and their Photos for Export
export async function getProductsForExportAction(filters: {
  status?: string;
  readyForImport?: string;
  brandId?: string;
  supplierId?: string;
  onlyNotExported?: boolean;
}) {
  await assertAdmin();

  try {
    // Build query where clause
    const where: any = {};

    if (filters.status) {
      where.status = { equals: filters.status, mode: 'insensitive' };
    }
    if (filters.readyForImport) {
      where.readyForImport = { equals: filters.readyForImport, mode: 'insensitive' };
    }
    if (filters.brandId) {
      where.brandId = filters.brandId;
    }
    if (filters.supplierId) {
      where.supplierId = filters.supplierId;
    }
    if (filters.onlyNotExported) {
      where.OR = [
        { exportStatus: null },
        { exportStatus: "" }
      ];
    }

    // Query products
    const products = await prisma.product.findMany({
      where,
      orderBy: { internalArticleNumber: 'asc' },
      include: {
        brand: true,
        supplier: true,
        category: true,
        subcategory: true
      }
    });

    // Populate images from local filesystem directory
    const productsWithImages = products.map(product => {
      const dir = path.join(PRODUCTS_DIR, product.internalArticleNumber);
      let images: { name: string; url: string }[] = [];

      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir);
          images = files
            .filter(f => /\.(jpg|jpeg|png|webp|gif|avif|heic)$/i.test(f))
            .map(f => ({
              name: f,
              url: `/api/uploads/products/${product.internalArticleNumber}/${f}`
            }));
        } catch (e) {
          console.warn(`Error reading images for product ${product.internalArticleNumber}:`, e);
        }
      }

      return {
        ...product,
        images
      };
    });

    return { success: true, products: productsWithImages };
  } catch (err: any) {
    console.error("Error retrieving products for export:", err);
    return { error: err.message || "Failed to load products." };
  }
}

// 5. Mark Products as Exported
export async function markProductsAsExportedAction(productIds: string[]) {
  await assertAdmin();

  if (!productIds || productIds.length === 0) {
    return { success: true, count: 0 };
  }

  try {
    const timestamp = new Date().toLocaleString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    
    const label = `Geëxporteerd op ${timestamp}`;

    const updateResult = await prisma.product.updateMany({
      where: {
        id: { in: productIds }
      },
      data: {
        exportStatus: label
      }
    });

    revalidatePath('/products');
    return { success: true, count: updateResult.count };
  } catch (err: any) {
    console.error("Error marking products as exported:", err);
    return { error: err.message || "Failed to update export status." };
  }
}

// 6. Clear Export folder
export async function clearExportFolderAction() {
  await assertAdmin();

  try {
    if (fs.existsSync(EXPORTS_DIR)) {
      const files = fs.readdirSync(EXPORTS_DIR);
      for (const file of files) {
        const filePath = path.join(EXPORTS_DIR, file);
        if (fs.lstatSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      }
    }
    return { success: true };
  } catch (err: any) {
    console.error("Error clearing export folder:", err);
    return { error: err.message || "Failed to clear export folder." };
  }
}
