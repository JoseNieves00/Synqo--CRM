'use client';

import React, { useState, useEffect } from 'react';
import { AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export interface PlatformAnnouncementItem {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
  targetAudience: 'all' | 'paying' | 'evolution';
}

interface PlatformAnnouncementBannerProps {
  announcements: PlatformAnnouncementItem[];
}

export function PlatformAnnouncementBanner({ announcements }: PlatformAnnouncementBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('synqo_dismissed_announcements');
      if (stored) {
        setDismissedIds(JSON.parse(stored));
      }
    } catch {}
  }, []);

  const handleDismiss = (id: string) => {
    const updated = [...dismissedIds, id];
    setDismissedIds(updated);
    try {
      localStorage.setItem('synqo_dismissed_announcements', JSON.stringify(updated));
    } catch {}
  };

  const visible = (announcements || []).filter((a) => !dismissedIds.includes(a.id));

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 w-full z-20">
      {visible.map((item) => {
        const isUrgent = item.severity === 'urgent';
        const isWarning = item.severity === 'warning';

        const bgClass = isUrgent
          ? 'bg-rose-500 text-white'
          : isWarning
          ? 'bg-amber-500 text-slate-950 font-medium'
          : 'bg-indigo-600 text-white';

        return (
          <div
            key={item.id}
            className={`px-4 py-2 sm:py-2.5 flex items-center justify-between shadow-sm transition-colors ${bgClass}`}
          >
            <div className="flex items-center gap-2.5 text-xs sm:text-sm min-w-0 pr-2">
              {isUrgent ? (
                <AlertCircle className="w-4 h-4 flex-shrink-0 animate-pulse" />
              ) : isWarning ? (
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-slate-950" />
              ) : (
                <Info className="w-4 h-4 flex-shrink-0 text-white/90" />
              )}
              <div className="truncate">
                <span className="font-bold mr-1.5 uppercase tracking-wide text-[11px] sm:text-xs">
                  [{item.title}]
                </span>
                <span className="opacity-95">{item.message}</span>
              </div>
            </div>

            <button
              onClick={() => handleDismiss(item.id)}
              className="p-1 rounded hover:bg-black/10 active:scale-95 transition flex-shrink-0"
              title="Ocultar anuncio"
              aria-label="Ocultar anuncio"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
