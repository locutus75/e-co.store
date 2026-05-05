import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    const skip = parseInt(url.searchParams.get('skip') ?? '0', 10);
    const take = parseInt(url.searchParams.get('take') ?? '20', 10);

    if (!userId) {
      return NextResponse.json({ error: 'userId vereist' }, { status: 400 });
    }

    const roles: string[] = (session.user as any)?.roles ?? [];
    const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
    const currentUserId = (session.user as any)?.id;

    if (!isAdmin && currentUserId !== userId) {
      return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    }

    const logs = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      skip,
      take,
      include: {
        user: {
          select: {
            email: true
          }
        }
      }
    });

    const totalCount = await prisma.auditLog.count({
      where: { userId }
    });

    return NextResponse.json({ logs, totalCount });

  } catch (err: any) {
    console.error('[user-activity] Error:', err);
    return NextResponse.json({ error: `Server fout: ${err?.message}` }, { status: 500 });
  }
}
