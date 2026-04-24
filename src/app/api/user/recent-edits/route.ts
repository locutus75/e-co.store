import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/user/recent-edits?userId=<id>&take=20
 * Returns the most recently edited products by a given user.
 * Requires authentication. Admin-only access to other users' data.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const userId = searchParams.get('userId');
  const take = Math.min(parseInt(searchParams.get('take') ?? '20', 10), 50);

  if (!userId) return NextResponse.json({ error: 'userId vereist' }, { status: 400 });

  const roles: string[] = (session.user as any)?.roles ?? [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
  const currentUserId = (session.user as any)?.id;

  // Only admin can view other users' edit history
  if (!isAdmin && currentUserId !== userId) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
  }

  const products = await prisma.product.findMany({
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

  return NextResponse.json({ products });
}
