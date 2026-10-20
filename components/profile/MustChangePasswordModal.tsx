'use client';

import React, { useState } from 'react';
import { updateUserProfile } from '@/app/actions/profile';
import { Lock, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';

interface MustChangePasswordModalProps {
  mustChange: boolean;
  userEmail: string;
}

export function MustChangePasswordModal({ mustChange, userEmail }: MustChangePasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!mustChange || success) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden. Por favor verifícalas.');
      return;
    }

    setSaving(true);
    try {
      const res = await updateUserProfile({ newPassword });
      if (res.success) {
        setSuccess(true);
        window.location.reload();
      } else {
        setError(res.error || 'Error al actualizar contraseña.');
      }
    } catch (err: any) {
      setError(err.message || 'Error inesperado.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 bg-amber-500/10 border-b border-amber-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold flex-shrink-0 shadow-md">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-950">Cambio de Contraseña Obligatorio</h3>
            <p className="text-xs text-amber-800">Has ingresado con una clave temporal. Por seguridad, debes definir una nueva clave personal para continuar.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Cuenta de Acceso</label>
            <input
              type="text"
              disabled
              value={userEmail}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-100 text-gray-500 text-xs font-mono cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-gray-500" />
              Nueva Contraseña Personal
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs text-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Confirmar Nueva Contraseña
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs text-gray-900"
            />
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 transition shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              {saving ? 'Guardando nueva clave...' : 'Guardar y Continuar al CRM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

