import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/user/recent-edits?userId=<id>&take=20
 * Returns the most recently edited products by a given user.
 * Requires authentication. Admins can view any user; others only themselves.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    // Use standard URL parsing for compatibility
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    const take = Math.min(parseInt(url.searchParams.get('take') ?? '20', 10), 50);

    if (!userId) {
      return NextResponse.json({ error: 'userId vereist' }, { status: 400 });
    }

    const roles: string[] = (session.user as any)?.roles ?? [];
    const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
    const currentUserId = (session.user as any)?.id;

    // Only admin can view other users' edit history
    if (!isAdmin && currentUserId !== userId) {
      return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    }

    // Check if the lastEditedByUserId field exists on Product
    // (gracefully handle old builds where it might not be available yet)
    let products: any[] = [];
    try {
      products = await prisma.product.findMany({
        where: { lastEditedByUserId: userId },
        orderBy: { updatedAt: 'desc' },
        take,
        select: {
          id: true,
          internalArticleNumber: true,
          title: true,
          status: true,
          updatedAt: true,
        },
      });
    } catch (prismaErr: any) {
      console.error('[recent-edits] Prisma query failed:', prismaErr.message);
      // Field might not exist in this build's client — return empty rather than crashing
      return NextResponse.json({ products: [], warning: 'Schema nog niet bijgewerkt in deze build' });
    }

    return NextResponse.json({ products });

  } catch (err: any) {
    console.error('[recent-edits] Unexpected error:', err);
    return NextResponse.json({ error: `Server fout: ${err?.message ?? 'Onbekend'}` }, { status: 500 });
  }
}
