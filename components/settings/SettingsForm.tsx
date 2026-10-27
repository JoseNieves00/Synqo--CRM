'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  updateOrganizationSettings,
  testWhatsAppConnection,
  testCalConnection,
  processEmbeddedSignup,
  disconnectWhatsApp,
  addCustomTemplate,
  updateCustomTemplate,
  deleteCustomTemplate,
} from '@/app/actions/settings';
import {
  KeyRound,
  Bot,
  Calendar,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Lock,
  Users,
  Sliders,
  Check,
  Zap,
  Sparkles,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Unlink,
  RefreshCw,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Save,
} from 'lucide-react';
import { TeamTab } from './TeamTab';

interface PlanDetails {
  title: string;
  badge: string;
  description: string;
  tokens: string;
  seats: string;
  features: string[];
  highlight?: string;
}

const PLAN_BENEFITS: Record<string, PlanDetails> = {
  core: {
    title: 'Starter (Validación)',
    badge: 'Starter',
    description: 'Diseñado para negocios unipersonales o 1-2 asesores validando su canal de captación y cierre por WhatsApp.',
    tokens: '500,000 tokens IA / mes (~350 - 500 chats)',
    seats: 'Hasta 2 usuarios de asesores incluidos',
    features: [
      'IA autónoma con Prompt 100% editable y personalizable',
      'Bandeja de entrada de WhatsApp & Kanban en tiempo real',
      'Agendamiento de citas sincronizado con Cal.com',
      'Alertas sonoras melódicas y notificaciones push al navegador',
      'Soporte técnico estándar por ticket y correo',
    ],
  },
  starter: {
    title: 'Starter (Validación)',
    badge: 'Starter',
    description: 'Diseñado para negocios unipersonales o 1-2 asesores validando su canal de captación y cierre por WhatsApp.',
    tokens: '500,000 tokens IA / mes (~350 - 500 chats)',
    seats: 'Hasta 2 usuarios de asesores incluidos',
    features: [
      'IA autónoma con Prompt 100% editable y personalizable',
      'Bandeja de entrada de WhatsApp & Kanban en tiempo real',
      'Agendamiento de citas sincronizado con Cal.com',
      'Alertas sonoras melódicas y notificaciones push al navegador',
      'Soporte técnico estándar por ticket y correo',
    ],
  },
  pro: {
    title: 'Pro Comercial (Recomendado)',
    badge: 'Pro',
    description: 'Para empresas con equipo comercial activo que buscan acelerar la conversión y cierre de prospectos calificados.',
    tokens: '2,500,000 tokens IA / mes (~1,800 - 2,500 chats)',
    seats: 'Hasta 5 usuarios de asesores incluidos',
    features: [
      'IA autónoma con Prompt 100% editable y personalizable',
      'Bandeja de entrada de WhatsApp & Kanban en tiempo real',
      'Agendamiento de citas sincronizado con Cal.com',
      'Exportación de Leads y contactos a archivo CSV / Excel',
      'Alertas sonoras melódicas y notificaciones push al navegador',
      'Soporte comercial prioritario por correo electrónico',
    ],
    highlight: 'Plan Más Popular',
  },
  enterprise: {
    title: 'Enterprise Corporativo (Escala)',
    badge: 'Enterprise',
    description: 'Para operaciones comerciales consolidadas con múltiples turnos y equipos comerciales grandes.',
    tokens: '7,500,000 tokens IA / mes (~5,000 - 7,500 chats)',
    seats: 'Hasta 12 usuarios de asesores incluidos',
    features: [
      'IA autónoma con Prompt 100% editable y personalizable',
      'Bandeja de entrada de WhatsApp & Kanban en tiempo real',
      'Agendamiento de citas sincronizado con Cal.com',
      'Exportación Masiva de Leads & Historial completo a Excel',
      'Grupo VIP de WhatsApp dedicado con SLA de respuesta < 2h',
      'Sesión de Capacitación en Vivo (45 min) para asesores',
      'Facturación corporativa anual / local y soporte preferencial',
    ],
    highlight: 'Soporte VIP en WhatsApp',
  },
};

interface SettingsFormProps {
  initialData: {
    whatsappPhoneNumberId?: string | null;
    hasWhatsappToken?: boolean;
    hasWhatsappAppSecret?: boolean;
    calEventTypeId?: string | null;
    calComEnabled?: boolean;
    systemPrompt?: string | null;
    subscriptionStatus?: string | null;
    planType?: string | null;
    orgName?: string | null;
    metaAppId?: string;
    metaConfigId?: string;
    whatsappTemplates?: Array<{ name: string; label: string }>;
  };
  teamData?: {
    organization: {
      id: string;
      name: string;
      planType: string;
      maxUsers: number;
      usedUsers: number;
      remainingSeats: number;
    };
    members: any[];
  };
}

