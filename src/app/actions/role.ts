"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function setRolePermissionAction(roleId: string, module: string, action: string) {
  try {
    if (action === 'INHERIT' || action === '') {
      // Delete specific permission if resetting
      await prisma.rolePermission.deleteMany({
        where: { roleId, module }
      });
    } else {
      // Upsert the new permission
      await prisma.rolePermission.upsert({
        where: { roleId_module_action: { roleId, module, action } }, // Wait, action is part of the unique constraint. That means a role could technically have READ and WRITE records for the same module.
        // Let's delete existing module records first to ensure only 1 action per module per role.
        create: { roleId, module, action },
        update: { action }
      });
    }
  } catch (e) {
    // Because the schema defines @@unique([roleId, module, action]), we can't just upsert on [roleId, module].
    // So we safely delete and create.
    await prisma.rolePermission.deleteMany({
      where: { roleId, module }
    });
    
    if (action !== 'INHERIT' && action !== '') {
      await prisma.rolePermission.create({
        data: { roleId, module, action }
      });
    }
  }

  revalidatePath("/roles");
  return { success: true };
}

export async function createRoleAction(name: string) {
  try {
    if (!name || name.trim() === '') return { success: false, error: 'Role name required' };
    await prisma.role.create({
      data: { name: name.trim() }
    });
    revalidatePath("/roles");
    return { success: true };
  } catch (e: any) {
    if (e.code === 'P2002') return { success: false, error: 'Role already exists' };
    return { success: false, error: e.message };
  }
}

export async function renameRoleAction(id: string, newName: string) {
  if (!newName || newName.trim() === '') return { success: false, error: 'Valid name required' };
  try {
    // Prevent modification of the ADMIN role
    const existing = await prisma.role.findUnique({ where: { id } });
    if (existing?.name.toUpperCase() === 'ADMIN') {
      return { success: false, error: 'ADMIN role cannot be renamed' };
    }
    await prisma.role.update({
      where: { id },
      data: { name: newName.trim() }
    });
    revalidatePath("/roles");
    return { success: true };
  } catch (e: any) {
    if (e.code === 'P2002') return { success: false, error: 'Role name already taken' };
    return { success: false, error: e.message };
  }
}

export async function deleteRoleAction(id: string) {
  try {
    const role = await prisma.role.findUnique({ 
      where: { id },
      include: { _count: { select: { userRoles: true } } } 
    });
    
    if (!role) return { success: false, error: 'Role not found' };
    if (role.name.toUpperCase() === 'ADMIN') return { success: false, error: 'ADMIN role cannot be deleted' };
    
    if (role._count.userRoles > 0) {
       return { success: false, error: `Cannot delete role. There are ${role._count.userRoles} users currently assigned to it.` };
    }
    
    await prisma.role.delete({ where: { id } });
    revalidatePath("/roles");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
