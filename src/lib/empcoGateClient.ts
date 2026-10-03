import { evaluateEmpcoReadyGateAction } from '@/app/actions/empco';

interface GateItem {
  articleNumber: string;
  title: string;
  reason: string;
}

function showGateDialog(options: {
  type: 'blocked' | 'warning';
  title: string;
  count: number;
  items: GateItem[];
  intro: string;
  footerNote: string;
  confirmLabel?: string;
  cancelLabel?: string;
}): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '99999';
    overlay.style.padding = '1rem';

    const isBlocked = options.type === 'blocked';
    const accentColor = isBlocked ? '#ef4444' : '#ea580c';
    const accentHover = isBlocked ? '#dc2626' : '#c2410c';
    const icon = isBlocked ? '⛔' : '⚠️';
    const iconBg = isBlocked ? 'rgba(239, 68, 68, 0.12)' : '#fff7ed';

    const itemsHtml = options.items.slice(0, 8).map(item => `
      <div style="padding: 0.55rem 0.75rem; border-radius: 8px; background-color: #f8fafc; border: 1px solid #e2e8f0; font-size: 0.82rem; margin-bottom: 0.4rem;">
        <div style="font-weight: 600; color: #1e293b; margin-bottom: 0.15rem;">
          #${escapeHtml(item.articleNumber)} ${item.title ? `(${escapeHtml(item.title)})` : ''}
        </div>
        <div style="color: #64748b; font-size: 0.78rem;">${escapeHtml(item.reason)}</div>
      </div>
    `).join('') + (options.items.length > 8 ? `<div style="font-size: 0.75rem; color: #94a3b8; text-align: center; margin-top: 0.3rem;">… en nog ${options.items.length - 8} andere product(en)</div>` : '');

    const buttonsHtml = isBlocked
      ? `<button id="empco-gate-close-btn" type="button" style="padding: 0.6rem 1.4rem; background-color: ${accentColor}; color: white; border: none; border-radius: 10px; font-weight: 600; font-size: 0.9rem; cursor: pointer; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.35); transition: background-color 0.2s;">Begrepen</button>`
      : `
        <button id="empco-gate-cancel-btn" type="button" style="padding: 0.6rem 1.25rem; background: transparent; border: 1px solid #cbd5e1; border-radius: 10px; font-weight: 600; font-size: 0.9rem; color: #334155; cursor: pointer;">${options.cancelLabel || 'Annuleren'}</button>
        <button id="empco-gate-confirm-btn" type="button" style="padding: 0.6rem 1.35rem; background-color: ${accentColor}; color: white; border: none; border-radius: 10px; font-weight: 600; font-size: 0.9rem; cursor: pointer; box-shadow: 0 4px 14px rgba(234, 88, 12, 0.35); transition: background-color 0.2s;">${options.confirmLabel || 'Toch op Ja zetten'}</button>
      `;

    overlay.innerHTML = `
      <div style="background-color: white; border-radius: 20px; width: 100%; maxWidth: 540px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35); border: 1px solid #e2e8f0; overflow: hidden; animation: empcoGatePop 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
        <div style="padding: 1.75rem 1.75rem 1.25rem;">
          <div style="display: flex; align-items: flex-start; gap: 1.1rem; margin-bottom: 1.1rem;">
            <div style="width: 52px; height: 52px; border-radius: 50%; background-color: ${iconBg}; display: flex; align-items: center; justify-content: center; font-size: 1.75rem; flex-shrink: 0;">
              ${icon}
            </div>
            <div style="flex: 1; min-width: 0;">
              <h3 style="margin: 0; font-size: 1.2rem; font-weight: 700; color: ${accentColor};">
                ${escapeHtml(options.title)}
              </h3>
              <p style="margin: 0.4rem 0 0; font-size: 0.88rem; color: #475569; line-height: 1.5;">
                ${escapeHtml(options.intro)}
              </p>
            </div>
          </div>

          <div style="max-height: 220px; overflow-y: auto; padding-right: 0.25rem; margin-bottom: 1rem;">
            ${itemsHtml}
          </div>

          <p style="margin: 0; font-size: 0.78rem; color: #64748b; line-height: 1.45; background: #f8fafc; padding: 0.6rem 0.8rem; border-radius: 8px; border: 1px solid #e2e8f0;">
            ${escapeHtml(options.footerNote)}
          </p>
        </div>

        <div style="padding: 1rem 1.75rem; background-color: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 0.75rem;">
          ${buttonsHtml}
        </div>
      </div>
      <style>
        @keyframes empcoGatePop {
          from { transform: translateY(16px) scale(0.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      </style>
    `;

    const cleanup = (result: boolean) => {
      window.removeEventListener('keydown', handleKeyDown);
      overlay.remove();
      resolve(result);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    document.body.appendChild(overlay);

    if (isBlocked) {
      const closeBtn = overlay.querySelector('#empco-gate-close-btn') as HTMLButtonElement | null;
      closeBtn?.addEventListener('click', () => cleanup(false));
      closeBtn?.addEventListener('mouseenter', () => { closeBtn.style.backgroundColor = accentHover; });
      closeBtn?.addEventListener('mouseleave', () => { closeBtn.style.backgroundColor = accentColor; });
      closeBtn?.focus();
    } else {
      const cancelBtn = overlay.querySelector('#empco-gate-cancel-btn') as HTMLButtonElement | null;
      const confirmBtn = overlay.querySelector('#empco-gate-confirm-btn') as HTMLButtonElement | null;
      cancelBtn?.addEventListener('click', () => cleanup(false));
      confirmBtn?.addEventListener('click', () => cleanup(true));
      confirmBtn?.addEventListener('mouseenter', () => { confirmBtn.style.backgroundColor = accentHover; });
      confirmBtn?.addEventListener('mouseleave', () => { confirmBtn.style.backgroundColor = accentColor; });
      confirmBtn?.focus();
    }
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Client helper used before setting "Webshop Ready = JA".
 * - 'block' policy  → displays an in-app blocked modal and returns false
 * - 'warn' policy   → displays an in-app confirmation modal and returns user choice
 * The server additionally enforces 'block' in the ready actions.
 */
export async function confirmEmpcoReady(articleNumbers: string[]): Promise<boolean> {
  let gate;
  try {
    gate = await evaluateEmpcoReadyGateAction(articleNumbers);
  } catch {
    return true; // never block the UI on a gate evaluation error; server still enforces 'block'
  }

  if (gate.blocked.length > 0) {
    await showGateDialog({
      type: 'blocked',
      title: `Webshop Ready geblokkeerd (${gate.blocked.length})`,
      count: gate.blocked.length,
      items: gate.blocked,
      intro: `De onderstaande ${gate.blocked.length} product(en) bevatten ernstige EmpCo-overtredingen en mogen volgens het huidige beleid niet op Webshop Ready = Ja worden gezet:`,
      footerNote: '💡 Los de EmpCo-bevindingen op (via ⚖️ EmpCo in het product of de bulk-actie) of pas de drempel aan in Systeeminstellingen.',
    });
    return false;
  }

  if (gate.warnings.length > 0) {
    return await showGateDialog({
      type: 'warning',
      title: `EmpCo-waarschuwing (${gate.warnings.length})`,
      count: gate.warnings.length,
      items: gate.warnings,
      intro: `Er zijn openstaande EmpCo-aandachtspunten gevonden voor ${gate.warnings.length} product(en):`,
      footerNote: '⚠️ Weet je zeker dat je deze producten toch op Webshop Ready = Ja wilt zetten?',
      confirmLabel: 'Toch op Ja zetten',
      cancelLabel: 'Annuleren',
    });
  }

  return true;
}
