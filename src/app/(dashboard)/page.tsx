import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  const [
    totalProducts,
    newProducts,
    checkProducts,
    readyYes,
    readyReview
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { status: 'NEW' } }),
    prisma.product.count({ where: { status: 'CHECK' } }),
    prisma.product.count({ where: { readyForImport: 'JA' } }),
    prisma.product.count({ where: { readyForImport: 'REVIEW' } })
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%', maxWidth: '1600px' }}>
      <div>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
          Welcome back, {session?.user?.email?.split('@')[0]}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem' }}>Real-time overview of the E&co product database.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        
        {/* Total Database Size */}
        <div className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', fontWeight: 600 }}>Totaal Producten</h3>
          <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{totalProducts}</p>
        </div>

        {/* Workflow Status */}
        <div className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', fontWeight: 600 }}>Workflow Status</h3>
          </div>
          <div style={{ display: 'flex', gap: '2rem', marginTop: '0.5rem' }}>
             <div>
               <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{newProducts}</p>
               <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontWeight: 600 }}>NEW</p>
             </div>
             <div>
               <p style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6', lineHeight: 1 }}>{checkProducts}</p>
               <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontWeight: 600 }}>CHECK</p>
             </div>
          </div>
        </div>

        {/* Webshop Readiness */}
        <div className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', fontWeight: 600 }}>Webshop Ready</h3>
          <div style={{ display: 'flex', gap: '2rem', marginTop: '0.5rem' }}>
             <div>
               <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)', lineHeight: 1 }}>{readyYes}</p>
               <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontWeight: 600 }}>YES</p>
             </div>
             <div>
               <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-mustard)', lineHeight: 1 }}>{readyReview}</p>
               <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontWeight: 600 }}>REVIEW</p>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
