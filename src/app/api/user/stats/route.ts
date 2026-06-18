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
        action: { in: ['UPDATE', 'STATUS_CHANGE'] }
      },
      select: {
        action: true,
        changes: true,
        timestamp: true
      }
    });

    const dailyStats: Record<string, number> = {};
    let updateLogsCount = 0;
    const statusCounts = { NEW: 0, EDIT: 0, CHECK: 0, DONE: 0 };

    logs.forEach(log => {
      // 1. Calculate daily stats for UPDATE actions (Bewerkingen)
      if (log.action === 'UPDATE') {
        const date = log.timestamp.toISOString().split('T')[0];
        dailyStats[date] = (dailyStats[date] || 0) + 1;
        updateLogsCount++;
      }

      // 2. Count status transitions
      if (log.action === 'STATUS_CHANGE' && log.changes) {
        const match = log.changes.match(/Status set to (\w+)/i);
        if (match) {
          const status = match[1].toUpperCase() as keyof typeof statusCounts;
          if (status in statusCounts) {
            statusCounts[status]++;
          }
        }
      } else if (log.action === 'UPDATE' && log.changes) {
        try {
          const parsed = JSON.parse(log.changes);
          if (parsed && parsed.status) {
            const status = parsed.status.toUpperCase() as keyof typeof statusCounts;
            if (status in statusCounts) {
              statusCounts[status]++;
            }
          }
        } catch (_) {
          // ignore non-json
        }
      }
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
      totalRecent: updateLogsCount,
      statusCounts
    });

  } catch (err: any) {
    console.error('[user-stats] Error:', err);
    return NextResponse.json({ error: `Server fout: ${err?.message}` }, { status: 500 });
  }
}
