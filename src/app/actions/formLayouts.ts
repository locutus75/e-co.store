"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type FormField = {
  id: string;
  label: string;
  type?: string;
  width?: number; // 1 to 24
  height?: number; // explicit height multiplier
  backgroundColor?: string;
  textColor?: string;
  options?: string[]; // For picklist dropdowns
  relationPath?: string; // e.g. 'brand.name' — resolved at render time from the nested product object
  useForSearch?: boolean; // When true, this field's value is included in the Google search URL on the article number link
  aiInstruction?: string; // Optional instruction for the AI field suggestion (e.g. "Alleen hele getallen, geen eenheid")
};

export type FormSection = {
  id: string;
  title: string;
  color: string;
  backgroundColor?: string;
  textColor?: string;
  fields: FormField[];
};

const DEFAULT_PRODUCT_LAYOUT: FormSection[] = [
  {
    id: "sect-basis",
    title: "Webshop Content (Basis)",
    color: "var(--primary)",
    fields: [
      { id: "FIELD:internalRemarks", label: "Interne Communicatie", type: "chat", width: 24 },
      { id: "FIELD:internalArticleNumber", label: "Interne Artikelcode", type: "text" },
      { id: "FIELD:ean", label: "EAN Code", type: "text" },
      { id: "FIELD:title", label: "Titel (Title)", type: "text" },
      { id: "FIELD:seoTitle", label: "SEO Titel", type: "text" },
      { id: "FIELD:price", label: "Basis Prijs (€)", type: "number" },
      { id: "FIELD:description", label: "Lange Omschrijving", type: "textarea" },
      { id: "FIELD:webshopActive", label: "Webshop (Actief op shop)", type: "checkbox" },
      { id: "FIELD:systemActive", label: "Actief (In systeem)", type: "checkbox" },
      { id: "FIELD:media", label: "Product Afbeeldingen (Media)", type: "media" }
    ]
  },
  {
    id: "sect-fysiek",
    title: "Fysieke Eigenschappen",
    color: "var(--color-mustard)",
    fields: [
      { id: "FIELD:weightGr", label: "Gewicht (gr)", type: "number" },
      { id: "FIELD:lengthCm", label: "Lengte (cm)", type: "number" },
      { id: "FIELD:widthCm", label: "Breedte (cm)", type: "number" },
      { id: "FIELD:heightCm", label: "Hoogte (cm)", type: "number" },
      { id: "FIELD:volumeMl", label: "Inhoud (ml)", type: "number" },
      { id: "FIELD:volumeGr", label: "Inhoud (gr)", type: "number" },
      { id: "FIELD:color", label: "Kleur", type: "text" },
      { id: "FIELD:mainMaterial", label: "Hoofdmateriaal", type: "text" },
      { id: "FIELD:ingredients", label: "Ingrediënten", type: "textarea" },
      { id: "FIELD:allergens", label: "Allergenen", type: "textarea" }
    ]
  },
  {
    id: "sect-mens",
    title: "Duurzaamheid: Mens",
    color: "var(--color-sage)",
    fields: [
      { id: "FIELD:critMensSafeWork", label: "Veilig werkomgeving (Slaafvrij)", type: "checkbox" },
      { id: "FIELD:critMensFairWage", label: "Eerlijk loon", type: "checkbox" },
      { id: "FIELD:critMensSocial", label: "Maatschappelijke betrokkenheid", type: "checkbox" }
    ]
  },
  {
    id: "sect-dier",
    title: "Duurzaamheid: Dier",
    color: "var(--color-sage)",
    fields: [
      { id: "FIELD:critDierCrueltyFree", label: "Diervrij (Veganistisch)", type: "checkbox" },
      { id: "FIELD:critDierFriendly", label: "Diervriendelijk", type: "checkbox" }
    ]
  },
  {
    id: "sect-verif",
    title: "Duurzaamheid: Verificatie",
    color: "var(--color-sage)",
    fields: [
      { id: "FIELD:supplierContacted", label: "Leverancier benaderd (Ja/Nee)", type: "text" }
    ]
  },
  {
    id: "sect-milieu",
    title: "Duurzaamheid: Milieu",
    color: "var(--color-sage)",
    fields: [
      { id: "FIELD:critMilieuPackagingFree", label: "Verpakkingsvrij", type: "checkbox" },
      { id: "FIELD:critMilieuPlasticFree", label: "Plastic vrij", type: "checkbox" },
      { id: "FIELD:critMilieuRecyclable", label: "Recyclebaar", type: "checkbox" },
      { id: "FIELD:critMilieuBiodegradable", label: "Afbreekbaar", type: "checkbox" },
      { id: "FIELD:critMilieuCompostable", label: "Composteerbaar", type: "checkbox" }
    ]
  },
  {
    id: "sect-bewerk",
    title: "Duurzaamheid: Bewerking",
    color: "var(--color-sage)",
    fields: [
      { id: "FIELD:critHandmade", label: "Handgemaakt", type: "checkbox" },
      { id: "FIELD:critNatural", label: "Natuurlijk (Natuurkracht)", type: "checkbox" },
      { id: "FIELD:critCircular", label: "Hergebruik / Gerecycled", type: "text" }
    ]
  },
  {
    id: "sect-trans",
    title: "Duurzaamheid: Transport & Overig",
    color: "var(--color-sage)",
    fields: [
      { id: "FIELD:critTransportDistance", label: "Afstand (km)", type: "number" },
      { id: "FIELD:critTransportVehicle", label: "Vervoersmiddel", type: "picklist", options: ["Vrachtwagen", "Bestelbus", "Trein", "Boot", "Vliegtuig"] },
      { id: "FIELD:critMilieuCarbonCompensated", label: "Uitstootcompensatie", type: "checkbox" },
      { id: "FIELD:critOther", label: "Overige vermelding", type: "textarea" }
    ]
  }
];

