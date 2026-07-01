"use client";
import React from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel = "Bevestigen",
  cancelLabel = "Annuleren",
  onConfirm,
  onCancel,
  type = 'warning'
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const getThemeColors = () => {
    switch (type) {
      case 'danger':
        return {
          icon: '🗑️',
          iconBg: 'rgba(239, 68, 68, 0.1)',
          titleColor: '#ef4444',
          btnBg: '#ef4444',
          btnHoverBg: '#dc2626',
          btnShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
        };
      case 'info':
        return {
          icon: 'ℹ️',
          iconBg: 'rgba(59, 130, 246, 0.1)',
          titleColor: '#3b82f6',
          btnBg: 'var(--primary)',
          btnHoverBg: 'var(--primary-hover)',
          btnShadow: '0 4px 14px rgba(59, 130, 246, 0.3)',
        };
      case 'warning':
      default:
        return {
          icon: '⚠️',
          iconBg: '#fff7ed',
          titleColor: '#9a3412',
          btnBg: '#ea580c',
          btnHoverBg: '#d97706',
          btnShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
        };
    }
  };

  const theme = getThemeColors();

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
      <div className="glass" style={{ backgroundColor: 'var(--surface, white)', padding: '2.5rem', borderRadius: '20px', width: '90%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ width: '56px', height: '56px', backgroundColor: theme.iconBg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '2rem' }}>
            {theme.icon}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '1.35rem', color: theme.titleColor, fontWeight: 700 }}>
              {title}
            </h3>
            <p style={{ margin: '0.75rem 0 0 0', color: 'var(--text-muted, #4b5563)', fontSize: '0.95rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {message}
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button 
            type="button"
            className="btn" 
            onClick={onCancel}
            style={{ 
              padding: '0.6rem 1.25rem', 
              background: 'transparent', 
              border: '1px solid var(--border)', 
              borderRadius: 'var(--radius, 8px)',
              cursor: 'pointer',
              color: 'var(--text)',
              fontSize: '0.9rem',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            {cancelLabel}
          </button>
          <button 
            type="button"
            className="btn" 
            onClick={onConfirm}
            style={{ 
              padding: '0.6rem 1.25rem', 
              background: theme.btnBg, 
              color: 'white',
              border: 'none', 
              borderRadius: 'var(--radius, 8px)',
              cursor: 'pointer',
              boxShadow: theme.btnShadow,
              fontSize: '0.9rem',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.btnHoverBg;
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.btnBg;
            }}
          >
            {confirmLabel}
          </button>
        </div>
        
        <style>{`
          @keyframes slideIn {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}
