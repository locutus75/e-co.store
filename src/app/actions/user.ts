"use server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { revalidatePath } from "next/cache";

export async function createUserAction(formData: FormData) {
  const email     = formData.get("email") as string;
  const password  = formData.get("password") as string;
  const rawRole   = formData.get("role") as string;
  const chatColor = (formData.get("chatColor") as string | null) || null;

  if (!email || !password) {
    return { success: false, error: "Email en wachtwoord zijn verplicht." };
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if(existing) return { success: false, error: "Dit emailadres is al in gebruik." };
    
    const roleName = rawRole || "EDITOR";
    const roleRecord = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName },
      update: {}
    });

    const hash = await bcrypt.hash(password, 10);
    
    await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        ...(chatColor ? { chatColor } : {}),
        userRoles: { create: { roleId: roleRecord.id } }
      }
    });

    revalidatePath("/admin");
    return { success: true };
  } catch (e: any) {
    console.error("Create User Error:", e);
    return { success: false, error: e.message };
  }
}

export async function updateUserAction(userId: string, formData: FormData) {
  const email     = formData.get("email") as string;
  const password  = formData.get("password") as string;
  const rawRole   = formData.get("role") as string;
  const chatColor = (formData.get("chatColor") as string | null) || null;

  if (!email) {
    return { success: false, error: "Email is verplicht." };
  }

  try {
    const roleName = rawRole || "EDITOR";
    const roleRecord = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName },
      update: {}
    });

    const dataPayload: any = { email, chatColor };
    
    if (password && password.length >= 8) {
      dataPayload.passwordHash = await bcrypt.hash(password, 10);
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        ...dataPayload,
        userRoles: {
          deleteMany: {},
          create: { roleId: roleRecord.id }
        }
      }
    });

    revalidatePath("/admin");
    return { success: true };
  } catch (e: any) {
    console.error("Update User Error:", e);
    return { success: false, error: e.message };
  }
}

export async function deleteUserAction(userId: string) {
  try {
    await prisma.user.delete({ where: { id: userId } });
    revalidatePath("/admin");
    return { success: true };
  } catch (e: any) {
    console.error("Delete User Error:", e);
    return { success: false, error: e.message };
  }
}
