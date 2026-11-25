'use client';

import React from 'react';
import { Pencil, Sparkles, X } from 'lucide-react';
import type { QuickSnippet } from '@/lib/chat/snippets';

interface QuickSnippetsPopoverProps {
  isTypingShortcut: boolean;
  snippetsSearch: string;
  setSnippetsSearch: (v: string) => void;
  filteredSnippets: QuickSnippet[];
  selectedSnippetIndex: number;
  onApplySnippet: (text: string) => void;
  onOpenManage: (shortcut: string | null) => void;
  onClose: () => void;
}

export function QuickSnippetsPopover({
  isTypingShortcut,
  snippetsSearch,
  setSnippetsSearch,
  filteredSnippets,
  selectedSnippetIndex,
  onApplySnippet,
  onOpenManage,
  onClose,
}: QuickSnippetsPopoverProps) {
  return (
    <div className="absolute bottom-full left-3 right-3 mb-2 bg-white dark:bg-[#131722] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#232A3B] p-2.5 space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150 z-40 max-w-md text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between px-2 pb-1.5 border-b border-slate-200 dark:border-[#1E2433] text-xs font-semibold text-slate-800 dark:text-slate-300">
        <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
          <span>Respuestas Rápidas (Escribe / para filtrar):</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenManage(null)}
            className="text-[11px] font-medium text-[#0052FF] dark:text-[#00D2FF] hover:underline cursor-pointer"
            title="Personalizar o editar atajos"
          >
            Gestionar / Editar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isTypingShortcut && (
        <input
          type="text"
          placeholder="Buscar atajo por comando (ej. /cuenta) o texto..."
          value={snippetsSearch}
          onChange={(e) => setSnippetsSearch(e.target.value)}
          className="w-full text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1.5 focus:ring-[#0052FF]"
          autoFocus
        />
      )}

      <div className="max-h-48 overflow-y-auto space-y-0.5 [scrollbar-width:thin]">
        {filteredSnippets.map((s, idx) => {
          const isSelected = idx === selectedSnippetIndex;
          return (
            <div
              key={s.shortcut}
              className={`w-full flex items-center justify-between p-2 rounded-lg transition group border ${
                isSelected
                  ? 'bg-blue-50 dark:bg-[#1A1F2C] border-blue-300 dark:border-[#0052FF]/60 ring-1 ring-[#0052FF]/30'
                  : 'hover:bg-slate-50 dark:hover:bg-[#1A1F2C] border-transparent hover:border-slate-200 dark:border-[#232A3B]'
              }`}
            >
              <button
                type="button"
                onClick={() => onApplySnippet(s.text)}
                className="flex-1 text-left cursor-pointer overflow-hidden"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white truncate">
                    {s.label}
                  </span>
                  <code className="text-[10px] font-mono text-[#0052FF] dark:text-[#00D2FF] bg-slate-100 dark:bg-[#090A0F] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#232A3B] shrink-0">
                    {s.shortcut}
                  </code>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{s.text}</p>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenManage(s.shortcut);
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-slate-400 hover:text-[#0052FF] dark:hover:text-[#00D2FF] hover:bg-slate-200 dark:hover:bg-[#232A3B] transition shrink-0 ml-1 cursor-pointer"
                title={`Editar atajo ${s.shortcut}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
