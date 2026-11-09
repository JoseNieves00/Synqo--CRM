import React, { useState, useMemo } from 'react';
import { MessageSender } from '@/lib/supabase/types';
import {
  Bot,
  User,
  ShieldCheck,
  Maximize2,
  X,
  Download,
  FileText,
  ExternalLink,
  Clock,
  Mic,
  AudioLines,
  Sparkles,
  Check,
  CheckCheck,
  Reply,
  Video,
  ThumbsUp,
  ThumbsDown,
  Pencil,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { submitAiFeedback } from '@/app/actions/chat';
import {
  parseImageMessageContent,
  parseDocumentMessageContent,
  parseAudioMessageContent,
  parseVideoMessageContent,
  parseQuoteMessageContent,
} from '@/lib/media/format';

interface MessageBubbleProps {
  id?: string;
  content: string;
  senderType: MessageSender;
  createdAt: string;
  status?: string | null;
  replyToMessageId?: string | null;
  reactions?: { emoji: string; from?: string; reacted_at?: string; ai_feedback?: string } | any;
  contactId?: string;
  onReply?: (msg: { id?: string; senderType: MessageSender; content: string }) => void;
}

export const MessageBubble = React.memo(
  function MessageBubble({ id, content, senderType, createdAt, status, reactions, contactId, onReply }: MessageBubbleProps) {
    const formattedTime = useMemo(() => {
      return new Date(createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }, [createdAt]);

    const isPending = Boolean(id && (id.startsWith('temp-') || id.startsWith('optimistic-')));
    const isLead = senderType === 'lead';
    const isAi = senderType === 'ai';
    const isAgent = senderType === 'agent_manual';

    const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
    const [correctionReason, setCorrectionReason] = useState('');
    const [correctAnswer, setCorrectAnswer] = useState('');
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
    const [localFeedback, setLocalFeedback] = useState<string | null>(reactions?.ai_feedback || null);
    const [feedbackSuccessNotice, setFeedbackSuccessNotice] = useState(false);

    const handleQuickFeedback = async (type: 'helpful' | 'needs_improvement') => {
      if (!id || !contactId || isSubmittingFeedback) return;
      setIsSubmittingFeedback(true);
      try {
        await submitAiFeedback({
          messageId: id,
          contactId,
          feedback: type,
        });
        setLocalFeedback(type);
        setFeedbackSuccessNotice(true);
        setTimeout(() => setFeedbackSuccessNotice(false), 3000);
      } catch (err) {
        console.error('[MessageBubble] Error enviando feedback de IA:', err);
      } finally {
        setIsSubmittingFeedback(false);
      }
    };

    const handleSaveCorrection = async () => {
      if (!id || !contactId || isSubmittingFeedback || (!correctionReason.trim() && !correctAnswer.trim())) return;
      setIsSubmittingFeedback(true);
      try {
        await submitAiFeedback({
          messageId: id,
          contactId,
          feedback: 'needs_improvement',
          feedbackText: correctionReason.trim(),
          correctAnswer: correctAnswer.trim(),
        });
        setLocalFeedback('needs_improvement');
        setIsCorrectionModalOpen(false);
        setFeedbackSuccessNotice(true);
        setTimeout(() => setFeedbackSuccessNotice(false), 3500);
      } catch (err) {
        console.error('[MessageBubble] Error guardando corrección de IA:', err);
      } finally {
        setIsSubmittingFeedback(false);
      }
    };

    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const imageInfo = useMemo(() => parseImageMessageContent(content), [content]);
    const docInfo = useMemo(() => parseDocumentMessageContent(content), [content]);
    const audioInfo = useMemo(() => parseAudioMessageContent(content), [content]);
    const videoInfo = useMemo(() => parseVideoMessageContent(content), [content]);
    const quoteInfo = useMemo(() => parseQuoteMessageContent(content), [content]);

    const voiceNoteInfo = useMemo(() => {
      const audioUrlMatch = content.match(/(https?:\/\/[^\s\]\)]+(?:chat-media|\.(?:ogg|opus|mp3|wav|m4a|webm))[^\s\]\)]*)/i);
      const audioUrl = audioUrlMatch ? audioUrlMatch[1] : undefined;

      if (!content.includes('🎤') && !content.includes('[Nota de voz]') && !audioUrl) {
        return { isVoiceNote: false, transcription: '', isFailed: false, audioUrl: undefined };
      }
      const isPlaceholder = /\[Nota de voz (?:recibida|inaudible|no reproducible)\]/i.test(content);
      if (isPlaceholder) {
        return { isVoiceNote: true, transcription: '', isFailed: true, audioUrl };
      }
      const match = content.match(/🎤\s*\[Nota de voz\](?::\s*["“]([\s\S]*?)["”])?/);
      if (match && match[1]) {
        const text = match[1].trim();
        const isFallback = /\[Nota de voz/i.test(text);
        return {
          isVoiceNote: true,
          transcription: isFallback ? '' : text,
          isFailed: isFallback,
          audioUrl,
        };
      }
      if (content.startsWith('🎤')) {
        const text = content.replace(/^🎤\s*/, '').trim();
        const isFallback = /\[Nota de voz/i.test(text);
        return {
          isVoiceNote: true,
          transcription: isFallback ? '' : text,
          isFailed: isFallback,
          audioUrl,
        };
      }
      return { isVoiceNote: Boolean(audioUrl), transcription: '', isFailed: false, audioUrl };
    }, [content]);

    if (senderType === 'system') {
      const isHandoff = content.includes('Relevo Silencioso') || content.includes('Relevo Solicitado') || content.includes('IA pausada');

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
                {reason || content.replace(/^\[Sistema:\s*/, '').replace(/\]$/, '') || 'Transferido a control humano'}
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

    const renderTicks = () => {
      if (isLead) return null;
      if (isPending) {
        return (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-sans opacity-90 animate-pulse ml-1">
            <Clock className="w-2.5 h-2.5" />
          </span>
        );
      }
      if (status === 'read') {
        return (
          <span title="Leído por el cliente" className="inline-flex ml-1 text-sky-400">
            <CheckCheck className="w-3.5 h-3.5" />
          </span>
        );
      }
      if (status === 'delivered') {
        return (
          <span title="Entregado al celular" className={`inline-flex ml-1 ${isAgent ? 'text-white/80' : 'text-slate-400'}`}>
            <CheckCheck className="w-3.5 h-3.5" />
          </span>
        );
      }
      return (
        <span title="Enviado a WhatsApp" className={`inline-flex ml-1 ${isAgent ? 'text-white/80' : 'text-slate-400'}`}>
          <Check className="w-3.5 h-3.5" />
        </span>
      );
    };

    return (
      <>
        <div className={`group flex w-full my-1.5 items-center gap-1.5 ${isLead ? 'justify-start' : 'justify-end'}`}>
          {/* Botones para mensajes salientes a la izquierda de la burbuja */}
          {!isLead && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
              {onReply && (
                <button
                  type="button"
                  onClick={() => onReply({ id, senderType, content: quoteInfo.actualText || content })}
                  className="p-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                  title="Responder a este mensaje"
                >
                  <Reply className="w-3 h-3" />
                </button>
              )}

              {isAi && id && contactId && (
                <>
                  <button
                    type="button"
                    onClick={() => handleQuickFeedback('helpful')}
                    disabled={isSubmittingFeedback || localFeedback === 'helpful'}
                    className={`p-1 rounded-full transition cursor-pointer ${
                      localFeedback === 'helpful'
                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                    }`}
                    title="Respuesta correcta / útil (👍)"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCorrectionModalOpen(true)}
                    disabled={isSubmittingFeedback}
                    className={`p-1 rounded-full transition cursor-pointer ${
                      localFeedback === 'needs_improvement'
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400'
                    }`}
                    title="Corregir esta respuesta para que la IA aprenda"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          )}

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
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1">
                    <Bot className="w-3 h-3 text-[#0052FF] dark:text-[#00D2FF]" />
                    <span className="text-[#0052FF] dark:text-[#00D2FF] font-mono font-bold">Synqo AI</span>
                  </div>
                  {localFeedback === 'helpful' ? (
                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                      <Check className="w-2.5 h-2.5" /> Aprobada
                    </span>
                  ) : localFeedback === 'needs_improvement' ? (
                    <span className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                      ⚠ Corregida
                    </span>
                  ) : feedbackSuccessNotice ? (
                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      ✓ Guardado
                    </span>
                  ) : null}
                </div>
              )}
              {isAgent && (
                <>
                  <ShieldCheck className="w-3 h-3 text-white/90" />
                  <span className="text-white/95 font-medium">Asesor Humano</span>
                </>
              )}
            </div>

            {/* Mensaje Citado (Quote Callout) si existe */}
            {quoteInfo.hasQuote && (
              <div
                className={`mb-2 p-2 rounded-lg border-l-4 text-[11px] select-none ${
                  isAgent
                    ? 'bg-white/15 border-white/70 text-white/95'
                    : 'bg-slate-100 dark:bg-[#10141f] border-[#0052FF] text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="font-semibold block text-[10px] opacity-80">Mensaje citado:</span>
                <p className="truncate italic font-normal">{quoteInfo.quotedText}</p>
              </div>
            )}

            {/* Renderizado de Video */}
            {videoInfo.isVideo && videoInfo.url ? (
              <div className="space-y-1.5 my-1">
                <div className="relative rounded-xl overflow-hidden border border-black/10 dark:border-white/10 max-w-sm bg-black/40">
                  <video
                    src={videoInfo.url}
                    controls
                    preload="metadata"
                    className="rounded-xl max-h-64 w-full object-contain"
                  />
                </div>
                {videoInfo.caption && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed font-normal">
                    {videoInfo.caption}
                  </p>
                )}
              </div>
            ) : imageInfo.isImage && imageInfo.url ? (
              /* Renderizado de Imagen */
              <div className="space-y-1.5 my-1">
                <div
                  onClick={() => setIsLightboxOpen(true)}
                  className="relative group/img cursor-pointer overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-sm min-w-[200px] min-h-[140px] aspect-[4/3] bg-slate-100/70 dark:bg-black/30 flex items-center justify-center transition-colors"
                >
                  <img
                    src={imageInfo.url}
                    alt={imageInfo.caption || 'Imagen adjunta'}
                    loading="lazy"
                    decoding="async"
                    className="max-h-64 w-full h-full rounded-xl object-cover hover:scale-[1.02] transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="px-2.5 py-1 bg-black/60 text-white rounded-full text-[11px] font-medium flex items-center gap-1 backdrop-blur-xs">
                      <Maximize2 className="w-3 h-3" /> Ver completa
                    </span>
                  </div>
                </div>
                {imageInfo.caption && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed font-normal">
                    {imageInfo.caption}
                  </p>
                )}
              </div>
            ) : docInfo.isDocument ? (
              /* Renderizado de Documento / Archivo */
              <div className="space-y-1.5 my-1">
                <div
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${
                    isAgent
                      ? 'bg-white/15 border-white/20 text-white'
                      : 'bg-slate-50 dark:bg-[#131722] border-slate-200 dark:border-[#232A3B] text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      isAgent
                        ? 'bg-white/20 text-white'
                        : 'bg-blue-50 dark:bg-blue-950/60 text-[#0052FF] dark:text-[#00D2FF]'
                    }`}
                  >
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs truncate" title={docInfo.fileName}>
                      {docInfo.fileName || 'Archivo adjunto'}
                    </p>
                    <span className="text-[10px] opacity-75 font-mono">Documento</span>
                  </div>
                  {docInfo.url && (
                    <a
                      href={docInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={docInfo.fileName}
                      className={`p-1.5 rounded-lg transition shrink-0 cursor-pointer ${
                        isAgent
                          ? 'bg-white/20 hover:bg-white/30 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                      title="Descargar archivo"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                {docInfo.caption && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed font-normal">
                    {docInfo.caption}
                  </p>
                )}
              </div>
            ) : audioInfo.isAudio && audioInfo.url ? (
              /* Renderizado de Audio / Nota de Voz Grabada en CRM */
              <div className="space-y-1.5 my-1 min-w-[220px] sm:min-w-[260px]">
                <div
                  className={`p-2.5 rounded-xl border flex flex-col gap-2 ${
                    isAgent
                      ? 'bg-white/15 border-white/20 text-white'
                      : 'bg-slate-50 dark:bg-[#131722] border-slate-200 dark:border-[#232A3B] text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-full ${isAgent ? 'bg-white/20 text-white' : 'bg-emerald-500 text-white'}`}>
                      <Mic className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-semibold truncate block">Nota de Voz</span>
                      <span className="text-[10px] opacity-75 font-mono">Audio oficial</span>
                    </div>
                  </div>
                  <audio
                    src={audioInfo.url}
                    controls
                    className="w-full h-8 rounded-lg"
                    preload="metadata"
                  />
                </div>
                {audioInfo.transcription && !/\[Nota de voz/i.test(audioInfo.transcription) && (
                  <div
                    className={`mt-1.5 p-2 rounded-xl border text-xs leading-relaxed ${
                      isAgent
                        ? 'bg-white/10 border-white/20 text-white'
                        : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-500/20 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 mb-1 select-none">
                      <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Transcripción del audio</span>
                    </div>
                    <p className="select-text font-normal italic pl-0.5">
                      «{audioInfo.transcription}»
                    </p>
                  </div>
                )}
              </div>
            ) : voiceNoteInfo.isVoiceNote ? (
              /* Renderizado de Nota de Voz de WhatsApp */
              <div className="space-y-2 my-1 min-w-[210px] sm:min-w-[240px]">
                <div
                  className={`flex items-center gap-2.5 p-2 rounded-xl border ${
                    isAgent
                      ? 'bg-white/15 border-white/20 text-white'
                      : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-500/20 text-emerald-950 dark:text-emerald-200'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      isAgent ? 'bg-white/25 text-white' : 'bg-emerald-500 text-white shadow-xs'
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[11px] font-semibold truncate">Nota de Voz WhatsApp</span>
                      <AudioLines className="w-3.5 h-3.5 opacity-75 shrink-0" />
                    </div>
                    <span className="text-[10px] opacity-75 font-mono">Audio transcrito por IA</span>
                  </div>
                </div>
                {voiceNoteInfo.audioUrl && (
                  <audio
                    src={voiceNoteInfo.audioUrl}
                    controls
                    className="w-full h-8 rounded-lg mt-1"
                    preload="metadata"
                  />
                )}
                {voiceNoteInfo.transcription ? (
                  <div
                    className={`mt-1.5 p-2 rounded-xl border text-xs leading-relaxed ${
                      isAgent
                        ? 'bg-white/10 border-white/20 text-white'
                        : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-500/20 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 mb-1 select-none">
                      <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Transcripción del audio</span>
                    </div>
                    <p className="select-text font-normal italic pl-0.5">
                      «{voiceNoteInfo.transcription}»
                    </p>
                  </div>
                ) : (
                  <div className="mt-1 px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2 select-none">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="text-[11px] font-medium">Nota de voz no se pudo transcribir (escuchar en WhatsApp)</span>
                  </div>
                )}
              </div>
            ) : (
              /* Contenido de texto regular */
              <p className="whitespace-pre-wrap break-words leading-relaxed font-normal">
                {quoteInfo.actualText || content}
              </p>
            )}

            {/* Hora y Ticks de Estado (Sent, Delivered, Read) */}
            <div suppressHydrationWarning className="text-[10px] mt-1 text-right font-mono opacity-75 flex items-center justify-end gap-0.5 select-none">
              <span>{formattedTime}</span>
              {renderTicks()}
            </div>

            {/* Reacción de WhatsApp con Emoji si existe */}
            {reactions?.emoji && (
              <div
                className={`absolute -bottom-2.5 ${isLead ? 'right-2' : 'left-2'} px-1.5 py-0.5 rounded-full bg-white dark:bg-[#1E2433] border border-slate-200 dark:border-[#2E384D] shadow-xs text-xs flex items-center justify-center select-none z-10 animate-in zoom-in-75 duration-150`}
                title={reactions.from === 'lead' ? 'Reacción del cliente' : 'Reacción'}
              >
                <span className="text-[13px] leading-none">{reactions.emoji}</span>
              </div>
            )}
          </div>

          {/* Botón de Citar (para mensajes entrantes a la derecha) */}
          {isLead && onReply && (
            <button
              type="button"
              onClick={() => onReply({ id, senderType, content: quoteInfo.actualText || content })}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer shrink-0"
              title="Responder a este mensaje"
            >
              <Reply className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Lightbox / Modal de Imagen a Pantalla Completa */}
        {isLightboxOpen && imageInfo.url && (
          <div
            onClick={() => setIsLightboxOpen(false)}
            className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-150"
          >
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <a
                href={imageInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                download
                onClick={(e) => e.stopPropagation()}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Descargar imagen"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Cerrar vista"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              onClick={(e) => e.stopPropagation()}
              className="max-w-4xl max-h-[85vh] flex flex-col items-center"
            >
              <img
                src={imageInfo.url}
                alt={imageInfo.caption || 'Imagen completa'}
                className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
              />
              {imageInfo.caption && (
                <p className="mt-3 text-white/90 text-xs bg-black/60 px-4 py-1.5 rounded-full text-center max-w-lg">
                  {imageInfo.caption}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Modal de Corrección de Respuesta de la IA */}
        {isCorrectionModalOpen && (
          <div
            onClick={() => setIsCorrectionModalOpen(false)}
            className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#1E2433] pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF]">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Corregir Respuesta de la IA
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Entrena a la IA para que aprenda el dato correcto en futuros chats.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCorrectionModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mensaje original de la IA */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-xs">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Respuesta dada por la IA:
                </span>
                <p className="text-slate-700 dark:text-slate-300 italic line-clamp-3">
                  &ldquo;{content}&rdquo;
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    ¿Qué estuvo mal o inexacto?
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: El precio de la cocina pequeña es $350.000, no $360.000"
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    ¿Cuál debió ser la respuesta correcta?
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Escribe la respuesta exacta que debió darle al cliente..."
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF] resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#1E2433]">
                <button
                  type="button"
                  onClick={() => setIsCorrectionModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2433] transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveCorrection}
                  disabled={isSubmittingFeedback || (!correctionReason.trim() && !correctAnswer.trim())}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#0052FF] hover:bg-[#0043D4] text-white transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingFeedback ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Corrección</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.id === nextProps.id &&
      prevProps.content === nextProps.content &&
      prevProps.senderType === nextProps.senderType &&
      prevProps.createdAt === nextProps.createdAt &&
      prevProps.status === nextProps.status &&
      prevProps.replyToMessageId === nextProps.replyToMessageId &&
      JSON.stringify(prevProps.reactions) === JSON.stringify(nextProps.reactions)
    );
  }
);