const CHAT_FIELD: FormField = {
  id: "FIELD:internalRemarks",
  label: "Interne Communicatie",
  type: "chat",
  width: 24,
};

/**
 * One-time startup cleanup: removes the "[Gemigreerd vanuit ...]\n" prefix
 * added during initial data migration. Uses LIKE + POSITION to avoid regex
 * bracket-escaping pitfalls in PostgreSQL. Guarded by a SystemSetting flag.
 */
async function cleanMigratedRemarkPrefixes(): Promise<void> {
  try {
    const flag = await prisma.$queryRaw<{ value: string }[]>`
      SELECT "value" FROM "SystemSetting"
      WHERE "key" = 'migration_remarks_prefix_cleaned_v2' LIMIT 1
    `;
    if (flag && flag.length > 0) return; // already done

    // Find rows that start with the legacy prefix and strip everything up to
    // (and including) the first newline, leaving only the actual remark text.
    // LIKE '[Gemigreerd vanuit %' — '[' is not a wildcard in PostgreSQL LIKE,
    // so no escaping needed. POSITION returns 0 if not found.
    await prisma.$executeRaw`
      UPDATE "ProductRemark"
      SET    "message" = SUBSTRING("message", POSITION(E'\n' IN "message") + 1)
      WHERE  "message" LIKE '[Gemigreerd vanuit %'
        AND  POSITION(E'\n' IN "message") > 0
    `;

    await prisma.$executeRaw`
      INSERT INTO "SystemSetting" ("key", "value")
      VALUES ('migration_remarks_prefix_cleaned_v2', 'true')
      ON CONFLICT ("key") DO NOTHING
    `;
  } catch (e) {
    console.warn('[startup] cleanMigratedRemarkPrefixes error:', e);
  }
}

