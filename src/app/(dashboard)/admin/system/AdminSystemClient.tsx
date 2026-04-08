"use client";

import React, { useState, useEffect, useRef } from 'react';

export default function AdminSystemClient() {
  const [checking, setChecking] = useState(true);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [updating, setUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Database State
  const [dbConfig, setDbConfig] = useState({ host: '', port: '', user: '', password: '', database: '' });
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [dbSuccess, setDbSuccess] = useState('');
  const [testingDb, setTestingDb] = useState(false);
  
  // Create DB State
  const [showCreateDb, setShowCreateDb] = useState(false);
  const [newDbName, setNewDbName] = useState('');
  const [creatingDb, setCreatingDb] = useState(false);

  // Custom Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalBody, setModalBody] = useState<React.ReactNode>(null);
  const [modalActionText, setModalActionText] = useState('Confirm');
  const [modalActionClass, setModalActionClass] = useState('btn-primary');
  const [modalAction, setModalAction] = useState<() => void>(() => {});
  const [modalIsInfoOnly, setModalIsInfoOnly] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkUpdates();
    fetchDbConfig();
  }, []);

  // --- MODAL HELPER ---
  const openConfirmModal = (title: string, body: React.ReactNode, actionText: string, actionClass: string, onConfirm: () => void) => {
    setModalTitle(title);
    setModalBody(body);
    setModalActionText(actionText);
    setModalActionClass(actionClass);
    setModalIsInfoOnly(false);
    setModalAction(() => () => {
      setModalOpen(false);
      onConfirm();
    });
    setModalOpen(true);
  };

  const openInfoModal = (title: string, body: React.ReactNode) => {
    setModalTitle(title);
    setModalBody(body);
    setModalActionText('Close');
    setModalActionClass('btn');
    setModalIsInfoOnly(true);
    setModalAction(() => () => setModalOpen(false));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    // if file input is pending reset it
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- UPDATER ---
  const checkUpdates = async () => {
    setChecking(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/system/update/check', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setUpdateInfo(data);
      else setErrorMsg(data.error || 'Failed to check updates');
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error checking updates');
    } finally {
      setChecking(false);
    }
  };

  // Removing confirmTriggerUpdate so '1-Click Update' goes straight to performReboot

  const performReboot = async () => {
    setUpdating(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/system/update/install', { method: 'POST' });
      if (res.ok) pollServer();
      else {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to start update');
        setUpdating(false);
      }
    } catch (e) {
      pollServer();
    }
  }

  const pollServer = () => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/system/update/check', { cache: 'no-store' });
        if (res.ok) {
          clearInterval(interval);
          setUpdating(false);
          window.location.reload(); 
        }
      } catch (e) {}
    }, 5000);
  };

  // --- DATABASE CONFIG ---
  const fetchDbConfig = async () => {
    try {
      const res = await fetch('/api/system/database/config', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setDbConfig({
          host: data.host || '', port: data.port || '', user: data.user || '',
          password: '', database: data.database || ''
        });
      }
    } catch (e) {
      setDbError("Failed to load database configuration.");
    } finally {
      setDbLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingDb(true);
    setDbError('');
    setDbSuccess('');
    try {
      const res = await fetch('/api/system/database/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dbConfig, testOnly: true })
      });
      const data = await res.json();
      if (res.ok) {
        setDbSuccess(data.message || 'Connection test successful!');
      } else {
        setDbError(data.error + (data.details ? ` (${data.details})` : ''));
      }
    } catch (e: any) {
      setDbError('Network error while testing connection.');
    } finally {
      setTestingDb(false);
    }
  };

  const submitDbSave = async () => {
    setDbError('');
    setDbSuccess('');
    try {
      const res = await fetch('/api/system/database/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbConfig)
      });
      const data = await res.json();
      if (res.ok) {
        setDbSuccess(data.message);
        setTimeout(() => performReboot(), 2000);
      } else {
        setDbError(data.error + (data.details ? ` (${data.details})` : ''));
      }
    } catch (e: any) {
      setDbError('Network error while saving DB config.');
    }
  };

  const confirmDbSave = (e: React.FormEvent) => {
    e.preventDefault();
    openConfirmModal(
      'Apply Database Settings',
      <div style={{ color: 'var(--text-muted)' }}>
        <p>Applying these new settings will modify the system configuration and **automatically restart the server**.</p>
        <p style={{ marginTop: '0.5rem', color: 'var(--error)', fontWeight: 500 }}>If the credentials are incorrect, the application will crash and cannot be recovered from the UI!</p>
        <p style={{ marginTop: '0.5rem' }}>It is highly recommended you use the <strong>Test Connection</strong> button first.</p>
      </div>,
      'Apply & Restart', 'btn-primary',
      submitDbSave
    );
  };

  const handleDbCreate = async () => {
    if (!newDbName) return;
    setCreatingDb(true);
    setDbError('');
    setDbSuccess('');
    try {
      const res = await fetch('/api/system/database/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newDatabaseName: newDbName })
      });
      const data = await res.json();
      if (res.ok) {
        setDbSuccess(data.message);
        setShowCreateDb(false);
        setNewDbName('');
      } else {
        setDbError(data.error || 'Failed to create database');
      }
    } catch (e: any) {
      setDbError('Network error while creating database.');
    } finally {
      setCreatingDb(false);
    }
  };

  const handleExport = () => {
    window.open('/api/system/database/export', '_blank');
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    openConfirmModal(
      'Import Database Backup',
      <div style={{ color: 'var(--text-muted)' }}>
        <p>You are about to import <strong>{file.name}</strong>.</p>
        <p style={{ marginTop: '0.5rem', color: 'var(--error)', fontWeight: 500 }}>WARNING: This will completely overwrite all existing tables and data in the current database target!</p>
      </div>,
      'Overwrite & Import', 'btn-primary', // Use a distinct visual action if we had a danger class
      () => performImport(file)
    );
  };

  const performImport = async (file: File) => {
    setDbError('');
    setDbSuccess('Importing database file... please wait, this may take a moment.');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/system/database/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setDbSuccess(data.message);
      } else {
        setDbError(data.error + (data.details ? ` (${data.details})` : ''));
        setDbSuccess('');
      }
    } catch (err) {
      setDbError("Network error during import.");
      setDbSuccess('');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- VIEWS ---

  if (updating) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius)' }}>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '1rem' }}>Updating System...</h3>
        <p style={{ color: 'var(--text-muted)' }}>The server is currently processing and restarting. This typically takes 1 to 2 minutes.</p>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Do not close this page. It will automatically refresh when the server is back online.</p>
        <div style={{ marginTop: '2rem' }}>
            <span style={{ display: 'inline-block', width: '20px', height: '20px', border: '3px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
        </div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%', maxWidth: '1200px', position: 'relative' }}>
      
      {/* Modal Overlay */}
      {modalOpen && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, backdropFilter: 'blur(2px)' }} onClick={closeModal} />
          <div className="glass" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '500px', backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', zIndex: 101, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1rem' }}>{modalTitle}</h2>
            <div style={{ marginBottom: '2rem' }}>{modalBody}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              {!modalIsInfoOnly && <button className="btn" style={{ backgroundColor: 'var(--background)' }} onClick={closeModal}>Cancel</button>}
              <button className={`btn ${modalActionClass}`} onClick={modalAction}>{modalActionText}</button>
            </div>
          </div>
        </>
      )}

      <div>
         <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>System Settings</h1>
         <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: '0.2rem' }}>Manage application updates and database configuration.</p>
      </div>

      {/* Software Update Card */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          Software Update
        </h2>

        {errorMsg && <div style={{ padding: '1rem', backgroundColor: 'rgba(255,50,50,0.1)', color: 'var(--error)', borderRadius: 'var(--radius)', marginBottom: '1.5rem', fontWeight: 500 }}>{errorMsg}</div>}

        {checking ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Checking for updates...</div>
        ) : updateInfo ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ padding: '1.5rem', backgroundColor: 'var(--background)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Current Version</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
                  <button onClick={() => openInfoModal('Local Build Details', (
                    <div>
                      <p><strong>Version Hash:</strong> {updateInfo.localHash}</p>
                      <p><strong>Commit Date:</strong> {updateInfo.localDate ? new Date(updateInfo.localDate).toLocaleString() : 'N/A'}</p>
                      <p><strong>Author:</strong> {updateInfo.localAuthor || 'N/A'}</p>
                      <hr style={{ margin: '1rem 0', borderColor: 'var(--border)' }} />
                      <p><strong>Message:</strong></p>
                      <pre style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '1rem', borderRadius: 'var(--radius)', whiteSpace: 'pre-wrap', marginTop: '0.5rem', fontFamily: 'monospace' }}>{updateInfo.localMessage || 'No local commits'}</pre>
                    </div>
                  ))} style={{ 
                    background: updateInfo.updateAvailable ? '#451a03' : '#064e3b', 
                    color: updateInfo.updateAvailable ? '#fde047' : '#86efac', 
                    border: `1px solid ${updateInfo.updateAvailable ? '#854d0e' : '#166534'}`,
                    padding: '0.35rem 1rem', 
                    borderRadius: '9999px',
                    fontSize: '0.9rem', 
                    fontWeight: 700, 
                    cursor: 'pointer', 
                    textDecoration: 'none',
                    letterSpacing: '0.05em',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    {updateInfo.localHash ? updateInfo.localHash.substring(0, 7).toUpperCase() : 'UNKNOWN'}
                  </button>
                </div>
              </div>

              <div style={{ padding: '1.5rem', backgroundColor: updateInfo.updateAvailable ? 'rgba(59, 130, 246, 0.05)' : 'var(--background)', borderRadius: 'var(--radius)', border: `1px solid ${updateInfo.updateAvailable ? 'var(--primary)' : 'var(--border)'}` }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: updateInfo.updateAvailable ? 'var(--primary)' : 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Latest Available</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
                  <button onClick={() => openInfoModal('Remote Update Details', (
                    <div>
                      <p><strong>Version Hash:</strong> {updateInfo.remoteHash}</p>
                      <p><strong>Commit Date:</strong> {updateInfo.remoteDate ? new Date(updateInfo.remoteDate).toLocaleString() : 'N/A'}</p>
                      <p><strong>Author:</strong> {updateInfo.remoteAuthor || 'N/A'}</p>
                      <hr style={{ margin: '1rem 0', borderColor: 'var(--border)' }} />
                      <p><strong>Message:</strong></p>
                      <pre style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '1rem', borderRadius: 'var(--radius)', whiteSpace: 'pre-wrap', marginTop: '0.5rem', fontFamily: 'monospace' }}>{updateInfo.remoteMessage || 'No remote commits'}</pre>
                    </div>
                  ))} style={{ 
                    background: '#064e3b', 
                    color: '#86efac', 
                    border: '1px solid #166534',
                    padding: '0.35rem 1rem', 
                    borderRadius: '9999px',
                    fontSize: '0.9rem', 
                    fontWeight: 700, 
                    cursor: 'pointer', 
                    textDecoration: 'none',
                    letterSpacing: '0.05em',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s ease',
                    display: 'inline-block'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    {updateInfo.remoteHash ? updateInfo.remoteHash.substring(0, 7).toUpperCase() : 'UNKNOWN'}
                  </button>
                </div>
                {updateInfo.updateAvailable && (
                  <div style={{ marginTop: '1.25rem' }}>
                    <button className="btn btn-primary" style={{ width: '100%', padding: '0.6rem', fontSize: '0.95rem', fontWeight: 600, boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)' }} onClick={performReboot}>
                      🚀 1-Click Update NextJS
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius)' }}>
              <div>
                <span style={{ fontWeight: 600, color: updateInfo.updateAvailable ? 'var(--error)' : 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {updateInfo.updateAvailable ? '⚠️ System architecture update is available.' : '✅ System is up to date'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn" style={{ backgroundColor: 'var(--background)' }} onClick={checkUpdates}>Check Again</button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--error)' }}>Unable to determine system state.</div>
        )}
      </div>

      {/* Database Management Card */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)' }}>
            Database Management
            </h2>
            <div style={{ display: 'flex', gap: '1rem' }}>
                <input type="file" accept=".sql" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileChange} />
                <button className="btn" style={{ backgroundColor: 'var(--background)' }} onClick={handleImportClick}>Import (.sql)</button>
                <button className="btn" style={{ backgroundColor: 'var(--background)' }} onClick={handleExport}>Export Backup (.sql)</button>
            </div>
        </div>

        {dbError && <div style={{ padding: '1rem', backgroundColor: 'rgba(255,50,50,0.1)', color: 'var(--error)', borderRadius: 'var(--radius)', marginBottom: '1.5rem', fontWeight: 500 }}>{dbError}</div>}
        {dbSuccess && <div style={{ padding: '1rem', backgroundColor: 'rgba(50,255,50,0.1)', color: 'var(--success)', borderRadius: 'var(--radius)', marginBottom: '1.5rem', fontWeight: 500 }}>{dbSuccess}</div>}

        {dbLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading configuration...</div>
        ) : (
            <form onSubmit={confirmDbSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div>
                        <label className="label" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Host</label>
                        <input className="input" type="text" value={dbConfig.host} onChange={e => setDbConfig({...dbConfig, host: e.target.value})} required />
                    </div>
                    <div>
                        <label className="label" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Port</label>
                        <input className="input" type="text" value={dbConfig.port} onChange={e => setDbConfig({...dbConfig, port: e.target.value})} required />
                    </div>
                    <div>
                        <label className="label" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Username</label>
                        <input className="input" type="text" value={dbConfig.user} onChange={e => setDbConfig({...dbConfig, user: e.target.value})} required />
                    </div>
                    <div>
                        <label className="label" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Password <span style={{ color: 'var(--primary)', fontWeight: 400 }}>(Leave blank to keep current)</span></label>
                        <input className="input" type="password" placeholder="••••••••" value={dbConfig.password} onChange={e => setDbConfig({...dbConfig, password: e.target.value})} />
                    </div>
                </div>
                
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', display: 'flex', alignItems: 'flex-end', gap: '1.5rem' }}>
                    <div style={{ flex: 1 }}>
                        <label className="label" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Target Database Name</label>
                        <input className="input" type="text" value={dbConfig.database} onChange={e => setDbConfig({...dbConfig, database: e.target.value})} required />
                    </div>
                    <div style={{ paddingBottom: '0.2rem' }}>
                        {!showCreateDb ? (
                            <button type="button" className="btn" style={{ backgroundColor: 'var(--background)' }} onClick={() => setShowCreateDb(true)}>+ Provision New Database</button>
                        ) : (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input className="input" type="text" placeholder="new_db_name" value={newDbName} onChange={e => setNewDbName(e.target.value)} />
                                <button type="button" className="btn btn-primary" onClick={handleDbCreate} disabled={creatingDb}>{creatingDb ? 'Creating...' : 'Create'}</button>
                                <button type="button" className="btn" style={{ backgroundColor: 'transparent' }} onClick={() => setShowCreateDb(false)}>Cancel</button>
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                    <button type="button" className="btn" style={{ backgroundColor: 'var(--background)' }} onClick={handleTestConnection} disabled={testingDb}>
                      {testingDb ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button type="submit" className="btn btn-primary">Apply Configuration</button>
                </div>
            </form>
        )}
      </div>

    </div>
  );
}
