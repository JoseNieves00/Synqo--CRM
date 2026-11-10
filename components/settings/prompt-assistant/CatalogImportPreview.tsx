'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  FileSpreadsheet,
  FileText,
  ImageOff,
  Loader2,
  X,
} from 'lucide-react';
import type { ImportedCatalogItem } from '@/lib/ai/prompt-assistant/file-import';

export type PendingImportState =
  | {
      type: 'spreadsheet';
      fileName: string;
      totalRows: number;
      items: ImportedCatalogItem[];
      exceededInlineLimit: boolean;
      catalogInlineMax: number;
    }
  | {
      type: 'pdf_confirm';
      fileName: string;
      totalPages: number;
      pagesProcessed: number;
      blocks: string[];
    }
  | {
      type: 'pdf_items';
      fileName: string;
      items: ImportedCatalogItem[];
      exceededInlineLimit: boolean;
      catalogInlineMax: number;
    };

interface CatalogImportPreviewProps {
  pending: PendingImportState;
  onConfirmSpreadsheetOrPdfItems: (items: ImportedCatalogItem[]) => Promise<void>;
  onConfirmPdfExtraction: (blocks: string[]) => Promise<void>;
  onCancel: () => void;
}

export function CatalogImportPreview({
  pending,
  onConfirmSpreadsheetOrPdfItems,
  onConfirmPdfExtraction,
  onCancel,
}: CatalogImportPreviewProps) {
  const [busy, setBusy] = useState(false);

  if (pending.type === 'pdf_confirm') {
    return (
      <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50/70 dark:bg-blue-950/20 p-3 text-xs space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <FileText className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF] shrink-0" />
            <span className="truncate">{pending.fileName}</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Detectamos texto legible en <strong>{pending.pagesProcessed}</strong> de{' '}
          <strong>{pending.totalPages}</strong> página(s). ¿Deseas extraer los productos y precios ahora?
        </p>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#232A3B] text-[11px] font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirmPdfExtraction(pending.blocks);
              } finally {
                setBusy(false);
              }
            }}
            className="px-3 py-1 rounded-lg bg-[#0052FF] hover:bg-[#0043D4] text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>Extraer catálogo</span>
          </button>
        </div>
      </div>
    );
  }

  const items = pending.items || [];
  const previewRows = items.slice(0, 8);
  const missingPhotosCount = items.filter((it) => !it.matchedPhotoUrl).length;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] p-3 text-xs space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="truncate">
            {pending.fileName} · {items.length} ítems detectados
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {pending.exceededInlineLimit && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 p-2 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Tu archivo tiene {items.length} opciones. Para mantener el bot ágil y rápido, guardaremos los{' '}
            <strong>{pending.catalogInlineMax} destacados</strong> en el prompt y puedes subir fotos del resto en{' '}
            <strong>Fotos de Productos</strong>.
          </span>
        </div>
      )}

      {missingPhotosCount > 0 && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <ImageOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>
            {missingPhotosCount} ítem(s) aún no tienen foto asociada en Fotos de Productos.
          </span>
        </div>
      )}

      <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 dark:border-[#1E2433]">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead className="bg-slate-50 dark:bg-[#090A0F] text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-2 py-1 font-semibold">Nombre</th>
              <th className="px-2 py-1 font-semibold">Precio</th>
              <th className="px-2 py-1 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#1E2433]">
            {previewRows.map((it, idx) => (
              <tr key={`${it.name}-${idx}`}>
                <td className="px-2 py-1 font-medium text-slate-800 dark:text-slate-200">
                  {it.name}
                </td>
                <td className="px-2 py-1 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {it.price || '—'}
                </td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                  {[it.specs, it.variants, it.includes].filter(Boolean).join(' · ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > previewRows.length && (
        <div className="text-[10px] text-slate-400">
          Mostrando {previewRows.length} de {items.length} filas detectadas.
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#232A3B] text-[11px] font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
        >
          Descartar
        </button>
        <button
          type="button"
          disabled={busy || items.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirmSpreadsheetOrPdfItems(items);
            } finally {
              setBusy(false);
            }
          }}
          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          <span>Agregar a ## Catálogo</span>
        </button>
      </div>
    </div>
  );
}
