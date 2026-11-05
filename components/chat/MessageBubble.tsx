import React, { useState, useMemo } from 'react';
import { MessageSender } from '@/lib/supabase/types';
import { Bot, User, ShieldCheck, Maximize2, X, Download, FileText, ExternalLink, Clock, Mic, AudioLines } from 'lucide-react';
import { parseImageMessageContent, parseDocumentMessageContent, parseAudioMessageContent } from '@/lib/media/format';

interface MessageBubbleProps {
  id?: string;
  content: string;
  senderType: MessageSender;
  createdAt: string;
}

export const MessageBubble = React.memo(
  function MessageBubble({ id, content, senderType, createdAt }: MessageBubbleProps) {
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

    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const imageInfo = useMemo(() => parseImageMessageContent(content), [content]);
    const docInfo = useMemo(() => parseDocumentMessageContent(content), [content]);
    const audioInfo = useMemo(() => parseAudioMessageContent(content), [content]);

    const voiceNoteInfo = useMemo(() => {
      if (!content.includes('🎤') && !content.includes('[Nota de voz]')) {
        return { isVoiceNote: false, transcription: '' };
      }
      const match = content.match(/🎤\s*\[Nota de voz\](?::\s*["“]([\s\S]*?)["”])?/);
      if (match) {
        return {
          isVoiceNote: true,
          transcription: match[1]?.trim() || '',
        };
      }
      if (content.startsWith('🎤')) {
        return {
          isVoiceNote: true,
          transcription: content.replace(/^🎤\s*/, '').trim(),
        };
      }
      return { isVoiceNote: false, transcription: '' };
    }, [content]);

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

  return (
    <>
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

          {/* Renderizado de Imagen */}
          {imageInfo.isImage && imageInfo.url ? (
            <div className="space-y-1.5 my-1">
              <div
                onClick={() => setIsLightboxOpen(true)}
                className="relative group cursor-pointer overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-sm min-w-[200px] min-h-[140px] aspect-[4/3] bg-slate-100/70 dark:bg-black/30 flex items-center justify-center transition-colors"
              >
                <img
                  src={imageInfo.url}
                  alt={imageInfo.caption || 'Imagen adjunta'}
                  loading="lazy"
                  decoding="async"
                  className="max-h-64 w-full h-full rounded-xl object-cover hover:scale-[1.02] transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
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
              {audioInfo.transcription && (
                <p className="text-xs leading-relaxed italic opacity-90 pl-1">
                  «{audioInfo.transcription}»
                </p>
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
              {voiceNoteInfo.transcription ? (
                <div
                  className={`text-xs leading-relaxed pl-2.5 py-0.5 border-l-2 ${
                    isAgent
                      ? 'border-white/50 text-white/95'
                      : 'border-emerald-500/50 dark:border-emerald-400/50 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <span className="italic">«{voiceNoteInfo.transcription}»</span>
                </div>
              ) : (
                <p className="text-[11px] opacity-75 italic">Nota de voz recibida</p>
              )}
            </div>
          ) : (
            /* Contenido de texto regular */
            <p className="whitespace-pre-wrap break-words leading-relaxed font-normal">
              {content}
            </p>
          )}

          {/* Hora y estado de envío optimista */}
          <div suppressHydrationWarning className="text-[10px] mt-1 text-right font-mono opacity-65 flex items-center justify-end gap-1 select-none">
            {isPending && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-sans opacity-90 animate-pulse">
                <Clock className="w-2.5 h-2.5" />
                <span>Enviando</span>
              </span>
            )}
            <span>{formattedTime}</span>
          </div>
        </div>
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
    </>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.content === nextProps.content &&
    prevProps.senderType === nextProps.senderType &&
    prevProps.createdAt === nextProps.createdAt
  );
});
