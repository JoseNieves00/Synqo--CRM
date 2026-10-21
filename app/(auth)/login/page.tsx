'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { signIn } from '@/app/actions/auth';
import { ShieldCheck, Mail, Lock, ArrowRight, Loader2, X } from 'lucide-react';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

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
    <div className="min-h-screen bg-[#090A0F] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Fondo con gradiente y resplandor de marca */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-[#0052FF]/20 via-[#00D2FF]/5 to-transparent blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Logo Oficial Synqo */}
        <div className="flex flex-col items-center justify-center mb-6">
          <Image
            src="/brand/logo.png"
            alt="Synqo"
            width={240}
            height={76}
            priority
            className="h-11 w-auto object-contain"
          />
          <span className="mt-2.5 text-[11px] text-[#00D2FF] font-mono tracking-widest uppercase font-semibold">
            Syncing code, traffic and sales
          </span>
        </div>

        <h2 className="text-center text-xl font-bold text-[#F8FAFC]">
          Iniciar Sesión
        </h2>
        <p className="mt-1 text-center text-xs text-[#94A3B8]">
          Tu mejor vendedor opera en la web 24/7
        </p>
      </div>

      <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-[#131722] border border-[#232A3B] py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
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
                  className="w-full bg-[#090A0F] border border-[#232A3B] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-300">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-[11px] text-[#00D2FF] hover:underline cursor-pointer font-medium"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-[#090A0F] border border-[#232A3B] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-[#0052FF] hover:bg-[#0047E0] text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition shadow-lg shadow-[#0052FF]/25 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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

          {/* Seguridad */}
          <div className="mt-6 pt-5 border-t border-[#232A3B] flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-4 h-4 text-[#0052FF]" />
            <span>Conexión Cifrada & Seguridad Empresarial</span>
          </div>
        </div>
      </div>

      {/* Modal de Cadena de Recuperación de Contraseña */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-[#090A0F]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#131722] border border-[#232A3B] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-[#232A3B] bg-[#090A0F]/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#0052FF]/20 text-[#00D2FF] flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Recuperación de Contraseña</h3>
                  <p className="text-[11px] text-[#94A3B8]">Seguridad multi-inquilino de Synqo</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#232A3B] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-300">
              <p className="leading-relaxed text-slate-400 text-[11px]">
                Por estrictas políticas de protección de datos empresariales, la recuperación de acceso se gestiona de manera jerárquica y asistida:
              </p>

              <div className="space-y-2.5">
                <div className="p-3 rounded-xl bg-[#090A0F] border border-[#232A3B]">
                  <p className="font-semibold text-white flex items-center gap-1.5 mb-1 text-xs">
                    👤 Asesor o Agente Comercial
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Solicita al <strong>Administrador de tu empresa</strong> que regenere tu contraseña temporal desde el CRM (<code className="text-slate-300">Ajustes &gt; Equipo</code>).
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[#090A0F] border border-[#232A3B]">
                  <p className="font-semibold text-white flex items-center gap-1.5 mb-1 text-xs">
                    🏢 Administrador de Empresa
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Comunícate con el <strong>Super Administrador</strong> de Synqo (<code className="text-[#00D2FF]">admin@synqo.dev</code>) para solicitar la reasignación de una nueva clave temporal.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[#090A0F] border border-[#232A3B]">
                  <p className="font-semibold text-white flex items-center gap-1.5 mb-1 text-xs">
                    🛡️ Super Administrador
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Acceso de infraestructura central mediante variables criptográficas maestras.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="w-full mt-3 bg-[#0052FF] hover:bg-[#0047E0] text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition shadow-md shadow-[#0052FF]/20 cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
