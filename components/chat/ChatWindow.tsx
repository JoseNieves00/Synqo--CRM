'use client';

import React from 'react';
import { MessageSender } from '@/lib/supabase/types';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { AiToggleSwitch } from './AiToggleSwitch';
import { isWithin24HourWindow, getRemainingHoursInWindow } from '@/services/contact.service';
import { sendAgentMessage, sendAgentTemplate, toggleContactAi } from '@/app/actions/chat';
import { MetaTemplateKey } from '@/services/whatsapp.service';
import { Phone, Clock, AlertCircle } from 'lucide-react';

interface MessageItem {
  id: string;
  sender_type: MessageSender;
  content: string;
  created_at: string;
}

interface ChatWindowProps {
  contact: {
    id: string;
    name: string | null;
    phone: string;
    is_ai_active: boolean;
    last_interaction_at: string;
  };
  messages: MessageItem[];
}

export function ChatWindow({ contact, messages }: ChatWindowProps) {
  const is24hValid = isWithin24HourWindow(contact.last_interaction_at);
  const remainingHours = getRemainingHoursInWindow(contact.last_interaction_at);

  const handleSendMessage = async (text: string) => {
    await sendAgentMessage(contact.id, text);
  };

  const handleSendTemplate = async (templateKey: MetaTemplateKey) => {
    await sendAgentTemplate(contact.id, templateKey);
  };

  const handleToggleAi = async (newState: boolean) => {
    await toggleContactAi(contact.id, newState);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Cabecera del Chat */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {contact.name || 'Lead de WhatsApp'}
          </h2>
          <div className="flex items-center gap-2 text-xs text-gray-500 font-mono mt-0.5">
            <Phone className="w-3.5 h-3.5" />
            <span>{contact.phone}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Indicador de la Ventana de 24h de Meta */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
              is24hValid
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-amber-50 text-amber-800 border-amber-300'
            }`}
          >
            {is24hValid ? (
              <>
                <Clock className="w-3.5 h-3.5" />
                <span>Ventana 24h: {remainingHours}h restantes</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Ventana 24h Expirada</span>
              </>
            )}
          </div>

          {/* Switch IA / Control Humano */}
          <AiToggleSwitch
            contactId={contact.id}
            initialIsAiActive={contact.is_ai_active}
            onToggle={handleToggleAi}
          />
        </div>
      </div>

      {/* Lista de Mensajes */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40 space-y-1">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            No hay mensajes registrados con este contacto.
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              content={msg.content}
              senderType={msg.sender_type}
              createdAt={msg.created_at}
            />
          ))
        )}
      </div>

      {/* Input de Chat con selector estático de plantillas */}
      <ChatInput
        contactId={contact.id}
        isWithin24h={is24hValid}
        onSendMessage={handleSendMessage}
        onSendTemplate={handleSendTemplate}
      />
    </div>
  );
}

