'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Send, User, RotateCcw, X, Sparkles, Clock, Zap, Loader2, Pencil, CheckCircle2, Check } from 'lucide-react';
import { simulateBotMessage } from '@/app/actions/settings';
import { teachAgentFromSandboxAction } from '@/app/actions/prompt-assistant';

interface BotSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  temporaryPrompt?: string;
  botName?: string;
  suggestedQuestions?: string[];
  targetOrganizationId?: string;
  onMessageSimulated?: () => void;
  onPromptPatched?: (newPrompt: string) => void;
}

export interface SimulatedProductCard {
  name: string;
  price?: string | number;
  caption?: string;
  url: string;
}

interface SimulatedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  latencyMs?: number;
  model?: string;
  productCards?: SimulatedProductCard[];
  toolCalls?: Array<{ name: string; args: any; status: string }>;
  leadProfileUpdate?: any;
}

export function BotSandboxModal({
  isOpen,
  onClose,
  temporaryPrompt,
  botName = 'Synqo AI',
  suggestedQuestions,
  targetOrganizationId,
  onMessageSimulated,
  onPromptPatched,
}: BotSandboxModalProps) {
  const [mounted, setMounted] = useState(false);
  const [workingPrompt, setWorkingPrompt] = useState(temporaryPrompt || '');
  const [messages, setMessages] = useState<SimulatedMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '¡Hola! Soy el simulador de tu Bot de IA. Puedes escribirme cualquier pregunta que haría un cliente para probar cómo responderé antes de activar cambios en producción.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [teachingMessageId, setTeachingMessageId] = useState<string | null>(null);
  const [teachInput, setTeachInput] = useState('');
  const [isTeaching, setIsTeaching] = useState(false);
  const [taughtFeedback, setTaughtFeedback] = useState<{ id: string; message: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (temporaryPrompt !== undefined) {
      setWorkingPrompt(temporaryPrompt);
    }
  }, [temporaryPrompt]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen || !mounted) return null;

  const handleSend = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cleanInput = input.trim();
    if (!cleanInput || isLoading) return;

    const userMsg: SimulatedMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: cleanInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const historyPayload = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          role: m.role,
          content: m.content,
          productCards: m.productCards,
        }));

      const res = await simulateBotMessage({
        userMessage: cleanInput,
        history: historyPayload,
        temporaryPrompt: workingPrompt,
        targetOrganizationId,
      });

      const assistantMsg: SimulatedMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: res.reply || 'Sin respuesta generada.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        latencyMs: res.latencyMs,
        model: res.model,
        productCards: res.productCards,
        toolCalls: res.toolCalls,
        leadProfileUpdate: res.leadProfileUpdate,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      onMessageSimulated?.();
    } catch (err: any) {
      const errorMsg: SimulatedMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Error al simular respuesta: ${err?.message || 'Fallo de conexión'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTeachAgent = async (assistantMsg: SimulatedMessage) => {
    const cleanRule = teachInput.trim();
    if (!cleanRule || isTeaching) return;

    setIsTeaching(true);
    setTaughtFeedback(null);
    try {
      const msgIndex = messages.findIndex((m) => m.id === assistantMsg.id);
      const prevUserMsg = msgIndex > 0 ? messages[msgIndex - 1] : undefined;

      const res = await teachAgentFromSandboxAction({
        userInstruction: cleanRule,
        simulatedQuestion: prevUserMsg?.role === 'user' ? prevUserMsg.content : undefined,
        simulatedAiReply: assistantMsg.content,
        currentPrompt: workingPrompt,
        targetOrganizationId,
      });

      if (res.success && res.patchedPrompt) {
        setWorkingPrompt(res.patchedPrompt);
        onPromptPatched?.(res.patchedPrompt);
        setTaughtFeedback({
          id: assistantMsg.id,
          message: `¡Regla aprendida en "${res.sectionTitle || 'Instrucciones'}"! Tu agente ha sido actualizado.`,
        });
        setTeachInput('');
        setTimeout(() => {
          setTeachingMessageId(null);
        }, 3000);
      } else {
        setTaughtFeedback({
          id: assistantMsg.id,
          message: res.error || 'No se pudo guardar la regla.',
        });
      }
    } catch (err: any) {
      setTaughtFeedback({
        id: assistantMsg.id,
        message: err?.message || 'Error de conexión al guardar regla.',
      });
    } finally {
      setIsTeaching(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Conversación reiniciada. ¿Qué pregunta te gustaría probar?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const defaultQuickPrompts = [
    '¿Qué precios tienen?',
    '¿Tienen disponibilidad mañana a las 3pm?',
    'Quiero hablar con un asesor humano',
    '¿Dónde están ubicados?',
  ];
  const quickPrompts =
    suggestedQuestions && suggestedQuestions.length > 0 ? suggestedQuestions : defaultQuickPrompts;

  const modalContent = (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#0E121B] border border-slate-200 dark:border-[#1E2433] rounded-2xl w-full max-w-xl h-[85vh] max-h-[680px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Cabecera del Sandbox */}
        <div className="p-4 bg-slate-50 dark:bg-[#131722] border-b border-slate-200 dark:border-[#1E2433] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Sandbox de Pruebas: {botName}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  Simulador
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Prueba en vivo tu prompt sin enviar WhatsApps reales a clientes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleReset}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Reiniciar chat de prueba"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Cerrar sandbox"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Ventana de Conversación */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-100/50 dark:bg-[#090A0F]">
          {messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-2xs text-xs space-y-1 ${
                    isUser
                      ? 'bg-[#0052FF] text-white rounded-tr-xs'
                      : 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] rounded-tl-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[10px] opacity-75 font-semibold">
                    <span className="flex items-center gap-1">
                      {isUser ? (
                        <>
                          <User className="w-3 h-3" />
                          <span>Tú (Prospecto de Prueba)</span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-3 h-3 text-[#0052FF] dark:text-[#00D2FF]" />
                          <span>{botName}</span>
                        </>
                      )}
                    </span>
                    <span>{m.timestamp}</span>
                  </div>

                  {/* Tarjetas Visuales de Producto despachadas por la IA */}
                  {!isUser && m.productCards && m.productCards.length > 0 && (
                    <div className="space-y-2 my-2">
                      {m.productCards.map((card, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 text-left"
                        >
                          {card.url && (
                            <div className="relative aspect-[4/3] max-h-56 w-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                              <img
                                src={card.url}
                                alt={card.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="p-2.5 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 dark:text-white text-xs">{card.name}</span>
                              <span className="px-2 py-0.5 rounded-full bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] font-mono font-bold text-[11px]">
                                {typeof card.price === 'number' ? `$${card.price.toLocaleString('es-CO')}` : card.price}
                              </span>
                            </div>
                            {card.caption && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-pre-wrap leading-tight">
                                {card.caption}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="whitespace-pre-wrap leading-relaxed select-text">{m.content}</p>

                  {/* Badges de Herramientas Ejecutadas por el Agente */}
                  {!isUser && m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {m.toolCalls.map((tc, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono"
                        >
                          ⚙️ {tc.name === 'send_product_card' ? `Foto: ${tc.args?.product_name_or_id || ''}` : tc.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {!isUser && m.id !== 'welcome' && (
                    <div className="pt-1.5 mt-1 border-t border-slate-100 dark:border-[#1E2433] space-y-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-2 text-slate-400 font-mono">
                          {m.latencyMs && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" /> {m.latencyMs}ms
                            </span>
                          )}
                          {m.model && (
                            <span className="flex items-center gap-1 text-[9px]">
                              <Zap className="w-2.5 h-2.5 text-amber-500" /> {m.model}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setTeachingMessageId(teachingMessageId === m.id ? null : m.id);
                            setTeachInput('');
                            setTaughtFeedback(null);
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#0052FF] dark:text-[#00D2FF] hover:underline cursor-pointer"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          <span>{teachingMessageId === m.id ? 'Cerrar' : 'Enseñar al Agente'}</span>
                        </button>
                      </div>

                      {teachingMessageId === m.id && (
                        <div className="p-2.5 rounded-xl bg-amber-50/90 dark:bg-amber-500/10 border border-amber-200/90 dark:border-amber-500/30 text-xs space-y-2 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1 text-[11px]">
                              <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                              Enseñar al Agente cómo responder
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-snug">
                            Escribe la regla comercial o respuesta correcta ante esta pregunta. Se incorporará de inmediato al cerebro de tu IA:
                          </p>
                          <textarea
                            rows={2}
                            value={teachInput}
                            onChange={(e) => setTeachInput(e.target.value)}
                            placeholder="Ej: Si preguntan por garantía, aclara que es de 1 año directo con la empresa..."
                            className="w-full text-xs p-2 rounded-lg bg-white dark:bg-[#131722] border border-amber-300 dark:border-amber-500/40 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setTeachingMessageId(null)}
                              className="px-2 py-1 rounded text-[10px] font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={isTeaching || !teachInput.trim()}
                              onClick={() => handleTeachAgent(m)}
                              className="px-2.5 py-1 rounded text-[10px] font-bold text-white bg-[#0052FF] hover:bg-[#0043D4] disabled:opacity-50 flex items-center gap-1 shadow-xs cursor-pointer"
                            >
                              {isTeaching ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
                              <span>Guardar y Aplicar Regla</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {taughtFeedback?.id === m.id && (
                        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 text-[10px] font-medium flex items-center gap-1.5 animate-in fade-in">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{taughtFeedback.message}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {!isUser && m.id === 'welcome' && m.latencyMs && (
                    <div className="pt-1 border-t border-slate-100 dark:border-[#1E2433] flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> {m.latencyMs}ms
                      </span>
                      {m.model && (
                        <span className="flex items-center gap-1 text-[9px]">
                          <Zap className="w-2.5 h-2.5 text-amber-500" /> {m.model}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 shadow-2xs rounded-tl-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0052FF]" />
                <span>La IA está pensando su respuesta...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Sugerencias Rápidas */}
        <div className="p-2 bg-slate-50 dark:bg-[#0E121B] border-t border-slate-200 dark:border-[#1E2433] flex items-center gap-1.5 overflow-x-auto text-[11px]">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 pl-1">
            Probar:
          </span>
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setInput(p);
              }}
              className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#1E2433] border border-slate-200 dark:border-[#232A3B] text-slate-600 dark:text-slate-300 transition text-[11px] shrink-0 cursor-pointer"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input de Mensaje de Prueba */}
        <form
          onSubmit={handleSend}
          className="p-3 bg-white dark:bg-[#131722] border-t border-slate-200 dark:border-[#1E2433] flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Escribe como si fueras un cliente..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-[#0052FF] hover:bg-[#0043D4] text-white px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-40"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}

