import { prisma } from "@/lib/prisma";
import AssignmentsClient from "./AssignmentsClient";

export default async function AssignmentsPage() {
  
  // Get all users and their assigned products
  const users = await prisma.user.findMany({
    include: {
      assignedProducts: true
    },
    orderBy: { email: 'asc' }
  });

  // Also get the pool of unassigned products to render the backlog
  const unassignedProducts = await prisma.product.findMany({
    where: { assignedUserId: null }
  });

  const payload = [
    { isUnassignedPool: true, id: 'unassigned', email: 'Unassigned', assignedProducts: unassignedProducts },
    ...users.map(u => ({ isUnassignedPool: false, ...u }))
  ];

  return <AssignmentsClient usersWithAssignments={payload} />;
}
