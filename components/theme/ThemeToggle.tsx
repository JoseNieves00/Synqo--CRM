'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Laptop, Check } from 'lucide-react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  // Evita mismatch de hidratación SSR
  useEffect(() => {
    setMounted(true);
  }, []);

  // Cierra al hacer clic fuera o presionar Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!mounted) {
    return (
      <div className={`w-8 h-8 rounded-lg bg-slate-200/50 dark:bg-[#131722] animate-pulse ${className}`} />
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={
          theme === 'system'
            ? `Tema: Automático del Sistema (${isDark ? 'Oscuro activo' : 'Claro activo'})`
            : theme === 'dark'
            ? 'Tema: Modo Oscuro'
            : 'Tema: Modo Claro'
        }
        aria-label="Configurar tema de la interfaz"
        aria-expanded={isOpen}
        className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#131722] transition-colors cursor-pointer relative"
      >
        {theme === 'system' ? (
          <Laptop className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
        ) : isDark ? (
          <Moon className="w-4 h-4 text-slate-700 dark:text-slate-300" />
        ) : (
          <Sun className="w-4 h-4 text-amber-500" />
        )}
      </button>

      {/* Popover flotante hacia arriba con las 3 opciones */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-48 bg-white dark:bg-[#131722] rounded-xl shadow-xl border border-slate-200 dark:border-[#232A3B] p-1.5 z-50 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Tema de la Interfaz
          </div>

          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setTheme('light');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-blue-50 dark:bg-[#0052FF]/20 text-[#0052FF] dark:text-[#00D2FF] font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1A1F2C]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Modo Claro</span>
              </div>
              {theme === 'light' && <Check className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setTheme('dark');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                theme === 'dark'
                  ? 'bg-blue-50 dark:bg-[#0052FF]/20 text-[#0052FF] dark:text-[#00D2FF] font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1A1F2C]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Moon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                <span>Modo Oscuro</span>
              </div>
              {theme === 'dark' && <Check className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setTheme('system');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                theme === 'system'
                  ? 'bg-blue-50 dark:bg-[#0052FF]/20 text-[#0052FF] dark:text-[#00D2FF] font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1A1F2C]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Laptop className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                <div className="flex flex-col text-left">
                  <span>Automático</span>
                  <span className="text-[10px] text-slate-400 font-normal">Sigue al sistema</span>
                </div>
              </div>
              {theme === 'system' && <Check className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
