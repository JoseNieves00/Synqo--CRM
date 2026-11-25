'use client';

import React from 'react';
import Link from 'next/link';
import {
  Camera,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  Send,
  Square,
  X,
} from 'lucide-react';
import type { GalleryPhotoItem } from '@/lib/media/format';
import type { GroupedProductGallery } from '@/lib/ai/product-gallery';

interface GalleryCatalogPopoverProps {
  menuRef: React.RefObject<HTMLDivElement>;
  catalogItems: GalleryPhotoItem[];
  groupedCatalog: GroupedProductGallery[];
  filteredCatalog: GroupedProductGallery[];
  catalogSearch: string;
  setCatalogSearch: (v: string) => void;
  selectedCatalogPhotoIds: string[];
  setSelectedCatalogPhotoIds: (ids: string[]) => void;
  expandedProductGroup: string | null;
  setExpandedProductGroup: (name: string | null) => void;
  isSendingCatalogPhoto: string | null;
  batchSendProgress: { current: number; total: number } | null;
  onClose: () => void;
  onToggleSelectPhoto: (id: string) => void;
  onSendSingle: (photo: GalleryPhotoItem) => void;
  onSendBatch: (photos: GalleryPhotoItem[]) => void;
}

export function GalleryCatalogPopover({
  menuRef,
  catalogItems,
  groupedCatalog,
  filteredCatalog,
  catalogSearch,
  setCatalogSearch,
  selectedCatalogPhotoIds,
  setSelectedCatalogPhotoIds,
  expandedProductGroup,
  setExpandedProductGroup,
  isSendingCatalogPhoto,
  batchSendProgress,
  onClose,
  onToggleSelectPhoto,
  onSendSingle,
  onSendBatch,
}: GalleryCatalogPopoverProps) {
  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-3 mb-2 z-40 w-88 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl shadow-2xl p-3 space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150 text-slate-900 dark:text-slate-100"
    >
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#1E2433] px-0.5">
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-md bg-blue-500/10 flex items-center justify-center text-[#0052FF] dark:text-[#00D2FF]">
            <Camera className="w-3.5 h-3.5" />
          </span>
          <span>Galería &amp; Catálogo</span>
          {catalogItems.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-blue-100 dark:bg-blue-900/50 text-[#0052FF] dark:text-[#00D2FF]">
              {catalogItems.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <Link
            href="/settings"
            className="text-[11px] font-medium text-[#0052FF] dark:text-[#00D2FF] hover:underline"
            title="Vincular fotos en Ajustes"
          >
            Ajustes
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre, tag o modelo..."
        value={catalogSearch}
        onChange={(e) => setCatalogSearch(e.target.value)}
        className="w-full text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1.5 focus:ring-[#0052FF]"
        autoFocus
      />

      {groupedCatalog.length > 0 && (
        <div className="flex items-center justify-between gap-1.5 px-2 py-1.5 bg-slate-50 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] rounded-xl text-xs">
          <button
            type="button"
            onClick={() => {
              const allHeroIds = filteredCatalog.map((p) => p.primaryPhoto.id);
              const allSelected = allHeroIds.length > 0 && allHeroIds.every((id) => selectedCatalogPhotoIds.includes(id));
              setSelectedCatalogPhotoIds(allSelected ? [] : allHeroIds);
            }}
            disabled={Boolean(batchSendProgress) || Boolean(isSendingCatalogPhoto)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-[#0052FF] dark:hover:text-[#00D2FF] transition cursor-pointer select-none"
          >
            {selectedCatalogPhotoIds.length > 0 &&
            filteredCatalog.map((p) => p.primaryPhoto.id).every((id) => selectedCatalogPhotoIds.includes(id)) ? (
              <>
                <CheckSquare className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                <span>Deseleccionar</span>
              </>
            ) : (
              <>
                <Square className="w-3.5 h-3.5 text-slate-400" />
                <span>Seleccionar todos</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-1.5">
            {selectedCatalogPhotoIds.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  const selectedPhotos = catalogItems.filter((item) =>
                    selectedCatalogPhotoIds.includes(item.id)
                  );
                  onSendBatch(selectedPhotos);
                }}
                disabled={Boolean(batchSendProgress) || Boolean(isSendingCatalogPhoto)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0052FF] hover:bg-[#0047E0] text-white text-[11px] font-bold shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                {batchSendProgress ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Enviando {batchSendProgress.current}/{batchSendProgress.total}...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3" />
                    <span>Enviar seleccionados ({selectedCatalogPhotoIds.length})</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const allHeroPhotos = filteredCatalog.map((p) => p.primaryPhoto);
                  onSendBatch(allHeroPhotos);
                }}
                disabled={Boolean(batchSendProgress) || Boolean(isSendingCatalogPhoto) || filteredCatalog.length === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-[#0052FF] dark:text-[#00D2FF] hover:bg-[#0052FF] hover:text-white border border-blue-200 dark:border-blue-900/60 text-[11px] font-bold transition disabled:opacity-50 cursor-pointer"
                title="Enviar todas las fotos principales del catálogo"
              >
                {batchSendProgress ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Enviando {batchSendProgress.current}/{batchSendProgress.total}...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3" />
                    <span>Enviar todos ({filteredCatalog.length})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {groupedCatalog.length === 0 ? (
        <div className="py-5 px-3 text-center space-y-2">
          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] flex items-center justify-center mx-auto text-slate-400">
            <Camera className="w-4 h-4" />
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            No hay fotos vinculadas en el catálogo.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0052FF] dark:text-[#00D2FF] hover:underline"
          >
            Vincular fotos en Ajustes &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
          {filteredCatalog.map((prod) => {
            const isExpanded = expandedProductGroup === prod.productName;
            const hasAlternates = prod.alternatePhotos.length > 0;
            const heroPhoto = prod.primaryPhoto;
            const isHeroSelected = selectedCatalogPhotoIds.includes(heroPhoto.id);

            return (
              <div
                key={prod.id}
                className="p-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#090A0F]/50 transition space-y-2"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleSelectPhoto(heroPhoto.id)}
                    className="text-slate-400 hover:text-[#0052FF] transition cursor-pointer p-0.5 shrink-0"
                    title={isHeroSelected ? 'Deseleccionar' : 'Seleccionar foto'}
                  >
                    {isHeroSelected ? (
                      <CheckSquare className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    )}
                  </button>

                  <div className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={heroPhoto.url}
                      alt={prod.productName}
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-[#232A3B]"
                    />
                    <span
                      className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center text-[9px] font-black shadow-sm"
                      title="Foto de Portada / Principal"
                    >
                      ★
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[130px]" title={prod.productName}>
                        {prod.productName}
                      </span>
                      {hasAlternates && (
                        <button
                          type="button"
                          onClick={() => setExpandedProductGroup(isExpanded ? null : prod.productName)}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 dark:bg-blue-900/40 text-[#0052FF] dark:text-[#00D2FF] hover:bg-blue-200 transition"
                          title="Ver ángulos alternos"
                        >
                          <Layers className="w-2.5 h-2.5" />
                          <span>{prod.allPhotos.length} fotos</span>
                          {isExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                      )}
                    </div>
                    {prod.price && (
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 block">
                        {prod.price}
                      </span>
                    )}
                    {prod.keywords && prod.keywords.length > 0 && (
                      <p className="text-[9px] text-slate-400 truncate">
                        {prod.keywords.slice(0, 2).map((k) => `#${k}`).join(' ')}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onSendSingle(heroPhoto)}
                    disabled={Boolean(isSendingCatalogPhoto) || Boolean(batchSendProgress)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#0052FF] hover:bg-[#0047E0] text-white text-[11px] font-bold shrink-0 transition cursor-pointer disabled:opacity-50 shadow-sm"
                    title="Enviar foto principal por WhatsApp"
                  >
                    {isSendingCatalogPhoto === heroPhoto.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      'Enviar'
                    )}
                  </button>
                </div>

                {hasAlternates && isExpanded && (
                  <div className="pt-2 border-t border-slate-200/70 dark:border-[#232A3B]/70 space-y-1.5 animate-in fade-in duration-150">
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block px-0.5">
                      Fotos adicionales de este producto:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {prod.alternatePhotos.map((altPhoto, altIdx) => {
                        const isAltSelected = selectedCatalogPhotoIds.includes(altPhoto.id);
                        return (
                          <div
                            key={altPhoto.id}
                            className="flex items-center gap-1.5 p-1 rounded-lg bg-white dark:bg-[#131722] border border-slate-200/80 dark:border-[#232A3B]"
                          >
                            <button
                              type="button"
                              onClick={() => onToggleSelectPhoto(altPhoto.id)}
                              className="text-slate-400 hover:text-[#0052FF] transition cursor-pointer shrink-0"
                              title={isAltSelected ? 'Deseleccionar' : 'Seleccionar foto'}
                            >
                              {isAltSelected ? (
                                <CheckSquare className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                              ) : (
                                <Square className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                              )}
                            </button>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={altPhoto.url}
                              alt={`Foto ${altIdx + 2}`}
                              className="w-8 h-8 rounded-md object-cover border border-slate-200 dark:border-[#232A3B] shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-[9px] font-bold text-slate-700 dark:text-slate-300 truncate block">
                                Foto {altIdx + 2}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => onSendSingle(altPhoto)}
                              disabled={Boolean(isSendingCatalogPhoto) || Boolean(batchSendProgress)}
                              className="px-1.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-200 text-[9px] font-bold transition shrink-0"
                              title={`Enviar Foto ${altIdx + 2}`}
                            >
                              {isSendingCatalogPhoto === altPhoto.id ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                'Enviar'
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
