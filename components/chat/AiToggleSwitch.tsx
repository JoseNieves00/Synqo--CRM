'use client';

import React, { useState, useEffect } from 'react';
import { Bot, UserCheck } from 'lucide-react';

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
      // Revertir en caso de fallo
      setIsActive(!nextState);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#090A0F] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-[#232A3B] shadow-2xs transition-colors">
      <div className="flex items-center gap-1.5">
        {isActive ? (
          <Bot className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
        ) : (
          <UserCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        )}
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 hidden sm:inline">
          {isActive ? 'IA Activa' : 'Control Humano'}
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

