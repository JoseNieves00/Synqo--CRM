'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Bot,
  MessageSquare,
  Send,
  Zap,
} from 'lucide-react';
import { sendBatchApologyMessage, BatchApologyResult } from '@/app/actions/chat';

interface ContactSummary {
  id: string;
  name: string | null;
  phone: string;
}

interface BatchApologyModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedContacts: ContactSummary[];
  currentUserName?: string;
  onSuccess: (result: BatchApologyResult) => void;
}

const PRESET_TEMPLATES = [
  {
    id: 'empatica',
    title: 'Empática (Recomendada)',
    text: '¡Hola {{nombre}}! Te ofrezco una sincera disculpa por la demora en responderte, teníamos una congestión en la línea. Ya estoy aquí contigo para atenderte con prioridad. Cuéntame, ¿todavía te podemos colaborar con tu consulta?',
  },
  {
    id: 'directa',
    title: 'Corta y Directa',
    text: 'Hola {{nombre}}, discúlpanos por la tardanza. Ya estoy conectado para ayudarte de inmediato. ¿En qué te puedo colaborar hoy?',
  },
  {
    id: 'prioridad',
    title: 'Cierre Comercial',
    text: '¡Hola {{nombre}}! Mil disculpas por no responderte antes. Ya tomé tu chat personalmente para darte atención prioritaria y asesorarte de una vez. ¿Me confirmas qué información necesitas?',
  },
];

