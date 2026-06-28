"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { 
  getProductsForExportAction, 
  markProductsAsExportedAction, 
  saveExportProfilesAction,
  clearExportFolderAction
} from "@/app/actions/export";

interface FieldDefinition {
  key: string;
  label: string;
  type: string;
}

interface ExportProfile {
  id: string;
  name: string;
  columns: { field: string; header: string }[];
}

interface ExportClientProps {
  brands: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  stats: {
    total: number;
    exported: number;
    neverExported: number;
  };
  initialProfiles: ExportProfile[];
  exportableFields: FieldDefinition[];
}

const DEFAULT_MAPPING = [
  { field: 'internalArticleNumber', header: 'Artikelnummer' },
  { field: 'ean', header: 'EAN' },
  { field: 'title', header: 'Omschrijving' },
  { field: 'basePrice', header: 'Verkoopprijs' },
  { field: 'rel_brand', header: 'Merk' },
  { field: 'rel_category', header: 'Hoofdcategorie' },
  { field: 'rel_subcategory', header: 'Subcategorie' }
];

export default function ExportClient({
  brands,
  suppliers,
  stats,
  initialProfiles,
  exportableFields
}: ExportClientProps) {
  // Stepper state
  const [step, setStep] = useState(1); // 1: Filters, 2: Columns, 3: Exporting, 4: Finished

  // Profiles State
  const [profiles, setProfiles] = useState<ExportProfile[]>(initialProfiles);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("default");
  const [newProfileName, setNewProfileName] = useState("");
  const [showSaveProfileModal, setShowSaveProfileModal] = useState(false);
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const showNotification = (type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    if (type !== "error") {
      setTimeout(() => {
        setNotification(prev => {
          if (prev?.message === message) return null;
          return prev;
        });
      }, 4000);
    }
  };

  // Filters State
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterReady, setFilterReady] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [onlyNotExported, setOnlyNotExported] = useState(false);

  // Loaded products list & status
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsToExport, setProductsToExport] = useState<any[]>([]);
  const [productsError, setProductsError] = useState<string | null>(null);

  // Column selection state
  // Mapping of field.key -> { selected: boolean, header: string }
  const [columnMapping, setColumnMapping] = useState<Record<string, { selected: boolean; header: string }>>({});

  // Export process state
  const [exportProgress, setExportProgress] = useState<{
    phase: "idle" | "preparing" | "photos" | "excel" | "marking" | "done" | "error";
    totalImages: number;
    currentImageIndex: number;
    currentImageName: string;
    errors: string[];
  }>({
    phase: "idle",
    totalImages: 0,
    currentImageIndex: 0,
    currentImageName: "",
    errors: []
  });

  const [excelDownloadUrl, setExcelDownloadUrl] = useState<string | null>(null);
  const [excelFilename, setExcelFilename] = useState<string>("");
  const [exportedCount, setExportedCount] = useState(0);

  // 1. Initialize mappings when selected profile changes
  useEffect(() => {
    const activeProfile = profiles.find(p => p.id === selectedProfileId);
    const initialMap: Record<string, { selected: boolean; header: string }> = {};

    // First disable/empty all
    exportableFields.forEach(f => {
      initialMap[f.key] = { selected: false, header: f.label };
    });

    if (activeProfile) {
      activeProfile.columns.forEach(col => {
        if (initialMap[col.field]) {
          initialMap[col.field] = { selected: true, header: col.header };
        }
      });
    } else {
      // Default fallback mapping
      DEFAULT_MAPPING.forEach(col => {
        if (initialMap[col.field]) {
          initialMap[col.field] = { selected: true, header: col.header };
        }
      });
    }

    setColumnMapping(initialMap);
  }, [selectedProfileId, profiles, exportableFields]);

  // 2. Fetch products count and preview on Step 1 load or filter change
  const fetchMatchingProducts = async () => {
    setLoadingProducts(true);
    setProductsError(null);
    try {
      const res = await getProductsForExportAction({
        status: filterStatus === "all" ? undefined : filterStatus,
        readyForImport: filterReady === "all" ? undefined : filterReady,
        brandId: filterBrand === "all" ? undefined : filterBrand,
        supplierId: filterSupplier === "all" ? undefined : filterSupplier,
        onlyNotExported
      });

      if (res.error) {
        setProductsError(res.error);
        setProductsToExport([]);
      } else if (res.products) {
        setProductsToExport(res.products);
      }
    } catch (e: any) {
      setProductsError(e.message || "Fout bij laden van producten.");
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    if (step === 1) {
      fetchMatchingProducts();
    }
  }, [filterStatus, filterReady, filterBrand, filterSupplier, onlyNotExported, step]);

  // Helper for step progression
  const nextStep = () => {
    if (step === 1 && productsToExport.length === 0) {
      showNotification("error", "Geen producten gevonden die aan de filters voldoen.");
      return;
    }
    setStep(prev => prev + 1);
  };

  const prevStep = () => {
    setStep(prev => prev - 1);
  };

  // Toggle field selection
  const handleToggleField = (key: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        selected: !prev[key]?.selected
      }
    }));
  };

  // Edit field header label
  const handleHeaderChange = (key: string, newHeader: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        header: newHeader
      }
    }));
  };

  // Select all or none
  const handleSelectAll = (select: boolean) => {
    const updated = { ...columnMapping };
    Object.keys(updated).forEach(k => {
      updated[k] = { ...updated[k], selected: select };
    });
    setColumnMapping(updated);
  };

  // Save profile
  const handleSaveProfile = async () => {
    if (!newProfileName.trim()) {
      showNotification("error", "Voer een profielnaam in.");
      return;
    }

    const newProfileId = newProfileName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const activeColumns = Object.entries(columnMapping)
      .filter(([_, value]) => value.selected)
      .map(([key, value]) => ({
        field: key,
        header: value.header
      }));

    const newProfile: ExportProfile = {
      id: newProfileId,
      name: newProfileName,
      columns: activeColumns
    };

    const updatedProfiles = [...profiles.filter(p => p.id !== newProfileId), newProfile];
    
    const res = await saveExportProfilesAction(updatedProfiles);
    if (res.error) {
      showNotification("error", "Fout bij opslaan: " + res.error);
    } else {
      setProfiles(updatedProfiles);
      setSelectedProfileId(newProfileId);
      setShowSaveProfileModal(false);
      setNewProfileName("");
      showNotification("success", `Profiel "${newProfileName}" succesvol opgeslagen!`);
    }
  };

  // Delete profile execution
  const handleDeleteProfile = async () => {
    if (selectedProfileId === "default") {
      showNotification("error", "Het standaard profiel kan niet worden verwijderd.");
      return;
    }

    const updatedProfiles = profiles.filter(p => p.id !== selectedProfileId);
    const res = await saveExportProfilesAction(updatedProfiles);
    if (res.error) {
      showNotification("error", "Fout bij verwijderen: " + res.error);
    } else {
      setProfiles(updatedProfiles);
      setSelectedProfileId("default");
      showNotification("success", "Profiel succesvol verwijderd.");
    }
    setConfirmDeleteProfile(false);
  };

  // Helper function to convert client-side image to PNG Blob using Canvas
  const convertImageToPngBlob = async (imageUrl: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas 2D context retrieval failed."));
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to export Canvas to PNG Blob."));
          }, "image/png");
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => {
        reject(new Error(`Failed to load image from URL: ${imageUrl}`));
      };
      img.src = imageUrl;
    });
  };

  // Perform full export process
  const runExportProcess = async () => {
    setStep(3);
    setExportProgress({
      phase: "preparing",
      totalImages: 0,
      currentImageIndex: 0,
      currentImageName: "",
      errors: []
    });

    const selectedFields = Object.entries(columnMapping)
      .filter(([_, val]) => val.selected)
      .map(([key, val]) => ({ key, header: val.header }));

    if (selectedFields.length === 0) {
      setExportProgress(prev => ({
        ...prev,
        phase: "error",
        errors: ["Geen kolommen geselecteerd voor export. Ga terug en selecteer ten minste één kolom."]
      }));
      return;
    }

    try {
      // 1. Clear server export directory first
      await clearExportFolderAction();

      // 2. Identify all photos that need copy and conversion
      const photoTasks: { productNum: string; url: string; targetName: string }[] = [];
      productsToExport.forEach(p => {
        if (p.images && p.images.length > 0) {
          p.images.forEach((img: any, idx: number) => {
            photoTasks.push({
              productNum: p.internalArticleNumber,
              url: img.url,
              // Format: <productnummer>-<opvolgnummer>.png (1-based index)
              targetName: `${p.internalArticleNumber}-${idx + 1}.png`
            });
          });
        }
      });

      setExportProgress(prev => ({
        ...prev,
        phase: "photos",
        totalImages: photoTasks.length,
        currentImageIndex: 0
      }));

      // 3. Process photos one by one (or in small chunks)
      const failedPhotos: string[] = [];
      for (let i = 0; i < photoTasks.length; i++) {
        const task = photoTasks[i];
        setExportProgress(prev => ({
          ...prev,
          currentImageIndex: i + 1,
          currentImageName: task.targetName
        }));

        try {
          // Convert to PNG Blob in client browser
          const pngBlob = await convertImageToPngBlob(task.url);

          // POST PNG to server
          const response = await fetch(`/api/export/save-image?filename=${encodeURIComponent(task.targetName)}`, {
            method: "POST",
            headers: {
              "Content-Type": "image/png"
            },
            body: pngBlob
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || `HTTP error ${response.status}`);
          }
        } catch (e: any) {
          console.warn(`Failed to export image ${task.targetName}:`, e.message);
          failedPhotos.push(`${task.targetName}: ${e.message}`);
        }
      }

      // 4. Generate Excel Sheet
      setExportProgress(prev => ({
        ...prev,
        phase: "excel",
        errors: failedPhotos.length > 0 ? [...prev.errors, ...failedPhotos] : prev.errors
      }));

      const excelData = productsToExport.map(p => {
        const row: Record<string, any> = {};
        
        selectedFields.forEach(field => {
          let value = "";
          
          if (field.key.startsWith("custom_")) {
            const customKey = field.key.replace("custom_", "");
            value = p.customData?.[customKey] ?? "";
          } else if (field.key === "rel_brand") {
            value = p.brand?.name ?? "";
          } else if (field.key === "rel_supplier") {
            value = p.supplier?.name ?? "";
          } else if (field.key === "rel_category") {
            value = p.category?.name ?? "";
          } else if (field.key === "rel_subcategory") {
            value = p.subcategory?.name ?? "";
          } else {
            // Standard direct field
            const rawVal = p[field.key];
            if (rawVal === true) value = "JA";
            else if (rawVal === false) value = "NEE";
            else if (rawVal != null) value = String(rawVal);
          }

          row[field.header] = value;
        });

        return row;
      });

      // Construct Workbook
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Producten");

      // Generate local download
      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `mpluskassa_export_${dateStr}.xlsx`;
      
      // We will trigger download locally
      XLSX.writeFile(workbook, filename);
      setExcelFilename(filename);

      // 5. Update Database Export Status
      setExportProgress(prev => ({ ...prev, phase: "marking" }));
      const productIds = productsToExport.map(p => p.id);
      
      const markRes = await markProductsAsExportedAction(productIds);
      if (markRes.error) {
        throw new Error(markRes.error);
      }

      setExportedCount(productsToExport.length);
      setExportProgress(prev => ({ ...prev, phase: "done" }));
      setStep(4);
    } catch (err: any) {
      console.error("Export process failed:", err);
      setExportProgress(prev => ({
        ...prev,
        phase: "error",
        errors: [...prev.errors, err.message || "Unknown error during export."]
      }));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%', maxWidth: '1200px' }}>
      
      {/* In-app Notification Banner */}
      {notification && (
        <div style={{
          padding: '1rem 1.5rem',
          borderRadius: 'var(--radius)',
          backgroundColor: notification.type === 'success' ? 'rgba(150, 183, 148, 0.2)' : notification.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(51, 133, 140, 0.15)',
          border: `1px solid ${notification.type === 'success' ? 'var(--color-sage)' : notification.type === 'error' ? 'var(--error)' : 'var(--color-teal)'}`,
          color: notification.type === 'success' ? '#2f5233' : notification.type === 'error' ? '#991b1b' : '#115e59',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: 600,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          animation: 'fadeIn 0.2s ease-out',
          marginBottom: '1rem'
        }}>
          <span>{notification.message}</span>
          <button 
            onClick={() => setNotification(null)} 
            style={{ 
              background: 'none', border: 'none', cursor: 'pointer', 
              fontSize: '1.2rem', color: 'inherit', display: 'flex', 
              alignItems: 'center', padding: '0 0.25rem' 
            }}
          >
            ×
          </button>
        </div>
      )}
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
            📦 MplusKassa Export Module
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem' }}>
            Exporteer producten en gekoppelde foto's in een uniform formaat voor de kassa database.
          </p>
        </div>
      </div>

      {/* Stepper Wizard Indicator */}
      <div className="glass" style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5rem 2.5rem', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: step >= 1 ? 1 : 0.4 }}>
          <span style={{ 
            width: '32px', height: '32px', borderRadius: '50%', 
            backgroundColor: step === 1 ? 'var(--primary)' : 'var(--color-sage)', 
            color: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 
          }}>1</span>
          <span style={{ fontWeight: step === 1 ? 700 : 500 }}>Selectie & Filters</span>
        </div>
        <div style={{ width: '40px', height: '1px', backgroundColor: 'var(--border)', alignSelf: 'center' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: step >= 2 ? 1 : 0.4 }}>
          <span style={{ 
            width: '32px', height: '32px', borderRadius: '50%', 
            backgroundColor: step === 2 ? 'var(--primary)' : step > 2 ? 'var(--color-sage)' : 'var(--border)', 
            color: step >= 2 ? '#1e293b' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 
          }}>2</span>
          <span style={{ fontWeight: step === 2 ? 700 : 500 }}>Kolom Mapping</span>
        </div>
        <div style={{ width: '40px', height: '1px', backgroundColor: 'var(--border)', alignSelf: 'center' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: step >= 3 ? 1 : 0.4 }}>
          <span style={{ 
            width: '32px', height: '32px', borderRadius: '50%', 
            backgroundColor: step === 3 ? 'var(--primary)' : step > 3 ? 'var(--color-sage)' : 'var(--border)', 
            color: step >= 3 ? '#1e293b' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 
          }}>3</span>
          <span style={{ fontWeight: step === 3 ? 700 : 500 }}>Export Uitvoeren</span>
        </div>
        <div style={{ width: '40px', height: '1px', backgroundColor: 'var(--border)', alignSelf: 'center' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: step >= 4 ? 1 : 0.4 }}>
          <span style={{ 
            width: '32px', height: '32px', borderRadius: '50%', 
            backgroundColor: step === 4 ? 'var(--color-sage)' : 'var(--border)', 
            color: step === 4 ? '#1e293b' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 
          }}>4</span>
          <span style={{ fontWeight: step === 4 ? 700 : 500 }}>Afronding</span>
        </div>
      </div>

      {/* STEP 1: FILTERS & SELECTION */}
      {step === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem' }}>
          {/* Left panel: Statistics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Database Status</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Totaal Producten</span>
                  <span style={{ fontWeight: 700 }}>{stats.total}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Reeds Geëxporteerd</span>
                  <span style={{ fontWeight: 700, color: 'var(--color-sage)' }}>{stats.exported}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Nog Niet Geëxporteerd</span>
                  <span style={{ fontWeight: 700, color: 'var(--color-mustard)' }}>{stats.neverExported}</span>
                </div>
              </div>
            </div>

            <div className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Match Resultaat</h3>
              {loadingProducts ? (
                <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem', animation: 'spin 1s linear infinite' }}>⏳</span>
                  Producten zoeken...
                </div>
              ) : productsError ? (
                <div style={{ color: 'var(--error)' }}>{productsError}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Matching producten:</span>
                    <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-teal)' }}>{productsToExport.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Gekoppelde foto's:</span>
                    <span style={{ fontWeight: 700 }}>
                      {productsToExport.reduce((sum, p) => sum + (p.images?.length ?? 0), 0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Filters Form */}
          <div className="glass" style={{ padding: '2.5rem', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Stap 1: Selecteer Producten</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Workflow Status</label>
                <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="all">Alle Statussen</option>
                  <option value="NEW">NEW</option>
                  <option value="EDIT">EDIT</option>
                  <option value="CHECK">CHECK</option>
                  <option value="DONE">DONE</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Klaar Voor Import?</label>
                <select className="input" value={filterReady} onChange={e => setFilterReady(e.target.value)}>
                  <option value="all">Alle Waarden</option>
                  <option value="JA">JA</option>
                  <option value="NEE">NEE</option>
                  <option value="REVIEW">REVIEW</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Merk</label>
                <select className="input" value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
                  <option value="all">Alle Merken</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Leverancier</label>
                <select className="input" value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}>
                  <option value="all">Alle Leveranciers</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>


            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
              <input 
                type="checkbox" 
                id="onlyNotExported" 
                checked={onlyNotExported} 
                onChange={e => setOnlyNotExported(e.target.checked)} 
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="onlyNotExported" style={{ fontWeight: 600, cursor: 'pointer' }}>
                Exporteer alleen producten die nog nooit geëxporteerd zijn
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button 
                className="btn btn-primary" 
                onClick={nextStep}
                disabled={loadingProducts || productsToExport.length === 0}
              >
                Volgende stap (Kolom selectie) →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: COLUMN MAPPING & PROFILES */}
      {step === 2 && (
        <div className="glass" style={{ padding: '2.5rem', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Header & Profiles Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>Stap 2: Kolom Selectie & Profielen</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Kies welke velden u in het Excel-bestand wilt opnemen en pas de kolomnamen aan.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Selecteer Profiel</label>
                <select 
                  className="input" 
                  value={selectedProfileId} 
                  onChange={e => setSelectedProfileId(e.target.value)}
                  style={{ width: '220px', padding: '0.5rem 0.75rem' }}
                >
                  <option value="default">Standaard Mappings</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <button 
                className="btn" 
                onClick={() => setShowSaveProfileModal(true)}
                style={{ backgroundColor: 'var(--color-lightblue)', color: '#1e293b', fontSize: '0.9rem', padding: '0.6rem 1rem' }}
              >
                💾 Opslaan als...
              </button>

              {selectedProfileId !== "default" && (
                <button 
                  className="btn" 
                  onClick={() => setConfirmDeleteProfile(true)}
                  style={{ backgroundColor: '#fee2e2', color: '#b91c1c', fontSize: '0.9rem', padding: '0.6rem 1rem' }}
                >
                  🗑️ Verwijder
                </button>
              )}
            </div>
          </div>

          {/* Quick Selection Helpers */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn" onClick={() => handleSelectAll(true)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: 'var(--border)' }}>
              Alles selecteren
            </button>
            <button className="btn" onClick={() => handleSelectAll(false)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: 'var(--border)' }}>
              Niets selecteren
            </button>
            <button className="btn" onClick={() => setColumnMapping(prev => {
              const updated = { ...prev };
              DEFAULT_MAPPING.forEach(col => {
                if (updated[col.field]) {
                  updated[col.field] = { selected: true, header: col.header };
                }
              });
              return updated;
            })} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: 'var(--border)' }}>
              Reset naar Standaard
            </button>
          </div>

          {/* Columns Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem', maxHeight: '450px', overflowY: 'auto', padding: '0.5rem' }}>
            {exportableFields.map(field => {
              const isSelected = !!columnMapping[field.key]?.selected;
              const headerVal = columnMapping[field.key]?.header ?? field.label;

              return (
                <div 
                  key={field.key} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1rem', 
                    padding: '0.75rem 1rem', 
                    borderRadius: 'var(--radius)', 
                    backgroundColor: isSelected ? 'rgba(225, 191, 220, 0.15)' : 'var(--surface)',
                    border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <input 
                    type="checkbox" 
                    id={`field-${field.key}`}
                    checked={isSelected}
                    onChange={() => handleToggleField(field.key)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label 
                      htmlFor={`field-${field.key}`} 
                      style={{ 
                        fontWeight: 600, 
                        fontSize: '0.9rem', 
                        cursor: 'pointer',
                        color: isSelected ? 'var(--text)' : 'var(--text-muted)'
                      }}
                    >
                      {field.label}
                    </label>
                    
                    {isSelected && (
                      <input 
                        type="text" 
                        className="input" 
                        value={headerVal} 
                        onChange={e => handleHeaderChange(field.key, e.target.value)}
                        placeholder="Kolomnaam in Excel"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', height: '28px' }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '1.5rem', marginTop: '1rem' }}>
            <button className="btn" onClick={prevStep} style={{ backgroundColor: 'var(--border)' }}>
              ← Terug naar filters
            </button>
            
            <button 
              className="btn btn-primary" 
              onClick={runExportProcess}
              disabled={!Object.values(columnMapping).some(v => v.selected)}
            >
              Start Exportproces 🚀
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: EXPORTING RUNNING */}
      {step === 3 && (
        <div className="glass" style={{ padding: '3rem', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', textAlign: 'center' }}>
          
          {/* Animated Spinner/Loader */}
          <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ 
              position: 'absolute', width: '100%', height: '100%', 
              borderRadius: '50%', border: '4px solid var(--border)',
              borderTopColor: 'var(--primary)',
              animation: 'spin 1s linear infinite'
            }} />
            <span style={{ fontSize: '2rem' }}>📦</span>
          </div>

          <div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              {exportProgress.phase === "preparing" && "Export voorbereiden..."}
              {exportProgress.phase === "photos" && "Productfoto's converteren & kopiëren..."}
              {exportProgress.phase === "excel" && "Excel-bestand genereren..."}
              {exportProgress.phase === "marking" && "Status bijwerken in database..."}
              {exportProgress.phase === "error" && "Export gestopt met fouten"}
            </h3>
            
            {exportProgress.phase === "photos" && (
              <p style={{ color: 'var(--text-muted)' }}>
                Foto: <strong>{exportProgress.currentImageName}</strong> ({exportProgress.currentImageIndex} van {exportProgress.totalImages})
              </p>
            )}

            {exportProgress.phase === "excel" && (
              <p style={{ color: 'var(--text-muted)' }}>Rijen vullen en Excel download aanroepen...</p>
            )}

            {exportProgress.phase === "marking" && (
              <p style={{ color: 'var(--text-muted)' }}>De 'exportStatus' in de database markeren...</p>
            )}
          </div>

          {/* Progress bar */}
          {exportProgress.phase === "photos" && exportProgress.totalImages > 0 && (
            <div style={{ width: '100%', maxWidth: '500px', height: '10px', backgroundColor: 'var(--border)', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                backgroundColor: 'var(--primary)', 
                width: `${(exportProgress.currentImageIndex / exportProgress.totalImages) * 100}%`,
                transition: 'width 0.2s ease'
              }} />
            </div>
          )}

          {/* Errors log if any */}
          {exportProgress.errors.length > 0 && (
            <div style={{ 
              width: '100%', maxWidth: '600px', 
              backgroundColor: '#fef2f2', border: '1px solid #fee2e2', 
              borderRadius: 'var(--radius)', padding: '1rem',
              textAlign: 'left', maxHeight: '150px', overflowY: 'auto'
            }}>
              <strong style={{ color: '#991b1b', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                Waarschuwingen / Fouten ({exportProgress.errors.length}):
              </strong>
              <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.8rem', color: '#7f1d1d' }}>
                {exportProgress.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {exportProgress.phase === "error" && (
            <button className="btn" onClick={() => setStep(2)} style={{ backgroundColor: 'var(--border)', marginTop: '1rem' }}>
              ← Terug en aanpassen
            </button>
          )}
        </div>
      )}

      {/* STEP 4: FINISHED */}
      {step === 4 && (
        <div className="glass" style={{ padding: '3.5rem 3rem', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.5rem', textAlign: 'center' }}>
          
          <div style={{ 
            width: '80px', height: '80px', borderRadius: '50%', 
            backgroundColor: 'rgba(150, 183, 148, 0.2)', 
            color: 'var(--color-sage)', display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontSize: '3rem', border: '2px solid var(--color-sage)'
          }}>
            ✓
          </div>

          <div>
            <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.5rem' }}>
              Export Succesvol Afgerond!
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
              Er zijn <strong>{exportedCount}</strong> producten geëxporteerd naar Excel en hun status is bijgewerkt. 
              Gekoppelde foto's zijn geconverteerd naar PNG en opgeslagen in de exportmap op de server.
            </p>
          </div>

          {/* Download Buttons Panel */}
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '220px' }}>
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  alert("Uw Excel bestand is reeds gedownload. Indien niet, start de export opnieuw.");
                }}
                style={{ width: '100%' }}
              >
                📊 Excel Gedownload
              </button>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{excelFilename || "mpluskassa_export.xlsx"}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '220px' }}>
              <a 
                href="/api/export/download-zip" 
                download
                className="btn"
                style={{ backgroundColor: 'var(--color-teal)', color: 'white', width: '100%' }}
              >
                🗂️ Download Foto's (ZIP)
              </a>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Alle PNG foto's gebundeld</span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', width: '100%', maxWidth: '600px', paddingTop: '1.5rem', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Server exportlocatie: <code>/public/uploads/exports/</code>
            </span>
            {exportProgress.errors.length > 0 && (
              <span style={{ fontSize: '0.85rem', color: '#b91c1c', fontWeight: 600 }}>
                Let op: er waren {exportProgress.errors.length} waarschuwingen bij het exporteren van foto's (zie browser console).
              </span>
            )}
          </div>

          <button className="btn" onClick={() => setStep(1)} style={{ backgroundColor: 'var(--border)', marginTop: '1.5rem' }}>
            Nieuwe export starten
          </button>
        </div>
      )}

      {/* SAVE PROFILE MODAL */}
      {showSaveProfileModal && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="glass" style={{ padding: '2.5rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h4 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Exportprofiel Opslaan</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Profiel Naam</label>
              <input 
                type="text" 
                className="input" 
                value={newProfileName} 
                onChange={e => setNewProfileName(e.target.value)} 
                placeholder="Bijv. MplusKassa Standaard"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
              <button className="btn" onClick={() => setShowSaveProfileModal(false)} style={{ backgroundColor: 'var(--border)' }}>
                Annuleren
              </button>
              <button className="btn btn-primary" onClick={handleSaveProfile}>
                Opslaan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE PROFILE MODAL */}
      {confirmDeleteProfile && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 110,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="glass" style={{ padding: '2.5rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h4 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#b91c1c' }}>🗑️ Profiel Verwijderen</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              Weet u zeker dat u het exportprofiel <strong>{profiles.find(p => p.id === selectedProfileId)?.name}</strong> wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
              <button className="btn" onClick={() => setConfirmDeleteProfile(false)} style={{ backgroundColor: 'var(--border)' }}>
                Annuleren
              </button>
              <button className="btn" onClick={handleDeleteProfile} style={{ backgroundColor: '#ef4444', color: 'white' }}>
                Ja, Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS for spin animation */}
      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
