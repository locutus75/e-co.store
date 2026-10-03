import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProductsClient from "./ProductsClient";
import fs from 'fs';
import path from 'path';
import { extractEmpcoFields, hashEmpcoFields } from '@/lib/empco';

import { redirect } from "next/navigation";

export default async function ProductsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }
  const roles = (session?.user as any)?.roles || [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
  const userId = (session?.user as any)?.id;

  const users = await prisma.user.findMany({
    orderBy: { email: 'asc' }
  });

  const userRecord = userId ? await prisma.user.findUnique({
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
  }) : null;

  const hasAssignmentsRight = userRecord?.userRoles.some((ur: any) =>
    ur.role.rolePermissions.some((rp: any) => rp.module === 'MENU:assignments' && rp.action === 'ALLOW')
  ) || false;

  const hasAiRight = userRecord?.userRoles.some((ur: any) =>
    ur.role.rolePermissions.some((rp: any) => rp.module === 'MENU:ai' && rp.action === 'ALLOW')
  ) || false;

  const canSeeAllProducts = isAdmin || hasAssignmentsRight;
  const canAssignProducts = isAdmin || hasAssignmentsRight;
  const canUseAi = isAdmin || hasAiRight;
  
  const [products, aiAnalyses, empcoChecks] = await Promise.all([
    prisma.product.findMany({
      where: canSeeAllProducts ? undefined : { assignedUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: { brand: true, supplier: true, category: true, subcategory: true, assignedUser: true, lastEditedByUser: { select: { id: true, email: true } }, remarks: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, userId: true } } }

    }),
    prisma.productAiAnalysis.findMany({ select: { articleNumber: true, score: true } }),
    prisma.productEmpcoCheck.findMany({ select: { articleNumber: true, status: true, issueCount: true, contentHash: true } }),
  ]);

  // Build a quick lookup: articleNumber → score
  const aiScoreMap: Record<string, number | null> = {};
  for (const a of aiAnalyses) { aiScoreMap[a.articleNumber] = a.score; }

  const fieldPermissions: Record<string, string> = {};
  if (!isAdmin && userRecord) {
    userRecord.userRoles.forEach((ur: any) => {
       ur.role.rolePermissions.forEach((rp: any) => {
          if (rp.module.startsWith('FIELD:')) { fieldPermissions[rp.module] = rp.action; }
       });
    });
  }

  const { getFormLayoutAction } = await import('@/app/actions/formLayouts');
  const { getEmpcoSettingsAction } = await import('@/app/actions/empco');
  const [layout, empcoSettings] = await Promise.all([getFormLayoutAction(), getEmpcoSettingsAction()]);

  // EmpCo lookup: articleNumber → { status, stale, issueCount }
  // A check is "stale" when the customer-facing texts changed after the check.
  const empcoMap: Record<string, { status: string; stale: boolean; issueCount: number }> = {};
  if (empcoChecks.length > 0) {
    const productByArticle = new Map(products.map(p => [p.internalArticleNumber, p]));
    for (const c of empcoChecks) {
      const p = productByArticle.get(c.articleNumber);
      if (!p) continue;
      const stale = !!c.contentHash && hashEmpcoFields(extractEmpcoFields(p, layout, undefined, empcoSettings.includedFieldKeys)) !== c.contentHash;
      empcoMap[c.articleNumber] = { status: c.status, stale, issueCount: c.issueCount };
    }
  }

  // Build image count map by scanning the uploads directory
  const ROOT_DIR = process.env.APP_ROOT || process.cwd();
  const uploadsDir = path.join(ROOT_DIR, 'public', 'uploads', 'products');
  const imageCountMap: Record<string, number> = {};
  try {
    if (fs.existsSync(uploadsDir)) {
      for (const articleDir of fs.readdirSync(uploadsDir)) {
        const dirPath = path.join(uploadsDir, articleDir);
        if (!fs.statSync(dirPath).isDirectory()) continue;
        const count = fs.readdirSync(dirPath).filter(f => /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(f)).length;
        if (count > 0) imageCountMap[articleDir] = count;
      }
    }
  } catch { /* ignore FS errors */ }

  return <ProductsClient initialProducts={products} systemUsers={users} isAdmin={isAdmin} canAssignProducts={canAssignProducts} canUseAi={canUseAi} fieldPermissions={fieldPermissions} layout={layout} currentUserId={userId || ''} currentUserChatColor={(userRecord as any)?.chatColor || null} aiScoreMap={aiScoreMap} imageCountMap={imageCountMap} empcoMap={empcoMap} />;
}

