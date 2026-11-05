'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { executeEcoPosSyncAction } from '@/app/actions/ecopos';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as any)?.roles ?? [];
  const isAdmin = roles.some((r) => r.toUpperCase() === 'ADMIN');
  if (!session?.user || !isAdmin) {
    throw new Error('Alleen beheerders mogen deze actie uitvoeren.');
  }
  return session.user;
}

/**
 * Synchronises categories and subcategories for all products from EcoPos.
 */
export async function syncCategoriesFromEcoPosAction(): Promise<{
  ok: boolean;
  error?: string;
  updatedCount: number;
  totalFieldsChanged: number;
}> {
  try {
    await requireAdmin();
    const res = await executeEcoPosSyncAction({
      allowedFieldKeys: ['subcategory'],
      createNewProducts: false,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: res.error || 'Kon categorieën niet ophalen uit EcoPos.',
        updatedCount: 0,
        totalFieldsChanged: 0,
      };
    }

    // Also clean up any legacy MplusWebshops category links automatically
    await cleanupUnusedCategoriesAction();

    revalidatePath('/categories');
    revalidatePath('/products');
    return {
      ok: true,
      updatedCount: res.updatedCount,
      totalFieldsChanged: res.totalFieldsChanged,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Onbekende fout bij synchroniseren van categorieën.',
      updatedCount: 0,
      totalFieldsChanged: 0,
    };
  }
}

/**
 * Removes legacy "MplusWebshops" root category links and deletes empty categories
 * that have no linked products and no child categories.
 */
export async function cleanupUnusedCategoriesAction(): Promise<{
  ok: boolean;
  removedCount: number;
  error?: string;
}> {
  try {
    await requireAdmin();

    // 1. Find any "MplusWebshops" categories and detach them
    const mplusRoots = await prisma.category.findMany({
      where: { name: { equals: 'MplusWebshops', mode: 'insensitive' } },
      select: { id: true },
    });

    if (mplusRoots.length > 0) {
      const rootIds = mplusRoots.map((c) => c.id);
      await prisma.category.updateMany({
        where: { parentId: { in: rootIds } },
        data: { parentId: null },
      });
      await prisma.product.updateMany({
        where: { categoryId: { in: rootIds } },
        data: { categoryId: null },
      });
      await prisma.product.updateMany({
        where: { subcategoryId: { in: rootIds } },
        data: { subcategoryId: null },
      });
    }

    // 2. Delete leaf categories with 0 products, then parent categories with 0 products & 0 children
    let removedCount = 0;
    for (let pass = 0; pass < 2; pass++) {
      const allCats = await prisma.category.findMany({
        include: {
          _count: {
            select: {
              productsAsCategory: true,
              productsAsSubcategory: true,
              children: true,
            },
          },
        },
      });

      const emptyIds = allCats
        .filter(
          (c) =>
            c._count.productsAsCategory === 0 &&
            c._count.productsAsSubcategory === 0 &&
            c._count.children === 0
        )
        .map((c) => c.id);

      if (emptyIds.length > 0) {
        const del = await prisma.category.deleteMany({
          where: { id: { in: emptyIds } },
        });
        removedCount += del.count;
      }
    }

    revalidatePath('/categories');
    revalidatePath('/products');
    return { ok: true, removedCount };
  } catch (err: any) {
    return { ok: false, removedCount: 0, error: err?.message || 'Kon categorieën niet opschonen.' };
  }
}

export async function renameCategoryAction(
  categoryId: string,
  newName: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const trimmed = newName.trim();
    if (!trimmed) {
      return { ok: false, error: 'Categorienaam mag niet leeg zijn.' };
    }
    await prisma.category.update({
      where: { id: categoryId },
      data: { name: trimmed },
    });
    revalidatePath('/categories');
    revalidatePath('/products');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Hernoemen mislukt.' };
  }
}

export async function deleteCategoryAction(
  categoryId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    await prisma.product.updateMany({
      where: { categoryId },
      data: { categoryId: null },
    });
    await prisma.product.updateMany({
      where: { subcategoryId: categoryId },
      data: { subcategoryId: null },
    });
    await prisma.category.updateMany({
      where: { parentId: categoryId },
      data: { parentId: null },
    });
    await prisma.category.delete({
      where: { id: categoryId },
    });
    revalidatePath('/categories');
    revalidatePath('/products');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Verwijderen mislukt.' };
  }
}

