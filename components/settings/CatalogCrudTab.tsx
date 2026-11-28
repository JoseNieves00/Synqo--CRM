'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  FileSpreadsheet,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Package,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { GalleryPhotoItem } from '@/lib/media/format';
import {
  canonicalGroupKey,
  groupGalleryIntoProducts,
  setPrimaryPhotoInGallery,
  type GroupedProductGallery,
} from '@/lib/ai/product-gallery';
import { getOrganizationCatalogGallery, saveAiImageGallery } from '@/app/actions/settings';
import { uploadChatMedia } from '@/app/actions/chat';
import { suggestProductCatalogAi } from '@/app/actions/ai-catalog';
import type { ImportedCatalogItem } from '@/lib/ai/prompt-assistant/file-import';

interface CatalogCrudTabProps {
  onCatalogUpdated?: (nextGallery: GalleryPhotoItem[]) => void;
}

export function CatalogCrudTab({ onCatalogUpdated }: CatalogCrudTabProps) {
  const [items, setItems] = useState<GalleryPhotoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estado del Modal CRUD de Producto
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formKeywords, setFormKeywords] = useState('');
  const [formContextRule, setFormContextRule] = useState('');
  const [formAvailable, setFormAvailable] = useState(true);
  const [formPhotos, setFormPhotos] = useState<GalleryPhotoItem[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Estado de Importación Excel/CSV con IA
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    items: ImportedCatalogItem[];
  } | null>(null);

  useEffect(() => {
    let active = true;
    getOrganizationCatalogGallery()
      .then((list) => {
        if (active) setItems(Array.isArray(list) ? list : []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const groupedProducts = useMemo(() => groupGalleryIntoProducts(items), [items]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groupedProducts;
    return groupedProducts.filter((p) => {
      const haystack = [
        p.productName,
        p.price || '',
        p.description || '',
        ...(p.keywords || []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [groupedProducts, searchQuery]);

  const persistCatalog = async (next: GalleryPhotoItem[], successMessage: string) => {
    setIsSaving(true);
    setFeedback(null);
    try {
      await saveAiImageGallery(next);
      setItems(next);
      onCatalogUpdated?.(next);
      setFeedback({ type: 'success', text: successMessage });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Error guardando el catálogo.' });
    } finally {
      setIsSaving(false);
    }
  };

  const openCreateModal = () => {
    setEditingGroupKey(null);
    setFormName('');
    setFormPrice('');
    setFormDescription('');
    setFormKeywords('');
    setFormContextRule('');
    setFormAvailable(true);
    setFormPhotos([]);
    setIsModalOpen(true);
  };

  const openEditModal = (product: GroupedProductGallery) => {
    setEditingGroupKey(canonicalGroupKey(product.productName));
    setFormName(product.productName);
    setFormPrice(product.price || '');
    setFormDescription(product.description || '');
    setFormKeywords((product.keywords || []).join(', '));
    setFormContextRule(product.primaryPhoto.contextRule || '');
    setFormAvailable(product.isAvailable !== false);
    setFormPhotos(product.allPhotos);
    setIsModalOpen(true);
  };

  const handleUploadProductPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadChatMedia(fd);
      if (!res?.url) throw new Error('No se recibió URL de la imagen subida.');

      const isFirst = formPhotos.length === 0;
      const newPhoto: GalleryPhotoItem = {
        id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: formName.trim() || file.name.replace(/\.[^.]+$/, ''),
        productName: formName.trim() || file.name.replace(/\.[^.]+$/, ''),
        url: res.url,
        isHero: isFirst,
        imageRole: isFirst ? 'principal' : 'alterna',
        isAvailable: formAvailable,
      };
      setFormPhotos((prev) => [...prev, newPhoto]);

      if (!formName.trim()) {
        setFormName(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Error subiendo imagen.' });
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleRunAiSuggest = async () => {
    const targetUrl = formPhotos.find((p) => p.isHero)?.url || formPhotos[0]?.url;
    if (!targetUrl) {
      setFeedback({ type: 'error', text: 'Sube al menos una foto para analizarla con IA.' });
      return;
    }
    setIsAnalyzingAi(true);
    setFeedback(null);
    try {
      const res = await suggestProductCatalogAi({
        imageUrl: targetUrl,
        productName: formName.trim() || undefined,
        description: formDescription.trim() || undefined,
      });
      if (res.success && res.data) {
        if (res.data.name) setFormName(res.data.name);
        if (res.data.description) setFormDescription(res.data.description);
        if (res.data.keywords?.length) setFormKeywords(res.data.keywords.join(', '));
        if (res.data.contextRule) setFormContextRule(res.data.contextRule);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'No se pudo analizar la imagen con IA.' });
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  const handleSaveProductModal = async () => {
    if (!formName.trim()) {
      setFeedback({ type: 'error', text: 'El nombre del producto o servicio es obligatorio.' });
      return;
    }
    if (formPhotos.length === 0) {
      setFeedback({ type: 'error', text: 'Agrega al menos una imagen para la tarjeta del catálogo.' });
      return;
    }

    const parsedKeywords = formKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const hasPrimary = formPhotos.some((p) => p.isHero);
    const mappedPhotos: GalleryPhotoItem[] = formPhotos.map((photo, idx) => {
      const isHero = hasPrimary ? Boolean(photo.isHero) : idx === 0;
      const prevRole = (photo.imageRole || '').trim();
      const nextRole = isHero
        ? 'principal'
        : prevRole.toLowerCase() === 'principal' || !prevRole
        ? `vista_${idx + 1}`
        : prevRole;
      return {
        ...photo,
        name: formName.trim(),
        productName: formName.trim(),
        price: formPrice.trim() || undefined,
        description: formDescription.trim() || undefined,
        keywords: parsedKeywords.length > 0 ? parsedKeywords : undefined,
        contextRule: formContextRule.trim() || undefined,
        isAvailable: formAvailable,
        isHero,
        imageRole: nextRole,
      };
    });

    // Garantizar que la foto principal quede SIEMPRE de primera en el arreglo del producto
    const heroPhoto = mappedPhotos.find((p) => p.isHero) || mappedPhotos[0];
    const updatedGroupPhotos: GalleryPhotoItem[] = [
      heroPhoto,
      ...mappedPhotos.filter((p) => p !== heroPhoto),
    ];

    const withoutOld = editingGroupKey
      ? items.filter((it) => canonicalGroupKey(it.productName || it.name) !== editingGroupKey)
      : items;

    const nextGallery = [...updatedGroupPhotos, ...withoutOld];
    await persistCatalog(
      nextGallery,
      editingGroupKey ? 'Producto actualizado en el catálogo y en el prompt.' : 'Producto agregado al catálogo.'
    );
    setIsModalOpen(false);
  };

  const handleDeleteProduct = async (product: GroupedProductGallery) => {
    const productKey = canonicalGroupKey(product.productName);
    const nextGallery = items.filter((it) => canonicalGroupKey(it.productName || it.name) !== productKey);
    await persistCatalog(nextGallery, `Producto "${product.productName}" eliminado del catálogo.`);
  };

  const handleSetPrimaryOnCard = async (photoIdOrUrl: string) => {
    const nextGallery = setPrimaryPhotoInGallery(items, photoIdOrUrl);
    await persistCatalog(nextGallery, 'Imagen principal actualizada.');
  };

  const handleExcelSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingExcel(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'spreadsheet');

      const res = await fetch('/api/settings/prompt-assistant/import', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Error leyendo el archivo Excel/CSV.');
      }

      const importedItems: ImportedCatalogItem[] = Array.isArray(data?.items) ? data.items : [];
      if (importedItems.length === 0) {
        throw new Error('No se detectaron productos válidos en el archivo.');
      }
      setPendingImport({ fileName: file.name, items: importedItems });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Error importando Excel/CSV.' });
    } finally {
      setIsImportingExcel(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) return;
    const newEntries: GalleryPhotoItem[] = [];
    const existingKeys = new Set(items.map((it) => canonicalGroupKey(it.productName || it.name)));

    for (const row of pendingImport.items) {
      const cleanName = (row.name || '').trim();
      if (!cleanName) continue;
      const syntheticKey = canonicalGroupKey(cleanName);
      if (existingKeys.has(syntheticKey)) continue;

      const photoUrl =
        row.matchedPhotoUrl && /^https?:\/\//i.test(row.matchedPhotoUrl.trim())
          ? row.matchedPhotoUrl.trim()
          : '';
      const descParts = [row.specs, row.variants, row.includes]
        .map((v) => (v || '').trim())
        .filter(Boolean);

      newEntries.push({
        id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: cleanName,
        productName: cleanName,
        price: row.price ? String(row.price).trim() : undefined,
        description: descParts.length > 0 ? descParts.join(' · ') : undefined,
        url: photoUrl,
        isHero: true,
        imageRole: 'principal',
        isAvailable: true,
      });
      existingKeys.add(syntheticKey);
    }

    if (newEntries.length === 0) {
      setFeedback({ type: 'error', text: 'Todos los productos del archivo ya existen en el catálogo.' });
      setPendingImport(null);
      return;
    }

    await persistCatalog(
      [...items, ...newEntries],
      `Se importaron ${newEntries.length} productos desde "${pendingImport.fileName}". Puedes agregarles foto desde Editar.`
    );
    setPendingImport(null);
  };

  return (
    <div className="space-y-5">
      {/* Cabecera del Catálogo */}
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Catálogo de Productos y Servicios ({groupedProducts.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Cualquier edición en descripción, precio, fotos o keywords se sincroniza automáticamente con el prompt del agente IA.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.csv"
              onChange={handleExcelSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => excelInputRef.current?.click()}
              disabled={isImportingExcel || isSaving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#1A1F2C] hover:bg-slate-100 dark:hover:bg-[#232A3B] text-slate-700 dark:text-slate-200 text-xs font-semibold transition cursor-pointer disabled:opacity-60"
            >
              {isImportingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 text-emerald-500" />}
              <span>{isImportingExcel ? 'Analizando Excel...' : 'Importar Excel / CSV'}</span>
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0052FF] hover:bg-blue-600 text-white text-xs font-semibold transition cursor-pointer shadow-2xs disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar Producto</span>
            </button>
          </div>
        </div>

        {/* Buscador */}
        <div className="mt-4 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, precio, descripción o palabra clave..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0052FF]/30"
          />
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Preview de importación Excel/CSV */}
      {pendingImport && (
        <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Vista previa de importación: {pendingImport.fileName} ({pendingImport.items.length} ítems detectados)</span>
            </div>
            <button
              type="button"
              onClick={() => setPendingImport(null)}
              className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {pendingImport.items.slice(0, 12).map((row, idx) => (
              <div key={idx} className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl p-2.5 text-xs">
                <p className="font-semibold text-slate-900 dark:text-white truncate">{row.name}</p>
                {row.price && <p className="text-emerald-600 font-bold text-[11px]">{row.price}</p>}
                {row.specs && <p className="text-slate-500 text-[11px] line-clamp-2 mt-0.5">{row.specs}</p>}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingImport(null)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#232A3B] text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {isSaving ? 'Importando...' : `Importar ${pendingImport.items.length} ítems al Catálogo`}
            </button>
          </div>
        </div>
      )}

      {/* Grid de Tarjetas de Producto */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-xs text-slate-500 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Cargando catálogo...</span>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white dark:bg-[#131722] border border-dashed border-slate-300 dark:border-[#232A3B] rounded-2xl p-10 text-center space-y-2">
          <Package className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {searchQuery ? 'No hay productos que coincidan con tu búsqueda' : 'Tu catálogo está vacío'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Agrega tu primer producto con foto o importa tu lista desde Excel / CSV.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const thumbUrl = product.primaryPhoto?.url;
            return (
              <div
                key={product.id}
                className="group bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl overflow-hidden shadow-2xs flex flex-col justify-between transition hover:border-[#0052FF]/40"
              >
                <div>
                  <div className="relative h-44 bg-slate-100 dark:bg-[#090A0F] overflow-hidden">
                    {thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbUrl}
                        alt={product.productName}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1">
                        <ImageIcon className="w-7 h-7" />
                        <span className="text-[11px]">Sin foto aún</span>
                      </div>
                    )}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900/75 text-white backdrop-blur-xs">
                        {product.allPhotos.length} {product.allPhotos.length === 1 ? 'foto' : 'fotos'}
                      </span>
                      {!product.isAvailable && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white">
                          Agotado
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                        {product.productName}
                      </h4>
                      {product.price && (
                        <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0">
                          {product.price}
                        </span>
                      )}
                    </div>

                    {product.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3">
                        {product.description}
                      </p>
                    )}

                    {product.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {product.keywords.slice(0, 5).map((kw, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#1A1F2C] text-[10px] font-medium text-slate-600 dark:text-slate-300"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-slate-100 dark:border-[#232A3B] flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-[#090A0F]/40">
                  <button
                    type="button"
                    onClick={() => openEditModal(product)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] hover:border-[#0052FF]/50 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#0052FF]" />
                    <span>Editar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteProduct(product)}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal CRUD de Producto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-[#232A3B] flex items-center justify-between bg-slate-50/70 dark:bg-[#090A0F]">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingGroupKey ? `Editar "${formName}"` : 'Nuevo Producto / Servicio en Catálogo'}
              </h4>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Fotos del Producto */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-200">
                    Imágenes del Producto (elige cuál es la principal)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRunAiSuggest}
                      disabled={isAnalyzingAi || formPhotos.length === 0}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {isAnalyzingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>Autocompletar con IA</span>
                    </button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleUploadProductPhoto}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={isUploadingPhoto}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0052FF] text-white font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                      <span>Subir Foto</span>
                    </button>
                  </div>
                </div>

                {formPhotos.length === 0 ? (
                  <div
                    onClick={() => photoInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 dark:border-[#232A3B] rounded-xl p-6 text-center cursor-pointer hover:border-[#0052FF]/50 transition"
                  >
                    <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                    <p className="text-slate-500">Haz clic para subir la imagen principal del producto</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {formPhotos.map((photo, idx) => (
                      <div
                        key={photo.id || idx}
                        className={`relative rounded-xl overflow-hidden border-2 ${
                          photo.isHero
                            ? 'border-[#0052FF]'
                            : 'border-slate-200 dark:border-[#232A3B]'
                        }`}
                      >
                        {photo.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo.url} alt="" className="w-full h-24 object-cover" />
                        ) : (
                          <div className="w-full h-24 bg-slate-100 dark:bg-[#090A0F] flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-slate-400" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 p-1 bg-slate-950/70 flex items-center justify-between">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => {
                              // Reordenar formPhotos poniendo la elegida primero y limpiando imageRole
                              setFormPhotos((prev) => {
                                const chosen = prev[idx];
                                if (!chosen) return prev;
                                const promoted: GalleryPhotoItem = {
                                  ...chosen,
                                  isHero: true,
                                  imageRole: chosen.imageRole?.toLowerCase() === 'alterna' || !chosen.imageRole ? 'principal' : chosen.imageRole,
                                };
                                const others = prev
                                  .filter((_, i) => i !== idx)
                                  .map((p) => ({
                                    ...p,
                                    isHero: false,
                                    imageRole: p.imageRole?.toLowerCase() === 'principal' ? 'alterna' : (p.imageRole || 'alterna'),
                                  }));
                                return [promoted, ...others];
                              });

                              // Solo persistir de inmediato si la foto ya existe en `items` (guardada en BD)
                              const photoKey = photo.id || photo.url;
                              const existsInSavedItems = items.some(
                                (it) => (photo.id && it.id === photo.id) || (photo.url && it.url === photo.url)
                              );
                              if (editingGroupKey && photoKey && existsInSavedItems) {
                                handleSetPrimaryOnCard(photoKey);
                              }
                            }}
                            className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer disabled:opacity-60 ${
                              photo.isHero ? 'bg-[#0052FF] text-white' : 'text-slate-200 hover:text-white'
                            }`}
                          >
                            <Star className="w-2.5 h-2.5" />
                            <span>{photo.isHero ? 'Principal' : 'Hacer principal'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormPhotos((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-0.5 text-rose-300 hover:text-rose-100 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Campos del Producto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Nombre del Producto / Servicio *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej: Cocinita Infantil Mediana"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Precio
                  </label>
                  <input
                    type="text"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="Ej: $420.000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Descripción, Medidas y Detalles
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Ej: Medidas 1,20 m alto × 60 cm ancho. Fabricada en MDF de 12 mm."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Keywords (separadas por coma)
                  </label>
                  <input
                    type="text"
                    value={formKeywords}
                    onChange={(e) => setFormKeywords(e.target.value)}
                    placeholder="cocina, cocinita, mediana, mdf"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Disponibilidad
                  </label>
                  <select
                    value={formAvailable ? 'available' : 'out'}
                    onChange={(e) => setFormAvailable(e.target.value === 'available')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
                  >
                    <option value="available">Disponible</option>
                    <option value="out">Agotado / No disponible</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Regla de contexto (opcional: cuándo debe enviarlo la IA)
                </label>
                <input
                  type="text"
                  value={formContextRule}
                  onChange={(e) => setFormContextRule(e.target.value)}
                  placeholder="Ej: Enviar cuando pregunten por la cocina de tamaño intermedio."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100 dark:border-[#232A3B] flex items-center justify-end gap-2 bg-slate-50/70 dark:bg-[#090A0F]">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveProductModal}
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-[#0052FF] hover:bg-blue-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {isSaving ? 'Guardando...' : 'Guardar Producto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
