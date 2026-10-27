'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  Trash2,
  ShieldCheck,
  Building2,
  Zap,
  CreditCard,
  LifeBuoy,
} from 'lucide-react';
import { askAdminCopilot } from '@/app/actions/admin-copilot';

export function AdminCopilotTab() {
  const [messages, setMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([
    {
      role: 'assistant',
      content: `👋 ¡Hola Super Administrador! Soy tu **Admin Copilot**, el asistente de inteligencia operativa de Synqo CRM.

Puedo analizar para ti en tiempo real:
• **Velocidad de Consumo de Tokens (Burn-Rate):** Predecir qué empresas agotarán sus tokens pronto.
• **Riesgo de Cartera & Mora:** Identificar cuentas con facturación atrasada.
• **Estado de Integraciones:** Detectar qué empresas tienen WhatsApp desconectado.
• **Diagnóstico de Soporte:** Resumir las fallas técnicas más frecuentes en GitHub Issues.

*Nota de Privacidad: Cero acceso a SQL en vivo y Cero PII de clientes finales. Solo datos agregados y sanitizados.*

¿Qué deseas consultar hoy?`,
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (queryOverride?: string) => {
    const q = queryOverride || inputQuery;
    if (!q.trim() || loading) return;

    const userMsg = { role: 'user' as const, content: q };
    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const res = await askAdminCopilot(q, messages as any);
      if (res.success) {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.answer }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `⚠️ ${res.error || 'Error al obtener respuesta.'}` },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ Error de red: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        role: 'assistant',
        content: 'Conversación reiniciada. ¿Qué otra consulta operativa o comercial deseas realizar?',
      },
    ]);
  };

  return (
    <div className="space-y-5">
      {/* Cabecera Informativa con Garantía de Seguridad */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#00D2FF]/20 text-[#00D2FF] rounded-lg">
              <Sparkles className="w-4 h-4" />
            </span>
            <h3 className="text-base font-bold text-white tracking-tight">
              Synqo Admin Copilot • Inteligencia Operativa
            </h3>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono">
              Zero PII • Solo Métricas Seguras
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-xl">
            Realiza preguntas ejecutivas sobre tus empresas suscritas, velocidad de consumo de IA, estados de cobranza y diagnóstico de soporte.
          </p>
        </div>

        <button
          type="button"
          onClick={handleClearChat}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 bg-white/10 hover:bg-white/20 transition cursor-pointer self-start sm:self-auto border border-white/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Limpiar Chat</span>
        </button>
      </div>

      {/* Sugerencias Rápidas de Consulta */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mr-1">
          Consultas Frecuentes:
        </span>
        {[
          { label: '🔥 Consumo Crítico de Tokens', q: '¿Cuáles empresas están por encima del 70% de consumo de tokens y cuándo se estima que se agoten?' },
          { label: '💳 Riesgo de Mora', q: '¿Hay alguna empresa con riesgo de mora o suspensión esta semana?' },
          { label: '📱 WhatsApp Desconectado', q: '¿Qué empresas tienen su línea de WhatsApp desconectada actualmente?' },
          { label: '🎫 Frecuencia de Fallas', q: '¿Cuál ha sido la falla o categoría más reportada en tickets de soporte?' },
        ].map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(item.q)}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold border border-gray-200 shadow-2xs transition cursor-pointer"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Ventana de Conversación */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col h-[520px] overflow-hidden">
        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-[#00D2FF] flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                  <Sparkles className="w-4 h-4" />
                </div>
              )}
              <div
                className={`p-4 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 border border-slate-200 text-gray-900 shadow-2xs whitespace-pre-line'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-gray-400 text-xs pl-11">
              <Loader2 className="w-4 h-4 animate-spin text-[#0052FF]" />
              <span>Analizando snapshot de plataforma y métricas de empresas...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-gray-100 bg-white flex items-center gap-2">
          <input
            type="text"
            placeholder="Escribe tu consulta ejecutiva sobre empresas, métricas o soporte..."
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loading}
            className="flex-1 text-xs border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black bg-white"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={loading || !inputQuery.trim()}
            className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Consultar</span>
          </button>
        </div>
      </div>
    </div>
  );
}

