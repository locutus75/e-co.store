import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import CategoriesClient from './CategoriesClient';

export default async function CategoriesPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  const roles: string[] = (session.user as any)?.roles ?? [];
  const isAdmin = roles.some((r) => r.toUpperCase() === 'ADMIN');

  const [categories, products, empcoChecks] = await Promise.all([
    prisma.category.findMany({
      include: {
        parent: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      select: {
        internalArticleNumber: true,
        title: true,
        status: true,
        readyForImport: true,
        webshopActive: true,
        systemActive: true,
        uitlopend: true,
        basePrice: true,
        categoryId: true,
        subcategoryId: true,
        category: { select: { id: true, name: true, parentId: true } },
        subcategory: { select: { id: true, name: true, parentId: true } },
        brand: { select: { name: true } },
        supplier: { select: { name: true } },
        customData: true,
      },
      orderBy: { internalArticleNumber: 'asc' },
    }),
    prisma.productEmpcoCheck.findMany({
      select: {
        articleNumber: true,
        status: true,
        issueCount: true,
      },
    }),
  ]);

  const empcoMap: Record<string, { status: string; issueCount: number }> = {};
  for (const c of empcoChecks) {
    empcoMap[c.articleNumber] = { status: c.status, issueCount: c.issueCount };
  }

  return (
    <CategoriesClient
      initialCategories={categories}
      initialProducts={products}
      empcoMap={empcoMap}
      isAdmin={isAdmin}
    />
  );
}

