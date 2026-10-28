'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ShieldCheck, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { staffRegisterWithInvitation } from '@/app/actions/staff';

interface StaffJoinClientProps {
  token: string;
  isValid: boolean;
  companyName: string;
  errorMessage?: string;
}

export function StaffJoinClient({ token, isValid, companyName, errorMessage }: StaffJoinClientProps) {
  const router = useRouter();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isValid) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center px-4 py-8 max-w-md mx-auto">
        <div className="bg-slate-900 border border-rose-900/60 rounded-2xl p-6 text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-2xl mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white">Invitación No Válida</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {errorMessage || 'Este enlace de invitación ha caducado (vigencia máxima: 24 horas) o ya fue utilizado.'}
          </p>
          <button
            onClick={() => router.push('/colaborador')}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition"
          >
            Ir a Iniciar Sesión
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await staffRegisterWithInvitation({
        token,
        name,
        phone,
        specialty,
        password,
      });
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Error al completar el registro.');
    } finally {
      setLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center px-4 py-8 max-w-md mx-auto">
        <div className="bg-slate-900 border border-emerald-900/60 rounded-2xl p-6 text-center space-y-4 shadow-xl animate-in fade-in zoom-in-95 duration-200">
          <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-white">¡Registro Enviado con Éxito!</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Te has registrado en el equipo de <strong className="text-white">{companyName}</strong>.
          </p>
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 text-[11px] text-slate-400">
            ⏳ Por seguridad, el administrador debe aprobar tu ingreso antes de que puedas acceder a la agenda. Te avisarán en cuanto esté listo.
          </div>
          <button
            onClick={() => router.push('/colaborador')}
            className="w-full py-3 bg-[#0052FF] hover:bg-[#0047E0] text-white font-bold text-xs rounded-xl transition shadow-lg shadow-[#0052FF]/20 flex items-center justify-center gap-1.5"
          >
            Ir a la Pantalla de Ingreso
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center px-4 py-8 max-w-md mx-auto">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-[#0052FF] rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-[#0052FF]/30 mb-3">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
          Invitación de Equipo
        </span>
        <h1 className="text-xl font-black text-white mt-0.5">Únete a {companyName}</h1>
        <p className="text-xs text-slate-400 mt-1">Crea tu usuario para gestionar tu agenda y turnos</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Nombre Completo
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Carlos Morales"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Número de Celular (Tu usuario de ingreso)
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+57 300 123 4567"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Especialidad o Cargo
            </label>
            <input
              type="text"
              required
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="Ej. Profesor de Acordeón, Barbero, etc."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 car."
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Confirmar
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite clave"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-[#0052FF]/20 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {loading ? 'Registrando...' : 'Completar Registro'}
          </button>
        </form>

        <div className="mt-5 pt-3.5 border-t border-slate-800 text-center">
          <span className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Invitación segura con consumo de uso único
          </span>
        </div>
      </div>
    </div>
  );
}

