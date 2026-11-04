import React from 'react';
import { MessageSender } from '@/lib/supabase/types';
import { Bot, User, ShieldCheck } from 'lucide-react';

interface MessageBubbleProps {
  content: string;
  senderType: MessageSender;
  createdAt: string;
}

export function MessageBubble({ content, senderType, createdAt }: MessageBubbleProps) {
  const formattedTime = new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (senderType === 'system') {
    const isHandoff = content.includes('Relevo Silencioso') || content.includes('Relevo Solicitado');

    if (isHandoff) {
      // Extraer motivo de forma limpia sin corchetes técnicos de log
      let reason = '';
      const match = content.match(/Motivo:\s*["']?([^"'\]]+)["']?/i);
      if (match && match[1]) {
        reason = match[1].trim();
      }

      return (
        <div className="flex items-center justify-center my-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-[#1A1F2C] border border-amber-200 dark:border-amber-500/30 rounded-full text-amber-900 dark:text-slate-300 text-xs shadow-xs max-w-lg transition-colors">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0" />
            <span className="font-semibold text-amber-800 dark:text-amber-300">Pausa IA:</span>
            <span className="text-slate-700 dark:text-slate-300 truncate">
              {reason || 'Transferido a control humano'}
            </span>
            <span suppressHydrationWarning className="text-[10px] text-slate-500 font-mono ml-1 shrink-0">
              {formattedTime}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center my-2.5">
        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#131722] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#232A3B] font-mono text-center transition-colors">
          {content}
        </span>
      </div>
    );
  }

  const isLead = senderType === 'lead';
  const isAi = senderType === 'ai';
  const isAgent = senderType === 'agent_manual';

  return (
    <div className={`flex w-full my-1.5 ${isLead ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-2xs text-xs relative transition-colors ${
          isLead
            ? 'bg-white dark:bg-[#1A1F2C] text-slate-900 dark:text-[#F8FAFC] border border-slate-200 dark:border-[#232A3B] rounded-tl-xs'
            : isAi
            ? 'bg-blue-50/70 dark:bg-[#131722] text-slate-900 dark:text-[#F8FAFC] border border-blue-200 dark:border-[#0052FF]/40 rounded-tr-xs'
            : 'bg-[#0052FF] text-white rounded-tr-xs'
        }`}
      >
        {/* Badge superior del remitente */}
        <div className="flex items-center gap-1 mb-1 text-[10px] font-semibold opacity-80">
          {isLead && (
            <>
              <User className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span className="text-slate-600 dark:text-slate-400 font-medium">Cliente</span>
            </>
          )}
          {isAi && (
            <>
              <Bot className="w-3 h-3 text-[#0052FF] dark:text-[#00D2FF]" />
              <span className="text-[#0052FF] dark:text-[#00D2FF] font-mono font-bold">Synqo AI</span>
            </>
          )}
          {isAgent && (
            <>
              <ShieldCheck className="w-3 h-3 text-white/90" />
              <span className="text-white/95 font-medium">Asesor Humano</span>
            </>
          )}
        </div>

        {/* Contenido con sanitización contra XSS */}
        <p className="whitespace-pre-wrap break-words leading-relaxed font-normal">
          {content}
        </p>

        {/* Hora */}
        <div suppressHydrationWarning className="text-[10px] mt-1 text-right font-mono opacity-60">
          {formattedTime}
        </div>
      </div>
    </div>
  );
}
