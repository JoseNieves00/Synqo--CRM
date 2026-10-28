import React from 'react';
import { MessageSender } from '@/lib/supabase/types';
import { sanitizeHtmlText } from '@/lib/security/sanitize';
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
        <div className="flex items-center justify-center my-4">
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-500/10 border border-amber-300/70 rounded-full text-slate-700 text-xs shadow-2xs max-w-lg">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
            <span className="font-bold text-amber-900">IA en pausa:</span>
            <span className="text-slate-700 truncate">
              {reason || 'Transferido a control humano'}
            </span>
            <span suppressHydrationWarning className="text-[10px] text-slate-400 font-mono ml-1 shrink-0">
              {formattedTime}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center my-3">
        <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200/80 font-medium text-center">
          {content}
        </span>
      </div>
    );
  }

  const isLead = senderType === 'lead';
  const isAi = senderType === 'ai';
  const isAgent = senderType === 'agent_manual';

  return (
    <div className={`flex w-full my-2 ${isLead ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm text-sm relative ${
          isLead
            ? 'bg-white text-gray-900 border border-gray-200 rounded-tl-sm'
            : isAi
            ? 'bg-[#0052FF]/5 text-slate-950 border border-[#0052FF]/20 rounded-tr-sm'
            : 'bg-gray-900 text-white rounded-tr-sm'
        }`}
      >
        {/* Badge superior del remitente */}
        <div className="flex items-center gap-1 mb-1 text-[11px] font-semibold opacity-75">
          {isLead && (
            <>
              <User className="w-3 h-3" />
              <span>Cliente</span>
            </>
          )}
          {isAi && (
            <>
              <Bot className="w-3 h-3 text-[#0052FF]" />
              <span className="text-[#0052FF]">Synqo AI</span>
            </>
          )}
          {isAgent && (
            <>
              <ShieldCheck className="w-3 h-3 text-gray-300" />
              <span className="text-gray-200">Asesor Humano</span>
            </>
          )}
        </div>

        {/* Contenido con sanitización contra XSS */}
        <p className="whitespace-pre-wrap break-words leading-relaxed font-normal">
          {content}
        </p>

        {/* Hora */}
        <div suppressHydrationWarning className="text-[10px] mt-1 text-right opacity-60">
          {formattedTime}
        </div>
      </div>
    </div>
  );
}

