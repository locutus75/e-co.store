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

    const roles: string[] = (session.user as any)?.roles ?? [];
    const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
    const currentUserId = (session.user as any)?.id;

    if (userId && !isAdmin && currentUserId !== userId) {
      return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    }

    // Daily stats for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(userId ? { userId } : {}),
        timestamp: { gte: thirtyDaysAgo },
        action: 'UPDATE' // Focus on product updates
      },
      select: {
        timestamp: true
      }
    });

    const dailyStats: Record<string, number> = {};
    logs.forEach(log => {
      const date = log.timestamp.toISOString().split('T')[0];
      dailyStats[date] = (dailyStats[date] || 0) + 1;
    });

    // Fill in missing days
    const result = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        count: dailyStats[dateStr] || 0
      });
    }

    return NextResponse.json({ 
      daily: result.reverse(),
      totalRecent: logs.length
    });

  } catch (err: any) {
    console.error('[user-stats] Error:', err);
    return NextResponse.json({ error: `Server fout: ${err?.message}` }, { status: 500 });
  }
}
