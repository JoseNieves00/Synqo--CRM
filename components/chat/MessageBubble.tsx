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
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full border border-gray-200">
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
            ? 'bg-emerald-50 text-emerald-950 border border-emerald-200 rounded-tr-sm'
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
              <Bot className="w-3 h-3 text-emerald-600" />
              <span className="text-emerald-700">Synqo AI</span>
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
        <div className="text-[10px] mt-1 text-right opacity-60">
          {formattedTime}
        </div>
      </div>
    </div>
  );
}

