"use client";
import React, { useState, useTransition } from 'react';
import { previewExcelAction, executeImportAction } from '@/app/actions/importExcel';
import { PRISMA_FIELDS } from '@/lib/constants';

type Phase = 'upload' | 'preview' | 'mapping' | 'importing';

export default function ExcelImportWizard({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<any[][]>([]);
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  
  const [isPending, startTransition] = useTransition();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      const fd = new FormData();
      fd.append('file', selectedFile);

      setPhase('preview');
      startTransition(async () => {
        const res = await previewExcelAction(fd);
        if (res.success && res.previewRows) {
          setPreviewRows(res.previewRows);
        } else {
          alert("Fout bij het lezen van Excel: " + res.error);
          setPhase('upload');
        }
      });
    }
  };

  const handleConfirmHeader = () => {
    // Attempt auto-guessing the mapping based on the chosen header row
    const headers = previewRows[headerRowIndex] || [];
    const autoMap: Record<number, string> = {};
    
    headers.forEach((headerStr, colIndex) => {
      if(!headerStr) {
        autoMap[colIndex] = 'ignore';
        return;
      }
      
      const cleanHeader = String(headerStr).toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Super naive auto match
      const matchedField = PRISMA_FIELDS.find(f => {
        const cleanField = f.label.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanKey = f.key.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanHeader.includes(cleanField) || cleanHeader.includes(cleanKey) || cleanField.includes(cleanHeader);
      });

      // Specific hardcoded matches for smooth UX on specifically known headers
      if (typeof headerStr === 'string') {
        if (headerStr.includes('Nummer')) autoMap[colIndex] = 'internalArticleNumber';
        else if (headerStr.includes('A.Omschrijving') || headerStr.includes('Titel')) autoMap[colIndex] = 'title';
        else if (headerStr.includes('Web titel')) autoMap[colIndex] = 'seoTitle';
        else if (headerStr.includes('Web omschrijving')) autoMap[colIndex] = 'longDescription';
        else if (headerStr.includes('Gewicht')) autoMap[colIndex] = 'weightGr';
        else if (headerStr.includes('Hoofdmateriaal')) autoMap[colIndex] = 'mainMaterial';
        else if (headerStr.includes('Compleet/klaar')) autoMap[colIndex] = 'readyForImport';
        else autoMap[colIndex] = matchedField ? matchedField.key : 'ignore';
      } else {
        autoMap[colIndex] = 'ignore';
      }
    });

    setMapping(autoMap);
    setPhase('mapping');
  };

  const executeImport = () => {
    if (!file) return;
    setPhase('importing');
    
    const fd = new FormData();
    fd.append('file', file);
    
    startTransition(async () => {
      const res = await executeImportAction(fd, headerRowIndex, mapping);
      if (res.error) {
        alert("Import Mislukt: " + res.error);
        setPhase('mapping');
      } else {
        alert(`Succesvol ${res.count} producten geïmporteerd of bijgewerkt!`);
        onClose();
      }
    });
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass" style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: '1000px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
        
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)' }}>
            {phase === 'upload' && "1. Upload Excel"}
            {phase === 'preview' && "2. Kies Rijkop (Header Row)"}
            {phase === 'mapping' && "3. Kolommen Koppelen"}
            {phase === 'importing' && "Data Importeren..."}
          </h2>
          <button className="btn" style={{ border: 'none', backgroundColor: 'transparent', fontSize: '1.25rem' }} onClick={onClose} disabled={phase === 'importing'}>✕</button>
        </div>

        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {phase === 'upload' && (
            <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📄</div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Selecteer een Excel of CSV bestand</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Upload een bestand om de dynamische import te starten.</p>
              <label className="btn btn-primary" style={{ padding: '0.8rem 2rem', fontSize: '1rem', cursor: 'pointer' }}>
                Bladeren...
                <input type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} onChange={handleFileUpload} />
              </label>
            </div>
          )}

          {phase === 'preview' && (
            <div>
              <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Klik op de rij die de kolomnamen (headers) bevat. Alles daarboven wordt genegeerd.</p>
              {isPending ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Bestand inlezen...</div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <tbody>
                      {previewRows.map((row, rIdx) => (
                        <tr key={rIdx} style={{ backgroundColor: headerRowIndex === rIdx ? 'var(--primary-glow)' : (rIdx % 2 === 0 ? 'var(--surface)' : 'var(--surface-hover)'), cursor: 'pointer', borderBottom: '1px solid var(--border)' }} onClick={() => setHeaderRowIndex(rIdx)}>
                          <td style={{ padding: '0.5rem', width: '40px', textAlign: 'center' }}>
                            <input type="radio" checked={headerRowIndex === rIdx} readOnly />
                          </td>
                          <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--text-muted)' }}>Rij {rIdx + 1}</td>
                          {Array.from({ length: Math.min(10, row.length) }).map((_, cIdx) => (
                            <td key={cIdx} style={{ padding: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                              {String(row[cIdx] || '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {phase === 'mapping' && (
            <div>
              <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Koppel de Excel kolommen aan de juiste velden in de database.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(250px, 1fr) 2fr', gap: '1rem', fontWeight: 600, paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
                <div>Excel Kolom</div>
                <div>Database Veld</div>
                <div>Voorbeeld Data (Eerste rij)</div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(previewRows[headerRowIndex] || []).map((headerLabel, cIdx) => {
                  if (!headerLabel) return null;
                  const sampleData = previewRows[headerRowIndex + 1]?.[cIdx] || '';
                  
                  return (
                    <div key={cIdx} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(250px, 1fr) 2fr', gap: '1rem', alignItems: 'center' }}>
                      <div style={{ fontWeight: 500 }}>{String(headerLabel)}</div>
                      <select 
                        className="input" 
                        value={mapping[cIdx] || 'ignore'} 
                        onChange={e => setMapping({...mapping, [cIdx]: e.target.value})}
                        style={{ padding: '0.4rem', borderRadius: 'var(--radius)' }}
                      >
                        <option value="ignore">❌ -- Negeer deze kolom --</option>
                        {PRISMA_FIELDS.map(f => (
                          <option key={f.key} value={f.key}>{f.label} ({f.type})</option>
                        ))}
                      </select>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {String(sampleData)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {phase === 'importing' && (
            <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'spin 2s linear infinite' }}>⏳</div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Importeren...</h3>
              <p style={{ color: 'var(--text-muted)' }}>We controleren en verwerken de rijen, een moment geduld aub.</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', backgroundColor: 'var(--surface-hover)' }}>
          {phase === 'preview' && (
            <button className="btn btn-primary" onClick={handleConfirmHeader}>Verder naar Koppelen →</button>
          )}
          {phase === 'mapping' && (
             <>
               <button className="btn" onClick={() => setPhase('preview')}>← Terug</button>
               <button className="btn btn-primary" onClick={executeImport}>Start Import</button>
             </>
          )}
        </div>
      </div>
    </div>
  );
}
