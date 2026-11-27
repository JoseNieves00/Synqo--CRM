'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Plus, Trash2, Upload, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import type { GalleryPhotoItem } from '@/lib/media/format';
import {
  getOrganizationCatalogGallery,
  getOrganizationMediaGallery,
  saveAiImageGallery,
  saveAiMediaGallery,
} from '@/app/actions/settings';
import { uploadChatMedia } from '@/app/actions/chat';
import { suggestProductCatalogAi } from '@/app/actions/ai-catalog';

export function AiGalleryTab({ mode = 'media' }: { mode?: 'catalog' | 'media' }) {
  const isCatalog = mode === 'catalog';
  const [items, setItems] = useState<GalleryPhotoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [contextRule, setContextRule] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    const loader = isCatalog ? getOrganizationCatalogGallery : getOrganizationMediaGallery;
    loader()
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
  }, [isCatalog]);

  const persistGallery = async (next: GalleryPhotoItem[], successMessage: string) => {
    setIsSaving(true);
    setFeedback(null);
    try {
      if (isCatalog) {
        await saveAiImageGallery(next);
      } else {
        await saveAiMediaGallery(next);
      }
      setItems(next);
      setFeedback({ type: 'success', text: successMessage });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Error guardando la galería.' });
    } finally {
      setIsSaving(false);
    }
  };

  const runGeminiAutofill = async (targetUrl: string, fallbackName?: string) => {
    if (!targetUrl.trim()) return;
    setIsAnalyzingAi(true);
    try {
      const res = await suggestProductCatalogAi({
        imageUrl: targetUrl.trim(),
        productName: name.trim() || fallbackName,
        description: description.trim() || undefined,
      });
      if (res.success && res.data) {
        if (res.data.name) setName(res.data.name);
        if (res.data.description) setDescription(res.data.description);
        if (res.data.keywords?.length) setKeywordsInput(res.data.keywords.join(', '));
        if (res.data.contextRule) setContextRule(res.data.contextRule);
        setFeedback({
          type: 'success',
          text: 'Gemini analizó la imagen y prellenó los campos. Revísalos o edítalos antes de guardar.',
        });
      }
    } catch {
      // silencioso: el usuario puede llenar manualmente
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadChatMedia(formData);
      if (res?.url) {
        setImageUrl(res.url);
        const cleanFileName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        if (!name.trim()) {
          setName(cleanFileName);
        }
        await runGeminiAutofill(res.url, cleanFileName);
      } else {
        setFeedback({ type: 'error', text: 'No se pudo subir la imagen.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Error subiendo imagen.' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !imageUrl.trim()) {
      setFeedback({ type: 'error', text: 'Ingresa el nombre y sube o pega la URL de la imagen.' });
      return;
    }

    const keywords = keywordsInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const newItem: GalleryPhotoItem = {
      id: `img-${Date.now()}`,
      name: name.trim(),
      url: imageUrl.trim(),
      description: description.trim() || undefined,
      price: price.trim() || undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      contextRule: contextRule.trim() || undefined,
      isAvailable: true,
    };

    const next = [newItem, ...items];
    await persistGallery(next, 'Imagen agregada a la galería de la IA.');
    setName('');
    setDescription('');
    setPrice('');
    setKeywordsInput('');
    setContextRule('');
    setImageUrl('');
  };

  const handleDelete = async (id: string) => {
    const next = items.filter((item) => item.id !== id);
    await persistGallery(next, 'Imagen eliminada de la galería.');
  };

  const handleToggleAvailable = async (id: string) => {
    const next = items.map((item) =>
      item.id === id ? { ...item, isAvailable: item.isAvailable === false } : item
    );
    await persistGallery(next, 'Disponibilidad de imagen actualizada.');
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-[#1E2433] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-[#0052FF] dark:text-[#00D2FF]">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Galería de Imágenes ({items.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Biblioteca libre de imágenes de apoyo (referencias, medidas, ubicación, promociones o productos) que tanto tus asesores en el Inbox como la IA pueden enviar en todo el proceso de ventas.
              </p>
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 border ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        <form onSubmit={handleAddImage} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-[#0D1017] border border-slate-200 dark:border-[#1E2433]">
          <div className="md:col-span-4">
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nombre o título *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Tabla de tallas o Sede Principal"
              className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-900 dark:text-white"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Precio (opcional)
            </label>
            <input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Ej. $120.000"
              className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-900 dark:text-white"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Cuándo enviarla / palabras clave
            </label>
            <input
              type="text"
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
              placeholder="Ej. medidas, ubicación, mapa, catálogo"
              className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-900 dark:text-white"
            />
          </div>

          <div className="md:col-span-6">
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Regla de contexto (cuándo SÍ y cuándo NO enviarla)
            </label>
            <input
              type="text"
              value={contextRule}
              onChange={(e) => setContextRule(e.target.value)}
              placeholder="Ej. Enviar solo si pregunta por ubicación; NO enviar si pregunta precios"
              className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-900 dark:text-white"
            />
          </div>

          <div className="md:col-span-6">
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Descripción breve (opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contexto adicional que acompaña la foto"
              className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-900 dark:text-white"
            />
          </div>

          <div className="md:col-span-12">
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Subir imagen o pegar URL * (Gemini autocompletará los campos antes de guardar)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="url"
                required
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 min-w-[200px] h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-900 dark:text-white"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                disabled={isUploading || isAnalyzingAi}
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{isUploading ? 'Subiendo...' : 'Subir'}</span>
              </button>
              {imageUrl.trim() && (
                <button
                  type="button"
                  disabled={isAnalyzingAi || isUploading}
                  onClick={() => runGeminiAutofill(imageUrl)}
                  className="h-9 px-3 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-xs font-semibold text-[#0052FF] dark:text-[#00D2FF] inline-flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {isAnalyzingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{isAnalyzingAi ? 'Analizando...' : 'Autocompletar'}</span>
                </button>
              )}
              <button
                type="submit"
                disabled={isSaving || isUploading || isAnalyzingAi}
                className="h-9 px-4 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Guardar en Galería</span>
              </button>
            </div>
          </div>
        </form>

        {isLoading ? (
          <div className="py-10 text-center text-xs text-slate-400">Cargando galería...</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-[#232A3B] rounded-xl">
            Aún no hay imágenes en la galería. Sube tu primera imagen arriba para usarla con tus asesores y la IA.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0D1017] overflow-hidden flex flex-col"
              >
                <div className="aspect-video bg-slate-900/40 relative overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                        {item.name}
                      </h3>
                      {item.price && (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                          {item.price}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    {item.keywords && item.keywords.length > 0 && (
                      <p className="text-[10px] text-[#0052FF] dark:text-[#00D2FF] mt-1 truncate">
                        Claves: {item.keywords.join(', ')}
                      </p>
                    )}
                    {item.contextRule && (
                      <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                        <span className="font-semibold">Contexto:</span> {item.contextRule}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-[#1E2433]">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleToggleAvailable(item.id)}
                      className={`text-[11px] font-semibold cursor-pointer ${
                        item.isAvailable === false
                          ? 'text-slate-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {item.isAvailable === false ? 'Oculta' : 'Disponible'}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition cursor-pointer"
                      title="Eliminar imagen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
