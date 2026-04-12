import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  const [
    totalProducts,
    countNew,
    countEdit,
    countCheck,
    countDone,
    readyYes,
    readyReview
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { status: { equals: 'NEW',   mode: 'insensitive' } } }),
    prisma.product.count({ where: { status: { equals: 'EDIT',  mode: 'insensitive' } } }),
    prisma.product.count({ where: { status: { equals: 'CHECK', mode: 'insensitive' } } }),
    prisma.product.count({ where: { status: { equals: 'DONE',  mode: 'insensitive' } } }),
    prisma.product.count({ where: { readyForImport: { equals: 'JA',     mode: 'insensitive' } } }),
    prisma.product.count({ where: { readyForImport: { equals: 'REVIEW', mode: 'insensitive' } } })
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%', maxWidth: '1600px' }}>
      <div>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
          Welcome back, {session?.user?.email?.split('@')[0]}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem' }}>Real-time overview of the E&co product database.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
        
        {/* Total Database Size */}
        <div className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', fontWeight: 600 }}>Totaal Producten</h3>
          <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{totalProducts}</p>
        </div>

        {/* Workflow Status — all 4 labels */}
        <div className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', gridColumn: 'span 2' }}>
          <h3 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.25rem', fontWeight: 600 }}>Workflow Status</h3>
          <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{countNew}</p>
              <span style={{ display: 'inline-block', marginTop: '0.5rem', padding: '0.15rem 0.6rem', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'var(--primary)', color: 'white' }}>NEW</span>
            </div>
            <div>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-mustard)', lineHeight: 1 }}>{countEdit}</p>
              <span style={{ display: 'inline-block', marginTop: '0.5rem', padding: '0.15rem 0.6rem', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'var(--color-mustard)', color: 'white' }}>EDIT</span>
            </div>
            <div>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6', lineHeight: 1 }}>{countCheck}</p>
              <span style={{ display: 'inline-block', marginTop: '0.5rem', padding: '0.15rem 0.6rem', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 700, backgroundColor: '#3b82f6', color: 'white' }}>CHECK</span>
            </div>
            <div>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{countDone}</p>
              <span style={{ display: 'inline-block', marginTop: '0.5rem', padding: '0.15rem 0.6rem', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 700, backgroundColor: '#10b981', color: 'white' }}>DONE</span>
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
