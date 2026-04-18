import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getLlmConfigsAction, getLlmUsageStatsAction } from '@/app/actions/llm';
import AiClient from './AiClient';

export const metadata = { title: 'AI Assistent — e&co.store' };

export default async function AiPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const roles: string[] = (session.user as any)?.roles ?? [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');

  if (!isAdmin) {
    const perm = await prisma.rolePermission.findFirst({
      where: { role: { name: { in: roles } }, module: 'MENU:ai', action: 'ALLOW' },
    });
    if (!perm) redirect('/');
  }

  const [providers, stats] = await Promise.all([
    getLlmConfigsAction(),
    isAdmin ? getLlmUsageStatsAction('30d') : null,
  ]);

  const userId = (session.user as any)?.id as string;
  const userEmail = (session.user as any)?.email as string;

  return <AiClient providers={providers} initialStats={stats} isAdmin={isAdmin} userId={userId} userEmail={userEmail} />;
}
