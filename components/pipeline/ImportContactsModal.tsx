'use client';

import React, { useState, useRef, useEffect } from 'react';
import { importContactsBatch } from '@/app/actions/pipeline';
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, ShieldCheck, Users } from 'lucide-react';

interface ImportContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

interface ParsedContactRow {
  name?: string;
  phone: string;
  notes?: string;
  stage?: string;
}

/**
 * Normalizador seguro de teléfonos a E.164
 */
function normalizeE164Phone(rawPhone: string, defaultCountryCode: string = '57'): string {
  let cleaned = rawPhone.replace(/\D/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }

  if (cleaned.length === 10 && !cleaned.startsWith('57') && !cleaned.startsWith('52') && !cleaned.startsWith('34')) {
    cleaned = `${defaultCountryCode}${cleaned}`;
  }

  return `+${cleaned}`;
}

export function ImportContactsModal({
  isOpen,
  onClose,
  onImportComplete,
}: ImportContactsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedContactRow[]>([]);
  const [defaultCountryCode, setDefaultCountryCode] = useState<string>('57');
  const [loading, setLoading] = useState(false);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; updated: number; errors: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const parseCsvText = (text: string): ParsedContactRow[] => {
    // Normalizar saltos de línea
    const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    // Detectar delimitador (coma o punto y coma)
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase().replace(/"/g, ''));

    // Índices de columnas
    const phoneIdx = headers.findIndex((h) =>
      h.includes('tel') || h.includes('phone') || h.includes('cel') || h.includes('what') || h.includes('movil')
    );
    const nameIdx = headers.findIndex((h) =>
      h.includes('nom') || h.includes('name') || h.includes('cliente') || h.includes('prospecto')
    );
    const notesIdx = headers.findIndex((h) =>
      h.includes('not') || h.includes('obs') || h.includes('det') || h.includes('coment')
    );
    const stageIdx = headers.findIndex((h) =>
      h.includes('etapa') || h.includes('fase') || h.includes('stage') || h.includes('estado')
    );

    if (phoneIdx === -1) {
      throw new Error('El archivo CSV debe tener al menos una columna de teléfono o WhatsApp ("telefono", "celular", "whatsapp").');
    }

    const items: ParsedContactRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
      const rawPhone = cols[phoneIdx];
      const rawName = nameIdx >= 0 ? cols[nameIdx] : undefined;
      const rawNotes = notesIdx >= 0 ? cols[notesIdx] : undefined;
      const rawStage = stageIdx >= 0 ? cols[stageIdx] : undefined;

      // Descartar si no tiene números
      if (rawPhone && rawPhone.replace(/\D/g, '').length >= 7) {
        items.push({
          name: rawName || 'Contacto Importado',
          phone: rawPhone,
          notes: rawNotes,
          stage: rawStage,
        });
      }
    }

    return items;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setParsingError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const items = parseCsvText(text);
        if (items.length === 0) {
          setParsingError('No se encontraron filas con números telefónicos válidos en el archivo.');
          setParsedRows([]);
        } else {
          setParsedRows(items);
        }
      } catch (err: any) {
        setParsingError(`Error al procesar archivo: ${err?.message || 'Formato no soportado'}`);
      }
    };
    reader.onerror = () => {
      setParsingError('Error al leer el archivo en el navegador.');
    };
    reader.readAsText(selected, 'UTF-8');
  };

  const handleImportSubmit = async () => {
    if (parsedRows.length === 0 || loading) return;
    setLoading(true);
    setParsingError(null);

    try {
      const res = await importContactsBatch(parsedRows, defaultCountryCode);
      setResult(res);
      onImportComplete?.();
    } catch (err: any) {
      setParsingError(err?.message || 'Error al importar contactos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-[#232A3B] animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100 transition-colors">
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#0E121B]">
          <div className="flex items-center gap-2.5 text-slate-900 dark:text-white">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#090A0F] text-[#0052FF] dark:text-[#00D2FF] border border-slate-200 dark:border-[#232A3B] flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Importar Contactos (CSV / Excel)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Carga tu base de clientes existente en lote sin duplicar.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Si ya terminó la importación, mostrar tarjeta de éxito */}
        {result ? (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6 space-y-4 [scrollbar-width:thin]">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl text-emerald-800 dark:text-emerald-300 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <span>Importación completada con éxito</span>
                </div>
                <ul className="text-xs space-y-1 pl-6 text-emerald-900 dark:text-emerald-200/90 font-mono">
                  <li>• <strong>{result.imported}</strong> nuevos prospectos creados.</li>
                  <li>• <strong>{result.updated}</strong> contactos actualizados sin duplicar.</li>
                  {result.errors > 0 && (
                    <li className="text-amber-700 dark:text-amber-300">
                      • <strong>{result.errors}</strong> descartados por teléfono inválido.
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="shrink-0 flex justify-end px-5 py-3.5 border-t border-slate-200 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#0E121B]">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-xs"
              >
                Cerrar y Ver Pipeline
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 [scrollbar-width:thin]">
              {/* Selector de país por defecto */}
              <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-[#090A0F] p-3 rounded-xl border border-slate-200 dark:border-[#232A3B] text-xs">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                  <span className="text-[11px] font-medium">Prefijo internacional (10 dígitos):</span>
                </div>
                <select
                  value={defaultCountryCode}
                  onChange={(e) => setDefaultCountryCode(e.target.value)}
                  className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                >
                  <option value="57">Colombia (+57)</option>
                  <option value="52">México (+52)</option>
                  <option value="34">España (+34)</option>
                  <option value="1">USA (+1)</option>
                  <option value="54">Argentina (+54)</option>
                  <option value="56">Chile (+56)</option>
                  <option value="51">Perú (+51)</option>
                  <option value="593">Ecuador (+593)</option>
                </select>
              </div>

              {/* Zona de Subida de Archivo */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-slate-300 dark:border-[#232A3B] hover:border-[#0052FF] dark:hover:border-[#0052FF] bg-slate-50 dark:bg-[#090A0F] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-xl p-5 text-center cursor-pointer transition space-y-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-[#131722] text-[#0052FF] dark:text-[#00D2FF] border border-slate-200 dark:border-[#232A3B] mx-auto flex items-center justify-center shadow-2xs">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {file ? file.name : 'Haz clic para seleccionar tu archivo CSV'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Archivos delimitados por comas o punto y coma (.csv) exportados de Excel o Google Sheets.
                  </p>
                </div>
              </div>

              {parsingError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span>{parsingError}</span>
                </div>
              )}

              {/* Vista Previa de Filas Parseadas */}
              {parsedRows.length > 0 && (
                <div className="space-y-2.5 border border-slate-200 dark:border-[#232A3B] rounded-xl p-3 bg-slate-50 dark:bg-[#090A0F]">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                      <span>Vista previa ({parsedRows.length} contactos):</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-2 py-0.5 rounded font-semibold">
                      Listo para importar
                    </span>
                  </div>

                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-[#1E2433] text-xs bg-white dark:bg-[#131722] rounded-lg border border-slate-200 dark:border-[#232A3B] [scrollbar-width:thin]">
                    {parsedRows.slice(0, 5).map((row, idx) => (
                      <div key={idx} className="p-2 px-3 flex items-center justify-between gap-2">
                        <div className="truncate font-medium text-slate-800 dark:text-slate-200">{row.name}</div>
                        <div className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                          {normalizeE164Phone(row.phone, defaultCountryCode)}
                        </div>
                      </div>
                    ))}
                    {parsedRows.length > 5 && (
                      <div className="p-1.5 text-center text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        ... y {parsedRows.length - 5} contactos más
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Botones de Acción */}
            <div className="shrink-0 flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-slate-200 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#0E121B]">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-3.5 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={parsedRows.length === 0 || loading}
                className="px-4 py-2 bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold rounded-xl transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Importando...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importar {parsedRows.length} Contactos</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
