'use client';

import React, { useState, useEffect } from 'react';

interface AiToggleSwitchProps {
  contactId: string;
  initialIsAiActive: boolean;
  onToggle: (newState: boolean) => Promise<void>;
}

export function AiToggleSwitch({
  contactId,
  initialIsAiActive,
  onToggle,
}: AiToggleSwitchProps) {
  const [isActive, setIsActive] = useState(initialIsAiActive);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setIsActive(initialIsAiActive);
  }, [initialIsAiActive, contactId]);

  const handleToggle = async () => {
    if (isUpdating) return;
    const nextState = !isActive;
    setIsActive(nextState);
    setIsUpdating(true);

    try {
      await onToggle(nextState);
    } catch (error) {
      console.error('Error toggling AI switch:', error);
      setIsActive(!nextState);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      className={`h-8 inline-flex items-center gap-2 px-2.5 rounded-xl border transition-all select-none shrink-0 ${
        isActive
          ? 'bg-blue-50/60 dark:bg-[#0052FF]/10 border-blue-200/80 dark:border-blue-500/25 shadow-2xs'
          : 'bg-slate-50/80 dark:bg-[#090A0F] border-slate-200 dark:border-[#232A3B]'
      }`}
      title={
        isActive
          ? 'La IA está respondiendo automáticamente (Pulsa para tomar control manual)'
          : 'Control manual activo (Pulsa para activar la IA)'
      }
    >
      <div className="flex items-center gap-1.5">
        {isActive ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        ) : (
          <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
        )}
        <span
          className={`text-xs font-semibold hidden sm:inline transition-colors ${
            isActive
              ? 'text-[#0052FF] dark:text-[#00D2FF]'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          {isActive ? 'IA Activa' : 'Manual'}
        </span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={isActive}
        disabled={isUpdating}
        onClick={handleToggle}
        className={`relative inline-flex h-4.5 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
          isActive ? 'bg-[#0052FF]' : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
            isActive ? 'translate-x-3.5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

