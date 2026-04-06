import React from 'react';

export function Logo({ size = 48, showText = true }: { size?: number, showText?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      {/* 
        The actual logo image file needs to be placed in the public/ folder at public/logo.png.
      */}
      <img 
        src="/logo.png" 
        alt="E&co Logo" 
        width={size} 
        height={size} 
        style={{ objectFit: 'contain' }} 
      />
      {showText && (
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
          MANAGER
        </span>
      )}
    </div>
  );
}
