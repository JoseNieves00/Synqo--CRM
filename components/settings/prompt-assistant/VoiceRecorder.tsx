'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';

interface VoiceRecorderProps {
  maxSeconds?: number;
  disabled?: boolean;
  onTranscribed: (text: string) => void;
  onError?: (msg: string) => void;
}

export function VoiceRecorder({
  maxSeconds = 120,
  disabled = false,
  onTranscribed,
  onError,
}: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(maxSeconds);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  };

  useEffect(() => {
    return () => cleanup();
  }, []);

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    if (disabled || recording || transcribing) return;
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      onError?.('Tu navegador no soporta grabación de audio.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const ext = finalMime.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        cleanup();

        if (blob.size < 400) {
          onError?.('La nota de voz fue demasiado corta. Intenta de nuevo.');
          return;
        }

        setTranscribing(true);
        try {
          const file = new File([blob], `nota-voz.${ext}`, { type: finalMime });
          const fd = new FormData();
          fd.append('kind', 'audio');
          fd.append('file', file);

          const res = await fetch('/api/settings/prompt-assistant/import', {
            method: 'POST',
            body: fd,
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error || 'No se pudo transcribir el audio.');
          }
          const transcription = String(data?.transcription || '').trim();
          if (!transcription) {
            onError?.('No se detectó voz clara en la grabación.');
          } else {
            onTranscribed(transcription);
          }
        } catch (err: any) {
          onError?.(err?.message || 'Error al transcribir nota de voz.');
        } finally {
          setTranscribing(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSecondsLeft(maxSeconds);

      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      cleanup();
      onError?.('No pudimos acceder al micrófono. Revisa los permisos del navegador.');
    }
  };

  if (transcribing) {
    return (
      <button
        type="button"
        disabled
        className="p-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-100 dark:bg-[#131722] text-slate-500 flex items-center gap-1.5 text-[11px]"
        title="Transcribiendo audio..."
      >
        <Loader2 className="w-4 h-4 animate-spin text-[#0052FF]" />
      </button>
    );
  }

  if (recording) {
    const mins = Math.floor(secondsLeft / 60);
    const secs = String(secondsLeft % 60).padStart(2, '0');
    return (
      <button
        type="button"
        onClick={stopRecording}
        className="px-2.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-xs animate-pulse cursor-pointer shrink-0"
        title="Detener y transcribir nota de voz"
      >
        <Square className="w-3.5 h-3.5 fill-current" />
        <span className="font-mono">{mins}:{secs}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      className="p-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] hover:bg-slate-50 dark:hover:bg-[#1E2433] text-slate-600 dark:text-slate-300 transition cursor-pointer disabled:opacity-40 shrink-0"
      title="Dictar respuesta con nota de voz (máx 2 min)"
    >
      <Mic className="w-4 h-4" />
    </button>
  );
}
