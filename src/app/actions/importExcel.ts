"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { PRISMA_FIELDS } from "@/lib/constants";

export async function previewExcelAction(formData: FormData) {
  const file = formData.get("file") as File;
  if (!file) return { error: "No file uploaded" };

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // header: 1 means give us a 2D array of raw rows across all columns
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: true });
    
    // Grab the first 10 strictly to construct the preview table UI
    return { success: true, previewRows: rows.slice(0, 10), totalRows: rows.length };
  } catch(error: any) {
    return { error: error.message };
  }
}

export async function getSavedMappingsAction() {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'saved_import_mappings' } });
    if (setting && setting.value) {
       return JSON.parse(setting.value);
    }
  } catch (err) {}
  return {};
}

export async function executeImportAction(
  formData: FormData, 
  headerRowIndex: number, 
  mapping: Record<number, string>, 
  headers: (string|null)[], 
  overwriteRules: Record<string, boolean>
) {
  const file = formData.get("file") as File;
  if (!file) return { error: "No file uploaded" };

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    
    const allRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    
    // Slice off all the rows that come BEFORE AND INCLUDING the header row
    const dataRows = allRows.slice(headerRowIndex + 1);
    
    let processedParams = 0;
    
    for (const rawRow of dataRows) {
      if(!rawRow || rawRow.length === 0) continue;

      const rowData: Record<string, any> = {};

      for (const [colIndexStr, dbField] of Object.entries(mapping)) {
        if (dbField === 'ignore') continue;
        const colIndex = parseInt(colIndexStr, 10);
        
        let cellVal = rawRow[colIndex];
        if (cellVal === undefined || cellVal === null || String(cellVal).trim() === "") {
            continue; // Skip empties so database persists its current value
        }
        
        cellVal = String(cellVal).trim();
        
        // Find field type logic definition
        const fieldDef = PRISMA_FIELDS.find(f => f.key === dbField);
        if(!fieldDef) continue;

        if (fieldDef.type === 'string') {
          rowData[dbField] = cellVal;
        } else if (fieldDef.type === 'number') {
          const cleanStr = cellVal.replace(/[^\d.-]/g, '');
          const parsed = parseInt(cleanStr, 10);
          if (!Number.isNaN(parsed)) rowData[dbField] = parsed;
        } else if (fieldDef.type === 'float') {
          const cleanStr = cellVal.replace(/[^\d,.-]/g, '');
          const parsed = parseFloat(cleanStr.replace(',', '.')); // Replace EU commas with dots
          if (!Number.isNaN(parsed)) rowData[dbField] = parsed;
        } else if (fieldDef.type === 'boolean') {
          const upper = cellVal.toUpperCase();
          rowData[dbField] = (upper === "JA" || upper === "TRUE" || upper === "1" || upper === "Y");
        } else if (fieldDef.type === 'relation') {
          // It's either rel_supplier or rel_brand
          const relationName = dbField.replace('rel_', ''); // 'supplier' or 'brand'
          rowData[relationName] = {
            connectOrCreate: {
              where: { name: cellVal },
              create: { name: cellVal }
            }
          };
        }
      }

      // Requirement: It MUST have an internalArticleNumber to execute an upset safely
      if (!rowData.internalArticleNumber || rowData.internalArticleNumber.toLowerCase() === "drie") {
        continue; 
      }
      
      const internalArticleNumber = rowData.internalArticleNumber;
      delete rowData.internalArticleNumber; // Remove from the generic update payload temporarily

      const existingProduct = await prisma.product.findUnique({
        where: { internalArticleNumber }
      });

      if (!existingProduct) {
        // Safe Create
        await prisma.product.create({
          data: {
             internalArticleNumber,
             title: rowData.title || "Nieuw Product",
             status: "new",
             ...rowData
          }
        });
      } else {
        // Selective Update
        const updatePayload: Record<string, any> = {};
        
        for (const [key, value] of Object.entries(rowData)) {
          // It's a relation field if it's an object (like { connectOrCreate })
          const isRelation = typeof value === 'object' && value !== null && 'connectOrCreate' in value;

          if (overwriteRules[key]) {
             // Overwrite unconditionally
             updatePayload[key] = value;
          } else {
             // Let's check if the existing value is effectively empty
             let existingVal: any;
             if (isRelation && key === 'supplier') existingVal = (existingProduct as any).supplierId;
             else if (isRelation && key === 'brand') existingVal = (existingProduct as any).brandId;
             else existingVal = (existingProduct as any)[key];
             
             if (existingVal === null || existingVal === undefined || String(existingVal).trim() === "") {
                updatePayload[key] = value;
             }
          }
        }

        if (Object.keys(updatePayload).length > 0) {
           await prisma.product.update({
             where: { internalArticleNumber },
             data: updatePayload
           });
        }
      }
      
      processedParams++;
    }

    // Save mapping memory for future uploads
    try {
      const savedMap = await getSavedMappingsAction();
      let updatedSomething = false;

      for (const [colIndexStr, dbField] of Object.entries(mapping)) {
        const colIndex = parseInt(colIndexStr, 10);
        const headerName = headers[colIndex];
        if (headerName && typeof headerName === 'string') {
          savedMap[headerName.toLowerCase().trim()] = dbField;
          updatedSomething = true;
        }
      }

      if (updatedSomething) {
        await prisma.systemSetting.upsert({
          where: { key: 'saved_import_mappings' },
          create: { key: 'saved_import_mappings', value: JSON.stringify(savedMap) },
          update: { value: JSON.stringify(savedMap) }
        });
      }
    } catch (err) {
      console.warn("Could not save mapping memory:", err);
    }

    revalidatePath('/products');
    return { success: true, count: processedParams };
  } catch (error: any) {
    console.error("Excel Import Execution Error:", error);
    return { error: error.message };
  }
}
