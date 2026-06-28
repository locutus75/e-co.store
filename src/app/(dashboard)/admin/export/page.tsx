import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { 
  getExportProfilesAction, 
  getExportableFieldsAction 
} from "@/app/actions/export";
import ExportClient from "./ExportClient";

export default async function ExportPage() {
  // 1. Authenticate and authorize admin role
  const session = await getServerSession(authOptions);
  const roles = (session?.user as any)?.roles || [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');

  if (!isAdmin) {
    redirect("/login");
  }

  // 2. Load statistics and filter options
  const [
    brands, 
    suppliers, 
    totalProducts, 
    exportedCount, 
    profiles, 
    exportableFields
  ] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: 'asc' } }),
    prisma.supplier.findMany({ orderBy: { name: 'asc' } }),
    prisma.product.count(),
    prisma.product.count({
      where: {
        NOT: [
          { exportStatus: null },
          { exportStatus: "" }
        ]
      }
    }),
    getExportProfilesAction(),
    getExportableFieldsAction()
  ]);

  const neverExportedCount = totalProducts - exportedCount;

  return (
    <ExportClient 
      brands={brands}
      suppliers={suppliers}
      stats={{
        total: totalProducts,
        exported: exportedCount,
        neverExported: neverExportedCount
      }}
      initialProfiles={profiles}
      exportableFields={exportableFields}
    />
  );
}
