'use client';

import React, { useState } from 'react';
import { signIn } from '@/app/actions/auth';
import { ShieldCheck, Mail, Lock, ArrowRight, Loader2, Info } from 'lucide-react';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await signIn(formData);
      if (res?.error) {
        setError(res.error);
        setLoading(false);
      }
    } catch (err: any) {
      // Next.js redirect() throws a NEXT_REDIRECT error on success
      if (err?.message?.includes('NEXT_REDIRECT')) {
        return;
      }
      setError(err?.message || 'Credenciales inválidas o error de conexión.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Fondo con gradiente sutil */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-emerald-500/10 to-transparent blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Logo Synqo */}
        <div className="flex justify-center items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-2xl shadow-lg shadow-emerald-500/20">
            S
          </div>
          <div>
            <span className="text-2xl font-black text-white tracking-tight">Synqo CRM</span>
            <span className="block text-[11px] text-emerald-400 font-mono tracking-widest uppercase">
              AI WhatsApp Engine
            </span>
          </div>
        </div>

        <h2 className="text-center text-xl font-bold text-slate-200">
          Iniciar Sesión
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          Accede al panel de gestión comercial y automatización de tu organización
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          {error && (
            <div className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="admin@tuempresa.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 px-4 rounded-lg text-sm transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Verificando...
                </>
              ) : (
                <>
                  Entrar al CRM <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Aviso de Registro Privado / Super Admin */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <div className="flex items-start gap-2.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/60 text-slate-400 text-xs leading-relaxed">
              <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>
                El alta de nuevas empresas es gestionado exclusivamente por el <strong>Super Administrador</strong> de Synqo. Si tu organización aún no cuenta con acceso, comunícate con tu asesor comercial.
              </span>
            </div>
          </div>

          {/* Seguridad */}
          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Aislamiento Multi-Tenant con Row Level Security</span>
          </div>
        </div>
      </div>
    </div>
  );
}
