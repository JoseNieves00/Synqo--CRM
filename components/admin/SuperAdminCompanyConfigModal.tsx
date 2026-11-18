'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Clock,
  Users,
  Smartphone,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
  KeyRound,
  Copy,
  Check,
  Shield,
} from 'lucide-react';
import {
  getCompanyFullConfigAction,
  updateCompanyPromptAction,
  updateCompanyFollowUpAction,
  createCompanyUserAction,
  deleteCompanyUserAction,
  regenerateCompanyAdminPassword,
} from '@/app/actions/superadmin';

interface SuperAdminCompanyConfigModalProps {
  organizationId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SuperAdminCompanyConfigModal({
  organizationId,
  isOpen,
  onClose,
}: SuperAdminCompanyConfigModalProps) {
  const [activeTab, setActiveTab] = useState<'prompt' | 'follow_ups' | 'users' | 'whatsapp'>('prompt');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [company, setCompany] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);

  // Prompt state
  const [systemPrompt, setSystemPrompt] = useState('');

  // Follow-up state
  const [isFollowUpEnabled, setIsFollowUpEnabled] = useState(false);
  const [followUpSettings, setFollowUpSettings] = useState<any>(null);

  // New user form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'supervisor' | 'agent'>('agent');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Success credential display
  const [createdCredential, setCreatedCredential] = useState<{ email: string; pass: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    if (!isOpen || !organizationId) return;
    loadCompanyData();
  }, [isOpen, organizationId]);

  const loadCompanyData = async () => {
    if (!organizationId) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await getCompanyFullConfigAction(organizationId);
      setCompany(data.organization);
      setProfiles(data.profiles);
      setSystemPrompt(data.organization.system_prompt || '');

      const cf = (data.organization.custom_fields || {}) as Record<string, any>;
      const fu = cf.follow_up_settings || { enabled: false, sequences: {} };
      setFollowUpSettings(fu);
      setIsFollowUpEnabled(Boolean(fu.enabled));
    } catch (err: any) {
      setErrorMsg(err.message || 'Error cargando datos de la empresa');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePrompt = async () => {
    if (!organizationId) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await updateCompanyPromptAction({
        organizationId,
        systemPrompt,
      });
      setSuccessMsg('Prompt de la empresa actualizado correctamente');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando el prompt');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveFollowUp = async () => {
    if (!organizationId) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const updatedSettings = {
        ...(followUpSettings || {}),
        enabled: isFollowUpEnabled,
      };
      await updateCompanyFollowUpAction({
        organizationId,
        followUpSettings: updatedSettings,
      });
      setFollowUpSettings(updatedSettings);
      setSuccessMsg('Configuración de seguimientos actualizada');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando seguimientos');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !newUserEmail || !newUserName) return;
    setIsCreatingUser(true);
    setErrorMsg(null);
    try {
      const res = await createCompanyUserAction({
        organizationId,
        email: newUserEmail,
        fullName: newUserName,
        role: newUserRole,
      });
      setCreatedCredential({ email: res.email, pass: res.password });
      setNewUserEmail('');
      setNewUserName('');
      await loadCompanyData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creando usuario');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!organizationId) return;
    if (!confirm(`¿Eliminar al asesor "${userName}" de esta empresa? Esta acción revocará su acceso de inmediato.`)) {
      return;
    }
    setErrorMsg(null);
    try {
      await deleteCompanyUserAction({ organizationId, userId });
      await loadCompanyData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error eliminando usuario');
    }
  };

  const handleResetAdminPassword = async () => {
    if (!organizationId) return;
    if (!confirm('¿Regenerar la contraseña temporal del Administrador de esta empresa?')) return;
    setErrorMsg(null);
    try {
      const res = await regenerateCompanyAdminPassword(organizationId);
      setCreatedCredential({ email: res.email, pass: res.tempPassword });
    } catch (err: any) {
      setErrorMsg(err.message || 'Error regenerando contraseña');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  if (!isOpen || !organizationId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Banner Superior Modo Asistencia */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-4 py-2.5 text-white flex items-center justify-between gap-3 text-xs font-semibold shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-200 shrink-0" />
            <span>
              Modo Asistencia SuperAdmin: Gestionando configuración de{' '}
              <strong className="underline underline-offset-2">{company?.name || 'Cargando...'}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white transition p-1 hover:bg-white/10 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notificaciones */}
        {errorMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Credenciales recién generadas */}
        {createdCredential && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-xs text-slate-800 dark:text-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-bold text-[#0052FF] dark:text-[#00D2FF]">Credenciales de Acceso Generadas:</p>
              <p>
                Email: <code className="font-mono font-bold">{createdCredential.email}</code> · Contraseña:{' '}
                <code className="font-mono font-bold bg-white dark:bg-[#1E2433] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  {createdCredential.pass}
                </code>
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(`Email: ${createdCredential.email}\nContraseña: ${createdCredential.pass}`)}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#1E2433] border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition"
            >
              {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copiedKey ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
        )}

        {/* Pestañas de Navegación */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-200 dark:border-[#232A3B] shrink-0 bg-slate-50/50 dark:bg-[#0E121B]">
          <button
            type="button"
            onClick={() => setActiveTab('prompt')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 ${
              activeTab === 'prompt'
                ? 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF] bg-white dark:bg-[#131722]'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Prompt & Reglas</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('follow_ups')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 ${
              activeTab === 'follow_ups'
                ? 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF] bg-white dark:bg-[#131722]'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Seguimientos de Embudo</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 ${
              activeTab === 'users'
                ? 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF] bg-white dark:bg-[#131722]'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Equipo ({profiles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 ${
              activeTab === 'whatsapp'
                ? 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF] bg-white dark:bg-[#131722]'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>WhatsApp & Motor</span>
          </button>
        </div>

        {/* Contenido de la Pestaña Activa */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#0052FF]" />
              <p className="text-xs">Cargando configuración de la empresa...</p>
            </div>
          ) : activeTab === 'prompt' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Prompt del Sistema & Instrucciones Comerciales
                  </h4>
                  <p className="text-xs text-slate-500">
                    Modifica directamente el prompt que guía el tono, precios, fletes y cierre de la IA.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSavePrompt}
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Guardar Prompt</span>
                </button>
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={16}
                className="w-full p-3 font-mono text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/30 resize-y leading-relaxed"
                placeholder="Instrucciones comerciales del negocio, catálogo, fletes, etc..."
              />
            </div>
          ) : activeTab === 'follow_ups' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B]">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Interruptor Maestro de Seguimientos
                  </h4>
                  <p className="text-xs text-slate-500">
                    Activa o pausa todos los envíos automáticos de reactivación comercial de esta empresa.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isFollowUpEnabled}
                      onChange={(e) => setIsFollowUpEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                  <button
                    type="button"
                    onClick={handleSaveFollowUp}
                    disabled={isSaving}
                    className="px-3 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Guardar Estado</span>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] space-y-2">
                <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Estructura Actual de Secuencias
                </h5>
                <pre className="p-3 rounded-lg bg-slate-100 dark:bg-[#0E121B] text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto max-h-60">
                  {JSON.stringify(followUpSettings?.sequences || {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : activeTab === 'users' ? (
            <div className="space-y-5">
              {/* Formulario Crear Usuario */}
              <form onSubmit={handleCreateUser} className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B] space-y-3">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-[#0052FF]" />
                  Agregar Usuario / Asesor a esta Empresa
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    required
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Nombre completo"
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                  <input
                    type="email"
                    required
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="Correo electrónico"
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                  <div className="flex gap-2">
                    <select
                      value={newUserRole}
                      onChange={(e: any) => setNewUserRole(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] focus:outline-none"
                    >
                      <option value="agent">Asesor (Agent)</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="admin">Administrador</option>
                    </select>
                    <button
                      type="submit"
                      disabled={isCreatingUser}
                      className="px-3 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold shrink-0 disabled:opacity-50 flex items-center gap-1"
                    >
                      {isCreatingUser ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>Crear</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* Lista de Miembros Actuales */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Miembros de la Organización ({profiles.length})
                  </h4>
                  <button
                    type="button"
                    onClick={handleResetAdminPassword}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>Regenerar clave Admin</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-[#232A3B] border border-slate-200 dark:border-[#232A3B] rounded-xl overflow-hidden bg-white dark:bg-[#131722]">
                  {profiles.map((p) => (
                    <div key={p.id} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-[#1A1F2C] transition">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{p.full_name || 'Sin nombre'}</p>
                        <p className="text-slate-400 font-mono text-[11px] truncate">{p.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 dark:bg-[#1E2433] text-slate-600 dark:text-slate-300">
                          {p.role}
                        </span>
                        {!p.is_super_admin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(p.id, p.full_name || p.email)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B] space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Configuración Técnica de Mensajería
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400 text-[11px] block">Proveedor de WhatsApp:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 uppercase">
                      {company?.whatsapp_provider || 'evolution'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] block">Instancia Evolution (VPS):</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {company?.evolution_instance_name || 'No configurada'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] block">Phone Number ID (Meta):</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {company?.whatsapp_phone_number_id || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] block">Límite de Tokens Mensual:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {Number(company?.ai_tokens_limit || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
