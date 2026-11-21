'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  Shield,
  X,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
  Clock,
  Users,
  Smartphone,
  Plus,
  Trash2,
  KeyRound,
  Save,
  Loader2,
  Play,
  Flame,
  HelpCircle,
  Sun,
  Snowflake,
  PackageCheck,
  BarChart3,
  Settings2,
  Sliders,
  ShieldCheck,
  Zap,
  RotateCcw,
  Building2,
  Activity,
  Crown,
  TrendingUp,
  DollarSign,
  MessageSquare,
  ShoppingBag,
  Calendar,
} from 'lucide-react';
import {
  getCompanyFullConfigAction,
  updateCompanyPromptAction,
  updateCompanyFollowUpAction,
  updateCompanyPipelineAction,
  updateCompanyDetails,
  createCompanyUserAction,
  deleteCompanyUserAction,
  regenerateCompanyAdminPassword,
} from '@/app/actions/superadmin';
import type { FollowUpSettingsConfig, FollowUpCategory } from '@/lib/ai/follow-up-types';

const BotSandboxModal = dynamic(
  () => import('@/components/settings/BotSandboxModal').then((m) => m.BotSandboxModal),
  { ssr: false }
);

interface SuperAdminCompanyConfigModalProps {
  organizationId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const CRM_STAGES = [
  { id: 'new_lead', defaultLabel: 'Nuevo Lead', desc: 'Lead recién ingresado o primer contacto.' },
  { id: 'qualifying', defaultLabel: 'Calificación / Interés', desc: 'Cliente calificado con necesidad, interés o presupuesto.' },
  { id: 'proposal_sent', defaultLabel: 'Propuesta / Cotización', desc: 'Se ha presentado cotización formal, catálogo o precio final.' },
  { id: 'negotiating', defaultLabel: 'En Negociación', desc: 'Objeciones, dudas técnicas o acuerdo de pago en curso.' },
  { id: 'won', defaultLabel: 'Cerrado Ganado', desc: 'Venta o cita cerrada con confirmación de pago o asistencia.' },
];

const FOLLOWUP_CATEGORIES: { id: FollowUpCategory; label: string; icon: any; color: string }[] = [
  { id: 'hot_unclosed', label: 'Leads Calientes (Sin Cierre)', icon: Flame, color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' },
  { id: 'qualified_doubt', label: 'Cotización / Dudas Pendientes', icon: HelpCircle, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' },
  { id: 'warm', label: 'Interés Medio (Warm)', icon: Sun, color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800' },
  { id: 'unresponsive', label: 'No Responden / Fríos', icon: Snowflake, color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  { id: 'post_order', label: 'Post-Venta / Recompra', icon: PackageCheck, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' },
];

export function SuperAdminCompanyConfigModal({
  organizationId,
  isOpen,
  onClose,
}: SuperAdminCompanyConfigModalProps) {
  const [activeTab, setActiveTab] = useState<'company' | 'telemetry' | 'users' | 'prompt' | 'pipeline' | 'follow_ups' | 'whatsapp' | 'modules'>('company');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Datos de la empresa
  const [company, setCompany] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [adminProfile, setAdminProfile] = useState<any>(null);
  const [telemetry, setTelemetry] = useState<any>(null);

  // 0. Tab Empresa & Perfil (Modelo comercial sin presets)
  const [companyName, setCompanyName] = useState('');
  const [businessModel, setBusinessModel] = useState<'products' | 'services' | 'hybrid'>('products');
  const [isActive, setIsActive] = useState(true);

  // 1. Tab Prompt & Cerebro IA
  const [systemPrompt, setSystemPrompt] = useState('');
  const [aiProvider, setAiProvider] = useState<'google' | 'openai'>('google');
  const [isSandboxOpen, setIsSandboxOpen] = useState(false);

  // 2. Tab Pipeline Comercial
  const [stageLabels, setStageLabels] = useState<Record<string, string>>({});
  const [stageCriteria, setStageCriteria] = useState<Record<string, string>>({});

  // 3. Tab Seguimientos de Embudo
  const [followUpConfig, setFollowUpConfig] = useState<FollowUpSettingsConfig | null>(null);

  // 4. Tab WhatsApp & Consumo IA
  const [waProvider, setWaProvider] = useState<'evolution' | 'meta'>('evolution');
  const [evolutionUrl, setEvolutionUrl] = useState('');
  const [evolutionInstance, setEvolutionInstance] = useState('');
  const [evolutionKey, setEvolutionKey] = useState('');
  const [evolutionAntiBan, setEvolutionAntiBan] = useState(true);
  const [evolutionMaxOutbound, setEvolutionMaxOutbound] = useState(40);
  const [aiTokensLimit, setAiTokensLimit] = useState(500000);

  // 5. Tab Equipo
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'supervisor' | 'agent'>('agent');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createdCredential, setCreatedCredential] = useState<{ email: string; pass: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // 6. Tab Plan & Módulos
  const [planType, setPlanType] = useState<'starter' | 'pro' | 'enterprise'>('starter');
  const [maxUsers, setMaxUsers] = useState(2);
  const [companyCode, setCompanyCode] = useState('');
  const [moduleNativeCalendar, setModuleNativeCalendar] = useState(true);
  const [moduleAntiNoShow, setModuleAntiNoShow] = useState(false);

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
      const org = data.organization;
      setCompany(org);
      setProfiles(data.profiles);
      setAdminProfile(data.adminProfile);
      setTelemetry(data.telemetry);

      // Empresa & Perfil
      setCompanyName(org.name || '');
      const preset = org.industry_preset;
      const modules = (org.enabled_modules || {}) as Record<string, boolean>;
      if (preset === 'products' || preset === 'services' || preset === 'hybrid') {
        setBusinessModel(preset);
      } else if (modules.native_calendar && modules.orders) {
        setBusinessModel('hybrid');
      } else if (modules.native_calendar) {
        setBusinessModel('services');
      } else {
        setBusinessModel('products');
      }
      setIsActive(org.is_active !== false);

      // Prompt & Cerebro
      setSystemPrompt(org.system_prompt || '');
      setAiProvider((org.ai_provider as 'google' | 'openai') || 'google');

      // Pipeline
      setStageLabels(data.stageLabels || {});
      setStageCriteria(data.stageCriteria || {});

      // Seguimientos
      setFollowUpConfig(data.followUpSettings);

      // WhatsApp
      setWaProvider(org.whatsapp_provider === 'meta' ? 'meta' : 'evolution');
      setEvolutionUrl(org.evolution_api_url || '');
      setEvolutionInstance(org.evolution_instance_name || '');
      setEvolutionKey(''); // Se mantiene vacía para no sobrescribir sin intención
      setEvolutionAntiBan(org.evolution_anti_ban_mode !== false);
      setEvolutionMaxOutbound(Number(org.evolution_max_outbound_per_hour) || 40);
      setAiTokensLimit(Number(org.ai_tokens_limit) || 500000);

      // Plan & Módulos
      setPlanType((org.plan_type as any) || 'starter');
      setMaxUsers(Number(org.max_users) || 2);
      setCompanyCode(org.company_code || '');
      setModuleNativeCalendar(modules.native_calendar !== false);
      setModuleAntiNoShow(Boolean(modules.anti_no_show));
    } catch (err: any) {
      setErrorMsg(err.message || 'Error cargando datos de la empresa');
    } finally {
      setIsLoading(false);
    }
  };

  // Guardar Empresa & Modelo Comercial
  const handleSaveCompanyInfo = async () => {
    if (!organizationId) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await updateCompanyDetails({
        organizationId,
        name: companyName,
        businessModel,
        isActive,
        companyCode,
        maxUsers,
        planType,
      });
      setSuccessMsg('Información de la empresa y modelo comercial actualizados exitosamente');
      await loadCompanyData();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando datos de la empresa');
    } finally {
      setIsSaving(false);
    }
  };

  // Guardar Prompt & Cerebro
  const handleSavePromptAndAi = async () => {
    if (!organizationId) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await updateCompanyPromptAction({
        organizationId,
        systemPrompt,
        aiProvider,
      });
      setSuccessMsg('Cerebro y Prompt IA de la empresa actualizados correctamente');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando prompt e IA');
    } finally {
      setIsSaving(false);
    }
  };

  // Guardar Pipeline
  const handleSavePipeline = async () => {
    if (!organizationId) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await updateCompanyPipelineAction({
        organizationId,
        stageLabels,
        stageCriteria,
      });
      setSuccessMsg('Pipeline comercial y criterios semánticos guardados correctamente');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando pipeline');
    } finally {
      setIsSaving(false);
    }
  };

  // Guardar Seguimientos
  const handleSaveFollowUps = async () => {
    if (!organizationId || !followUpConfig) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await updateCompanyFollowUpAction({
        organizationId,
        followUpSettings: followUpConfig,
      });
      if (res.followUpSettings) {
        setFollowUpConfig(res.followUpSettings);
      }
      setSuccessMsg('Secuencias y configuración de seguimientos actualizadas');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando seguimientos');
    } finally {
      setIsSaving(false);
    }
  };

