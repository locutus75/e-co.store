"use client";
import React, { useEffect, useState, useTransition } from 'react';
import ProductGallery from './ProductGallery';
import { updateProductAction } from '@/app/actions/product';

export default function ProductDrawer({ product, isOpen, onClose, fieldPermissions }: { product: any, isOpen: boolean, onClose: () => void, fieldPermissions?: Record<string, string> }) {
  const [isPending, startTransition] = useTransition();

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      if(product?.internalArticleNumber) {
        await updateProductAction(product.internalArticleNumber, formData);
        onClose();
      }
    });
  };

  return (
    <>
      {/* Backdrop overlay */}
      {isOpen && (
        <div 
          onClick={onClose}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)', zIndex: 40, backdropFilter: 'blur(2px)' }} 
        />
      )}

      {/* Drawer */}
      <form action={handleSubmit} className="glass" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'calc(100vw - 250px)',
        backgroundColor: 'var(--surface)',
        zIndex: 50,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        overflowY: 'auto',
        boxShadow: '-10px 0 30px rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column'
      }}>
        {product && (
          <>
            <div style={{ padding: '2rem 3rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: 'rgba(255,255,255,0.95)', zIndex: 10, backdropFilter: 'blur(8px)' }}>
              <div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)' }}>Edit Product #{product.internalArticleNumber}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '1rem', color: 'var(--color-mustard)', fontWeight: 600 }}>{product.title}</span>
                  <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', backgroundColor: (product.status || 'NEW').toUpperCase() === 'CHECK' ? '#3b82f6' : 'var(--primary)', color: 'white', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                    {(product.status || 'NEW').toUpperCase()}
                  </span>
                </div>
              </div>
              <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.75rem', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {(() => {
               const renderField = (moduleName: string, label: string, val: string, inputComponent: React.ReactNode) => {
                 let action = fieldPermissions?.[moduleName] ?? 'READ';
                 if (action === 'HIDDEN') return null;
                 
                 return (
                   <div>
                     <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>{label}</label>
                     {action === 'READ' ? (
                       <div className="input" style={{ backgroundColor: 'rgba(0,0,0,0.02)', color: 'var(--text-muted)', cursor: 'not-allowed', border: '1px solid rgba(0,0,0,0.05)' }}>
                         {val || '-'}
                       </div>
                     ) : (
                       inputComponent
                     )}
                   </div>
                 );
               };

               return (
                 <>
                   <div style={{ padding: '3rem', display: 'flex', flexDirection: 'column', gap: '3.5rem' }}>
                     <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '3rem' }}>
                       {/* Basis Informatie */}
                       <section>
                         <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--primary-hover)', marginBottom: '1.5rem', borderBottom: '2px solid var(--primary)', paddingBottom: '0.5rem', display: 'inline-block' }}>Webshop Content (Basis)</h3>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                           
                           {renderField('FIELD:internalArticleNumber', 'Interne Artikelcode', product.internalArticleNumber, <input name="internalArticleNumber" className="input" defaultValue={product.internalArticleNumber} readOnly style={{ backgroundColor: 'rgba(0,0,0,0.02)' }} />)}
                           {renderField('FIELD:ean', 'EAN Code', product.ean, <input name="ean" className="input" defaultValue={product.ean || ''} placeholder="13-cijferige streepjescode" />)}
                           {renderField('FIELD:title', 'Titel (Title)', product.title, <input name="title" className="input" defaultValue={product.title || ''} required />)}
                           {renderField('FIELD:seoTitle', 'SEO Titel', product.seoTitle, <input name="seoTitle" className="input" defaultValue={product.seoTitle || ''} placeholder="Merk - Omschrijving (inhoud)" />)}
                           {renderField('FIELD:price', 'Basis Prijs (€)', product.basePrice?.toString(), <input name="basePrice" type="number" step="0.01" className="input" defaultValue={product.basePrice ?? ''} placeholder="0.00" />)}
                           {renderField('FIELD:description', 'Lange Omschrijving', product.longDescription, <textarea name="longDescription" className="input" rows={6} defaultValue={product.longDescription || ''} placeholder="Volledige omschrijving..." />)}
                           
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                             <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}>
                               <input type="checkbox" name="webshopActive" defaultChecked={product.webshopActive} /> Webshop (Actief op shop)
                             </label>
                             <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}>
                               <input type="checkbox" name="systemActive" defaultChecked={product.systemActive} /> Actief (In systeem)
                             </label>
                           </div>
                           
                           <ProductGallery articleNumber={product.internalArticleNumber} />
                         </div>
                       </section>

                  {/* Fysieke Eigenschappen */}
                  <section>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-mustard)', marginBottom: '1.5rem', borderBottom: '2px solid var(--color-mustard)', paddingBottom: '0.5rem', display: 'inline-block' }}>Fysieke Eigenschappen</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
                      <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Gewicht (gr)</label><input type="number" name="weightGr" className="input" defaultValue={product.weightGr ?? ''} /></div>
                      <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Lengte (cm)</label><input type="number" name="lengthCm" className="input" defaultValue={product.lengthCm ?? ''} /></div>
                      <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Breedte (cm)</label><input type="number" name="widthCm" className="input" defaultValue={product.widthCm ?? ''} /></div>
                      <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Hoogte (cm)</label><input type="number" name="heightCm" className="input" defaultValue={product.heightCm ?? ''} /></div>
                      <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Inhoud (ml)</label><input type="number" name="volumeMl" className="input" defaultValue={product.volumeMl ?? ''} /></div>
                      <div><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Inhoud (gr)</label><input type="number" name="volumeGr" className="input" defaultValue={product.volumeGr ?? ''} /></div>
                      <div style={{ gridColumn: 'span 3' }}><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Kleur</label><input name="color" className="input" defaultValue={product.color || ''} placeholder="Basiskleur" /></div>
                      <div style={{ gridColumn: 'span 3' }}><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Hoofdmateriaal</label><input name="mainMaterial" className="input" defaultValue={product.mainMaterial || ''} placeholder="Hout, glas, plastic..." /></div>
                      <div style={{ gridColumn: 'span 3' }}><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Ingrediënten</label><textarea name="ingredients" className="input" rows={2} defaultValue={product.ingredients || ''} /></div>
                      <div style={{ gridColumn: 'span 3' }}><label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Allergenen</label><textarea name="allergens" className="input" rows={2} defaultValue={product.allergens || ''} /></div>
                    </div>
                  </section>
                </div>

                {/* Duurzaamheidscriteria */}
                <section>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-sage)', marginBottom: '1.5rem', borderBottom: '2px solid var(--color-sage)', paddingBottom: '0.5rem', display: 'inline-block' }}>Duurzaamheidscriteria</h3>
                  
                  <div style={{ padding: '2rem', backgroundColor: 'rgba(150, 183, 148, 0.05)', borderRadius: 'var(--radius)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '3rem', border: '1px solid rgba(150, 183, 148, 0.2)' }}>
                    
                    {/* Mens & Dier */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Mens</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critMensSafeWork" defaultChecked={product.critMensSafeWork === 'Ja'} /> Veilig werkomgeving (Slaafvrij / kindvrij)</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critMensFairWage" defaultChecked={product.critMensFairWage === 'Ja'} /> Eerlijk loon</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critMensSocialCheck" defaultChecked={product.critMensSocial === 'Ja'} /> Maatschappelijke betrokkenheid (e.g. Sociale werkplaats)</label>
                        </div>
                      </div>

                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Dier</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critDierCrueltyFree" defaultChecked={product.critDierCrueltyFree === 'Ja'} /> Diervrij (Veganistisch)</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critDierFriendly" defaultChecked={product.critDierFriendly === 'Ja'} /> Diervriendelijk (Biologisch / dierproefvrij)</label>
                        </div>
                      </div>

                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Verificatie</h4>
                        <div style={{ marginTop: '0.5rem' }}>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Leverancier benaderd (Criteria Ja/Nee)</label>
                          <input name="supplierContacted" className="input" defaultValue={product.supplierContacted || ''} placeholder="JA of JA, 2x" />
                        </div>
                      </div>
                    </div>

                    {/* Milieu, Transport, Bewerking */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                      
                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Milieu</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critMilieuPackagingFree" defaultChecked={product.critMilieuPackagingFree === 'Ja'} /> Verpakkingsvrij</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critMilieuPlasticFree" defaultChecked={product.critMilieuPlasticFree === 'Ja'} /> Plastic vrij</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critMilieuRecyclable" defaultChecked={product.critMilieuRecyclable === 'Ja'} /> Recyclebaar</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critMilieuBiodegradable" defaultChecked={product.critMilieuBiodegradable === 'Ja'} /> Afbreekbaar</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critMilieuCompostable" defaultChecked={product.critMilieuCompostable === 'Ja'} /> Composteerbaar</label>
                        </div>
                      </div>

                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Bewerking</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critHandmade" defaultChecked={product.critHandmade === 'Ja'} /> Handgemaakt</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critNatural" defaultChecked={product.critNatural === 'Ja'} /> Natuurlijk (Natuurkracht)</label>
                          <div style={{ marginTop: '0.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Hergebruik / Gerecycled</label>
                            <input name="critCircular" className="input" defaultValue={product.critCircular || ''} placeholder="Circulair, Upcycled, Tweedehands..." />
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Transport & Overig</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Afstand (km)</label>
                            <input type="number" name="critTransportDistance" className="input" defaultValue={product.critTransportDistance ?? ''} placeholder="KM nr" />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Vervoersmiddel</label>
                            <input name="critTransportVehicle" className="input" defaultValue={product.critTransportVehicle || ''} placeholder="Boot, vrachtwagen..." />
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}><input type="checkbox" name="critMilieuCarbonCompensated" defaultChecked={product.critMilieuCarbonCompensated === 'Ja'} /> Uitstootcompensatie</label>
                          </div>
                          <div style={{ gridColumn: 'span 2', marginTop: '0.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Overige vermelding</label>
                            <textarea name="critOther" className="input" rows={2} defaultValue={product.critOther || ''} placeholder="Extra leverancier informatie..." />
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                </section>

              </div>

              <div style={{ padding: '1.5rem 3rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', backgroundColor: 'var(--surface-hover)', marginTop: 'auto', position: 'sticky', bottom: 0, zIndex: 10 }}>
                <button type="button" onClick={onClose} className="btn" style={{ backgroundColor: 'white', border: '1px solid var(--border)', color: 'var(--text)' }} disabled={isPending}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ boxShadow: '0 4px 14px rgba(225, 191, 220, 0.4)' }} disabled={isPending}>
                  {isPending ? 'Saving...' : 'Save Content'}
                </button>
              </div>
                 </>
               );
            })()}

          </>
        )}
      </form>
    </>
  );
}