export async function getFormLayoutAction(): Promise<FormSection[]> {
  // One-time prefix cleanup — fires asynchronously on first load after update
  void cleanMigratedRemarkPrefixes();

  let layout: FormSection[] | null = null;
  try {
    const records = await prisma.$queryRaw<{ key: string, value: string }[]>`SELECT "key", "value" FROM "SystemSetting" WHERE "key" = 'product_form_layout' LIMIT 1`;
    if (records && records.length > 0 && records[0].value) {
      layout = JSON.parse(records[0].value) as FormSection[];
    }
  } catch(e) {
    console.error("Error fetching form layout via raw SQL", e);
  }

  if (!layout) return DEFAULT_PRODUCT_LAYOUT;

  // ── Sanitise: ensure exactly one chat field, remove any legacy duplicates ─
  //
  // Situations the DB layout can be in:
  //   A) No internalRemarks field at all          → prepend a new chat field
  //   B) One field: id=internalRemarks, type≠chat → upgrade it to chat
  //   C) One field: id=internalRemarks, type=chat → nothing to do
  //   D) Two fields with id=internalRemarks (one chat, one textarea) — the
  //      duplicate-key bug scenario → keep only the chat one, drop the rest
  //
  // We handle all cases in one pass:
  let chatFieldFound = false;
  layout = layout.map(section => ({
    ...section,
    fields: section.fields.reduce<import('@/app/actions/formLayouts').FormField[]>((acc, field) => {
      if (field.id === 'FIELD:internalRemarks') {
        if (!chatFieldFound) {
          // First occurrence: ensure it's type=chat
          chatFieldFound = true;
          acc.push({ ...field, type: 'chat', width: 24 });
        }
        // Subsequent occurrences with same id → silently drop (duplicate)
      } else {
        acc.push(field);
      }
      return acc;
    }, []),
  }));

  // No internalRemarks field existed at all → prepend a fresh chat field
  if (!chatFieldFound && layout.length > 0) {
    layout[0].fields = [CHAT_FIELD, ...layout[0].fields];
  }

  return layout;
}

export async function saveFormLayoutAction(layout: FormSection[]) {
  try {
    const valueString = JSON.stringify(layout);
    await prisma.$executeRaw`
      INSERT INTO "SystemSetting" ("key", "value") 
      VALUES ('product_form_layout', ${valueString})
      ON CONFLICT ("key") 
      DO UPDATE SET "value" = ${valueString}
    `;
    revalidatePath("/roles");
    revalidatePath("/products");
    return { success: true };
  } catch(e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Bulk-migrate legacy internalRemarks text for ALL products into the new
 * ProductRemark chat table. Safe to call multiple times — skips products that
 * already have remarks or have no internalRemarks text.
 * Called when the user explicitly removes the old internalRemarks field from
 * the form layout via the WYSIWYG builder.
 */
export async function bulkMigrateInternalRemarksAction(): Promise<{ success: boolean; migrated: number; error?: string }> {
  try {
    // Find a fallback admin user to attribute migrated remarks to
    const fallbackUser = await prisma.user.findFirst({
      where: { userRoles: { some: { role: { name: { equals: 'ADMIN', mode: 'insensitive' } } } } },
      select: { id: true }
    });

    const products = await prisma.product.findMany({
      where: { internalRemarks: { not: null } },
      select: {
        id: true,
        internalRemarks: true,
        assignedUserId: true,
        remarks: { select: { id: true }, take: 1 }
      }
    });

    let migrated = 0;
    for (const product of products) {
      // Skip products that already have chat remarks (lazy migration already ran)
      if (product.remarks.length > 0) {
        // Still clear the legacy field to keep DB tidy
        await prisma.product.update({ where: { id: product.id }, data: { internalRemarks: null } });
        continue;
      }
      const text = product.internalRemarks?.trim();
      if (!text) continue;

      const userId = product.assignedUserId || fallbackUser?.id;
      if (!userId) continue;

      await prisma.productRemark.create({
        data: {
          productId: product.id,
          userId,
          message: text
        }
      });
      await prisma.product.update({ where: { id: product.id }, data: { internalRemarks: null } });
      migrated++;
    }

    revalidatePath('/products');
    return { success: true, migrated };
  } catch (e: any) {
    console.error('bulkMigrateInternalRemarksAction error', e);
    return { success: false, migrated: 0, error: e.message };
  }
}
