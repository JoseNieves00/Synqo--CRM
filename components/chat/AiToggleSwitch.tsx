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
    <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
      <div className="flex items-center gap-1.5">
        {isActive ? (
          <Bot className="w-4 h-4 text-[#0052FF] animate-pulse" />
        ) : (
          <UserCheck className="w-4 h-4 text-amber-600" />
        )}
        <span className="text-xs font-semibold text-gray-700">
          {isActive ? 'IA Activa' : 'Control Humano'}
        </span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={isActive}
        disabled={isUpdating}
        onClick={handleToggle}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-1 disabled:opacity-50 ${
          isActive ? 'bg-[#0052FF]' : 'bg-gray-300'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
            isActive ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

