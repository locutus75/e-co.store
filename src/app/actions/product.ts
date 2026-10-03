"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function logAuditAction(userId: string, action: string, entity: string, entityId: string, changes?: string) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        changes
      }
    });
  } catch (e) {
    console.error("Audit logging failed:", e);
  }
}

/** Throws when the configured EmpCo policy blocks marking these products as webshop-ready. */
async function assertEmpcoReadyAllowed(internalIds: string[], status: string) {
  if ((status || '').toUpperCase() !== 'JA') return;
  const { evaluateEmpcoReadyGateAction } = await import('@/app/actions/empco');
  const gate = await evaluateEmpcoReadyGateAction(internalIds);
  if (gate.blocked.length > 0) {
    const list = gate.blocked.slice(0, 5).map(b => `#${b.articleNumber}: ${b.reason}`).join('; ');
    throw new Error(`EmpCo: ${gate.blocked.length} product(en) mogen niet op Webshop Ready gezet worden — ${list}${gate.blocked.length > 5 ? ' …' : ''}`);
  }
}

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
      select: { internalArticleNumber: true, title: true, status: true }
    });
  } catch(e) {
    console.error("Failed to get supplier products", e);
    return [];
  }
}

export async function getProductDataAction(internalId: string) {
  try {
    return await prisma.product.findUnique({
      where: { internalArticleNumber: internalId },
      include: {
        brand: true,
        category: true,
        subcategory: true,
        supplier: true,
        assignedUser: true,
      }
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
    
    const session = await getServerSession(authOptions);
    const actorId = (session?.user as any)?.id;
    if (actorId) {
      for (const id of internalIds) {
        await logAuditAction(actorId, 'ASSIGN', 'Product', id, `Assigned to ${userId}`);
      }
    }
    
    revalidatePath('/products');
    revalidatePath('/assignments');
    revalidatePath('/', 'layout');
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

export async function updateProductUitlopendAction(internalId: string, uitlopend: boolean) {
  try {
    await assertProductLock(internalId);
    await prisma.product.update({
      where: { internalArticleNumber: internalId },
      data: { uitlopend }
    });
    const session = await getServerSession(authOptions);
    const actorId = (session?.user as any)?.id;
    if (actorId) {
      await logAuditAction(actorId, 'UITLOPEND_CHANGE', 'Product', internalId, `Uitlopend set to ${uitlopend}`);
    }

    revalidatePath('/products');
    revalidatePath('/assignments');
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (e: any) {
    console.error("Update uitlopend failed:", e);
    return { success: false, error: e.message };
  }
}

export async function bulkUpdateUitlopendAction(internalIds: string[], uitlopend: boolean) {
  if (!internalIds || internalIds.length === 0) return { success: false, error: "Geen ID's meegegeven" };

  try {
    const session = await getServerSession(authOptions);
    const roles = (session?.user as any)?.roles || [];
    const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized: Admin role required.' };
    }

    const res = await prisma.product.updateMany({
      where: {
        internalArticleNumber: {
          in: internalIds
        }
      },
      data: {
        uitlopend
      }
    });

    const actorId = (session?.user as any)?.id;
    if (actorId) {
      for (const id of internalIds) {
        await logAuditAction(actorId, 'BULK_UITLOPEND_CHANGE', 'Product', id, `Bulk uitlopend set to ${uitlopend}`);
      }
    }

    revalidatePath('/products');
    revalidatePath('/assignments');
    revalidatePath('/', 'layout');
    return { success: true, count: res.count };
  } catch (e: any) {
    console.error("Bulk update uitlopend failed:", e);
    return { success: false, error: e.message };
  }
}

export async function updateReadyForImportAction(internalId: string, status: string) {
  try {
    await assertEmpcoReadyAllowed([internalId], status);
    await prisma.product.update({
      where: { internalArticleNumber: internalId },
      data: { readyForImport: status }
    });
    const session = await getServerSession(authOptions);
    const actorId = (session?.user as any)?.id;
    if (actorId) {
      await logAuditAction(actorId, 'READY_FOR_IMPORT_CHANGE', 'Product', internalId, `Status set to ${status}`);
    }

    revalidatePath('/products');
    revalidatePath('/assignments');
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (e: any) {
    console.error("Update readyForImport failed:", e);
    return { success: false, error: e.message };
  }
}

export async function bulkUpdateReadyForImportAction(internalIds: string[], status: string) {
  if (!internalIds || internalIds.length === 0) return { success: false, error: "Geen ID's meegegeven" };

  try {
    const session = await getServerSession(authOptions);
    const roles = (session?.user as any)?.roles || [];
    const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized: Admin role required.' };
    }

    await assertEmpcoReadyAllowed(internalIds, status);

    const res = await prisma.product.updateMany({
      where: {
        internalArticleNumber: {
          in: internalIds
        }
      },
      data: {
        readyForImport: status
      }
    });

    const actorId = (session?.user as any)?.id;
    if (actorId) {
      for (const id of internalIds) {
        await logAuditAction(actorId, 'READY_FOR_IMPORT_CHANGE', 'Product', id, `Status set to ${status} via bulk update`);
      }
    }

    revalidatePath('/products');
    revalidatePath('/assignments');
    revalidatePath('/', 'layout');
    return { success: true, count: res.count };
  } catch (e: any) {
    console.error("BULK READY FOR IMPORT CHANGE ERROR", e);
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
    const session = await getServerSession(authOptions);
    const actorId = (session?.user as any)?.id;
    if (actorId) {
      await logAuditAction(actorId, 'STATUS_CHANGE', 'Product', internalId, `Status set to ${status}`);
    }

    revalidatePath('/products');
    revalidatePath('/assignments');
    revalidatePath('/', 'layout');
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

  // Collect internalRemarks value for later migration (never save to DB column directly)
  const legacyRemarksText = formData.get('internalRemarks')?.toString() || '';

  for (const field of allFields) {
    let key = field.id.replace('FIELD:', '');
    if (key === 'description') key = 'longDescription';
    
    if (!presentFields.includes(key)) {
      continue;
    }
    
    // Some keys are strictly natively boolean in Prisma schema
    const isNativeBoolean = key === 'webshopActive' || key === 'systemActive' || key === 'publicationReady' || key === 'uitlopend';
    
    // How the data comes in from the DOM
    const val = formData.get(key);
    
    let processedValue: any = val;

    if (field.type === 'checkbox') {
      if (isNativeBoolean) {
        processedValue = formData.has(key); // native checkbox sends "on" or nothing
      } else if (key.startsWith('crit')) {
        // Crit fields are rendered as ThreeWayToggle which always submits 'Ja', 'Nee', or 'Leeg'
        // via a hidden input — so we must read the actual value, not just check presence.
        const threeWayVal = val?.toString();
        processedValue = (threeWayVal === 'Ja' || threeWayVal === 'Nee') ? threeWayVal : null;
      } else {
        // Other string-backed checkboxes (JaNeeToggle) send 'on' when checked, nothing when unchecked
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

    // 'chat' fields are render-only — never post data to DB
    if (field.type === 'chat') continue;
    // 'internalRemarks' is now managed by the ProductRemark chat system — skip it here
    if (key === 'internalRemarks') continue;

    if (key === 'critMensSocialCheck') key = 'critMensSocial'; // database alias
    if (key === 'assignedUserId' && processedValue === 'NONE') processedValue = null;

    const knownPrismaProductKeys = [
      'internalArticleNumber', 'ean', 'title', 'status', 'brandId', 'supplierId', 'categoryId', 'subcategoryId', 'assignedUserId',
      'shortDescription', 'longDescription', 'color', 'size', 'material', 'tags', 'webshopSlug', 'weightGr', 'lengthCm', 'widthCm',
      'heightCm', 'volumeMl', 'volumeGr', 'ingredients', 'allergens', 'mainMaterial', 'readyForImport', 'webshopActive', 'systemActive',
      'uitlopend', 'supplierContacted', 'internalRemarks', 'customData', 'critMensSafeWork', 'critMensFairWage', 'critMensSocial', 'critDierCrueltyFree',
      'critDierFriendly', 'critMilieuPackagingFree', 'critMilieuPlasticFree', 'critMilieuRecyclable', 'critMilieuBiodegradable',
      'critMilieuCompostable', 'critMilieuCarbonCompensated', 'critTransportDistance', 'critTransportVehicle', 'critHandmade', 'critNatural',
      'critCircular', 'critOther', 'seoTitle', 'seoMetaDescription', 'basePrice', 'qualityControlStatus', 'exportStatus', 'publicationReady', 'internalNotes'
    ];

    if (key.startsWith('custom_')) {
      const cleanKey = key.replace('custom_', '');
      customData[cleanKey] = processedValue;
    } else if (key !== 'basePrice' && key !== 'media') {
      // media is virtual, basePrice handled above
      if (knownPrismaProductKeys.includes(key)) {
        data[key] = processedValue;
      } else {
        // Auto-fallback: User added an unmapped field (e.g. 'price') without 'custom_' prefix. Protect Prisma by isolating it.
        customData[key] = processedValue;
      }
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

  // ── Legacy internalRemarks migration ────────────────────────────────────
  // If the old textarea was still present in the form AND has content, convert
  // it to a ProductRemark. This handles any saved layouts that still include the
  // old FIELD:internalRemarks textarea.
  if (legacyRemarksText.trim()) {
    const migrSession = await getServerSession(authOptions);
    const migrUserId = (migrSession?.user as any)?.id;
    if (migrUserId) {
      const product = await prisma.product.findUnique({
        where: { internalArticleNumber: internalId },
        select: { id: true }
      });
      if (product) {
        const { migrateInlineRemarksAction } = await import('@/app/actions/remarks');
        await migrateInlineRemarksAction(product.id, migrUserId, legacyRemarksText);
      }
    }
  }

  try {
    const session = await getServerSession(authOptions);
    const editorId = (session?.user as any)?.id;
    if (editorId) {
      data.lastEditedByUserId = editorId;
      await logAuditAction(editorId, 'UPDATE', 'Product', internalId, JSON.stringify(data));
    }

    // ── Field history: remember previous values of changed text fields ──────
    const empcoFields = new Set(formData.getAll('_empco_fields').map(v => v.toString()));
    const restoreFields = new Set(formData.getAll('_restore_fields').map(v => v.toString()));
    let historyRows: any[] = [];
    let existing: any = null;
    try {
      existing = await prisma.product.findUnique({ where: { internalArticleNumber: internalId } });
      if (existing) {
        const labelOf = (k: string) => {
          const f = allFields.find((x: any) => {
            let fk = x.id.replace('FIELD:', '');
            if (fk === 'description') fk = 'longDescription';
            return fk === k;
          });
          return f?.label ?? k;
        };
        const norm = (v: any) => (v == null || v === '' ? null : v);
        const isTextish = (v: any) => v == null || typeof v === 'string';
        const pushIfChanged = (formKey: string, oldV: any, newV: any) => {
          if (!isTextish(oldV) || !isTextish(newV)) return;
          if (norm(oldV) === norm(newV)) return;
          historyRows.push({
            articleNumber: internalId,
            fieldKey: formKey,
            fieldLabel: labelOf(formKey),
            oldValue: norm(oldV),
            newValue: norm(newV),
            source: empcoFields.has(formKey) ? 'EMPCO' : restoreFields.has(formKey) ? 'RESTORE' : 'MANUAL',
            userId: editorId ?? null,
            userEmail: (session?.user as any)?.email ?? null,
          });
        };
        const skip = new Set(['lastEditedByUserId', 'customData', 'status', 'readyForImport']);
        for (const [k, v] of Object.entries(data)) {
          if (skip.has(k) || /Id$/.test(k)) continue;
          pushIfChanged(k, existing[k], v);
        }
        if (data.customData) {
          for (const [k, v] of Object.entries(data.customData as Record<string, any>)) {
            pushIfChanged(`custom_${k}`, existing.customData?.[k], v);
          }
        }
      }
    } catch (histErr) {
      console.error('Field history diff failed:', histErr);
      historyRows = [];
    }

    await prisma.product.update({
      where: { internalArticleNumber: internalId },
      data
    });

    if (historyRows.length > 0) {
      try { await prisma.productFieldHistory.createMany({ data: historyRows }); }
      catch (histErr) { console.error('Field history write failed:', histErr); }
    }

    // ── EmpCo: update status / alerting for resolved findings ────────────────
    if (existing) {
      try {
        const { syncEmpcoCheckAfterEdit } = await import('@/lib/empcoSync');
        await syncEmpcoCheckAfterEdit(internalId, existing, layout, empcoFields);
      } catch (syncErr) { console.error('EmpCo sync failed:', syncErr); }

      // Automatically remember applied fixes for this brand
      if (existing.brandId && empcoFields.size > 0) {
        try {
          const check = await prisma.productEmpcoCheck.findUnique({ where: { articleNumber: internalId } });
          if (check?.structuredData) {
            const parsed = JSON.parse(check.structuredData);
            const { saveBrandRuleAction } = await import('@/app/actions/brandEmpco');
            for (const issue of (parsed.issues ?? [])) {
              if (empcoFields.has(issue.field) && issue.original) {
                await saveBrandRuleAction({
                  brandId: existing.brandId,
                  original: issue.original,
                  replacement: issue.replacement,
                  rule: issue.rule,
                  fieldKey: issue.field,
                  explanation: issue.explanation,
                  sourceArticle: internalId,
                });
              }
            }
          }
        } catch (brandErr) {
          console.error('Failed to learn brand rule after product save:', brandErr);
        }
      }
    }

    revalidatePath('/products');
    revalidatePath('/assignments');
    revalidatePath('/', 'layout');
  } catch (e: any) {
    const fs = require('fs');
    fs.writeFileSync('prisma_debug_err.log', "Error:\n" + String(e.message) + "\n\nPayload:\n" + JSON.stringify(data, null, 2));
    console.error("PRISMA VALIDATION ERROR", JSON.stringify(data), e.message);
    throw new Error(`Data Validation Failed! Error: ${e.message.slice(0, 150)}... // More written to prisma_debug_err.log`);
  }
}