export function BatchApologyModal({
  isOpen,
  onClose,
  selectedContacts,
  currentUserName = 'Asesor',
  onSuccess,
}: BatchApologyModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('empatica');
  const [messageText, setMessageText] = useState<string>(PRESET_TEMPLATES[0].text);
  const [assignToMe, setAssignToMe] = useState<boolean>(true);
  const [leaveAiActive, setLeaveAiActive] = useState<boolean>(false);

  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<BatchApologyResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Primer contacto para la vista previa en vivo
  const sampleContact = selectedContacts[0] || { name: 'María Gómez', phone: '+57 300 123 4567' };
  const sampleFirstName = sampleContact.name?.trim().split(' ')[0] || 'Cliente';
  const advisorFirstName = currentUserName.trim().split(' ')[0] || 'Asesor';

  const previewText = useMemo(() => {
    return messageText
      .replace(/\{\{nombre\}\}/gi, sampleFirstName)
      .replace(/\{\{nombre_completo\}\}/gi, sampleContact.name || sampleFirstName)
      .replace(/\{\{asesor\}\}/gi, advisorFirstName)
      .replace(/\{\{empresa\}\}/gi, 'nuestro equipo')
      .replace(/¡Hola\s+!/gi, '¡Hola!')
      .replace(/Hola\s+,/gi, 'Hola,')
      .trim();
  }, [messageText, sampleFirstName, sampleContact.name, advisorFirstName]);

  if (!mounted || !isOpen) return null;

  const handleInsertVariable = (variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMessageText((prev) => `${prev} ${variable}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = messageText;
    const updated = current.substring(0, start) + variable + current.substring(end);
    setMessageText(updated);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 10);
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const found = PRESET_TEMPLATES.find((p) => p.id === presetId);
    if (found) {
      setMessageText(found.text);
    }
  };

  const handleStartSending = async () => {
    if (!messageText.trim()) {
      setErrorMessage('El mensaje no puede estar vacío.');
      return;
    }

    setIsSending(true);
    setErrorMessage(null);

    try {
      const contactIds = selectedContacts.map((c) => c.id);
      const res = await sendBatchApologyMessage({
        contactIds,
        messageTemplate: messageText,
        leaveAiActive,
        assignToMe,
      });

      setSendResult(res);
      onSuccess(res);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al despachar el lote de disculpas.');
    } finally {
      setIsSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-white dark:bg-[#131722] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#232A3B] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabecera del Modal */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232A3B] flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <span>Rescate Masivo por Demora</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  {selectedContacts.length} {selectedContacts.length === 1 ? 'chat' : 'chats'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pide disculpas con empatía y retoma clientes que llevan tiempo esperando respuesta.
              </p>
            </div>
          </div>
          {!isSending && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Contenido del Modal */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {sendResult ? (
            /* Pantalla de Éxito */
            <div className="py-6 text-center space-y-4 animate-in fade-in">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  ¡Despacho Masivo Completado!
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  Se enviaron {sendResult.successful} de {sendResult.total} mensajes de rescate. El timer de espera SLA se ha reiniciado y los chats pasaron a estado atendido.
                </p>
              </div>

              {sendResult.failed > 0 && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/30 text-rose-700 dark:text-rose-300 text-[11px] text-left space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{sendResult.failed} contactos no pudieron recibir el mensaje:</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 opacity-90 max-h-24 overflow-y-auto">
                    {sendResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                Cerrar y volver a la bandeja
              </button>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Plantillas Rápidas */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  1. Selecciona un tono de respuesta:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_TEMPLATES.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`p-2 rounded-xl text-left border transition cursor-pointer ${
                        selectedPreset === preset.id
                          ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-500/50 text-amber-900 dark:text-amber-200 font-bold shadow-2xs'
                          : 'bg-slate-50 dark:bg-[#1A1F2C] border-slate-200 dark:border-[#232A3B] text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <div className="truncate">{preset.title}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor del Mensaje con Variables */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    2. Mensaje a enviar (puedes personalizarlo):
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400 mr-1">Insertar:</span>
                    <button
                      type="button"
                      onClick={() => handleInsertVariable('{{nombre}}')}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 dark:bg-[#0052FF]/15 text-[#0052FF] dark:text-[#00D2FF] border border-blue-200 dark:border-[#00D2FF]/20 hover:bg-blue-100 transition cursor-pointer"
                      title="Inserta el primer nombre del cliente (ej. Juan)"
                    >
                      + &#123;&#123;nombre&#125;&#125;
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertVariable('{{asesor}}')}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B] hover:bg-slate-200 transition cursor-pointer"
                      title="Inserta tu nombre de asesor"
                    >
                      + &#123;&#123;asesor&#125;&#125;
                    </button>
                  </div>
                </div>

                <textarea
                  ref={textareaRef}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  disabled={isSending}
                  rows={4}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#090A0F] text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 transition leading-relaxed resize-none shadow-2xs"
                  placeholder="Escribe el mensaje de disculpa y rescate..."
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>Variables disponibles: &#123;&#123;nombre&#125;&#125;, &#123;&#123;asesor&#125;&#125;, &#123;&#123;empresa&#125;&#125;</span>
                  <span>{messageText.length} caracteres</span>
                </div>
              </div>

              {/* Vista Previa en Vivo (Estilo Burbuja WhatsApp) */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  3. Vista previa real (ejemplo para {sampleContact.name || sampleContact.phone}):
                </label>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#090A0F] border border-slate-200 dark:border-[#1E2433]">
                  <div className="max-w-[85%] ml-auto bg-[#DCF8C6] dark:bg-[#005c4b] text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-xs shadow-xs relative">
                    <p className="whitespace-pre-wrap leading-relaxed">{previewText}</p>
                    <div className="text-[10px] text-slate-400 dark:text-slate-300/70 text-right mt-1">
                      Ahora · Enviado vía Synqo
                    </div>
                  </div>
                </div>
              </div>

              {/* Opciones de Operación Comercial */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1A1F2C]/60 border border-slate-200 dark:border-[#232A3B] space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={assignToMe}
                    onChange={(e) => setAssignToMe(e.target.checked)}
                    disabled={isSending}
                    className="w-4 h-4 rounded text-[#0052FF] focus:ring-0 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                    <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                    <span>Asignarme estos {selectedContacts.length} chats a mí para atender las respuestas</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={leaveAiActive}
                    onChange={(e) => setLeaveAiActive(e.target.checked)}
                    disabled={isSending}
                    className="w-4 h-4 rounded text-[#0052FF] focus:ring-0 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                    <Bot className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Reactivar la IA tras el envío (la IA responderá si el cliente contesta)</span>
                  </div>
                </label>
              </div>

              {/* Aviso de Protección Anti-Ban y WhatsApp */}
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>
                  Synqo espaciará los envíos automáticamente a 2 por segundo para cuidar tu número y reputación en WhatsApp.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Pie del Modal con Acciones */}
        {!sendResult && (
          <div className="px-5 py-3.5 border-t border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B] flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1A1F2C] font-semibold text-xs transition cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleStartSending}
              disabled={isSending || selectedContacts.length === 0}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs inline-flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Despachando rescate masivo...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Despachar disculpa a {selectedContacts.length} chats</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