  // Guardar WhatsApp & Consumo IA
  const handleSaveWhatsAppAndTokens = async (resetTokens = false) => {
    if (!organizationId || !company) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await updateCompanyDetails({
        organizationId,
        name: company.name,
        maxUsers,
        aiTokensLimit,
        resetTokensUsed: resetTokens,
        whatsappProvider: waProvider,
        evolutionApiUrl: evolutionUrl,
        evolutionApiKey: evolutionKey.trim() ? evolutionKey.trim() : undefined,
        evolutionInstanceName: evolutionInstance,
        evolutionAntiBanMode: evolutionAntiBan,
        evolutionMaxOutboundPerHour: evolutionMaxOutbound,
      });
      setSuccessMsg(
        resetTokens
          ? 'Tokens consumidos reiniciados a 0 y configuración de WhatsApp guardada'
          : 'Canal de WhatsApp y cuota de tokens actualizados'
      );
      setEvolutionKey('');
      await loadCompanyData();
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando WhatsApp y tokens');
    } finally {
      setIsSaving(false);
    }
  };

  // Guardar Plan & Módulos
  const handleSavePlanAndModules = async () => {
    if (!organizationId || !company) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await updateCompanyDetails({
        organizationId,
        name: company.name,
        planType,
        maxUsers,
        companyCode,
        enabledModules: {
          native_calendar: moduleNativeCalendar,
          anti_no_show: moduleAntiNoShow,
          physical_rooms: false,
          staff_mobile_portal: false,
          quick_pay: false,
        },
      });
      setSuccessMsg('Plan comercial y módulos de la empresa actualizados');
      await loadCompanyData();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando módulos');
    } finally {
      setIsSaving(false);
    }
  };

  // Crear usuario
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

  // Eliminar usuario
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

  // Regenerar clave admin
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
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/75 backdrop-blur-xs overflow-y-auto">
        <div className="relative w-full max-w-5xl bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Banner Superior Modo Asistencia */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-5 py-3 text-white flex items-center justify-between gap-3 text-xs font-semibold shrink-0">
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-blue-200 shrink-0" />
              <span>
                Configurador Remoto SuperAdmin: Gestionando{' '}
                <strong className="underline underline-offset-2">{company?.name || 'Cargando...'}</strong>
                {company?.company_code && <span className="opacity-75 font-mono text-[11px] ml-1">({company.company_code})</span>}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-white/80 hover:text-white transition p-1 hover:bg-white/10 rounded-lg cursor-pointer"
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
            <div className="mx-5 mt-3 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-xs text-slate-800 dark:text-slate-200 flex flex-wrap items-center justify-between gap-2 shadow-xs">
              <div>
                <p className="font-bold text-[#0052FF] dark:text-[#00D2FF]">Credenciales de Acceso Generadas:</p>
                <p className="mt-0.5">
                  Email: <code className="font-mono font-bold">{createdCredential.email}</code> · Contraseña:{' '}
                  <code className="font-mono font-bold bg-white dark:bg-[#1E2433] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    {createdCredential.pass}
                  </code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(`Email: ${createdCredential.email}\nContraseña: ${createdCredential.pass}`)}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#1E2433] border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 transition cursor-pointer"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copiedKey ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          )}

          {/* Pestañas de Navegación */}
          <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-200 dark:border-[#232A3B] shrink-0 bg-slate-50/50 dark:bg-[#0E121B] overflow-x-auto [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setActiveTab('company')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'company'
                  ? 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF] bg-white dark:bg-[#131722]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Empresa & Perfil</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('telemetry')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'telemetry'
                  ? 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF] bg-white dark:bg-[#131722]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-amber-500" />
              <span>Telemetría & IA</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 whitespace-nowrap cursor-pointer ${
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
              onClick={() => setActiveTab('prompt')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'prompt'
                  ? 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF] bg-white dark:bg-[#131722]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Prompt & Cerebro</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pipeline')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'pipeline'
                  ? 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF] bg-white dark:bg-[#131722]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Pipeline Comercial</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('follow_ups')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'follow_ups'
                  ? 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF] bg-white dark:bg-[#131722]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Seguimientos</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('whatsapp')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'whatsapp'
                  ? 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF] bg-white dark:bg-[#131722]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>WhatsApp & VPS</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('modules')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'modules'
                  ? 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF] bg-white dark:bg-[#131722]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Plan & Cupos</span>
            </button>
          </div>

          {/* Contenido de la Pestaña Activa */}
          <div className="p-5 overflow-y-auto flex-1 space-y-4">
            {isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-[#0052FF]" />
                <p className="text-xs">Cargando configuración remota de la empresa...</p>
              </div>
            ) : activeTab === 'company' ? (
              /* Pestaña 0: Empresa & Perfil (Modelo comercial sin presets) */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-[#0052FF]" />
                      Información General & Perfil Comercial
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Configura la identidad del negocio y selecciona el modelo comercial puro sin presets rígidos.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveCompanyInfo}
                    disabled={isSaving}
                    className="px-3.5 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Guardar Empresa</span>
                  </button>
                </div>

                {/* Identidad de la Empresa */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B] sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Nombre de la Empresa
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Nombre comercial"
                      className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                    />
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B]">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Estado de la Cuenta
                    </label>
                    <select
                      value={isActive ? 'active' : 'inactive'}
                      onChange={(e) => setIsActive(e.target.value === 'active')}
                      className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 font-semibold cursor-pointer"
                    >
                      <option value="active">Activa (Acceso Total)</option>
                      <option value="inactive">Suspendida / Desactivada</option>
                    </select>
                  </div>
                </div>

                {/* Selector de Modelo Comercial Puro (Sin Presets) */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B] space-y-3">
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Modelo de Operación Comercial (Sin Presets)
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      Define automáticamente qué herramientas operativas tendrá la empresa sin forzar categorías artificiales.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label
                      onClick={() => setBusinessModel('products')}
                      className={`p-3.5 rounded-xl border-2 flex flex-col justify-between gap-2 cursor-pointer transition ${
                        businessModel === 'products'
                          ? 'border-[#0052FF] bg-blue-50/60 dark:bg-[#0052FF]/10 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-[#0052FF] dark:text-[#00D2FF]">
                          <ShoppingBag className="w-4 h-4" />
                        </div>
                        <input
                          type="radio"
                          name="business_model"
                          checked={businessModel === 'products'}
                          onChange={() => setBusinessModel('products')}
                          className="accent-[#0052FF]"
                        />
                      </div>
                      <div>
                        <p className="font-bold text-xs text-slate-900 dark:text-white">Vende Productos</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Habilita catálogo, gestión y despacho de pedidos. Oculta citas y salas.
                        </p>
                      </div>
                    </label>

                    <label
                      onClick={() => setBusinessModel('services')}
                      className={`p-3.5 rounded-xl border-2 flex flex-col justify-between gap-2 cursor-pointer transition ${
                        businessModel === 'services'
                          ? 'border-[#0052FF] bg-blue-50/60 dark:bg-[#0052FF]/10 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <input
                          type="radio"
                          name="business_model"
                          checked={businessModel === 'services'}
                          onChange={() => setBusinessModel('services')}
                          className="accent-[#0052FF]"
                        />
                      </div>
                      <div>
                        <p className="font-bold text-xs text-slate-900 dark:text-white">Vende Servicios</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Habilita citas nativas y especialistas. Oculta despachos de productos.
                        </p>
                      </div>
                    </label>

                    <label
                      onClick={() => setBusinessModel('hybrid')}
                      className={`p-3.5 rounded-xl border-2 flex flex-col justify-between gap-2 cursor-pointer transition ${
                        businessModel === 'hybrid'
                          ? 'border-[#0052FF] bg-blue-50/60 dark:bg-[#0052FF]/10 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                          <Zap className="w-4 h-4" />
                        </div>
                        <input
                          type="radio"
                          name="business_model"
                          checked={businessModel === 'hybrid'}
                          onChange={() => setBusinessModel('hybrid')}
                          className="accent-[#0052FF]"
                        />
                      </div>
                      <div>
                        <p className="font-bold text-xs text-slate-900 dark:text-white">Modelo Híbrido</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Combina Citas + Pedidos unificados bajo el mismo cliente (Ficha 360).
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Resumen de Conexión & Suscripción */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722]">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Canal WhatsApp Activo
                    </span>
                    <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{company?.whatsapp_provider === 'meta' ? 'Meta Cloud API' : 'Evolution API VPS'}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                      {company?.evolution_instance_name || company?.whatsapp_phone_number_id || 'Sin instancia'}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722]">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Suscripción & Plan
                    </span>
                    <p className="text-xs font-bold text-slate-900 dark:text-white capitalize flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 text-amber-500" />
                      <span>Plan {company?.plan_type || 'Starter'}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Día de corte: {company?.billing_due_day || 5} de cada mes
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722]">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Código de Equipo
                    </span>
                    <p className="text-xs font-mono font-bold text-[#0052FF] dark:text-[#00D2FF]">
                      {company?.company_code || 'SIN CÓDIGO'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Creada: {company?.created_at ? new Date(company.created_at).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            ) : activeTab === 'telemetry' ? (
              /* Pestaña Telemetría & Rendimiento de la IA */
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-amber-500" />
                    Telemetría & Desempeño Real de la IA en esta Empresa
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Métricas operativas del negocio: volumen de mensajes, autonomía, leads calientes y consumo de tokens.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {/* Tarjeta 1: Autonomía IA */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-gradient-to-br from-blue-50/50 to-indigo-50/20 dark:from-[#0052FF]/10 dark:to-transparent">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      <span>Autonomía IA</span>
                      <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                    </div>
                    <p className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                      {telemetry?.autonomyPct ?? 100}%
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Mensajes salientes resueltos 100% por la IA sin humanos.
                    </p>
                  </div>

                  {/* Tarjeta 2: Volumen de Mensajes */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722]">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      <span>Mensajes IA</span>
                      <MessageSquare className="w-4 h-4 text-[#0052FF]" />
                    </div>
                    <p className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                      {(telemetry?.aiMessagesCount ?? 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      vs {(telemetry?.humanMessagesCount ?? 0).toLocaleString()} de asesores humanos.
                    </p>
                  </div>

                  {/* Tarjeta 3: Leads Calientes */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722]">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      <span>Leads Calientes</span>
                      <Flame className="w-4 h-4 text-rose-500 fill-rose-500" />
                    </div>
                    <p className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
                      {telemetry?.hotLeadsCount ?? 0}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Con alta intención detectada de {telemetry?.contactsCount ?? 0} contactos.
                    </p>
                  </div>

                  {/* Tarjeta 4: Costo Estimado IA */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722]">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      <span>Costo API (USD)</span>
                      <DollarSign className="w-4 h-4 text-emerald-500" />
                    </div>
                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      ${telemetry?.estimatedCostUsd ?? '0.00'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Costo real de infraestructura consumido este mes.
                    </p>
                  </div>
                </div>

                {/* Desglose de Tokens */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B] space-y-3">
                  <h5 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Desglose de Capacidad y Cuota de Tokens
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B]">
                      <span className="text-slate-400 block text-[11px]">Tokens Totales Usados</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {(telemetry?.tokensUsed ?? 0).toLocaleString()} / {(telemetry?.tokensLimit ?? 500000).toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B]">
                      <span className="text-slate-400 block text-[11px]">Google Gemini 2.5 Flash</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {(telemetry?.googleTokensUsed ?? 0).toLocaleString()} tokens
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B]">
                      <span className="text-slate-400 block text-[11px]">OpenAI Mini</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {(telemetry?.openAiTokensUsed ?? 0).toLocaleString()} tokens
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === 'prompt' ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B]">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      Motor de Inteligencia Artificial
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Selecciona el proveedor primario para responder las conversaciones de WhatsApp.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={aiProvider}
                      onChange={(e) => setAiProvider(e.target.value as any)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value="google">Google Gemini 2.5 Flash (Primario • $0)</option>
                      <option value="openai">OpenAI GPT-4o-mini (Backup • Balance)</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setIsSandboxOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      title="Abrir simulador Sandbox para probar respuestas de este bot"
                    >
                      <Play className="w-3.5 h-3.5 fill-purple-600 text-purple-600" />
                      <span>Sandbox Remoto</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Prompt del Sistema & Reglas Comerciales
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Define catálogo, políticas, fletes, instrucciones de cierre y tono del asesor comercial IA.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-400">
                        {systemPrompt.length.toLocaleString()} caracteres
                      </span>
                      <button
                        type="button"
                        onClick={handleSavePromptAndAi}
                        disabled={isSaving}
                        className="px-3.5 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition disabled:opacity-50 cursor-pointer"
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        <span>Guardar Cerebro IA</span>
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={17}
                    className="w-full p-3.5 font-mono text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/30 resize-y leading-relaxed"
                    placeholder="Instrucciones comerciales del negocio, catálogo, políticas de fletes y cierre..."
                  />
                </div>
              </div>
            ) : activeTab === 'pipeline' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5 text-[#0052FF]" />
                      Etapas Comerciales & Criterios Semánticos de IA
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Personaliza los nombres de cada etapa y define en lenguaje natural qué condición detectada por la IA hace avanzar al prospecto.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSavePipeline}
                    disabled={isSaving}
                    className="px-3.5 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Guardar Pipeline</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {CRM_STAGES.map((st, idx) => {
                    const currentLabel = stageLabels[st.id] ?? '';
                    const currentCrit = stageCriteria[st.id] ?? '';
                    return (
                      <div
                        key={st.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B] space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-white dark:bg-[#131722] px-2 py-0.5 rounded border border-slate-200 dark:border-[#232A3B]">
                            Etapa {idx + 1}: {st.id}
                          </span>
                          <span className="text-[11px] text-slate-400 italic">
                            {st.desc}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Nombre Visible en Pipeline
                            </label>
                            <input
                              type="text"
                              value={currentLabel}
                              onChange={(e) =>
                                setStageLabels((prev) => ({
                                  ...prev,
                                  [st.id]: e.target.value,
                                }))
                              }
                              placeholder={st.defaultLabel}
                              maxLength={40}
                              className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                Criterio Semántico IA de Avance
                              </label>
                              <span className="text-[10px] font-mono text-slate-400">
                                {currentCrit.length}/150
                              </span>
                            </div>
                            <input
                              type="text"
                              value={currentCrit}
                              onChange={(e) =>
                                setStageCriteria((prev) => ({
                                  ...prev,
                                  [st.id]: e.target.value,
                                }))
                              }
                              placeholder={`Ej: Si el cliente confirma ${st.defaultLabel.toLowerCase()}...`}
                              maxLength={150}
                              className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : activeTab === 'follow_ups' ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B]">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-[#0052FF]" />
                      Interruptor Maestro & Política Anti-Spam
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Control global de envíos automáticos y cupo diario de protección para evitar baneos en WhatsApp.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(followUpConfig?.enabled)}
                        onChange={(e) =>
                          setFollowUpConfig((prev: any) => ({
                            ...(prev || {}),
                            enabled: e.target.checked,
                          }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>

                    <button
                      type="button"
                      onClick={handleSaveFollowUps}
                      disabled={isSaving}
                      className="px-3.5 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition disabled:opacity-50 cursor-pointer"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>Guardar Seguimientos</span>
                    </button>
                  </div>
                </div>

                {/* Parámetros Generales */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722]">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Tope Diario de Envíos (Daily Cap)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={500}
                      value={followUpConfig?.dailyCap ?? 40}
                      onChange={(e) =>
                        setFollowUpConfig((prev: any) => ({
                          ...(prev || {}),
                          dailyCap: Math.max(1, Number(e.target.value) || 40),
                        }))
                      }
                      className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B] font-mono font-bold"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Tope de mensajes automáticos por día asignado por SuperAdmin para proteger la cuenta.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                        Priorizar por Lead Score
                      </span>
                      <p className="text-[10px] text-slate-400">
                        Si se alcanza el tope diario, despacha primero a los prospectos con mayor probabilidad de compra.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={followUpConfig?.prioritizeByScore !== false}
                        onChange={(e) =>
                          setFollowUpConfig((prev: any) => ({
                            ...(prev || {}),
                            prioritizeByScore: e.target.checked,
                          }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0052FF]"></div>
                    </label>
                  </div>
                </div>

                {/* Categorías de Seguimiento */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Secuencias por Temperatura & Estado
                  </h4>
                  {FOLLOWUP_CATEGORIES.map((cat) => {
                    const seq = followUpConfig?.sequences?.[cat.id];
                    const isEnabled = seq ? seq.enabled !== false : true;
                    const stepsCount = seq?.steps?.length || 0;
                    const Icon = cat.icon;

                    return (
                      <div
                        key={cat.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-lg border ${cat.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                              {cat.label}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {stepsCount === 0
                                ? 'Sin pasos definidos'
                                : `${stepsCount} paso${stepsCount > 1 ? 's' : ''} configurado${stepsCount > 1 ? 's' : ''}`}
                            </span>
                          </div>
                        </div>

                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setFollowUpConfig((prev: any) => {
                                const currentSeq = prev?.sequences?.[cat.id] || { category: cat.id, steps: [] };
                                return {
                                  ...(prev || {}),
                                  sequences: {
                                    ...(prev?.sequences || {}),
                                    [cat.id]: {
                                      ...currentSeq,
                                      enabled: checked,
                                    },
                                  },
                                };
                              });
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : activeTab === 'whatsapp' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-[#0052FF]" />
                      Proveedor de WhatsApp & Cuota de Tokens
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Ajuste de VPS Evolution API / Meta Cloud API y saldo mensual de inteligencia artificial.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveWhatsAppAndTokens(false)}
                    disabled={isSaving}
                    className="px-3.5 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Guardar Conexión</span>
                  </button>
                </div>

                {/* Selector de Proveedor */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`p-3.5 rounded-xl border flex items-center gap-3 cursor-pointer transition ${
                      waProvider === 'evolution'
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-500 ring-2 ring-indigo-500/20'
                        : 'bg-white dark:bg-[#131722] border-slate-200 dark:border-[#232A3B]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="waProviderModal"
                      checked={waProvider === 'evolution'}
                      onChange={() => setWaProvider('evolution')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        Evolution API (VPS Propio)
                      </span>
                      <span className="text-[11px] text-indigo-600 dark:text-indigo-400 block font-medium">
                        Conexión por QR & Código • Sin costo Meta
                      </span>
                    </div>
                  </label>

                  <label
                    className={`p-3.5 rounded-xl border flex items-center gap-3 cursor-pointer transition ${
                      waProvider === 'meta'
                        ? 'bg-blue-50/70 dark:bg-blue-950/30 border-[#0052FF] ring-2 ring-[#0052FF]/20'
                        : 'bg-white dark:bg-[#131722] border-slate-200 dark:border-[#232A3B]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="waProviderModal"
                      checked={waProvider === 'meta'}
                      onChange={() => setWaProvider('meta')}
                      className="text-[#0052FF] focus:ring-[#0052FF]"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        Meta Cloud API (Oficial)
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        WABA oficial de Meta
                      </span>
                    </div>
                  </label>
                </div>

                {/* Campos Evolution API */}
                {waProvider === 'evolution' && (
                  <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
                    <h5 className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                      Parámetros de Instancia Evolution API
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          URL del VPS
                        </label>
                        <input
                          type="text"
                          value={evolutionUrl}
                          onChange={(e) => setEvolutionUrl(e.target.value)}
                          placeholder="https://vps.tudominio.com"
                          className="w-full text-xs font-mono border border-slate-300 dark:border-[#232A3B] rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Nombre de Instancia
                        </label>
                        <input
                          type="text"
                          value={evolutionInstance}
                          onChange={(e) => setEvolutionInstance(e.target.value)}
                          placeholder="empresa_instancia"
                          className="w-full text-xs font-mono border border-slate-300 dark:border-[#232A3B] rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Nueva API Key (opcional)
                        </label>
                        <input
                          type="password"
                          value={evolutionKey}
                          onChange={(e) => setEvolutionKey(e.target.value)}
                          placeholder="Dejar vacía para mantener"
                          className="w-full text-xs font-mono border border-slate-300 dark:border-[#232A3B] rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-indigo-200/60 dark:border-indigo-900/40 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={evolutionAntiBan}
                          onChange={(e) => setEvolutionAntiBan(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-[11px] font-semibold text-indigo-950 dark:text-indigo-200">
                          Heurística Anti-Ban (Jitter humano y demoras realistas)
                        </span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500">Tope/hora:</span>
                        <input
                          type="number"
                          min={5}
                          max={500}
                          value={evolutionMaxOutbound}
                          onChange={(e) => setEvolutionMaxOutbound(Number(e.target.value))}
                          className="w-16 text-xs text-center border border-slate-300 dark:border-[#232A3B] rounded px-1.5 py-0.5 bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Gestión de Tokens IA */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        Gestión de Tokens IA del Mes
                      </h5>
                      <p className="text-[11px] text-slate-500">
                        Consumo actual: <strong>{Number(company?.ai_tokens_used || 0).toLocaleString()}</strong> /{' '}
                        {aiTokensLimit.toLocaleString()} tokens asignados.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('¿Reiniciar a 0 los tokens consumidos por esta empresa durante este mes?')) {
                          handleSaveWhatsAppAndTokens(true);
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reiniciar Tokens a Cero</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Cuota Asignada (Tokens)
                      </label>
                      <input
                        type="number"
                        step={100000}
                        min={100000}
                        value={aiTokensLimit}
                        onChange={(e) => setAiTokensLimit(Number(e.target.value) || 500000)}
                        className="w-full text-xs font-mono font-bold border border-slate-300 dark:border-[#232A3B] rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block mb-1">Google Gemini (Primario):</span>
                      <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 block py-1.5">
                        {Number(company?.ai_tokens_google_used || 0).toLocaleString()} tokens
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block mb-1">OpenAI (Backup):</span>
                      <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 block py-1.5">
                        {Number(company?.ai_tokens_openai_used || 0).toLocaleString()} tokens
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === 'users' ? (
              <div className="space-y-5">
                {/* Administrador Titular VIP Card */}
                {adminProfile ? (
                  <div className="p-4 rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 dark:from-[#0052FF]/10 dark:to-indigo-950/20 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-[#0052FF] dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                        <Crown className="w-5 h-5 text-amber-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {adminProfile.full_name || 'Administrador Titular'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-blue-100 dark:bg-blue-900/50 text-[#0052FF] dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            Admin Titular
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {adminProfile.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetAdminPassword}
                        className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        title="Generar nueva clave temporal"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Regenerar Contraseña</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Esta empresa aún no tiene un usuario con rol de Administrador asignado.</span>
                  </div>
                )}

                {/* Formulario Crear Usuario */}
                <form
                  onSubmit={handleCreateUser}
                  className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B] space-y-3"
                >
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-[#0052FF]" />
                    Agregar Asesor / Usuario a esta Empresa
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      required
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="Nombre completo"
                      className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                    />
                    <input
                      type="email"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="Correo (usado para Google Calendar)"
                      className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newUserRole}
                        onChange={(e: any) => setNewUserRole(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value="agent">Asesor (Agent)</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="admin">Administrador</option>
                      </select>
                      <button
                        type="submit"
                        disabled={isCreatingUser}
                        className="px-3.5 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold shrink-0 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
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
                      Equipo Comercial ({profiles.length})
                    </h4>
                    <button
                      type="button"
                      onClick={handleResetAdminPassword}
                      className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>Regenerar clave Admin</span>
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-[#232A3B] border border-slate-200 dark:border-[#232A3B] rounded-xl overflow-hidden bg-white dark:bg-[#131722]">
                    {profiles.map((p) => (
                      <div
                        key={p.id}
                        className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-[#1A1F2C] transition"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                            {p.full_name || 'Sin nombre'}
                          </p>
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
                              className="p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer"
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
              /* Tab Plan & Módulos */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5 text-[#0052FF]" />
                      Plan Comercial & Capacidad de la Empresa
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Gestiona la suscripción acordada, límite de licencias de asesores y el módulo de agendamiento nativo.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSavePlanAndModules}
                    disabled={isSaving}
                    className="px-3.5 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Guardar Plan</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B]">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Plan Comercial
                    </label>
                    <select
                      value={planType}
                      onChange={(e) => setPlanType(e.target.value as any)}
                      className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 font-semibold cursor-pointer"
                    >
                      <option value="starter">Starter</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B]">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Límite de Asesores (Max Users)
                    </label>
                    <input
                      type="number"
                      min={profiles.length || 1}
                      max={500}
                      value={maxUsers}
                      onChange={(e) => setMaxUsers(Number(e.target.value) || 1)}
                      className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 font-mono font-bold"
                    />
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B]">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Código de Equipo
                    </label>
                    <input
                      type="text"
                      value={companyCode}
                      onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                      placeholder="CÓDIGO"
                      className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 font-mono font-bold uppercase"
                    />
                  </div>
                </div>

                {/* Módulos Habilitados */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Módulos Funcionales
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                        moduleNativeCalendar
                          ? 'bg-blue-50/50 dark:bg-blue-950/20 border-[#0052FF]/30'
                          : 'bg-white dark:bg-[#131722] border-slate-200 dark:border-[#232A3B]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={moduleNativeCalendar}
                        onChange={(e) => setModuleNativeCalendar(e.target.checked)}
                        className="mt-0.5 rounded text-[#0052FF] focus:ring-[#0052FF]"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">
                          Calendario Nativo & Google Calendar (ARM)
                        </span>
                        <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                          Agendamiento inteligente de citas, reuniones o llamadas con sincronización con Google Calendar.
                        </span>
                      </div>
                    </label>

                    <label
                      className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                        moduleAntiNoShow
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                          : 'bg-white dark:bg-[#131722] border-slate-200 dark:border-[#232A3B]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={moduleAntiNoShow}
                        onChange={(e) => setModuleAntiNoShow(e.target.checked)}
                        className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          Protocolo Anti-No-Show (Confirmación 8h)
                        </span>
                        <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                          Recordatorios automáticos y liberación de cupo en el calendario si el cliente no confirma.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sandbox de Prueba Remoto */}
      {isSandboxOpen && (
        <BotSandboxModal
          isOpen={isSandboxOpen}
          onClose={() => setIsSandboxOpen(false)}
          temporaryPrompt={systemPrompt}
          botName={company?.name || 'Synqo AI'}
          targetOrganizationId={organizationId}
          onPromptPatched={(newP) => {
            setSystemPrompt(newP);
            setSuccessMsg('Prompt actualizado con la regla enseñada en el Sandbox');
            setTimeout(() => setSuccessMsg(null), 3500);
          }}
        />
      )}
    </>
  );
}
