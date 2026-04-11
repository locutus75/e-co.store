"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function assertProductLock(internalId: string) {
  const session = await getServerSession(authOptions);
  const roles = (session?.user as any)?.roles || [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
  
  if (isAdmin) return; // Admins bypass locks
  
  const existingProduct = await prisma.product.findUnique({
    where: { internalArticleNumber: internalId },
    select: { readyForImport: true }
  });
  
  if (existingProduct) {
    const readyStatus = (existingProduct.readyForImport || '').toUpperCase();
    if (readyStatus === 'JA' || readyStatus === 'REVIEW' || readyStatus === 'R' || readyStatus === 'Y') {
      throw new Error('Unauthorized: Product is locked for review/export and cannot be modified.');
    }
  }
}

export async function getSupplierProductsAction(supplierId: string, currentArticleId: string) {
  if (!supplierId) return [];
  try {
    return await prisma.product.findMany({
      where: { 
        supplierId: supplierId,
        internalArticleNumber: { not: currentArticleId }
      },
      select: { internalArticleNumber: true, title: true }
    });
  } catch(e) {
    console.error("Failed to get supplier products", e);
    return [];
  }
}

export async function getProductDataAction(internalId: string) {
  try {
    return await prisma.product.findUnique({
      where: { internalArticleNumber: internalId }
    });
  } catch(e) {
    console.error("Failed to get product data", e);
    return null;
  }
}

export async function bulkAssignAction(internalIds: string[], userId: string) {
  if (!internalIds || internalIds.length === 0) return { success: false, error: 'Geen ID\'s meegegeven' };
  
  try {
    const res = await prisma.product.updateMany({
      where: {
        internalArticleNumber: {
          in: internalIds
        }
      },
      data: {
        assignedUserId: userId === 'NONE' ? null : userId
      }
    });

    // Option: Insert History tracking into ProductAssignment here if desired.
    if (userId !== 'NONE') {
      const histories = internalIds.map(pid => ({
        productId: pid, // wait, product has an internal article number, but the relation might be the CUID. Let's just blindly update `assignedUserId` on the Product directly, which is clean.
      }))
    }
    
    revalidatePath('/products');
    return { success: true, count: res.count };
  } catch(e: any) {
    console.error("ASSIGN ERROR", e);
    return { success: false, error: e.message };
  }
}

export async function deleteProductsAction(internalIds: string[]) {
  if (!internalIds || internalIds.length === 0) return { success: false, error: 'Geen ID\'s meegegeven' };
  
  try {
    const res = await prisma.product.deleteMany({
      where: {
        internalArticleNumber: {
          in: internalIds
        }
      }
    });
    revalidatePath('/products');
    return { success: true, count: res.count };
  } catch(e: any) {
    console.error("DELETE ERROR", e);
    return { success: false, error: e.message };
  }
}

export async function updateReadyForImportAction(internalId: string, status: string) {
  try {
    await prisma.product.update({
      where: { internalArticleNumber: internalId },
      data: { readyForImport: status }
    });
    revalidatePath('/products');
    return { success: true };
  } catch (e: any) {
    console.error("Update readyForImport failed:", e);
    return { success: false, error: e.message };
  }
}

export async function updateProductStatusAction(internalId: string, status: string) {
  try {
    await assertProductLock(internalId);
    await prisma.product.update({
      where: { internalArticleNumber: internalId },
      data: { status: status }
    });
    revalidatePath('/products');
    return { success: true };
  } catch (e: any) {
    console.error("Update status failed:", e);
    return { success: false, error: e.message };
  }
}

export async function updateProductAction(internalId: string, formData: FormData) {
  await assertProductLock(internalId);
  const data: any = {};
  
  // Safe extraction of float fields
  if (formData.has('basePrice')) {
      const pVal = formData.get('basePrice');
      if (pVal === '') {
          data.basePrice = null;
      } else {
          const parsed = parseFloat(pVal as string);
          if (!Number.isNaN(parsed)) {
             data.basePrice = parsed;
          }
      }
  }

  // Load layout to dynamically extract all WYSIWYG fields
  const { getFormLayoutAction } = await import('@/app/actions/formLayouts');
  const layout = await getFormLayoutAction();
  const allFields = layout.flatMap((s: any) => s.fields);
  
  const customData: Record<string, string | null> = {};
  
  const presentFields = formData.getAll('_present_fields').map(v => v.toString());

  for (const field of allFields) {
    let key = field.id.replace('FIELD:', '');
    if (key === 'description') key = 'longDescription';
    
    if (!presentFields.includes(key)) {
      continue;
    }
    
    // Some keys are strictly natively boolean in Prisma schema
    const isNativeBoolean = key === 'webshopActive' || key === 'systemActive' || key === 'publicationReady';
    
    // How the data comes in from the DOM
    const val = formData.get(key);
    
    let processedValue: any = val;

    if (field.type === 'checkbox') {
      if (isNativeBoolean) {
        processedValue = formData.has(key); // native checkbox sends "on" or nothing
      } else {
        // If it's a Prisma String mapped as a checkbox, coerce to 'Ja'/'Nee' based on presence
        processedValue = formData.has(key) ? 'Ja' : 'Nee';
      }
    } else if (field.type === 'threeway') {
      if (val === 'Ja' || val === 'Nee') {
        processedValue = val;
      } else {
        processedValue = null; // 'Leeg' or unrecognized
      }
    } else if (field.type === 'number') {
      if (val !== null && val !== '') {
        const parsed = parseInt(val.toString(), 10);
        processedValue = Number.isNaN(parsed) ? null : parsed;
      } else {
        processedValue = null;
      }
    } else {
      // text, textarea, picklist, media
      processedValue = (val === '' || val === null) ? null : val?.toString();
    }

    if (key === 'critMensSocialCheck') key = 'critMensSocial'; // database alias

    if (key.startsWith('custom_')) {
      const cleanKey = key.replace('custom_', '');
      customData[cleanKey] = processedValue;
    } else if (key !== 'basePrice' && key !== 'media') {
      // media is virtual, basePrice handled above
      data[key] = processedValue;
    }
  }

  // Double check basic fields from non-WYSIWYG forms or modals
  const textFallbacks = ['title', 'ean', 'status'];
  for (const fallback of textFallbacks) {
    if (formData.has(fallback)) {
      data[fallback] = formData.get(fallback)?.toString();
    }
  }

  if (Object.keys(customData).length > 0) {
    data.customData = customData;
  }

  try {
    await prisma.product.update({
      where: { internalArticleNumber: internalId },
      data
    });
    revalidatePath('/products');
  } catch (e: any) {
    const fs = require('fs');
    fs.writeFileSync('prisma_debug_err.log', "Error:\n" + String(e.message) + "\n\nPayload:\n" + JSON.stringify(data, null, 2));
    console.error("PRISMA VALIDATION ERROR", JSON.stringify(data), e.message);
    throw new Error(`Data Validation Failed! Error: ${e.message.slice(0, 150)}... // More written to prisma_debug_err.log`);
  }
}
