'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Send, AlertTriangle, FileText, Lock } from 'lucide-react';

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

  React.useEffect(() => {
    if (availableTemplates.length > 0 && !availableTemplates.some((t) => t.name === selectedTemplate)) {
      setSelectedTemplate(availableTemplates[0].name);
    }
  }, [availableTemplates, selectedTemplate]);

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

  // Modo Solo Lectura / Bloqueo Anti-Colisión (asignado a otro agente)
  if (disabled) {
    return (
      <div className="p-4 bg-slate-100 border-t border-gray-200 flex items-center justify-center gap-2.5 text-xs text-slate-600 font-medium">
        <Lock className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span>{disabledReason || 'Este chat está siendo atendido por otro asesor. Modo solo lectura.'}</span>
      </div>
    );
  }

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

        {availableTemplates.length > 0 ? (
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="flex-1 bg-white border border-amber-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
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
              className="flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md text-sm font-medium transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              {loading ? 'Enviando...' : 'Enviar Plantilla Oficial'}
            </button>
          </div>
        ) : (
          <div className="bg-amber-100/80 border border-amber-300 rounded-xl p-3 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>
              Tu empresa no tiene plantillas oficiales registradas. Configura tus plantillas aprobadas en Ajustes para poder contactar prospectos fuera de la ventana de 24 horas.
            </span>
            <Link
              href="/settings"
              className="inline-flex items-center font-bold text-amber-950 hover:underline shrink-0"
            >
              Configurar en Ajustes &rarr;
            </Link>
          </div>
        )}
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
        onChange={(e) => {
          setMessage(e.target.value);
          onTyping?.();
        }}
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

