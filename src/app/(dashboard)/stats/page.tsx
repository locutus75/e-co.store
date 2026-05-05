import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import StatsClient from "./StatsClient";
import { redirect } from "next/navigation";

export default async function StatsPage() {
  const session = await getServerSession(authOptions);
  const roles = (session?.user as any)?.roles || [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');

  if (!isAdmin) {
    redirect('/');
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true
    }
  });

  return <StatsClient users={users} />;
}
