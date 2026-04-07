import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProductsClient from "./ProductsClient";

export default async function ProductsPage() {
  const session = await getServerSession(authOptions);
  const roles = (session?.user as any)?.roles || [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
  const userId = (session?.user as any)?.id;
  
  let products = await prisma.product.findMany({
    where: isAdmin ? undefined : {
      assignedUserId: userId
    },
    orderBy: { createdAt: 'desc' },
    include: {
      brand: true,
      supplier: true,
      assignedUser: true
    }
  });

  const users = await prisma.user.findMany({
    orderBy: { email: 'asc' }
  });

  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: true
            }
          }
        }
      }
    }
  });

  const fieldPermissions: Record<string, string> = {};
  if (!isAdmin && userRecord) {
    userRecord.userRoles.forEach((ur: any) => {
       ur.role.rolePermissions.forEach((rp: any) => {
          if (rp.module.startsWith('FIELD:')) {
            fieldPermissions[rp.module] = rp.action;
          }
       });
    });
  }

  // The fallback test product has been removed so you can freely empty the database.

  const { getFormLayoutAction } = await import('@/app/actions/formLayouts');
  const layout = await getFormLayoutAction();

  return <ProductsClient initialProducts={products} systemUsers={users} isAdmin={isAdmin} fieldPermissions={fieldPermissions} layout={layout} />;
}