export function SettingsForm({ initialData, teamData }: SettingsFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'integrations' | 'team'>('integrations');
  const [phoneNumberId, setPhoneNumberId] = useState(initialData.whatsappPhoneNumberId || '');
  const [accessToken, setAccessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [appSecret, setAppSecret] = useState('');
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [hasToken, setHasToken] = useState(Boolean(initialData.hasWhatsappToken));
  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false);
  const [savingManualWa, setSavingManualWa] = useState(false);
  const [disconnectingWhatsApp, setDisconnectingWhatsApp] = useState(false);
  const [capturedPhoneId, setCapturedPhoneId] = useState<string | null>(null);
  const [capturedWabaId, setCapturedWabaId] = useState<string | null>(null);
  const [showManualConfig, setShowManualConfig] = useState(!initialData.hasWhatsappToken && !initialData.whatsappPhoneNumberId);

  const metaAppId = initialData.metaAppId || process.env.NEXT_PUBLIC_META_APP_ID || '1628755725455108';
  const metaConfigId = initialData.metaConfigId || process.env.NEXT_PUBLIC_META_CONFIG_ID || '1897459618280453';

  const [calApiKey, setCalApiKey] = useState('');
  const [calEventTypeId, setCalEventTypeId] = useState(initialData.calEventTypeId || '');
  const [systemPrompt, setSystemPrompt] = useState(
    initialData.systemPrompt ||
      'Eres un asesor comercial experto y empático de Synqo. Responde con cortesía, resuelve dudas de servicios y orienta al prospecto a agendar una cita mediante Cal.com.'
  );

  // Inicialización del SDK de Meta y escucha de eventos de sesión (sessionInfoVersion: '2')
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.fbAsyncInit = function () {
        window.FB?.init({
          appId: metaAppId,
          cookie: true,
          xfbml: true,
          version: 'v21.0',
        });
      };

      if (!document.getElementById('facebook-jssdk')) {
        const js = document.createElement('script');
        js.id = 'facebook-jssdk';
        js.src = 'https://connect.facebook.net/es_LA/sdk.js';
        js.async = true;
        js.defer = true;
        document.body.appendChild(js);
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
        return;
      }
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.event === 'FINISH') {
            const pId = data.data?.phone_number_id;
            const wId = data.data?.waba_id;
            if (pId) setCapturedPhoneId(pId);
            if (wId) setCapturedWabaId(wId);
          } else if (data.event === 'CANCEL') {
            setConnectingWhatsApp(false);
          }
        }
      } catch {
        // Ignorar mensajes que no sean JSON
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [metaAppId]);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Estados para pruebas de conexión
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [waTestResult, setWaTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  const [testingCal, setTestingCal] = useState(false);
  const [calTestResult, setCalTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  // Gestión dinámica de plantillas de WhatsApp (Meta)
  const DEFAULT_SYSTEM_TEMPLATES = [
    { name: 'reactivacion_lead', label: 'Reactivación de Contacto' },
    { name: 'hello_world', label: 'Saludo de Prueba Meta' },
    { name: 'recordatorio_cita', label: 'Recordatorio de Cita' },
    { name: 'seguimiento_general', label: 'Seguimiento General' },
  ];

  const [templates, setTemplates] = useState<Array<{ name: string; label: string }>>(
    initialData.whatsappTemplates && initialData.whatsappTemplates.length > 0
      ? initialData.whatsappTemplates
      : DEFAULT_SYSTEM_TEMPLATES
  );
  const [newTplName, setNewTplName] = useState('');
  const [newTplLabel, setNewTplLabel] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplFeedback, setTplFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deletingTpl, setDeletingTpl] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [templateToEdit, setTemplateToEdit] = useState<{ oldName: string; name: string; label: string } | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editingTpl, setEditingTpl] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleAddTemplate = async () => {
    const cleanName = newTplName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleanName) {
      setTplFeedback({
        type: 'error',
        message: 'Por favor ingresa el nombre exacto de la plantilla en Meta (ej: reactivacion_lead).',
      });
      return;
    }
    setSavingTpl(true);
    setTplFeedback(null);
    try {
      const res = await addCustomTemplate({
        name: cleanName,
        label: newTplLabel.trim() || undefined,
      });
      if (res.templates) {
        setTemplates(res.templates);
      }
      setNewTplName('');
      setNewTplLabel('');
      setTplFeedback({
        type: 'success',
        message: `Plantilla "${cleanName}" guardada y lista para usarse en el Inbox.`,
      });
    } catch (err: any) {
      setTplFeedback({
        type: 'error',
        message: err.message || 'Error al guardar la plantilla en el CRM.',
      });
    } finally {
      setSavingTpl(false);
    }
  };

  const handleSaveEditTemplate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!templateToEdit) return;
    const cleanNewName = templateToEdit.name.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleanNewName) {
      setEditError('El nombre técnico de la plantilla en Meta no puede estar vacío.');
      return;
    }
    if (!editPassword.trim()) {
      setEditError('Debes ingresar tu contraseña para confirmar la modificación.');
      return;
    }

    setEditingTpl(true);
    setEditError(null);
    try {
      const res = await updateCustomTemplate({
        oldName: templateToEdit.oldName,
        newName: cleanNewName,
        label: templateToEdit.label.trim() || undefined,
        password: editPassword,
      });
      if (res.templates) {
        setTemplates(res.templates);
      }
      setTemplateToEdit(null);
      setEditPassword('');
      setTplFeedback({
        type: 'success',
        message: `Plantilla actualizada con éxito.`,
      });
      router.refresh();
    } catch (err: any) {
      setEditError(err.message || 'Error al actualizar la plantilla.');
    } finally {
      setEditingTpl(false);
    }
  };

  const confirmDeleteTemplate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!templateToDelete) return;
    if (!deletePassword.trim()) {
      setDeleteError('Debes ingresar tu contraseña para confirmar la eliminación.');
      return;
    }

    setDeletingTpl(true);
    setDeleteError(null);
    try {
      const res = await deleteCustomTemplate({
        templateName: templateToDelete,
        password: deletePassword,
      });
      if (res.templates) {
        setTemplates(res.templates);
      }
      setTplFeedback({
        type: 'success',
        message: `Plantilla "${templateToDelete}" eliminada correctamente del CRM.`,
      });
      setTemplateToDelete(null);
      setDeletePassword('');
      router.refresh();
    } catch (err: any) {
      setDeleteError(err.message || 'Error al eliminar la plantilla.');
    } finally {
      setDeletingTpl(false);
    }
  };

  /**
   * Guarda directamente las credenciales manuales de WhatsApp sin depender de Meta Login
   */
  const handleSaveManualWhatsApp = async () => {
    const cleanPhone = phoneNumberId.trim().replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      setFeedback({
        type: 'error',
        message: 'Por favor ingresa un Phone Number ID válido de Meta (solo números).',
      });
      return;
    }

    setSavingManualWa(true);
    setFeedback(null);
    try {
      await updateOrganizationSettings({
        whatsappPhoneNumberId: cleanPhone,
        whatsappAccessToken: accessToken.trim() || undefined,
      });

      if (accessToken.trim()) {
        setHasToken(true);
        setAccessToken('');
      }

      setFeedback({
        type: 'success',
        message: '¡Credenciales de WhatsApp guardadas exitosamente!',
      });
      router.refresh();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Error al guardar las credenciales de WhatsApp.',
      });
    } finally {
      setSavingManualWa(false);
    }
  };

  /**
   * Lanza el flujo oficial de Meta Embedded Signup
   */
  const handleConnectWhatsApp = () => {
    if (typeof window === 'undefined' || !window.FB) {
      setFeedback({
        type: 'error',
        message: 'El SDK de Meta todavía está cargando. Por favor espera unos segundos y vuelve a pulsar el botón.',
      });
      return;
    }

    setConnectingWhatsApp(true);
    setFeedback(null);

    // Watchdog de seguridad: Si la ventana de Meta se bloquea o el usuario la cierra, liberar el botón tras 15 segundos
    const watchdogTimer = setTimeout(() => {
      setConnectingWhatsApp(false);
    }, 15000);

    const handleFocusBack = () => {
      setTimeout(() => {
        setConnectingWhatsApp(false);
        window.removeEventListener('focus', handleFocusBack);
      }, 1500);
    };
    window.addEventListener('focus', handleFocusBack);

    const loginOptions: Record<string, any> = {
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        setup: {},
        sessionInfoVersion: '2',
      },
    };

    if (metaConfigId) {
      loginOptions.config_id = metaConfigId;
    } else {
      loginOptions.scope = 'whatsapp_business_management,whatsapp_business_messaging';
    }

    window.FB.login(async (response: any) => {
      clearTimeout(watchdogTimer);
      window.removeEventListener('focus', handleFocusBack);

      if (response.authResponse?.code) {
        try {
          const res = await processEmbeddedSignup({
            code: response.authResponse.code,
            phoneNumberId: capturedPhoneId || undefined,
            wabaId: capturedWabaId || undefined,
          });

          if (res.success) {
            setPhoneNumberId(res.phoneNumberId);
            setHasToken(true);
            setWaTestResult({
              success: true,
              message: `¡Conexión verificada! Número oficial: ${res.displayPhoneNumber || res.phoneNumberId}${
                res.verifiedName ? ` (${res.verifiedName})` : ''
              }`,
            });
            setFeedback({
              type: 'success',
              message: `¡WhatsApp Business conectado exitosamente con Meta! Número vinculado: ${
                res.displayPhoneNumber || res.phoneNumberId
              }`,
            });
          }
        } catch (err: any) {
          setFeedback({
            type: 'error',
            message: err?.message || 'Error vinculando con Meta Embedded Signup',
          });
        } finally {
          setConnectingWhatsApp(false);
        }
      } else {
        setConnectingWhatsApp(false);
        if (response.status !== 'connected') {
          setFeedback({
            type: 'error',
            message: 'Flujo de conexión cancelado o no completado en Meta.',
          });
        }
      }
    }, loginOptions);
  };

  /**
   * Desconecta WhatsApp Business de la organización
   */
  const handleDisconnect = async () => {
    if (
      !confirm(
        '¿Estás seguro de desconectar WhatsApp Business? Tu CRM y la IA dejarán de procesar mensajes hasta que vuelvas a conectarlo.'
      )
    ) {
      return;
    }

    setDisconnectingWhatsApp(true);
    setFeedback(null);
    try {
      await disconnectWhatsApp();
      setPhoneNumberId('');
      setAccessToken('');
      setAppSecret('');
      setHasToken(false);
      setWaTestResult(null);
      setFeedback({
        type: 'success',
        message: 'WhatsApp Business ha sido desconectado correctamente de tu organización.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Error al desconectar WhatsApp',
      });
    } finally {
      setDisconnectingWhatsApp(false);
    }
  };

  const handleTestWhatsApp = async () => {
    setTestingWhatsApp(true);
    setWaTestResult(null);
    try {
      const res = await testWhatsAppConnection({
        phoneNumberId: phoneNumberId || undefined,
        accessToken: accessToken || undefined,
        appSecret: appSecret || undefined,
      });
      setWaTestResult(res);
    } catch (err: any) {
      setWaTestResult({ success: false, error: err.message || 'Error probando WhatsApp' });
    } finally {
      setTestingWhatsApp(false);
    }
  };

  const handleTestCal = async () => {
    setTestingCal(true);
    setCalTestResult(null);
    try {
      const res = await testCalConnection({
        apiKey: calApiKey || undefined,
        eventTypeId: calEventTypeId || undefined,
      });
      setCalTestResult(res);
      if (res.success && (res as any).detectedEventId) {
        setCalEventTypeId(String((res as any).detectedEventId));
      }
    } catch (err: any) {
      setCalTestResult({ success: false, error: err.message || 'Error probando Cal.com' });
    } finally {
      setTestingCal(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      await updateOrganizationSettings({
        whatsappPhoneNumberId: phoneNumberId || undefined,
        whatsappAccessToken: accessToken || undefined,
        whatsappAppSecret: appSecret || undefined,
        calApiKey: calApiKey || undefined,
        calEventTypeId: calEventTypeId || undefined,
        systemPrompt: systemPrompt || undefined,
      });

      setFeedback({
        type: 'success',
        message: 'Configuración y credenciales guardadas de forma segura.',
      });
      // Limpiar campos sensibles por seguridad
      setAccessToken('');
      setAppSecret('');
      setCalApiKey('');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Error al guardar configuración',
      });
    } finally {
      setSaving(false);
    }
  };

  const subStatus = initialData.subscriptionStatus || 'trialing';
  const planType = initialData.planType || 'core';

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Configuración & Administración
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestiona las integraciones de IA, credenciales cifradas y accesos de agentes de {initialData.orgName || 'tu empresa'}.
        </p>
      </div>

      {/* Navegación por Pestañas */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('integrations')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
            activeTab === 'integrations'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Integraciones & IA
        </button>

        {teamData && (
          <button
            type="button"
            onClick={() => setActiveTab('team')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
              activeTab === 'team'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Users className="w-4 h-4" />
            Equipo & Usuarios ({teamData.members.length}/{teamData.organization.maxUsers})
          </button>
        )}
      </div>

      {activeTab === 'team' && teamData ? (
        <TeamTab initialData={teamData} />
      ) : (
        <>
          {feedback && (
            <div
              className={`p-4 rounded-lg flex items-center gap-3 text-sm font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Tarjeta de Licencia y Beneficios del Plan */}
          {(() => {
            const currentPlan = PLAN_BENEFITS[planType.toLowerCase()] || PLAN_BENEFITS.core;
            return (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-[#0052FF]/10 text-[#0052FF] rounded-xl">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-gray-900">Estado de Licencia & Servicio</h2>
                        {currentPlan.highlight && (
                          <span className="text-[10px] bg-[#0052FF]/10 text-[#0052FF] font-semibold px-2 py-0.5 rounded-full border border-[#0052FF]/20">
                            {currentPlan.highlight}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">Plan contratado y herramientas activas en tu suscripción</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                        subStatus === 'active' || subStatus === 'trialing'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          subStatus === 'active' || subStatus === 'trialing'
                            ? 'bg-emerald-500 animate-pulse'
                            : 'bg-rose-500'
                        }`}
                      />
                      {subStatus === 'trialing'
                        ? `Prueba Activa (${currentPlan.badge})`
                        : `Plan ${currentPlan.badge}: ${subStatus.toUpperCase()}`}
                    </span>
                  </div>
                </div>

                {/* Descripción y Resumen del Plan */}
                <div className="space-y-3 pt-1">
                  <p className="text-xs text-gray-700 leading-relaxed font-medium">
                    {currentPlan.description}
                  </p>

                  {/* Cuotas del Plan: Usuarios y Tokens */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white text-[#0052FF] border border-slate-200 shadow-xs">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider block">
                          Capacidad de Equipo
                        </span>
                        <span className="text-xs font-bold text-gray-900">{currentPlan.seats}</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white text-[#0052FF] border border-slate-200 shadow-xs">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider block">
                          Cuota Mensual de Inteligencia Artificial
                        </span>
                        <span className="text-xs font-bold text-gray-900">{currentPlan.tokens}</span>
                      </div>
                    </div>
                  </div>

                  {/* Lista Oficial de Beneficios */}
                  <div className="pt-2">
                    <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block mb-2">
                      Beneficios Incluidos en tu Plan:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {currentPlan.features.map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-gray-600">
                          <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Formulario de Integraciones */}
          <form onSubmit={handleSave} className="space-y-6">
            {/* Meta WhatsApp Cloud API */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-gray-900">Meta WhatsApp Cloud API (Oficial)</h2>
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                        v21.0
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">Conexión oficial de WhatsApp Business para captación de leads y atención con IA</p>
                  </div>
                </div>

                {(hasToken || phoneNumberId) && (
                  <button
                    type="button"
                    onClick={handleTestWhatsApp}
                    disabled={testingWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer disabled:opacity-50"
                  >
                    <Zap className={`w-3.5 h-3.5 ${testingWhatsApp ? 'animate-spin' : ''}`} />
                    {testingWhatsApp ? 'Probando...' : 'Probar Conexión WhatsApp'}
                  </button>
                )}
              </div>

              {waTestResult && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                    waTestResult.success
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {waTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span>{waTestResult.success ? waTestResult.message : waTestResult.error}</span>
                </div>
              )}

              {/* SECCIÓN 1: VINCULACIÓN OFICIAL CON META EMBEDDED SIGNUP */}
              {hasToken && phoneNumberId ? (
                // Estado: Conectado
                <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-xs shrink-0">
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                          <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.067-2.123-.532-1.748-.733-2.871-2.502-2.958-2.618-.087-.115-.708-.941-.708-1.794 0-.853.448-1.272.607-1.446.16-.174.348-.217.464-.217.116 0 .232.001.333.006.107.005.25-.041.391.298.145.348.493 1.202.536 1.29.043.087.072.189.014.305-.058.115-.087.188-.174.289-.087.102-.182.228-.261.306-.087.087-.178.182-.077.355.101.174.45 1.742 1.353 2.544.755.672 1.392.879 1.589.976.197.097.312.083.428-.051.116-.134.493-.574.624-.77.13-.197.261-.164.44-.097.179.067 1.135.536 1.33.633.195.097.326.145.375.228.048.083.048.482-.096.887z"/>
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">WhatsApp Business Conectado</span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Activo & Sincronizado
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Phone Number ID: <span className="font-mono font-semibold text-gray-900">{phoneNumberId}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* BOTÓN OFICIAL AZUL PARA EMBEDDED SIGNUP CON FACEBOOK */}
                      <button
                        type="button"
                        onClick={handleConnectWhatsApp}
                        disabled={connectingWhatsApp}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#1877F2] hover:bg-[#166FE5] transition cursor-pointer shadow-xs disabled:opacity-50"
                        title="Abrir ventana oficial de Meta para sincronizar cuenta por Facebook Login"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${connectingWhatsApp ? 'animate-spin' : ''}`} />
                        <span>{connectingWhatsApp ? 'Conectando con Meta...' : 'Reconectar con Facebook'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={disconnectingWhatsApp}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer disabled:opacity-50"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        <span>{disconnectingWhatsApp ? 'Desconectando...' : 'Desconectar'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] text-emerald-900 bg-emerald-100/60 rounded-lg p-2.5 border border-emerald-200/60 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>
                      Tus clientes ya pueden escribir a este número y serán atendidos inmediatamente por la Inteligencia Artificial y tu equipo comercial.
                    </span>
                  </div>
                </div>
              ) : (
                // Estado: No conectado -> Hero Card con Botón Oficial Azul
                <div className="bg-gradient-to-br from-blue-50/80 via-white to-slate-50 border-2 border-dashed border-[#1877F2]/30 rounded-2xl p-6 sm:p-7 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#1877F2] bg-blue-100/80 px-2.5 py-0.5 rounded-full border border-blue-200">
                          Recomendado • Meta Embedded Signup (1 Clic)
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">
                        Conecta tu WhatsApp Business en 1 Clic
                      </h3>
                      <p className="text-xs text-gray-600 max-w-xl leading-relaxed">
                        Vincula tu número comercial de forma automática y guiada con Meta. Sin copiar tokens del sistema, sin crear apps en Meta Developers y sin demoras técnicas.
                      </p>
                    </div>

                    {/* BOTÓN OFICIAL AZUL DE META EMBEDDED SIGNUP */}
                    <button
                      type="button"
                      onClick={handleConnectWhatsApp}
                      disabled={connectingWhatsApp}
                      className="inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-bold text-sm text-white bg-[#1877F2] hover:bg-[#166FE5] active:bg-[#0C63D4] shadow-md hover:shadow-lg transition cursor-pointer disabled:opacity-60 shrink-0"
                    >
                      {connectingWhatsApp ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                      )}
                      <span>
                        {connectingWhatsApp ? 'Conectando con Meta...' : 'Conectar con Facebook / WhatsApp'}
                      </span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-blue-100/60 text-[11px] text-gray-600">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Inicio de sesión oficial con Facebook</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Configuración 100% autogestionada</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Cifrado militar AES-256 automático</span>
                    </div>
                  </div>
                </div>
              )}

              {/* SECCIÓN 2: ACORDEÓN DE CONFIGURACIÓN MANUAL AVANZADA */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowManualConfig(!showManualConfig)}
                  className="w-full flex items-center justify-between p-4 bg-gray-50/70 hover:bg-gray-100/70 transition cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <Lock className="w-4 h-4 text-gray-500" />
                    <span>Configuración Manual de Credenciales (Opciones Avanzadas)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                    <span>{showManualConfig ? 'Ocultar' : 'Mostrar'}</span>
                    {showManualConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {showManualConfig && (
                  <div className="p-4 sm:p-5 bg-white border-t border-gray-200 space-y-4">
                    <p className="text-xs text-gray-500">
                      Utiliza estos campos si necesitas configurar tokens permanentes generados manualmente en Meta for Developers o claves secretas específicas.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1">
                          Phone Number ID de Meta (Solo números)
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. 104589234812345"
                          value={phoneNumberId}
                          onChange={(e) => setPhoneNumberId(e.target.value.replace(/[^0-9]/g, ''))}
                          className="w-full text-sm border border-gray-300 rounded-md px-3.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black font-mono"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                          Encuéntralo en Meta for Developers → WhatsApp → API Setup → Phone number ID.
                        </p>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center justify-between">
                          <span>WhatsApp Permanent Access Token</span>
                          <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Cifrado AES-256
                          </span>
                        </label>
                        <div className="relative">
                          <input
                            type={showToken ? 'text' : 'password'}
                            placeholder={hasToken ? '•••••••••••••••••••••••• (Guardado)' : 'EAAG••••••••••••••••••••'}
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value.trim())}
                            className="w-full text-sm border border-gray-300 rounded-md pl-3.5 pr-10 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black font-mono text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken(!showToken)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
                            title={showToken ? 'Ocultar token' : 'Mostrar token'}
                          >
                            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">
                          Token del Sistema con permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>.
                        </p>
                      </div>
                    </div>

                    {/* Botón para guardar cambios de WhatsApp en el mismo bloque */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-gray-100">
                      <p className="text-[11px] text-gray-500">
                        Al guardar, el token se cifrará de inmediato con AES-256 y quedará activo en el CRM.
                      </p>
                      <button
                        type="button"
                        onClick={handleSaveManualWhatsApp}
                        disabled={savingManualWa || !phoneNumberId.trim()}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#0052FF] hover:bg-[#0047E0] text-white transition shadow-sm cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        <Save className={`w-3.5 h-3.5 ${savingManualWa ? 'animate-spin' : ''}`} />
                        <span>{savingManualWa ? 'Guardando...' : 'Guardar Credenciales de WhatsApp'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Plantillas de WhatsApp (Meta) para Ventana de 24 Horas y Nuevos Prospectos */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Plantillas de WhatsApp (Meta)</h2>
                    <p className="text-xs text-gray-500">
                      Disponibles en el selector del chat cuando la ventana de 24 horas expire o al crear un nuevo lead
                    </p>
                  </div>
                </div>
              </div>

              {tplFeedback && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                    tplFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {tplFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span>{tplFeedback.message}</span>
                </div>
              )}

              {/* Formulario para agregar nueva plantilla */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                  Vincular Nueva Plantilla desde Meta
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-gray-700 block mb-1">
                      Nombre exacto en Meta <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="ej: reactivacion_lead"
                      value={newTplName}
                      onChange={(e) => setNewTplName(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                      className="w-full text-xs font-mono border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-gray-700 block mb-1">
                      Etiqueta en CRM (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="ej: Reactivación de Lead"
                      value={newTplLabel}
                      onChange={(e) => setNewTplLabel(e.target.value)}
                      className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>
                  <div className="sm:col-span-1 flex items-end">
                    <button
                      type="button"
                      onClick={handleAddTemplate}
                      disabled={savingTpl || !newTplName.trim()}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {savingTpl ? 'Guardando...' : 'Agregar'}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500">
                  Copia el nombre tal cual lo aprobaste en el <strong>Administrador de WhatsApp de Meta</strong> (sin espacios ni mayúsculas). El CRM solo requiere el nombre para invocar el envío oficial.
                </p>
              </div>

              {/* Listado de plantillas activas en el CRM */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-700">
                    Plantillas configuradas ({templates.length}):
                  </h3>
                  <span className="text-[11px] text-gray-400">
                    Disponibles en el selector del chat
                  </span>
                </div>

                <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden bg-white">
                  {templates.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-500">
                      No hay plantillas registradas. Agrega una arriba con el nombre exacto aprobado en Meta.
                    </div>
                  ) : (
                    templates.map((tpl) => (
                      <div
                        key={tpl.name}
                        className="p-3 flex items-center justify-between hover:bg-gray-50/70 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <div>
                            <p className="text-xs font-semibold text-gray-900">
                              {tpl.label || tpl.name}
                            </p>
                            <p className="text-[11px] font-mono text-gray-500">
                              {tpl.name}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setTemplateToEdit({
                                oldName: tpl.name,
                                name: tpl.name,
                                label: tpl.label || tpl.name,
                              });
                              setEditPassword('');
                              setShowEditPassword(false);
                              setEditError(null);
                            }}
                            disabled={savingTpl || deletingTpl || editingTpl}
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                            title="Editar plantilla"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setTemplateToDelete(tpl.name);
                              setDeletePassword('');
                              setShowDeletePassword(false);
                              setDeleteError(null);
                            }}
                            disabled={savingTpl || deletingTpl || editingTpl}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Eliminar plantilla"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

        {/* Cal.com Scheduling (Solo si el Super Admin lo habilitó para esta empresa) */}
        {initialData.calComEnabled && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Integración con Cal.com</h2>
                  <p className="text-xs text-gray-500">Permite a Synqo AI consultar disponibilidad y agendar citas</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestCal}
                disabled={testingCal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition cursor-pointer disabled:opacity-50"
              >
                <Zap className={`w-3.5 h-3.5 ${testingCal ? 'animate-spin' : ''}`} />
                {testingCal ? 'Probando...' : 'Probar Conexión Cal.com'}
              </button>
            </div>

            {calTestResult && (
              <div
                className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                  calTestResult.success
                    ? 'bg-purple-50 text-purple-800 border border-purple-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {calTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-purple-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                )}
                <span>{calTestResult.success ? calTestResult.message : calTestResult.error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center justify-between">
                  <span>Cal.com API Key</span>
                  <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Almacenamiento Cifrado
                  </span>
                </label>
                <input
                  type="password"
                  placeholder="cal_live_••••••••••••••••"
                  value={calApiKey}
                  onChange={(e) => setCalApiKey(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-md px-3.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black font-mono"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Generada en Cal.com → Settings → Developer → API Keys (empieza con <code>cal_live_</code>).
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Tipo de Evento o Enlace Cal.com (Opcional - Detección Automática)
                </label>
                <input
                  type="text"
                  placeholder="Ej. cita-comercial (o déjalo vacío para auto-detectar)"
                  value={calEventTypeId}
                  onChange={(e) => setCalEventTypeId(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-md px-3.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black font-mono text-xs"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Puedes escribir el nombre de tu evento (ej. <strong className="text-purple-700">cita-comercial</strong>), pegar tu enlace completo, o dejarlo en blanco para que el botón <strong>"Probar Conexión"</strong> lo detecte y complete automáticamente.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* OpenAI System Prompt */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            <div className="p-2.5 bg-slate-100 text-slate-800 rounded-lg">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Instrucciones y Objetivos del Asesor IA</h2>
              <p className="text-xs text-gray-500">Define el tono, servicios de la empresa y objetivos comerciales</p>
            </div>
          </div>

          <div>
            <textarea
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Las directrices de confidencialidad, cortesía y protección comercial se aplican automáticamente para garantizar un servicio profesional.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#0052FF] hover:bg-[#0047E0] text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition shadow-md shadow-[#0052FF]/20 disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </form>

      {/* Modal de Edición de Plantilla */}
      {templateToEdit && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Pencil className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-gray-900">
                  Editar Plantilla
                </h3>
                <p className="text-xs text-gray-500">
                  Modifica el nombre técnico de Meta o su etiqueta.
                </p>
              </div>
            </div>

            {editError && (
              <div className="p-2.5 rounded-lg text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditTemplate} className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  Nombre exacto en Meta <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={templateToEdit.name}
                  onChange={(e) =>
                    setTemplateToEdit({
                      ...templateToEdit,
                      name: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                    })
                  }
                  placeholder="ej: reactivacion_lead"
                  className="w-full text-xs font-mono border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  Etiqueta en CRM (Nombre amigable)
                </label>
                <input
                  type="text"
                  value={templateToEdit.label}
                  onChange={(e) =>
                    setTemplateToEdit({
                      ...templateToEdit,
                      label: e.target.value,
                    })
                  }
                  placeholder="ej: Reactivación de Lead"
                  className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  Confirma con tu contraseña <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Tu contraseña de Synqo"
                    className="w-full text-xs border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-0.5"
                    title={showEditPassword ? 'Ocultar' : 'Mostrar'}
                  >
                    {showEditPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setTemplateToEdit(null);
                    setEditPassword('');
                    setEditError(null);
                  }}
                  disabled={editingTpl}
                  className="flex-1 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-xl border border-gray-300 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editingTpl || !templateToEdit.name.trim() || !editPassword.trim()}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {editingTpl ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Confirmación para Eliminar Plantilla */}
      {templateToDelete && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>

            <div>
              <h3 className="font-bold text-base text-gray-900 mb-1">
                ¿Eliminar plantilla de WhatsApp?
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                ¿Estás seguro de que deseas quitar la plantilla{' '}
                <strong className="text-gray-800 font-mono">"{templateToDelete}"</strong> del CRM? Ya no estará disponible en el selector del Inbox.
              </p>
            </div>

            {deleteError && (
              <div className="p-2.5 rounded-lg text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <form onSubmit={confirmDeleteTemplate} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  Confirma con tu contraseña <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showDeletePassword ? 'text' : 'password'}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Tu contraseña de Synqo"
                    className="w-full text-xs border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword(!showDeletePassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-0.5"
                    title={showDeletePassword ? 'Ocultar' : 'Mostrar'}
                  >
                    {showDeletePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setTemplateToDelete(null);
                    setDeletePassword('');
                    setDeleteError(null);
                  }}
                  disabled={deletingTpl}
                  className="flex-1 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-xl border border-gray-300 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={deletingTpl || !deletePassword.trim()}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deletingTpl ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      </>
      )}
    </div>
  );
}

