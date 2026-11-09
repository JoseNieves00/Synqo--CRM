'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Download, Mic, AudioLines, Sparkles, AlertCircle, Loader2 } from 'lucide-react';

interface AudioMessagePlayerProps {
  audioUrl?: string;
  messageId?: string;
  transcription?: string;
  isAgent?: boolean;
  isVoiceNote?: boolean;
}

export const AudioMessagePlayer: React.FC<AudioMessagePlayerProps> = ({
  audioUrl: initialAudioUrl,
  messageId,
  transcription,
  isAgent = false,
  isVoiceNote = true,
}) => {
  const [audioUrl, setAudioUrl] = useState<string | undefined>(initialAudioUrl);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialAudioUrl) {
      setAudioUrl(initialAudioUrl);
    }
  }, [initialAudioUrl]);

  const formatSeconds = (sec: number): string => {
    if (isNaN(sec) || !isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleFetchAudioUrl = async (): Promise<string | null> => {
    if (audioUrl) return audioUrl;
    if (!messageId) return null;

    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/chat/media/audio?messageId=${encodeURIComponent(messageId)}`);
      if (!res.ok) throw new Error('No se pudo recuperar el audio');
      const data = await res.json();
      if (data.url) {
        setAudioUrl(data.url);
        return data.url;
      }
      throw new Error('URL vacía');
    } catch (err) {
      console.warn('[AudioMessagePlayer] Error cargando audio:', err);
      setLoadError(true);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlay = async () => {
    let currentUrl: string | null | undefined = audioUrl;
    if (!currentUrl) {
      currentUrl = await handleFetchAudioUrl();
      if (!currentUrl) return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        console.warn('[AudioMessagePlayer] Play error:', err);
      }
    }
  };

  const toggleRate = () => {
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDownloading(true);

    try {
      // 1. Si tenemos messageId, usar endpoint de streaming con attachment header
      if (messageId) {
        const downloadUrl = `/api/chat/media/audio?messageId=${encodeURIComponent(messageId)}&download=1`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `nota_de_voz_${messageId.slice(0, 8)}.ogg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // 2. Fallback: descarga directa vía fetch Blob
      let targetUrl: string | null | undefined = audioUrl;
      if (!targetUrl) {
        targetUrl = await handleFetchAudioUrl();
      }
      if (!targetUrl) return;

      const res = await fetch(targetUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `nota_de_voz_${Date.now()}.ogg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('[AudioMessagePlayer] Error descargando audio:', err);
      if (audioUrl) {
        window.open(audioUrl, '_blank');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !audioRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-1.5 my-1 min-w-[240px] sm:min-w-[280px] max-w-full">
      {/* Contenedor del Reproductor */}
      <div
        className={`p-2.5 rounded-2xl border transition-all ${
          isAgent
            ? 'bg-white/15 border-white/25 text-white shadow-xs'
            : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-500/20 text-emerald-950 dark:text-emerald-100 shadow-xs'
        }`}
      >
        {/* Cabecera: Icono, Etiqueta, Velocidad y Descarga */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                isAgent ? 'bg-white/25 text-white' : 'bg-emerald-500 text-white shadow-xs'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold truncate block leading-tight">
                {isVoiceNote ? 'Nota de Voz WhatsApp' : 'Nota de Voz CRM'}
              </span>
              <span className="text-[9.5px] opacity-75 font-mono block leading-none">
                {audioUrl ? 'Audio listo' : 'Audio en WhatsApp'}
              </span>
            </div>
          </div>

          {/* Acciones: Velocidad y Descarga Directa */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Botón de Velocidad (1x, 1.5x, 2x) */}
            <button
              type="button"
              onClick={toggleRate}
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border transition-colors select-none cursor-pointer ${
                isAgent
                  ? 'border-white/30 bg-white/10 hover:bg-white/20 text-white'
                  : 'border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-black/30 hover:bg-white dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
              }`}
              title="Velocidad de reproducción"
            >
              {playbackRate}×
            </button>

            {/* Botón de Descarga Directa desde el CRM */}
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className={`p-1.5 rounded-lg border transition-all select-none cursor-pointer ${
                isAgent
                  ? 'border-white/30 bg-white/10 hover:bg-white/25 text-white'
                  : 'border-emerald-200 dark:border-emerald-800 bg-emerald-100/70 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-800 text-emerald-800 dark:text-emerald-200'
              } ${isDownloading ? 'opacity-50 cursor-wait' : ''}`}
              title="Descargar audio directamente al computador"
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Barra de Controles: Play/Pause, Línea de Tiempo y Tiempo */}
        <div className="flex items-center gap-2.5">
          {/* Botón Play / Pause */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={isLoading}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer shadow-xs ${
              isAgent
                ? 'bg-white text-emerald-800 hover:bg-white/90'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            title={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* Línea de tiempo Scrubber interactiva */}
          <div className="flex-1 min-w-0 space-y-1">
            <div
              ref={progressRef}
              onClick={handleSeek}
              className={`relative h-2 w-full rounded-full cursor-pointer overflow-hidden transition-all ${
                isAgent ? 'bg-white/25' : 'bg-emerald-200/80 dark:bg-emerald-950/60'
              }`}
              title="Adelantar o retroceder audio"
            >
              <div
                className={`absolute top-0 left-0 bottom-0 rounded-full transition-all duration-75 ${
                  isAgent ? 'bg-white' : 'bg-emerald-600 dark:bg-emerald-400'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Contador de Tiempo transcurrido / Duración */}
            <div className="flex items-center justify-between text-[10px] font-mono opacity-80 leading-none">
              <span>{formatSeconds(currentTime)}</span>
              <span>{duration > 0 ? formatSeconds(duration) : '--:--'}</span>
            </div>
          </div>
        </div>

        {/* Elemento de Audio Oculto */}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (!isNaN(d) && isFinite(d)) setDuration(d);
            }}
            onTimeUpdate={(e) => {
              setCurrentTime(e.currentTarget.currentTime);
            }}
            onEnded={() => {
              setIsPlaying(false);
              setCurrentTime(0);
            }}
            onError={() => {
              setIsPlaying(false);
              setLoadError(true);
            }}
          />
        )}
      </div>

      {/* Botón para Cargar Audio si aún no tenía URL */}
      {!audioUrl && !loadError && (
        <button
          type="button"
          onClick={handleFetchAudioUrl}
          disabled={isLoading}
          className="w-full py-1.5 px-3 rounded-xl border border-dashed border-emerald-400 dark:border-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center justify-center gap-1.5 transition select-none cursor-pointer"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <AudioLines className="w-3.5 h-3.5" />
          )}
          <span>{isLoading ? 'Cargando nota de voz...' : 'Cargar audio para reproducir / descargar'}</span>
        </button>
      )}

      {/* Transcripción del Audio (si existe y es válida) */}
      {transcription ? (
        <div
          className={`p-2 rounded-xl border text-xs leading-relaxed ${
            isAgent
              ? 'bg-white/10 border-white/20 text-white'
              : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-500/20 text-slate-800 dark:text-slate-100'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 mb-1 select-none">
            <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Transcripción del audio</span>
          </div>
          <p className="select-text font-normal italic pl-0.5">«{transcription}»</p>
        </div>
      ) : loadError ? (
        <div className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2 select-none">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-[11px] font-medium">Nota de voz no reproducible o expirada en WhatsApp</span>
        </div>
      ) : (
        <div className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2 select-none">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-[11px] font-medium">Audio no comprensible por IA • Requiere atención de un asesor</span>
        </div>
      )}
    </div>
  );
};
