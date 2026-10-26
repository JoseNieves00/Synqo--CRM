'use client';

import React, { useState } from 'react';
import { Send, AlertTriangle, FileText } from 'lucide-react';
import { META_TEMPLATES, MetaTemplateKey } from '@/services/whatsapp.service';

interface ChatInputProps {
  contactId: string;
  isWithin24h: boolean;
  onSendMessage: (text: string) => Promise<void>;
  onSendTemplate: (templateName: string) => Promise<void>;
  customTemplates?: Array<{ name: string; label: string }>;
}

export function ChatInput({
  contactId,
  isWithin24h,
  onSendMessage,
  onSendTemplate,
  customTemplates,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('reactivacion_lead');
  const [loading, setLoading] = useState(false);

  const handleSubmitText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || loading) return;
    setLoading(true);
    try {
      await onSendMessage(message);
      setMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleSendTemplate = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onSendTemplate(selectedTemplate);
    } finally {
      setLoading(false);
    }
  };

  // Parche 4: Si la ventana de 24 horas de Meta expiró, bloquear texto libre y mostrar selector estático
  if (!isWithin24h) {
    return (
      <div className="p-4 bg-amber-50 border-t border-amber-200">
        <div className="flex items-start gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Ventana de 24 horas de Meta cerrada</p>
            <p className="text-xs text-amber-700">
              Han transcurrido más de 24 horas desde la última respuesta (o es un contacto nuevo). Para iniciar o reanudar el contacto de forma oficial, envía una plantilla pre-aprobada por Meta:
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="flex-1 bg-white border border-amber-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
          >
            {/* Plantillas del catálogo estándar */}
            {Object.entries(META_TEMPLATES).map(([key, item]) => (
              <option key={key} value={item.name}>
                {item.label} ({item.name})
              </option>
            ))}

            {/* Plantillas dinámicas personalizadas de la empresa */}
            {customTemplates?.filter(t => !META_TEMPLATES[t.name as MetaTemplateKey]).map((tpl) => (
              <option key={tpl.name} value={tpl.name}>
                {tpl.label || tpl.name} ({tpl.name})
              </option>
            ))}
          </select>

          <button
            onClick={handleSendTemplate}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md text-sm font-medium transition shadow-sm disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            {loading ? 'Enviando...' : 'Enviar Plantilla Oficial'}
          </button>
        </div>
      </div>
    );
  }

  // Dentro de las 24 horas: input libre normal para el agente humano
  return (
    <form onSubmit={handleSubmitText} className="p-4 bg-white border-t border-gray-200 flex gap-2">
      <input
        type="text"
        placeholder="Escribe un mensaje como agente (esto pausará la IA automáticamente)..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={loading}
        className="flex-1 border border-gray-300 rounded-md px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0052FF] disabled:bg-gray-100"
      />
      <button
        type="submit"
        disabled={loading || !message.trim()}
        className="bg-[#0052FF] hover:bg-[#0047E0] text-white px-4 py-2 rounded-md transition shadow-sm disabled:opacity-50 flex items-center justify-center cursor-pointer"
      >
        <Send className="w-4 h-4" />
      </button>
    </form>
  );
}

