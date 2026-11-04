'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Send, AlertTriangle, FileText, Zap, X, Settings2, Sparkles } from 'lucide-react';
import { getOrganizationQuickReplies } from '@/app/actions/chat';
import { type QuickSnippet, BASE_DEFAULT_SNIPPETS } from '@/lib/chat/snippets';
import { ManageQuickRepliesModal } from './ManageQuickRepliesModal';

interface ChatInputProps {
  contactId: string;
  isWithin24h: boolean;
  onSendMessage: (text: string) => Promise<void>;
  onSendTemplate: (templateName: string) => Promise<void>;
  customTemplates?: Array<{ name: string; label: string }>;
  disabled?: boolean;
  disabledReason?: string;
  onTyping?: () => void;
}

export function ChatInput({
  contactId,
  isWithin24h,
  onSendMessage,
  onSendTemplate,
  customTemplates,
  disabled,
  disabledReason,
  onTyping,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const availableTemplates = customTemplates && customTemplates.length > 0
    ? customTemplates
    : [];

  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    availableTemplates[0]?.name || ''
  );
  const [loading, setLoading] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [activeSnippets, setActiveSnippets] = useState<QuickSnippet[]>(BASE_DEFAULT_SNIPPETS);
  const [aiSuggestions, setAiSuggestions] = useState<QuickSnippet[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cargar atajos personalizados y sugerencias generadas por la IA según el prompt
  useEffect(() => {
    let isMounted = true;
    getOrganizationQuickReplies().then((data) => {
      if (isMounted && data) {
        if (data.activeSnippets && data.activeSnippets.length > 0) {
          setActiveSnippets(data.activeSnippets);
        }
        if (data.aiSuggestions) {
          setAiSuggestions(data.aiSuggestions);
        }
      }
    }).catch((err) => {
      console.warn('[ChatInput] Error cargando atajos:', err);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (availableTemplates.length > 0 && !availableTemplates.some((t) => t.name === selectedTemplate)) {
      setSelectedTemplate(availableTemplates[0].name);
    }
  }, [availableTemplates, selectedTemplate]);

  // Si el usuario empieza a escribir con '/', abrir el menú de atajos automáticamente
  const isTypingShortcut = message.startsWith('/');
  const filteredSnippets = isTypingShortcut
    ? activeSnippets.filter((s) => s.shortcut.toLowerCase().startsWith(message.toLowerCase()))
    : activeSnippets;

  const handleApplySnippet = (snippetText: string) => {
    setMessage(snippetText);
    setShowSnippets(false);
    inputRef.current?.focus();
  };

  const handleSubmitText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || loading || disabled) return;

    setLoading(true);
    const textToSend = message;
    setMessage('');
    setShowSnippets(false);

    try {
      await onSendMessage(textToSend);
    } catch {
      setMessage(textToSend);
    } finally {
      setLoading(false);
    }
  };

  const handleSendTemplate = async () => {
    if (!selectedTemplate || loading || disabled) return;
    setLoading(true);
    try {
      await onSendTemplate(selectedTemplate);
    } finally {
      setLoading(false);
    }
  };

  // Si el chat está bloqueado porque otro agente lo tiene asignado
  if (disabled) {
    return (
      <div className="p-3.5 bg-slate-50 dark:bg-[#131722] border-t border-slate-200 dark:border-[#1E2433] text-center text-xs text-slate-500 dark:text-slate-400">
        <span>{disabledReason || 'Chat en modo solo lectura.'}</span>
      </div>
    );
  }

  // Fuera de la ventana de 24 horas: bloqueo de mensajes libres según política Meta
  if (!isWithin24h) {
    return (
      <div className="p-3.5 bg-white dark:bg-[#131722] border-t border-slate-200 dark:border-[#1E2433] space-y-2.5 transition-colors">
        <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-300">Ventana de 24 horas de Meta cerrada</p>
            <p className="text-[11px] text-amber-800 dark:text-amber-200/80 mt-0.5 leading-relaxed">
              Han transcurrido más de 24 horas desde la última interacción. Para reanudar el contacto oficial, envía una plantilla autorizada:
            </p>
          </div>
        </div>

        {availableTemplates.length > 0 ? (
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="flex-1 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
            >
              {availableTemplates.map((tpl) => (
                <option key={tpl.name} value={tpl.name}>
                  {tpl.label || tpl.name} ({tpl.name})
                </option>
              ))}
            </select>

            <button
              onClick={handleSendTemplate}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 bg-[#0052FF] hover:bg-[#0043D4] text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{loading ? 'Enviando...' : 'Enviar Plantilla'}</span>
            </button>
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg p-2.5 text-xs text-slate-700 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              No hay plantillas oficiales registradas para este canal.
            </span>
            <Link
              href="/settings"
              className="inline-flex items-center text-[11px] font-semibold text-[#0052FF] dark:text-[#00D2FF] hover:underline shrink-0"
            >
              Configurar en Ajustes &rarr;
            </Link>
          </div>
        )}
      </div>
    );
  }

  // Dentro de las 24 horas: input libre normal para el agente humano con atajos rápidos
  return (
    <div className="relative border-t border-slate-200 dark:border-[#1E2433] bg-white dark:bg-[#131722] transition-colors">
      {/* Popover flotante de sugerencias al escribir '/' o al pulsar 'Atajos' */}
      {(showSnippets || (isTypingShortcut && filteredSnippets.length > 0)) && (
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-white dark:bg-[#131722] rounded-xl shadow-2xl border border-slate-200 dark:border-[#232A3B] p-2 space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150 z-30 max-w-md text-slate-900 dark:text-slate-100">
          <div className="flex items-center justify-between px-2 pb-1.5 border-b border-slate-200 dark:border-[#1E2433] text-xs font-semibold text-slate-800 dark:text-slate-300">
            <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
              <span>Respuestas Rápidas (Escribe / para filtrar):</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowSnippets(false);
                  setIsManageModalOpen(true);
                }}
                className="text-[11px] font-medium text-[#0052FF] dark:text-[#00D2FF] hover:underline cursor-pointer"
                title="Personalizar atajos o ver sugerencias de la IA"
              >
                Gestionar
              </button>
              <button
                type="button"
                onClick={() => setShowSnippets(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {filteredSnippets.map((s) => (
              <button
                key={s.shortcut}
                type="button"
                onClick={() => handleApplySnippet(s.text)}
                className="w-full text-left p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#1A1F2C] border border-transparent hover:border-slate-200 dark:hover:border-[#232A3B] transition group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white">
                    {s.label}
                  </span>
                  <code className="text-[10px] font-mono text-[#0052FF] dark:text-[#00D2FF] bg-slate-100 dark:bg-[#090A0F] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#232A3B]">
                    {s.shortcut}
                  </code>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{s.text}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mini-Barra Superior de Atajos de 1-Clic */}
      <div className="px-3 pt-2 flex items-center gap-1.5 overflow-x-auto text-[11px]">
        <button
          type="button"
          onClick={() => setShowSnippets((prev) => !prev)}
          className="px-2 py-0.5 rounded-md font-semibold bg-blue-50 dark:bg-[#090A0F] hover:bg-blue-100 dark:hover:bg-[#1A1F2C] text-[#0052FF] dark:text-[#00D2FF] border border-blue-200 dark:border-[#00D2FF]/30 flex items-center gap-1 transition shrink-0 cursor-pointer"
        >
          <Zap className="w-3 h-3 text-[#0052FF] dark:text-[#00D2FF]" />
          <span>Atajos (/)</span>
        </button>

        {activeSnippets.slice(0, 3).map((snippet) => (
          <button
            key={snippet.shortcut}
            type="button"
            onClick={() => handleApplySnippet(snippet.text)}
            className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#1A1F2C] hover:bg-slate-200 dark:hover:bg-[#232A3B] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#232A3B] transition shrink-0 truncate max-w-[140px] cursor-pointer"
            title={snippet.text}
          >
            {snippet.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setIsManageModalOpen(true)}
          className="px-2 py-0.5 rounded-md font-medium text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1 transition shrink-0 cursor-pointer ml-auto"
          title="Personalizar atajos y ver sugerencias de la IA"
        >
          <Settings2 className="w-3 h-3" />
          <span>Personalizar</span>
        </button>
      </div>

      <form onSubmit={handleSubmitText} className="p-2.5 pt-1.5 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          placeholder="Escribe un mensaje o usa /precio, /cuenta (pausa la IA)..."
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            onTyping?.();
          }}
          disabled={loading}
          className="flex-1 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#0052FF] focus:border-[#0052FF] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="bg-[#0052FF] hover:bg-[#0043D4] text-white px-3.5 py-2 rounded-xl transition shadow-xs disabled:opacity-40 flex items-center justify-center cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Modal de Gestión de Atajos y Sugerencias de IA */}
      <ManageQuickRepliesModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        activeSnippets={activeSnippets}
        aiSuggestions={aiSuggestions}
        onSnippetsUpdated={(updated) => setActiveSnippets(updated)}
      />
    </div>
  );
}
