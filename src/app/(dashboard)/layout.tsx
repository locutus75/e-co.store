import { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { LogoutButton } from '@/components/LogoutButton';
import MessagesNavBadge from '@/components/MessagesNavBadge';
import Link from 'next/link';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const roles = (session?.user as any)?.roles || [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
  
  const userId = (session?.user as any)?.id as string | undefined;
  
  // Fetch active menu permissions purely for non-admins 
  let allowedMenus = new Set<string>();
  if (!isAdmin && roles.length > 0) {
    const permissions = await prisma.rolePermission.findMany({
      where: {
        role: { name: { in: roles } },
        module: { startsWith: 'MENU:' },
        action: 'ALLOW'
      }
    });
    permissions.forEach((p: any) => allowedMenus.add(p.module));
  }

  // Initial unread count for the Berichten badge
  const unreadCount = userId
    ? await prisma.messageRecipient.count({
        where: { toUserId: userId, readAt: null, deletedByRecipient: false },
      })
    : 0;

  // Helper function to ascertain access
  const canAccess = (menuKey: string) => isAdmin || allowedMenus.has(menuKey);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--background)' }}>
      {/* Sidebar */}
      <aside className="glass" style={{ 
        width: '260px', 
        display: 'flex', 
        flexDirection: 'column',
        borderRight: '1px solid var(--border)',
        borderTop: 'none',
        borderBottom: 'none',
        borderLeft: 'none',
        position: 'fixed',
        top: 0, bottom: 0, left: 0,
        zIndex: 10
      }}>
        <div style={{ padding: '2.5rem 1.5rem', display: 'flex', justifyContent: 'center', borderBottom: '1px solid rgba(0,0,0,0.03)' }}>
          <Logo size={64} />
        </div>
        
        <nav style={{ padding: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          {canAccess('MENU:dashboard') && (
            <Link href="/" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius)', backgroundColor: 'transparent', color: 'var(--text-muted)', fontWeight: 500, transition: 'all 0.2s', display: 'block' }}>Dashboard</Link>
          )}
          {canAccess('MENU:products') && (
            <Link href="/products" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius)', backgroundColor: 'transparent', color: 'var(--text-muted)', fontWeight: 500, transition: 'all 0.2s', display: 'block' }}>Products</Link>
          )}
          {canAccess('MENU:messages') && (
            <MessagesNavBadge initialCount={unreadCount} />
          )}
          {canAccess('MENU:categories') && (
            <Link href="/" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius)', color: 'var(--text-muted)', fontWeight: 500, transition: 'all 0.2s', display: 'block' }}>Categories</Link>
          )}
          {canAccess('MENU:assignments') && (
            <Link href="/assignments" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius)', color: 'var(--text-muted)', fontWeight: 500, transition: 'all 0.2s', display: 'block' }}>Assignments</Link>
          )}
          {canAccess('MENU:users') && (
            <Link href="/admin" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius)', color: 'var(--text-muted)', fontWeight: 500, transition: 'all 0.2s', display: 'block' }}>Team & Users</Link>
          )}
          {canAccess('MENU:roles') && (
            <Link href="/roles" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius)', color: 'var(--text-muted)', fontWeight: 500, transition: 'all 0.2s', display: 'block' }}>Roles & Security</Link>
          )}
          {canAccess('MENU:system') && (
            <Link href="/admin/system" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius)', color: 'var(--text-muted)', fontWeight: 500, transition: 'all 0.2s', display: 'block' }}>System Settings</Link>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, marginLeft: '260px', display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <header className="glass" style={{
          height: '70px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 2rem',
          borderBottom: '1px solid var(--border)',
          borderTop: 'none',
          borderLeft: 'none',
          borderRight: 'none',
          position: 'sticky',
          top: 0,
          zIndex: 5
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <LogoutButton />
          </div>
        </header>

        {/* Page Content */}
        <main style={{ padding: '2.5rem', flex: 1 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
