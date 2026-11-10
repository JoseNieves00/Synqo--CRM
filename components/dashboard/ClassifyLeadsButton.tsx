'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { classifyUnclassifiedLeadsAction } from '@/app/actions/contacts';

interface ClassifyLeadsButtonProps {
  initialUnclassified: number;
}

export function ClassifyLeadsButton({ initialUnclassified }: ClassifyLeadsButtonProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(initialUnclassified);
  const [classifiedSoFar, setClassifiedSoFar] = useState(0);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  if (initialUnclassified <= 0 && !doneMessage) return null;

  const handleClassifyAll = async () => {
    if (running) return;
    setRunning(true);
    setDoneMessage(null);

    let totalDone = 0;
    let totalStages = 0;
    let rem = initialUnclassified;

    try {
      // Ejecutar en lotes de 20 para evitar timeouts y mostrar progreso real
      for (let round = 0; round < 15 && rem > 0; round++) {
        const res = await classifyUnclassifiedLeadsAction(20);
        totalDone += res.processed;
        totalStages += res.stagesUpdated;
        rem = res.remaining;
        setClassifiedSoFar(totalDone);
        setRemaining(rem);
        if (res.processed === 0 || res.remaining === 0) break;
      }

      setDoneMessage(
        `${totalDone} leads clasificados (${totalStages} movidos en Pipeline)`
      );
      router.refresh();
    } catch (err: any) {
      setDoneMessage(err?.message || 'Error clasificando leads');
    } finally {
      setRunning(false);
    }
  };

  if (doneMessage) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-1 rounded-lg">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>{doneMessage}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClassifyAll}
      disabled={running}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#0052FF]/10 hover:bg-[#0052FF]/20 text-[#0052FF] dark:text-[#00D2FF] border border-[#0052FF]/25 transition cursor-pointer disabled:opacity-60"
      title="Analiza el historial de los leads sin temperatura usando IA ligera y actualiza su etapa en Pipeline"
    >
      {running ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Clasificando {classifiedSoFar} ({remaining} rest.)...</span>
        </>
      ) : (
        <>
          <Sparkles className="w-3 h-3" />
          <span>Clasificar {remaining} sin categoría con IA</span>
        </>
      )}
    </button>
  );
}
