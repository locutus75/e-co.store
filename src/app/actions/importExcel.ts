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

export async function executeImportAction(formData: FormData, headerRowIndex: number, mapping: Record<number, string>) {
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
          const parsed = parseInt(cellVal, 10);
          if (!Number.isNaN(parsed)) rowData[dbField] = parsed;
        } else if (fieldDef.type === 'float') {
          const parsed = parseFloat(cellVal.replace(',', '.')); // Replace EU commas with dots
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

      await prisma.product.upsert({
        where: { internalArticleNumber: internalArticleNumber },
        create: {
          internalArticleNumber,
          title: rowData.title || "Nieuw Product",
          status: "NEW",
          ...rowData
        },
        update: rowData
      });
      
      processedParams++;
    }

    revalidatePath('/products');
    return { success: true, count: processedParams };
  } catch (error: any) {
    console.error("Excel Import Execution Error:", error);
    return { error: error.message };
  }
}
