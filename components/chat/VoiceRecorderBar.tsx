'use client';

import React from 'react';
import { Loader2, Send, Trash2 } from 'lucide-react';

interface VoiceRecorderBarProps {
  recordingSeconds: number;
  isUploadingAudio: boolean;
  onCancel: () => void;
  onSend: () => void;
}

export function VoiceRecorderBar({
  recordingSeconds,
  isUploadingAudio,
  onCancel,
  onSend,
}: VoiceRecorderBarProps) {
  return (
    <div className="p-2.5 pt-2 flex items-center justify-between gap-3 animate-in fade-in bg-rose-50/50 dark:bg-rose-950/20 border-t border-rose-200 dark:border-rose-900/30">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
        <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
          {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:
          {(recordingSeconds % 60).toString().padStart(2, '0')}
        </span>
        <span className="text-xs text-slate-600 dark:text-slate-300 truncate">
          Grabando nota de voz de WhatsApp...
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          disabled={isUploadingAudio}
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition cursor-pointer"
          title="Cancelar y descartar"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={isUploadingAudio}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
          title="Enviar nota de voz"
        >
          {isUploadingAudio ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Enviando...</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span>Enviar Audio</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
