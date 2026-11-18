import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export interface UserActivityItem {
  id: string;
  type: 'FIELD_CHANGE' | 'AUDIT' | 'REMARK';
  timestamp: string;
  userId: string | null;
  userEmail: string | null;
  articleNumber: string;
  productTitle: string | null;
  action: string;
  fieldKey?: string;
  fieldLabel?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  source?: string;
  summary?: string | null;
}

const AUDIT_FIELD_LABELS: Record<string, string> = {
  title: 'Titel',
  shortDescription: 'Korte omschrijving',
  longDescription: 'Lange omschrijving',
  seoTitle: 'SEO Titel',
  seoMetaDescription: 'SEO Meta omschrijving',
  mainMaterial: 'Hoofdmateriaal',
  material: 'Materiaal',
  ingredients: 'Ingrediënten',
  allergens: 'Allergenen',
  color: 'Kleur',
  size: 'Maat',
  tags: 'Tags',
  webshopSlug: 'Webshop URL slug',
  basePrice: 'Prijs',
  weightGr: 'Gewicht (gr)',
  lengthCm: 'Lengte (cm)',
  widthCm: 'Breedte (cm)',
  heightCm: 'Hoogte (cm)',
  volumeMl: 'Inhoud (ml)',
  volumeGr: 'Inhoud (gr)',
  status: 'Status',
  readyForImport: 'Klaar voor import',
  webshopActive: 'Webshop actief',
  systemActive: 'Systeem actief',
  uitlopend: 'Uitlopend',
  internalRemarks: 'Interne opmerkingen',
  internalNotes: 'Interne notities',
};

