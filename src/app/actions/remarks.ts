"use server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type RemarkEntry = {
  id: string;
  message: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    chatColor?: string | null;
  };
};

const USER_SELECT = { id: true, email: true, chatColor: true } as const;

/**
 * Fetch all remarks for a product (oldest first).
 * Auto-migrates legacy `internalRemarks` text on first load if the remarks
 * table is empty for this product.
 */
export async function getProductRemarksAction(internalArticleNumber: string): Promise<RemarkEntry[]> {
  try {
    const product = await prisma.product.findUnique({
      where: { internalArticleNumber },
      select: {
        id: true,
        internalRemarks: true,
        assignedUserId: true,
        remarks: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: USER_SELECT } }
        }
      }
    });

    if (!product) return [];

    // ── Lazy migration: internalRemarks → ProductRemark ──────────────────
    if (product.remarks.length === 0 && product.internalRemarks?.trim()) {
      let attributeUserId = product.assignedUserId;
      if (!attributeUserId) {
        const session = await getServerSession(authOptions);
        attributeUserId = (session?.user as any)?.id ?? null;
      }

      if (attributeUserId) {
        await prisma.productRemark.create({
          data: { productId: product.id, userId: attributeUserId, message: product.internalRemarks.trim() }
        });
        await prisma.product.update({
          where: { id: product.id },
          data: { internalRemarks: null }
        });
        const fresh = await prisma.productRemark.findMany({
          where: { productId: product.id },
          orderBy: { createdAt: 'asc' },
          include: { user: { select: USER_SELECT } }
        });
        return fresh.map((r: any) => ({
          id: r.id,
          message: r.message,
          createdAt: r.createdAt.toISOString(),
          user: { id: r.user.id, email: r.user.email, chatColor: r.user.chatColor ?? null }
        }));
      }
    }

    return product.remarks.map((r: any) => ({
      id: r.id,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
      user: { id: r.user.id, email: r.user.email, chatColor: r.user.chatColor ?? null }
    }));
  } catch (e) {
    console.error("getProductRemarksAction error", e);
    return [];
  }
}

/**
 * Add a new remark to a product on behalf of the current session user.
 */
export async function addProductRemarkAction(
  internalArticleNumber: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (typeof (prisma as any).productRemark === 'undefined') {
    console.error('[remarks] prisma.productRemark is undefined — server must be restarted after schema migration.');
    return { success: false, error: 'Server is verouderd. Herstart de server na de schema-update.' };
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return { success: false, error: 'Niet ingelogd.' };

  const trimmed = message.trim();
  if (!trimmed) return { success: false, error: 'Bericht mag niet leeg zijn.' };

  try {
    const product = await prisma.product.findUnique({
      where: { internalArticleNumber },
      select: { id: true }
    });
    if (!product) return { success: false, error: 'Product niet gevonden.' };

    await prisma.productRemark.create({
      data: { productId: product.id, userId, message: trimmed }
    });

    return { success: true };
  } catch (e: any) {
    console.error("addProductRemarkAction error", e);
    return { success: false, error: e.message };
  }
}

/**
 * Delete a remark. Only the author or an admin may delete.
 * Returns specific error if a non-admin tries to delete someone else's remark.
 */
export async function deleteProductRemarkAction(
  remarkId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  const userId  = (session?.user as any)?.id;
  const roles   = (session?.user as any)?.roles || [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');

  try {
    const remark = await prisma.productRemark.findUnique({ where: { id: remarkId } });
    if (!remark) return { success: false, error: 'Opmerking niet gevonden.' };
    if (!isAdmin && remark.userId !== userId) {
      return { success: false, error: 'Je kunt alleen je eigen opmerkingen verwijderen.' };
    }
    await prisma.productRemark.delete({ where: { id: remarkId } });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Edit a remark. Only the author may edit, and only within 5 minutes.
 */
export async function updateProductRemarkAction(
  remarkId: string,
  newMessage: string
): Promise<{ success: boolean; error?: string }> {
  const session  = await getServerSession(authOptions);
  const userId   = (session?.user as any)?.id;
  if (!userId) return { success: false, error: 'Niet ingelogd.' };

  const trimmed = newMessage.trim();
  if (!trimmed) return { success: false, error: 'Bericht mag niet leeg zijn.' };

  try {
    const remark = await prisma.productRemark.findUnique({ where: { id: remarkId } });
    if (!remark) return { success: false, error: 'Opmerking niet gevonden.' };
    if (remark.userId !== userId) return { success: false, error: 'Je kunt alleen je eigen berichten bewerken.' };

    const ageMs = Date.now() - remark.createdAt.getTime();
    if (ageMs > 5 * 60 * 1000) {
      return { success: false, error: 'Berichten kunnen alleen binnen 5 minuten worden bewerkt.' };
    }

    await prisma.productRemark.update({
      where: { id: remarkId },
      data: { message: trimmed }
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Called from updateProductAction when `internalRemarks` sneaks in via the
 * legacy form field. Converts the text to a ProductRemark and clears the DB field.
 * Returns true if a migration was performed.
 */
export async function migrateInlineRemarksAction(
  productId: string,
  userId: string,
  text: string
): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    await prisma.productRemark.create({
      data: { productId, userId, message: `[Vanuit formulier]\n${trimmed}` }
    });
    await prisma.product.update({
      where: { id: productId },
      data: { internalRemarks: null }
    });
    return true;
  } catch {
    return false;
  }
}
