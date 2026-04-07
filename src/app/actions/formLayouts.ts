"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type FormField = {
  id: string;
  label: string;
  type?: string;
  width?: number; // 1 to 12
  options?: string[]; // For picklist dropdowns
};

export type FormSection = {
  id: string;
  title: string;
  color: string;
  fields: FormField[];
};

const DEFAULT_PRODUCT_LAYOUT: FormSection[] = [
  {
    id: "sect-basis",
    title: "Webshop Content (Basis)",
    color: "var(--primary)",
    fields: [
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
      { id: "FIELD:critOther", label: "Overige vermelding", type: "textarea" },
      { id: "FIELD:internalRemarks", label: "Interne Communicatie", type: "textarea", width: 12 }
    ]
  }
];

export async function getFormLayoutAction(): Promise<FormSection[]> {
  try {
    const records = await prisma.$queryRaw<{ key: string, value: string }[]>`SELECT "key", "value" FROM "SystemSetting" WHERE "key" = 'product_form_layout' LIMIT 1`;
    if (records && records.length > 0 && records[0].value) {
      return JSON.parse(records[0].value) as FormSection[];
    }
  } catch(e) {
    console.error("Error fetching form layout via raw SQL", e);
  }
  return DEFAULT_PRODUCT_LAYOUT;
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
