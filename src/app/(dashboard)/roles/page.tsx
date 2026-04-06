import { prisma } from "@/lib/prisma";
import RolesClient from "./RolesClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RolesPage() {
  const session = await getServerSession(authOptions);
  const rolesSession = (session?.user as any)?.roles || [];
  if (!rolesSession.some((r: string) => r.toUpperCase() === 'ADMIN')) {
    redirect('/');
  }

  const roles = await prisma.role.findMany({
    include: {
      rolePermissions: true
    },
    orderBy: { name: 'asc' }
  });

  return <RolesClient roles={roles} />;
}