function summarizeAuditChanges(action: string, rawChanges: string | null): string | null {
  if (!rawChanges) return null;
  if (action === 'UPDATE') {
    try {
      const parsed = JSON.parse(rawChanges);
      if (parsed && typeof parsed === 'object') {
        const keys = Object.keys(parsed).filter((k) => k !== 'lastEditedByUserId');
        if (keys.length === 0) return 'Product opgeslagen';
        const labels = keys.slice(0, 6).map((k) => AUDIT_FIELD_LABELS[k] || k);
        return `Velden opgeslagen: ${labels.join(', ')}${keys.length > 6 ? ` (+${keys.length - 6})` : ''}`;
      }
    } catch {
      // fall through
    }
  }
  return rawChanges;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    const roles: string[] = (session.user as any)?.roles ?? [];
    const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
    const currentUserId = (session.user as any)?.id as string | undefined;

    const url = new URL(req.url);
    const requestedUserId = url.searchParams.get('userId')?.trim() || '';
    const articleQuery = url.searchParams.get('articleNumber')?.trim() || '';
    const limitParam = parseInt(url.searchParams.get('limit') || url.searchParams.get('take') || '100', 10);
    const limit = Math.min(Math.max(Number.isNaN(limitParam) ? 100 : limitParam, 10), 250);
    const skipParam = parseInt(url.searchParams.get('skip') || '0', 10);
    const skip = Math.max(Number.isNaN(skipParam) ? 0 : skipParam, 0);

    // Non-admins can only view their own activity
    const effectiveUserId = isAdmin ? requestedUserId || undefined : currentUserId;
    if (!isAdmin && requestedUserId && requestedUserId !== currentUserId) {
      return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    }

    // Fetch Field History, Audit Logs, and Remarks in parallel
    const [fieldHistories, auditLogs, remarks] = await Promise.all([
      prisma.productFieldHistory.findMany({
        where: {
          ...(effectiveUserId ? { userId: effectiveUserId } : {}),
          ...(articleQuery
            ? { articleNumber: { contains: articleQuery, mode: 'insensitive' } }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.auditLog.findMany({
        where: {
          entity: 'Product',
          ...(effectiveUserId ? { userId: effectiveUserId } : {}),
          ...(articleQuery
            ? { entityId: { contains: articleQuery, mode: 'insensitive' } }
            : {}),
        },
        include: {
          user: { select: { id: true, email: true } },
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
      }),
      prisma.productRemark.findMany({
        where: {
          ...(effectiveUserId ? { userId: effectiveUserId } : {}),
          ...(articleQuery
            ? { product: { internalArticleNumber: { contains: articleQuery, mode: 'insensitive' } } }
            : {}),
        },
        include: {
          user: { select: { id: true, email: true } },
          product: { select: { internalArticleNumber: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 80),
      }),
    ]);

    // Collect all article numbers to resolve product titles in one query
    const articleSet = new Set<string>();
    fieldHistories.forEach((h) => articleSet.add(h.articleNumber));
    auditLogs.forEach((a) => articleSet.add(a.entityId));
    remarks.forEach((r) => {
      if (r.product?.internalArticleNumber) articleSet.add(r.product.internalArticleNumber);
    });

    const products =
      articleSet.size > 0
        ? await prisma.product.findMany({
          where: { internalArticleNumber: { in: Array.from(articleSet) } },
          select: { internalArticleNumber: true, title: true },
        })
        : [];
    const titleByArt = new Map(products.map((p) => [p.internalArticleNumber, p.title]));

    const items: UserActivityItem[] = [];

    // 1. Add all field-level changes
    for (const h of fieldHistories) {
      items.push({
        id: `fh_${h.id}`,
        type: 'FIELD_CHANGE',
        timestamp: h.createdAt.toISOString(),
        userId: h.userId,
        userEmail: h.userEmail,
        articleNumber: h.articleNumber,
        productTitle: titleByArt.get(h.articleNumber) ?? null,
        action: 'FIELD_CHANGE',
        fieldKey: h.fieldKey,
        fieldLabel: h.fieldLabel || AUDIT_FIELD_LABELS[h.fieldKey] || h.fieldKey,
        oldValue: h.oldValue,
        newValue: h.newValue,
        source: h.source,
      });
    }

    // 2. Add AuditLogs, skipping redundant UPDATE logs when field history already captured the exact save
    for (const a of auditLogs) {
      if (a.action === 'UPDATE') {
        const auditMs = a.timestamp.getTime();
        const hasDetailedFieldHistory = fieldHistories.some(
          (h) =>
            h.articleNumber === a.entityId &&
            (!h.userId || h.userId === a.userId) &&
            Math.abs(h.createdAt.getTime() - auditMs) <= 5000
        );
        if (hasDetailedFieldHistory) {
          continue;
        }
      }

      items.push({
        id: `al_${a.id}`,
        type: 'AUDIT',
        timestamp: a.timestamp.toISOString(),
        userId: a.userId,
        userEmail: a.user?.email ?? null,
        articleNumber: a.entityId,
        productTitle: titleByArt.get(a.entityId) ?? null,
        action: a.action,
        summary: summarizeAuditChanges(a.action, a.changes),
      });
    }

    // 3. Add Remarks
    for (const r of remarks) {
      const art = r.product?.internalArticleNumber;
      if (!art) continue;
      items.push({
        id: `rm_${r.id}`,
        type: 'REMARK',
        timestamp: r.createdAt.toISOString(),
        userId: r.userId,
        userEmail: r.user?.email ?? null,
        articleNumber: art,
        productTitle: r.product?.title ?? titleByArt.get(art) ?? null,
        action: 'REMARK',
        summary: r.message.length > 180 ? `${r.message.slice(0, 180)}…` : r.message,
      });
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const sliced = items.slice(skip, skip + limit);
    return NextResponse.json({
      items: sliced,
      total: items.length,
      logs: sliced.map((it) => ({
        id: it.id,
        entityId: it.articleNumber,
        action: it.action,
        timestamp: it.timestamp,
        changes: it.summary ?? (it.fieldLabel ? `${it.fieldLabel}: ${it.oldValue ?? '(leeg)'} → ${it.newValue ?? '(leeg)'}` : null),
      })),
      totalCount: items.length,
    });
  } catch (err: any) {
    console.error('[user-activity] Error:', err);
    return NextResponse.json({ error: `Server fout: ${err?.message}` }, { status: 500 });
  }
}
