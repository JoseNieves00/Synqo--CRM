'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  Download,
  LogOut,
  MessageCircle,
  ShieldAlert,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { exportSuspendedCompanyDataAction } from '@/app/actions/billing';

interface SuspendedOrganizationModalProps {
  orgName: string;
  userFullName: string;
  userEmail: string;
  userRole: string;
  signOutAction: () => Promise<void>;
  statusLabel?: string;
  daysPastDue?: number;
}

export function SuspendedOrganizationModal({
  orgName,
  userFullName,
  userEmail,
  userRole,
  signOutAction,
  statusLabel,
  daysPastDue,
}: SuspendedOrganizationModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const isAdmin = userRole === 'admin';

  const handleExportData = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(null);
    try {
      const res = await exportSuspendedCompanyDataAction();
      if (res.success && res.csvContent) {
        const blob = new Blob([res.csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', res.filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setExportSuccess(`Respaldo descargado exitosamente (${res.totalRecords} contactos).`);
      }
    } catch (err: any) {
      setExportError(err.message || 'Error al exportar los datos.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090A0F]/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#131722] border border-[#232A3B] rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl text-slate-100 flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header con Branding */}
        <div className="p-6 border-b border-[#1E2433] bg-[#090A0F]/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/isotipo-128w.png"
              alt="Synqo"
              width={36}
              height={36}
              className="w-9 h-9 object-contain"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base tracking-tight text-white leading-tight">synqo</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-[#00D2FF]/10 text-[#00D2FF] font-mono rounded border border-[#00D2FF]/20 font-bold">.dev</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">Notificación de Servicio</span>
            </div>
          </div>

          <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-rose-400" />
            {statusLabel || 'Servicio en Pausa'}
          </span>
        </div>

        {/* Contenido Principal */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-2xl border border-rose-500/20 flex-shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Cuenta Temporalmente Suspendida
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Empresa: <strong className="text-slate-200">{orgName}</strong>
              </p>
            </div>
          </div>

          {isAdmin ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#090A0F] border border-[#1E2433] text-xs text-slate-300 space-y-2 leading-relaxed">
                <p>
                  De acuerdo con nuestras <strong>Condiciones del Servicio</strong>, la cuenta ha entrado en suspensión preventiva tras cumplirse el período de pago de la mensualidad.
                </p>
                <p className="text-slate-400">
                  Para reactivar el acceso de tu equipo y las respuestas automáticas de Inteligencia Artificial por WhatsApp de manera inmediata, por favor realiza el pago de tu mensualidad y envía el comprobante a tu asesor comercial.
                </p>
              </div>

              {/* Cláusula de Propiedad de Datos */}
              <div className="p-4 rounded-2xl bg-[#0052FF]/10 border border-[#0052FF]/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#00D2FF] flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" /> Tus datos te pertenecen
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Conforme al contrato, toda tu base de datos de prospectos y notas es tu propiedad. Puedes descargar un respaldo completo en Excel/CSV en cualquier momento:
                </p>
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="w-full mt-2 py-2 px-3 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5 text-[#00D2FF]" />
                  {isExporting ? 'Generando archivo...' : 'Descargar Respaldo de Contactos (CSV / Excel)'}
                </button>
              </div>

              {exportSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{exportSuccess}</span>
                </div>
              )}

              {exportError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{exportError}</span>
                </div>
              )}

              {/* Botón de Contacto por WhatsApp para Reactivación */}
              <a
                href="https://wa.me/573000000000?text=Hola%20Synqo,%20quiero%20reportar%20el%20pago%20de%20mi%20mensualidad%20para%20reactivar%20mi%20cuenta"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-[#0052FF] hover:bg-[#0045D8] text-white transition flex items-center justify-center gap-2 shadow-lg shadow-[#0052FF]/20 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 text-[#00D2FF]" />
                Reportar Pago por WhatsApp para Reactivación
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#090A0F] border border-[#1E2433] text-xs text-slate-300 space-y-2 leading-relaxed">
                <p>
                  Hola, <strong>{userFullName}</strong>.
                </p>
                <p>
                  El servicio de Synqo CRM para <strong>{orgName}</strong> se encuentra temporalmente en pausa preventiva por temas administrativos de facturación.
                </p>
                <p className="text-slate-400">
                  Por favor comunícate con el administrador o departamento contable de tu empresa para que coordinen la reactivación con el equipo de Synqo.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer con Cerrar Sesión */}
        <div className="p-4 border-t border-[#1E2433] bg-[#090A0F]/60 flex items-center justify-between text-xs text-slate-400">
          <span className="truncate max-w-[200px]">{userEmail}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="py-1.5 px-3 rounded-lg text-slate-300 hover:text-white hover:bg-white/5 transition flex items-center gap-1.5 cursor-pointer font-semibold"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              Cerrar Sesión
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

