import { prisma } from "@/lib/prisma";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      userRoles: {
        include: {
          role: true
        }
      }
    }
  });

  const roles = await prisma.role.findMany({
    orderBy: { name: 'asc' }
  });

  return <AdminClient users={users} availableRoles={roles} />;
}
