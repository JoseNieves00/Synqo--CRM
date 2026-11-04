'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  updateOrganizationSettings,
  testWhatsAppConnection,
  processEmbeddedSignup,
  disconnectWhatsApp,
  addCustomTemplate,
  updateCustomTemplate,
  deleteCustomTemplate,
} from '@/app/actions/settings';
import {
  saveGoogleCalendarSettings,
  disconnectGoogleCalendar,
  testGoogleCalendarConnection,
  getGoogleOAuthUrl,
  saveInstagramSettings,
  disconnectInstagram,
  testInstagramConnection,
} from '@/app/actions/integrations';
import type { EnabledModules } from '@/lib/supabase/types';
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
  DoorOpen,
  Smartphone,
  Instagram,
  Video,
  Shield,
  Loader2,
} from 'lucide-react';
import { TeamTab } from './TeamTab';
import { SpecialistsTab } from './SpecialistsTab';
import { RoomsTab } from './RoomsTab';
import { StructuredPromptWizard } from './StructuredPromptWizard';
import { KnowledgeGapsList } from './KnowledgeGapsList';
import { EvolutionQrCard } from './EvolutionQrCard';

interface SettingsFormProps {
  initialData: {
    whatsappPhoneNumberId?: string | null;
    hasWhatsappToken?: boolean;
    hasWhatsappAppSecret?: boolean;
    systemPrompt?: string | null;
    structuredPromptData?: any;
    initialKnowledgeGaps?: any[];
    subscriptionStatus?: string | null;
    planType?: string | null;
    orgName?: string | null;
    companyCode?: string;
    metaAppId?: string;
    metaConfigId?: string;
    whatsappTemplates?: Array<{ name: string; label: string }>;
    initialOauthCode?: string;
    initialOauthError?: string;
    aiTokensUsed?: number;
    aiTokensLimit?: number;
    maxUsers?: number;
    industryPreset?: string | null;
    hasGoogleCalendarToken?: boolean;
    googleCalendarId?: string;
    googleCalendarSyncEnabled?: boolean;
    googleCalendarBlockBusy?: boolean;
    instagramAccountId?: string;
    hasInstagramToken?: boolean;
    whatsappProvider?: 'meta' | 'evolution';
    evolutionApiUrl?: string;
    evolutionInstanceName?: string;
    hasEvolutionApiKey?: boolean;
    evolutionStatus?: 'connected' | 'disconnected' | 'connecting';
    evolutionPhoneConnected?: string;
    evolutionAntiBanMode?: boolean;
    evolutionMaxOutboundPerHour?: number;
    specialistLabel?: string;
    roomLabel?: string;
    enabledModules?: EnabledModules;
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
  specialistsData?: any[];
  roomsData?: any[];
  isSuperAdmin?: boolean;
}

// Bandera para Meta Embedded Signup:
// Mantener en false mientras se completa la verificación oficial de Meta Tech Provider.
// En false, la conexión oficial se realiza mediante Phone Number ID y Token Permanente del Sistema.
// Control de características experimentales / futuras
const SHOW_EMBEDDED_SIGNUP = false;
// Instagram Direct preparado en arquitectura backend/servicios. Oculto en Frontend para MVP (activar en próxima release)
const SHOW_INSTAGRAM_MVP = false;

export function SettingsForm({
  initialData,
  teamData,
  specialistsData,
  roomsData,
  isSuperAdmin = false,
}: SettingsFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'integrations' | 'team' | 'specialists' | 'rooms'>('integrations');
  const activeWaEngine: 'meta' | 'evolution' =
    initialData.whatsappProvider === 'evolution' || initialData.evolutionInstanceName
      ? 'evolution'
      : 'meta';
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
  const capturedSessionRef = useRef<{ phoneId?: string; wabaId?: string }>({});
  const [showManualConfig, setShowManualConfig] = useState(!initialData.hasWhatsappToken && !initialData.whatsappPhoneNumberId);

  const metaAppId = initialData.metaAppId || process.env.NEXT_PUBLIC_META_APP_ID || '1628755725455108';
  const metaConfigId = initialData.metaConfigId || process.env.NEXT_PUBLIC_META_CONFIG_ID || '1897459618280453';

  const [systemPrompt, setSystemPrompt] = useState(
    initialData.systemPrompt ||
      'Eres un asesor comercial experto y empático de Synqo. Responde con cortesía, resuelve dudas de servicios y orienta al prospecto a agendar una cita.'
  );
  const [structuredPromptData, setStructuredPromptData] = useState<any>(
    initialData.structuredPromptData || null
  );

  // Google Calendar & Google Meet state
  const [gcalId, setGcalId] = useState(initialData.googleCalendarId || '');
  const [gcalToken, setGcalToken] = useState('');
  const [showGcalToken, setShowGcalToken] = useState(false);
  const [hasGcalToken, setHasGcalToken] = useState(Boolean(initialData.hasGoogleCalendarToken));
  const [gcalSyncEnabled, setGcalSyncEnabled] = useState(Boolean(initialData.googleCalendarSyncEnabled));
  const [gcalBlockBusy, setGcalBlockBusy] = useState(Boolean(initialData.googleCalendarBlockBusy));
  const [savingGcal, setSavingGcal] = useState(false);
  const [testingGcal, setTestingGcal] = useState(false);
  const [disconnectingGcal, setDisconnectingGcal] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [showManualGoogle, setShowManualGoogle] = useState(false);
  const [gcalFeedback, setGcalFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Instagram Direct state
  const [igAccountId, setIgAccountId] = useState(initialData.instagramAccountId || '');
  const [igToken, setIgToken] = useState('');
  const [showIgToken, setShowIgToken] = useState(false);
  const [hasIgToken, setHasIgToken] = useState(Boolean(initialData.hasInstagramToken));
  const [savingIg, setSavingIg] = useState(false);
  const [testingIg, setTestingIg] = useState(false);
  const [disconnectingIg, setDisconnectingIg] = useState(false);
  const [igFeedback, setIgFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Estados de verificación previa obligatoria (Gate anti-credenciales erróneas)
  const [waVerified, setWaVerified] = useState(false);
  const [igVerified, setIgVerified] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('google') === 'connected') {
        setGcalFeedback({
          success: true,
          message: '¡Cuenta de Google Calendar y Meet vinculada exitosamente con 1 clic!',
        });
        setHasGcalToken(true);
      } else if (params.get('google_error')) {
        setGcalFeedback({
          success: false,
          message: `Error al vincular con Google: ${decodeURIComponent(params.get('google_error') || '')}`,
        });
      }
    }
  }, []);

  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    setGcalFeedback(null);
    try {
      const res = await getGoogleOAuthUrl();
      if (res.success && res.url) {
        window.location.href = res.url;
      } else {
        setGcalFeedback({
          success: false,
          message: res.error || 'Configura GOOGLE_CLIENT_ID en .env.local para el botón de 1 clic, o ingresa tu token manualmente.',
        });
        setShowManualGoogle(true);
      }
    } catch (err: any) {
      setGcalFeedback({ success: false, message: err?.message || 'Error al conectar con Google.' });
      setShowManualGoogle(true);
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleSaveGoogleCalendar = async () => {
    setSavingGcal(true);
    setGcalFeedback(null);
    try {
      await saveGoogleCalendarSettings({
        calendarId: gcalId,
        accessToken: gcalToken || undefined,
        syncEnabled: gcalSyncEnabled,
        blockBusy: gcalBlockBusy,
      });
      if (gcalToken) setHasGcalToken(true);
      setGcalFeedback({ success: true, message: '¡Configuración de Google Calendar guardada exitosamente!' });
    } catch (err: any) {
      setGcalFeedback({ success: false, message: err?.message || 'Error al guardar Google Calendar.' });
    } finally {
      setSavingGcal(false);
    }
  };

  const handleTestGoogleCalendar = async () => {
    setTestingGcal(true);
    setGcalFeedback(null);
    try {
      const res = await testGoogleCalendarConnection(gcalId, gcalToken || undefined);
      setGcalFeedback({
        success: res.success,
        message: res.success ? (res.message || 'Conexión exitosa.') : (res.error || 'Fallo en la prueba.'),
      });
    } catch (err: any) {
      setGcalFeedback({ success: false, message: err?.message || 'Error probando Google Calendar.' });
    } finally {
      setTestingGcal(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    if (!confirm('¿Estás seguro de desconectar Google Calendar?')) return;
    setDisconnectingGcal(true);
    try {
      await disconnectGoogleCalendar();
      setHasGcalToken(false);
      setGcalToken('');
      setGcalFeedback({ success: true, message: 'Google Calendar desconectado.' });
    } catch (err: any) {
      setGcalFeedback({ success: false, message: err?.message || 'Error al desconectar.' });
    } finally {
      setDisconnectingGcal(false);
    }
  };

  const handleSaveInstagram = async () => {
    if (!igVerified && !hasIgToken) {
      setIgFeedback({
        success: false,
        message: 'Por favor prueba y verifica la conexión con Meta antes de guardar las credenciales.',
      });
      return;
    }
    setSavingIg(true);
    setIgFeedback(null);
    try {
      await saveInstagramSettings({
        instagramAccountId: igAccountId,
        accessToken: igToken || undefined,
      });
      if (igToken) {
        setHasIgToken(true);
        setIgToken('');
      }
      setIgVerified(false);
      setIgFeedback({ success: true, message: '¡Cuenta de Instagram guardada y vinculada exitosamente!' });
    } catch (err: any) {
      setIgFeedback({ success: false, message: err?.message || 'Error al guardar Instagram.' });
    } finally {
      setSavingIg(false);
    }
  };

  const handleTestInstagram = async () => {
    const accountToTest = igAccountId.trim() || initialData.instagramAccountId;
    const tokenToTest = igToken.trim();

    if (!accountToTest) {
      setIgFeedback({
        success: false,
        message: 'Por favor ingresa primero el "ID de la Cuenta de Instagram Business" para probar la conexión.',
      });
      setIgVerified(false);
      return;
    }

    if (!tokenToTest && !hasIgToken) {
      setIgFeedback({
        success: false,
        message: 'Por favor ingresa tu "Instagram Access Token (Meta System User)" para probar la conexión.',
      });
      setIgVerified(false);
      return;
    }

    setTestingIg(true);
    setIgFeedback(null);
    try {
      const res = await testInstagramConnection(accountToTest, tokenToTest || undefined);
      setIgFeedback({
        success: res.success,
        message: res.success ? (res.message || 'Conexión exitosa.') : (res.error || 'Fallo en la prueba.'),
      });
      setIgVerified(Boolean(res.success));
    } catch (err: any) {
      setIgFeedback({ success: false, message: err?.message || 'Error probando conexión con Instagram Direct.' });
      setIgVerified(false);
    } finally {
      setTestingIg(false);
    }
  };

  const handleDisconnectInstagram = async () => {
    if (!confirm('¿Estás seguro de desconectar Instagram Direct?')) return;
    setDisconnectingIg(true);
    try {
      await disconnectInstagram();
      setHasIgToken(false);
      setIgToken('');
      setIgVerified(false);
      setIgFeedback({ success: true, message: 'Instagram Direct desconectado.' });
    } catch (err: any) {
      setIgFeedback({ success: false, message: err?.message || 'Error al desconectar.' });
    } finally {
      setDisconnectingIg(false);
    }
  };

  // Inicialización del SDK de Meta y escucha de eventos de sesión (sessionInfoVersion: '2')
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const initFB = () => {
        try {
          window.FB?.init({
            appId: metaAppId,
            cookie: true,
            xfbml: true,
            version: 'v21.0',
          });
        } catch (err) {
          console.warn('[FB INIT WARNING]', err);
        }
      };

      window.fbAsyncInit = initFB;
      if (window.FB) {
        initFB();
      }

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
      // Permitir cualquier subdominio de facebook.com (web, business, developers, etc.)
      if (
        typeof event.origin !== 'string' ||
        (!event.origin.endsWith('.facebook.com') && event.origin !== 'https://facebook.com')
      ) {
        return;
      }
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.event === 'FINISH') {
            const pId = data.data?.phone_number_id;
            const wId = data.data?.waba_id;
            if (pId) {
              setCapturedPhoneId(pId);
              capturedSessionRef.current.phoneId = pId;
            }
            if (wId) {
              setCapturedWabaId(wId);
              capturedSessionRef.current.wabaId = wId;
            }
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

  // Estado dedicado para notificaciones y errores del bloque de WhatsApp
  const [waFeedback, setWaFeedback] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  // Escucha si el usuario completó la autenticación mediante redireccionamiento de Meta
  useEffect(() => {
    if (initialData.initialOauthCode) {
      setConnectingWhatsApp(true);
      setWaFeedback({
        type: 'warning',
        message: 'Finalizando vinculación de WhatsApp Business con Meta Graph API...',
      });

      processEmbeddedSignup({ code: initialData.initialOauthCode })
        .then((res) => {
          if (res.success) {
            setPhoneNumberId(res.phoneNumberId);
            setHasToken(true);
            setWaFeedback({
              type: 'success',
              message: `¡WhatsApp Business conectado exitosamente con Meta! Número vinculado: ${
                res.displayPhoneNumber || res.phoneNumberId
              }${res.verifiedName ? ` (${res.verifiedName})` : ''}`,
            });
            router.replace('/settings');
          }
        })
        .catch((err: any) => {
          setWaFeedback({
            type: 'error',
            message: `Error al procesar autorización de Meta: ${err?.message || 'Código de autorización no válido'}`,
          });
        })
        .finally(() => {
          setConnectingWhatsApp(false);
        });
    } else if (initialData.initialOauthError) {
      setWaFeedback({
        type: 'error',
        message: `Meta denegó la autorización: ${initialData.initialOauthError}`,
      });
      router.replace('/settings');
    }
  }, [initialData.initialOauthCode, initialData.initialOauthError, router]);

  // Estados para pruebas de conexión
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [waTestResult, setWaTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  // Gestión dinámica de plantillas de WhatsApp (Meta)
  const [templates, setTemplates] = useState<Array<{ name: string; label: string }>>(
    initialData.whatsappTemplates || []
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

    if (!waVerified && !hasToken) {
      setFeedback({
        type: 'error',
        message: 'Por favor prueba y verifica la conexión con WhatsApp antes de guardar.',
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

      setWaVerified(false);
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
    setWaFeedback(null);

    const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/settings` : 'https://crm.synqo.dev/settings';
    const directOauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&config_id=${metaConfigId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;

    // Re-intentar inicializar por si el SDK ya cargó en window
    if (typeof window !== 'undefined' && (window as any).FB) {
      try {
        (window as any).FB.init({
          appId: metaAppId,
          cookie: true,
          xfbml: true,
          version: 'v21.0',
        });
      } catch {}
    }

    // Si window.FB no está disponible (ej. bloqueador de publicidad activo o error de red)
    if (typeof window === 'undefined' || !window.FB) {
      const popup = window.open(directOauthUrl, 'MetaOAuth', 'width=650,height=750,scrollbars=yes,status=yes');
      if (!popup) {
        setWaFeedback({
          type: 'error',
          message: 'Tu navegador bloqueó la ventana emergente. Por favor permite las ventanas emergentes en la barra de direcciones o usa el enlace directo de abajo.',
        });
      } else {
        setConnectingWhatsApp(true);
        setWaFeedback({
          type: 'warning',
          message: 'Ventana de Meta abierta. Completa el registro del número para finalizar la vinculación.',
        });
      }
      return;
    }

    setConnectingWhatsApp(true);

    const watchdogTimer = setTimeout(() => {
      setConnectingWhatsApp(false);
    }, 25000);

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

    try {
      window.FB.login(async (response: any) => {
        clearTimeout(watchdogTimer);

        if (response.authResponse?.code) {
          try {
            const effectivePhoneId = capturedSessionRef.current.phoneId || capturedPhoneId || undefined;
            const effectiveWabaId = capturedSessionRef.current.wabaId || capturedWabaId || undefined;

            const res = await processEmbeddedSignup({
              code: response.authResponse.code,
              phoneNumberId: effectivePhoneId,
              wabaId: effectiveWabaId,
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
              setWaFeedback({
                type: 'success',
                message: `¡WhatsApp Business conectado exitosamente con Meta! Número vinculado: ${
                  res.displayPhoneNumber || res.phoneNumberId
                }`,
              });
              router.refresh();
            }
          } catch (err: any) {
            setWaFeedback({
              type: 'error',
              message: err?.message || 'Error vinculando con Meta Embedded Signup',
            });
          } finally {
            setConnectingWhatsApp(false);
          }
        } else {
          setConnectingWhatsApp(false);
          const detailedErr =
            response.error_message ||
            response.error_description ||
            response.status ||
            (response.error ? (typeof response.error === 'string' ? response.error : response.error.message || JSON.stringify(response.error)) : null);

          setWaFeedback({
            type: 'error',
            message: detailedErr && detailedErr !== 'connected'
              ? `Meta canceló o rechazó la conexión: ${detailedErr}`
              : 'La ventana de Meta fue cerrada o cancelada antes de completar la verificación.',
          });
        }
      }, loginOptions);
    } catch (err: any) {
      clearTimeout(watchdogTimer);
      setConnectingWhatsApp(false);
      const popup = window.open(directOauthUrl, 'MetaOAuth', 'width=650,height=750,scrollbars=yes,status=yes');
      if (!popup) {
        setWaFeedback({
          type: 'error',
          message: `Error al abrir la ventana de Facebook: ${err?.message || 'Ventana emergente bloqueada'}. Permite las ventanas emergentes o usa el enlace directo de abajo.`,
        });
      }
    }
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
      setWaVerified(Boolean(res.success));
    } catch (err: any) {
      setWaTestResult({ success: false, error: err.message || 'Error probando WhatsApp' });
      setWaVerified(false);
    } finally {
      setTestingWhatsApp(false);
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
        systemPrompt: systemPrompt || undefined,
        structuredPromptData: structuredPromptData || undefined,
      });

      setFeedback({
        type: 'success',
        message: 'Configuración y credenciales guardadas de forma segura.',
      });
      // Limpiar campos sensibles por seguridad
      setAccessToken('');
      setAppSecret('');
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
  const enabledModules: EnabledModules = initialData.enabledModules || {
    native_calendar: true,
    physical_rooms: false,
    staff_mobile_portal: false,
    quick_pay: false,
    anti_no_show: true,
  };

  return (
    <div className="max-w-5xl space-y-6 text-slate-900 dark:text-white transition-colors">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Configuración & Administración
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Gestiona las integraciones de IA, credenciales cifradas y accesos de agentes de {initialData.orgName || 'tu empresa'}.
        </p>
      </div>

      {/* Navegación por Pestañas Segmentadas */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('integrations')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
            activeTab === 'integrations'
              ? 'bg-white dark:bg-[#1A1F2C] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#1A1F2C]/50'
          }`}
        >
          <Sliders className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
          Integraciones & IA
        </button>

        {teamData && (
          <button
            type="button"
            onClick={() => setActiveTab('team')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
              activeTab === 'team'
                ? 'bg-white dark:bg-[#1A1F2C] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#1A1F2C]/50'
            }`}
          >
            <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            Equipo & Usuarios ({teamData.members.length}/{teamData.organization.maxUsers})
          </button>
        )}

        {Boolean(enabledModules.staff_mobile_portal) && (
          <button
            type="button"
            onClick={() => setActiveTab('specialists')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
              activeTab === 'specialists'
                ? 'bg-white dark:bg-[#1A1F2C] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#1A1F2C]/50'
            }`}
          >
            <Smartphone className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
            {initialData.specialistLabel ? `${initialData.specialistLabel}s` : 'Colaboradores'} ({specialistsData?.length || 0})
          </button>
        )}

        {Boolean(enabledModules.physical_rooms) && (
          <button
            type="button"
            onClick={() => setActiveTab('rooms')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
              activeTab === 'rooms'
                ? 'bg-white dark:bg-[#1A1F2C] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#1A1F2C]/50'
            }`}
          >
            <DoorOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            {initialData.roomLabel ? `${initialData.roomLabel}s` : 'Espacios Físicos'} ({roomsData?.length || 0})
          </button>
        )}
      </div>

      {activeTab === 'specialists' && enabledModules.staff_mobile_portal ? (
        <SpecialistsTab
          specialists={specialistsData || []}
          organizationId={teamData?.organization.id || ''}
          companyCode={initialData.companyCode || ''}
          companyName={initialData.orgName || 'Mi Empresa'}
          specialistLabel={initialData.specialistLabel || 'Colaborador'}
        />
      ) : activeTab === 'rooms' && enabledModules.physical_rooms ? (
        <RoomsTab
          rooms={roomsData || []}
          organizationId={teamData?.organization.id || ''}
          roomLabel={initialData.roomLabel || 'Espacio'}
        />
      ) : activeTab === 'team' && teamData ? (
        <TeamTab initialData={teamData} />
      ) : (
        <>
          {feedback && (
            <div
              className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Panel de Funcionalidades & Capacidad Activa (En vez de nombre rígido de plan) */}
          {(() => {
            const maxUsersCount = teamData?.organization?.maxUsers ?? initialData.maxUsers ?? 2;
            const activeUsersCount = teamData?.organization?.usedUsers ?? 1;
            const remainingSeats = teamData?.organization?.remainingSeats ?? Math.max(0, maxUsersCount - activeUsersCount);

            const effectiveLimit =
              initialData.aiTokensLimit && initialData.aiTokensLimit > 0
                ? initialData.aiTokensLimit
                : 500000;
            const effectiveUsed = initialData.aiTokensUsed || 0;
            const tokenPercent = Math.min(100, Math.round((effectiveUsed / effectiveLimit) * 100));

            const minEstimatedChats = Math.floor(effectiveLimit / 1200);
            const maxEstimatedChats = Math.floor(effectiveLimit / 800);
            const remainingTokens = Math.max(0, effectiveLimit - effectiveUsed);
            const remainingEstimatedChats = Math.floor(remainingTokens / 1000);

            const specLabel = initialData.specialistLabel || 'Colaborador';
            const rLabel = initialData.roomLabel || 'Espacio';

            const moduleList = [
              {
                id: 'calendar',
                name: 'Agenda & Citas por WhatsApp',
                active: Boolean(enabledModules.native_calendar),
                icon: Calendar,
                desc: 'Bot IA agendador 24/7 y sincronización de citas en tiempo real.',
              },
              {
                id: 'specialists',
                name: `Gestión de ${specLabel}s`,
                active: Boolean(enabledModules.staff_mobile_portal),
                icon: Smartphone,
                desc: `Portal móvil con PIN para que los ${specLabel.toLowerCase()}s vean su agenda.`,
              },
              {
                id: 'rooms',
                name: `Control de ${rLabel}s & Aforo`,
                active: Boolean(enabledModules.physical_rooms),
                icon: DoorOpen,
                desc: `Asignación de ${rLabel.toLowerCase()}s físicos por turno sin sobrecupo.`,
              },
              {
                id: 'anti_no_show',
                name: 'Protocolo Anti No-Show',
                active: Boolean(enabledModules.anti_no_show),
                icon: Shield,
                desc: 'Confirmaciones automáticas a 8 horas con recordatorios diurnos.',
              },
              {
                id: 'quick_pay',
                name: 'Cobros Rápidos (Quick Pay)',
                active: Boolean(enabledModules.quick_pay),
                icon: CreditCard,
                desc: 'Registro de cobros directos (Efectivo, Nequi, Datáfono).',
              },
            ];

            return (
              <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-6 shadow-xs space-y-5">
                {/* Cabecera del Servicio */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#232A3B] pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] rounded-xl border border-[#0052FF]/20">
                      <Sliders className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Funcionalidades & Capacidad Activa
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Herramientas habilitadas para {initialData.orgName || 'tu empresa'} y consumo del mes
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                        subStatus === 'active' || subStatus === 'trialing'
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                          : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          subStatus === 'active' || subStatus === 'trialing'
                            ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse'
                            : 'bg-rose-500 dark:bg-rose-400'
                        }`}
                      />
                      {subStatus === 'trialing' ? 'Prueba Activa' : 'Suscripción Activa'}
                    </span>
                  </div>
                </div>

                {/* Cuotas de Capacidad: Usuarios y Conversaciones */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#1E2433] flex flex-col justify-between gap-2.5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white dark:bg-[#1A1F2C] text-[#0052FF] dark:text-[#00D2FF] border border-slate-200 dark:border-[#232A3B] shadow-2xs shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">
                          Usuarios de Equipo
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {activeUsersCount} de {maxUsersCount} usuarios activos
                        </span>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1.5 border-t border-slate-200 dark:border-[#1E2433] font-medium">
                      <span>{remainingSeats > 0 ? `${remainingSeats} ${remainingSeats === 1 ? 'cupo disponible' : 'cupos disponibles'}` : 'Cupos al 100%'}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">Máx: {maxUsersCount}</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#1E2433] flex flex-col justify-between gap-2.5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white dark:bg-[#1A1F2C] text-[#0052FF] dark:text-[#00D2FF] border border-slate-200 dark:border-[#232A3B] shadow-2xs shrink-0">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">
                            Capacidad de Conversaciones IA
                          </span>
                          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 font-mono">
                            {tokenPercent}%
                          </span>
                        </div>
                        <span suppressHydrationWarning className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                          ~{remainingEstimatedChats.toLocaleString()} chats restantes este mes
                        </span>
                      </div>
                    </div>

                    {/* Barra de progreso de consumo de tokens */}
                    <div className="w-full bg-slate-200 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          tokenPercent >= 90
                            ? 'bg-rose-500'
                            : tokenPercent >= 75
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${tokenPercent}%` }}
                      />
                    </div>

                    <div suppressHydrationWarning className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-0.5 font-medium">
                      <span>Capacidad total: ~{minEstimatedChats.toLocaleString()} a {maxEstimatedChats.toLocaleString()} chats</span>
                      <span className="text-slate-600 dark:text-slate-300 font-mono">
                        {effectiveUsed.toLocaleString()} tokens usados
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tablero de Funcionalidades (Encendidas vs No contratadas) */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                      Herramientas & Módulos Disponibles
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {moduleList.filter((m) => m.active).length} de {moduleList.length} activas
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {moduleList.map((m) => {
                      const IconComponent = m.icon;
                      return (
                        <div
                          key={m.id}
                          className={`p-3.5 rounded-xl border transition flex flex-col justify-between gap-2 ${
                            m.active
                              ? 'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20'
                              : 'bg-slate-50/60 dark:bg-[#0E121C] border-slate-200 dark:border-[#232A3B] opacity-75'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div
                                className={`p-1.5 rounded-lg ${
                                  m.active
                                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                                }`}
                              >
                                <IconComponent className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                                {m.name}
                              </span>
                            </div>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                m.active
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {m.active ? 'Encendido' : 'No contratado'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            {m.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Banner de Solicitud de Nuevas Funcionalidades */}
                <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-[#0052FF]/5 border border-blue-100 dark:border-[#0052FF]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <span className="text-base">💡</span>
                    <span>
                      ¿Deseas encender un módulo adicional o ampliar el cupo de tu equipo?
                    </span>
                  </div>
                  <a
                    href="https://wa.me/573000000000?text=Hola,%20deseo%20activar%20una%20funcionalidad%20adicional%20en%20mi%20cuenta%20de%20Synqo"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0052FF] hover:bg-[#0047E0] text-white font-semibold transition shrink-0"
                  >
                    <span>Solicitar a Soporte</span>
                  </a>
                </div>
              </div>
            );
          })()}

          {/* Formulario de Integraciones */}
          <form onSubmit={handleSave} className="space-y-6">
            {activeWaEngine === 'evolution' ? (
              <EvolutionQrCard
                initialApiUrl={initialData.evolutionApiUrl}
                initialInstanceName={initialData.evolutionInstanceName}
                hasApiKey={initialData.hasEvolutionApiKey}
                initialStatus={initialData.evolutionStatus}
                initialPhone={initialData.evolutionPhoneConnected}
                antiBanMode={initialData.evolutionAntiBanMode}
                maxOutboundPerHour={initialData.evolutionMaxOutboundPerHour}
                isSuperAdmin={isSuperAdmin}
              />
            ) : (
              /* Meta WhatsApp Cloud API */
              <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#232A3B] pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">WhatsApp Cloud API</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Conexión oficial de WhatsApp Business para captación de leads y atención automática</p>
                  </div>
                </div>

                {hasToken && (
                  <button
                    type="button"
                    onClick={handleTestWhatsApp}
                    disabled={testingWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30 transition cursor-pointer disabled:opacity-50"
                  >
                    <Zap className={`w-3.5 h-3.5 ${testingWhatsApp ? 'animate-spin' : ''}`} />
                    {testingWhatsApp ? 'Diagnosticando...' : 'Diagnosticar Conexión'}
                  </button>
                )}
              </div>

              {waTestResult && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                    waTestResult.success
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {waTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 flex-shrink-0" />
                  )}
                  <span>{waTestResult.success ? waTestResult.message : waTestResult.error}</span>
                </div>
              )}

              {/* SECCIÓN WHATSAPP CLOUD API: CONEXIÓN OFICIAL DIRECTA O EMBEDDED SIGNUP */}
              {hasToken && phoneNumberId ? (
                // Estado: Conectado
                <div className="bg-slate-50 dark:bg-[#090A0F] border border-emerald-500/30 rounded-xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-lg shadow-xs shrink-0">
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                          <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.067-2.123-.532-1.748-.733-2.871-2.502-2.958-2.618-.087-.115-.708-.941-.708-1.794 0-.853.448-1.272.607-1.446.16-.174.348-.217.464-.217.116 0 .232.001.333.006.107.005.25-.041.391.298.145.348.493 1.202.536 1.29.043.087.072.189.014.305-.058.115-.087.188-.174.289-.087.102-.182.228-.261.306-.087.087-.178.182-.077.355.101.174.45 1.742 1.353 2.544.755.672 1.392.879 1.589.976.197.097.312.083.428-.051.116-.134.493-.574.624-.77.13-.197.261-.164.44-.097.179.067 1.135.536 1.33.633.195.097.326.145.375.228.048.083.048.482-.096.887z"/>
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">WhatsApp Business Conectado</span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                            Activo & Sincronizado
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Phone Number ID: <span className="font-mono font-semibold text-slate-900 dark:text-white">{phoneNumberId}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      {SHOW_EMBEDDED_SIGNUP ? (
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
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowManualConfig(!showManualConfig)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#1A1F2C] hover:bg-slate-50 dark:hover:bg-[#232A3B] border border-slate-200 dark:border-[#232A3B] transition cursor-pointer shadow-2xs"
                        >
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{showManualConfig ? 'Ocultar Credenciales' : 'Actualizar Credenciales'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={disconnectingWhatsApp}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition cursor-pointer disabled:opacity-50"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        <span>{disconnectingWhatsApp ? 'Desconectando...' : 'Desconectar'}</span>
                      </button>
                    </div>
                  </div>

                  {waFeedback && (
                    <div
                      className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                        waFeedback.type === 'success'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                          : waFeedback.type === 'warning'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {waFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 flex-shrink-0" />
                      )}
                      <span>{waFeedback.message}</span>
                    </div>
                  )}

                  <div className="text-[11px] text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 rounded-xl p-2.5 border border-emerald-500/20 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      Tus clientes ya pueden escribir a este número y serán atendidos inmediatamente de forma automática y por tu equipo comercial.
                    </span>
                  </div>

                  {/* Edición de credenciales cuando ya está conectado */}
                  {showManualConfig && (
                    <div className="p-4 sm:p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl space-y-4 mt-3 shadow-xs">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#1E2433] pb-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Actualizar Credenciales de WhatsApp
                        </span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Cifrado AES-256
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                            Phone Number ID de Meta (Solo números)
                          </label>
                          <input
                            type="text"
                            placeholder="Ej. 104589234812345"
                            value={phoneNumberId}
                            onChange={(e) => setPhoneNumberId(e.target.value.replace(/[^0-9]/g, ''))}
                            className="w-full text-sm bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                            Nuevo WhatsApp Permanent Access Token
                          </label>
                          <div className="relative">
                            <input
                              type={showToken ? 'text' : 'password'}
                              placeholder="•••••••••••••••••••••••• (Guardado)"
                              value={accessToken}
                              onChange={(e) => setAccessToken(e.target.value.trim())}
                              className="w-full text-sm bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl pl-3.5 pr-10 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] font-mono text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => setShowToken(!showToken)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer p-1"
                              title={showToken ? 'Ocultar token' : 'Mostrar token'}
                            >
                              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleSaveManualWhatsApp}
                          disabled={savingManualWa || !phoneNumberId.trim()}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#0052FF] hover:bg-[#0047E0] text-white transition shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          <Save className={`w-3.5 h-3.5 ${savingManualWa ? 'animate-spin' : ''}`} />
                          <span>{savingManualWa ? 'Guardando...' : 'Actualizar Credenciales'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : SHOW_EMBEDDED_SIGNUP ? (
                // Estado: No conectado con Embedded Signup activo
                <div className="bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-2xl p-6 sm:p-7 space-y-5 shadow-xs">
                  {waFeedback && (
                    <div
                      className={`p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2.5 transition ${
                        waFeedback.type === 'success'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                          : waFeedback.type === 'warning'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {waFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p>{waFeedback.message}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#1877F2] bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/30">
                          Recomendado • Meta Embedded Signup (1 Clic)
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        Conecta tu WhatsApp Business en 1 Clic
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
                        Vincula tu número comercial de forma automática y guiada con Meta. Sin copiar tokens del sistema, sin crear apps en Meta Developers y sin demoras técnicas.
                      </p>
                    </div>

                    <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleConnectWhatsApp}
                        disabled={connectingWhatsApp}
                        className="inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-bold text-sm text-white bg-[#1877F2] hover:bg-[#166FE5] active:bg-[#0C63D4] shadow-xs hover:shadow-sm transition cursor-pointer disabled:opacity-60"
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

                      <a
                        href={`https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&config_id=${metaConfigId}&response_type=code&redirect_uri=${encodeURIComponent(typeof window !== 'undefined' ? `${window.location.origin}/settings` : 'https://crm.synqo.dev/settings')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-[#0052FF] dark:text-[#00D2FF] hover:underline inline-flex items-center gap-1 font-medium cursor-pointer"
                      >
                        ¿No abre la ventana? Conectar en pestaña nueva &rarr;
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                // Estado: No conectado con Configuración Directa Oficial
                <div className="bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-2xl p-6 shadow-xs space-y-5">
                  <div className="border-b border-slate-200 dark:border-[#1E2433] pb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30 inline-block mb-1.5">
                      Conexión Oficial WhatsApp Cloud API
                    </span>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Vincular Número de WhatsApp Business
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Conecta la línea de WhatsApp de tu empresa ingresando tu Phone Number ID y el Token Permanente generado en Meta Business Suite.
                    </p>
                  </div>

                  {waFeedback && (
                    <div
                      className={`p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2.5 ${
                        waFeedback.type === 'success'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                          : waFeedback.type === 'warning'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {waFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <p>{waFeedback.message}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Phone Number ID de Meta <span className="text-rose-500 dark:text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. 104589234812345"
                        value={phoneNumberId}
                        onChange={(e) => {
                          setPhoneNumberId(e.target.value.replace(/[^0-9]/g, ''));
                          setWaVerified(false);
                        }}
                        className="w-full text-sm bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] font-mono"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Encuéntralo en Meta for Developers → WhatsApp → API Setup → Phone number ID.
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1 flex items-center justify-between">
                        <span>
                          Token Permanente de Meta (Usuario del Sistema) <span className="text-rose-500 dark:text-rose-400">*</span>
                        </span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Cifrado AES-256
                        </span>
                      </label>
                      <div className="relative">
                        <input
                          type={showToken ? 'text' : 'password'}
                          placeholder={hasToken ? '•••••••••••••••••••••••• (Guardado)' : 'EAAG••••••••••••••••••••'}
                          value={accessToken}
                          onChange={(e) => {
                            setAccessToken(e.target.value.trim());
                            setWaVerified(false);
                          }}
                          className="w-full text-sm bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl pl-3.5 pr-10 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer p-1"
                          title={showToken ? 'Ocultar token' : 'Mostrar token'}
                        >
                          {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Token permanente con permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>.
                      </p>
                    </div>
                  </div>

                  {/* Guía paso a paso */}
                  <div className="p-3.5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl space-y-1.5 text-xs text-slate-700 dark:text-slate-300 shadow-2xs">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-slate-900 dark:text-white block">
                      Instrucciones de Vinculación Oficial:
                    </span>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                      <li>Ingresa a tu <strong className="text-slate-800 dark:text-slate-200">Meta Business Suite</strong> (Configuración del Negocio &rarr; Usuarios del Sistema).</li>
                      <li>Genera un Token permanente con permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>.</li>
                      <li>Pega el <strong className="text-slate-800 dark:text-slate-200">Phone Number ID</strong> y el <strong className="text-slate-800 dark:text-slate-200">Token</strong> y haz clic en <em>1. Probar Conexión</em> antes de guardar.</li>
                    </ol>
                  </div>

                  {/* Barra de Acción con Flujo de Verificación Previa */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-[#1E2433]">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      {waVerified ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          Línea verificada con éxito en Meta. Ya puedes guardar.
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <Lock className="w-3.5 h-3.5 text-amber-500" />
                          Prueba la conexión primero para habilitar el guardado seguro.
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleTestWhatsApp}
                        disabled={testingWhatsApp}
                        className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                          waVerified
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20'
                        }`}
                      >
                        <Zap className={`w-3.5 h-3.5 ${testingWhatsApp ? 'animate-spin' : ''}`} />
                        <span>
                          {testingWhatsApp
                            ? 'Verificando con Meta...'
                            : waVerified
                            ? 'Re-verificar'
                            : '1. Probar Conexión con WhatsApp'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveManualWhatsApp}
                        disabled={savingManualWa || !waVerified || !phoneNumberId.trim()}
                        className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                          waVerified && !savingManualWa
                            ? 'bg-[#0052FF] hover:bg-[#0047E0] text-white'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-60'
                        }`}
                        title={!waVerified ? 'Primero debes probar y verificar la conexión con WhatsApp con éxito' : ''}
                      >
                        <Save className={`w-4 h-4 ${savingManualWa ? 'animate-spin' : ''}`} />
                        <span>{savingManualWa ? 'Guardando...' : '2. Guardar y Vincular WhatsApp'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Google Calendar & Google Meet (Oficial) */}
            <div id="google-calendar" className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#232A3B] pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 text-[#0052FF] dark:text-[#00D2FF] border border-blue-500/20 rounded-xl">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Google Calendar & Google Meet</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Sincroniza tus citas nativas con Google Calendar y genera videollamadas oficiales de Google Meet
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {hasGcalToken && (
                    <>
                      <button
                        type="button"
                        onClick={handleTestGoogleCalendar}
                        disabled={testingGcal}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-500/10 text-[#0052FF] dark:text-[#00D2FF] hover:bg-blue-500/20 border border-blue-500/30 transition cursor-pointer disabled:opacity-50"
                      >
                        <Zap className={`w-3.5 h-3.5 ${testingGcal ? 'animate-spin' : ''}`} />
                        {testingGcal ? 'Probando...' : 'Probar Conexión'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnectGoogleCalendar}
                        disabled={disconnectingGcal}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 border border-rose-500/30 transition cursor-pointer disabled:opacity-50"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        <span>Desconectar</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {gcalFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                    gcalFeedback.success
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {gcalFeedback.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 flex-shrink-0" />
                  )}
                  <span>{gcalFeedback.message}</span>
                </div>
              )}

              {!hasGcalToken ? (
                /* Estado No Conectado: Botón Oficial de Google en 1 Clic */
                <div className="space-y-4">
                  <div className="p-6 rounded-2xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-center space-y-4 shadow-xs">
                    <div className="max-w-md mx-auto space-y-1.5">
                      <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#131722] shadow-xs border border-slate-200 dark:border-[#232A3B] flex items-center justify-center mx-auto mb-2">
                        <Calendar className="w-6 h-6 text-[#0052FF] dark:text-[#00D2FF]" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Conecta tu Google Calendar en 1 Clic
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Inicia sesión con tu cuenta de Google para exportar citas automáticamente, generar videollamadas oficiales de Meet y evitar colisiones de horario.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handleConnectGoogle}
                        disabled={connectingGoogle}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#1A1F2C] hover:bg-slate-50 dark:hover:bg-[#232A3B] text-slate-800 dark:text-white font-bold text-xs shadow-xs hover:shadow-sm transition cursor-pointer disabled:opacity-50"
                      >
                        {connectingGoogle ? (
                          <Loader2 className="w-5 h-5 animate-spin text-[#0052FF] dark:text-[#00D2FF]" />
                        ) : (
                          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                          </svg>
                        )}
                        <span>{connectingGoogle ? 'Conectando con Google...' : 'Conectar con Google Calendar'}</span>
                      </button>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowManualGoogle(!showManualGoogle)}
                        className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white underline cursor-pointer"
                      >
                        {showManualGoogle ? 'Ocultar configuración avanzada manual' : '¿Prefieres ingresar token o credencial de servicio manualmente?'}
                      </button>
                    </div>
                  </div>

                  {showManualGoogle && (
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] space-y-4 shadow-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                            ID del Calendario de Google (Correo o primary)
                          </label>
                          <input
                            type="text"
                            placeholder="primary o tuempresa@gmail.com"
                            value={gcalId}
                            onChange={(e) => setGcalId(e.target.value.trim())}
                            className="w-full text-sm bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] font-mono text-xs"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                            OAuth Token / Google Service Token
                          </label>
                          <div className="relative">
                            <input
                              type={showGcalToken ? 'text' : 'password'}
                              placeholder="Pega tu token de acceso de Google"
                              value={gcalToken}
                              onChange={(e) => setGcalToken(e.target.value.trim())}
                              className="w-full text-sm bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl pl-3.5 pr-10 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] font-mono text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => setShowGcalToken(!showGcalToken)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer p-1"
                            >
                              {showGcalToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleSaveGoogleCalendar}
                          disabled={savingGcal || !gcalToken.trim()}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#0052FF] hover:bg-[#0047E0] text-white transition shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          <Save className={`w-4 h-4 ${savingGcal ? 'animate-spin' : ''}`} />
                          <span>{savingGcal ? 'Guardando...' : 'Guardar Token Manual'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Estado Conectado: Tarjeta Verificada y Ajustes de Sincronización */
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-xs">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                          Conectado a Google Calendar: {gcalId || 'primary'}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                          Sincronización activa con Google Meet y detección de horarios ocupados
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleTestGoogleCalendar}
                      disabled={testingGcal}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#131722] text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 hover:bg-slate-50 dark:hover:bg-[#1A1F2C] transition cursor-pointer shrink-0 shadow-2xs"
                    >
                      {testingGcal ? 'Verificando...' : 'Verificar Conexión'}
                    </button>
                  </div>

                  {/* Toggles de Sincronización */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] hover:bg-slate-100/70 dark:hover:bg-[#1A1F2C]/40 cursor-pointer transition">
                      <input
                        type="checkbox"
                        checked={gcalSyncEnabled}
                        onChange={(e) => setGcalSyncEnabled(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 dark:border-[#232A3B] text-[#0052FF] focus:ring-[#0052FF]"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">
                          Exportar Citas a Google Calendar
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug block">
                          Crea un evento en tu Google Calendar con enlace oficial de Google Meet cada vez que se agende una cita.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] hover:bg-slate-100/70 dark:hover:bg-[#1A1F2C]/40 cursor-pointer transition">
                      <input
                        type="checkbox"
                        checked={gcalBlockBusy}
                        onChange={(e) => setGcalBlockBusy(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 dark:border-[#232A3B] text-[#0052FF] focus:ring-[#0052FF]"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">
                          Bloquear Turnos Ocupados
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug block">
                          Evita que la IA agende turnos cuando tengas eventos ocupados en tu Google Calendar personal.
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleSaveGoogleCalendar}
                      disabled={savingGcal}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0052FF] hover:bg-[#0047E0] text-white transition shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Save className={`w-4 h-4 ${savingGcal ? 'animate-spin' : ''}`} />
                      <span>{savingGcal ? 'Guardando...' : 'Guardar Preferencias de Sincronización'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Meta Instagram Direct Messaging (Preparado para próxima actualización - oculto en MVP) */}
            {SHOW_INSTAGRAM_MVP && (
              <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#232A3B] pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20 rounded-xl">
                    <Instagram className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Meta Instagram Direct</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Recibe y responde mensajes directos (DMs) de Instagram de forma automática y con tus asesores desde un solo lugar
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {hasIgToken ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                        Vinculado
                      </span>
                      <button
                        type="button"
                        onClick={handleTestInstagram}
                        disabled={testingIg}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-50 hover:bg-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:hover:bg-purple-500/20 text-purple-700 border border-purple-200 dark:border-purple-500/30 transition cursor-pointer disabled:opacity-50"
                        title="Verificar estado de salud de la conexión con Meta Graph API"
                      >
                        <Zap className={`w-3.5 h-3.5 ${testingIg ? 'animate-spin' : ''}`} />
                        <span>{testingIg ? 'Diagnosticando...' : 'Diagnosticar Conexión'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnectInstagram}
                        disabled={disconnectingIg}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 transition cursor-pointer disabled:opacity-50"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        <span>Desconectar</span>
                      </button>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50">
                      No vinculado
                    </span>
                  )}
                </div>
              </div>

              {igFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                    igFeedback.success
                      ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {igFeedback.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  )}
                  <span>{igFeedback.message}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      ID de la Cuenta de Instagram Business <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. 1784140530921102"
                      value={igAccountId}
                      onChange={(e) => {
                        setIgAccountId(e.target.value.replace(/[^0-9]/g, ''));
                        setIgVerified(false);
                      }}
                      className="w-full text-sm bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#090A0F] focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] font-mono text-xs"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Encuéntralo en Meta Business Suite → Configuración de Instagram → ID de la cuenta.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1 flex items-center justify-between">
                      <span>
                        Instagram Access Token (Usuario del Sistema) <span className="text-rose-400">*</span>
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Cifrado AES-256
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type={showIgToken ? 'text' : 'password'}
                        placeholder={hasIgToken ? '•••••••••••••••••••••••• (Guardado)' : 'Pega tu System User Token permanente'}
                        value={igToken}
                        onChange={(e) => {
                          setIgToken(e.target.value.trim());
                          setIgVerified(false);
                        }}
                        className="w-full text-sm bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl pl-3.5 pr-10 py-2.5 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#090A0F] focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowIgToken(!showIgToken)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1"
                        title={showIgToken ? 'Ocultar token' : 'Mostrar token'}
                      >
                        {showIgToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Token permanente con permisos <code>instagram_basic</code> y <code>instagram_manage_messages</code>.
                    </p>
                  </div>
                </div>

                {/* Guía paso a paso unificada con el modelo de WhatsApp */}
                <div className="p-3.5 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-bold text-[11px] uppercase tracking-wider text-slate-900 dark:text-white block">
                    Instrucciones de Vinculación Oficial:
                  </span>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <li>Verifica que tu cuenta de Instagram sea Profesional (Business o Creator) y esté vinculada a una Fan Page en Meta.</li>
                    <li>En tu <strong className="text-slate-800 dark:text-slate-200">Meta Business Suite</strong> (Configuración del Negocio &rarr; Usuarios del Sistema), genera un token permanente.</li>
                    <li>Pega el <strong className="text-slate-800 dark:text-slate-200">ID de Instagram</strong> y el <strong className="text-slate-800 dark:text-slate-200">Token</strong> y haz clic en <em>1. Probar Conexión con Instagram</em> antes de guardar.</li>
                  </ol>
                </div>

                {/* Barra de Acción con Flujo de Verificación Previa ("Probar primero -> Guardar después") */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-[#1E2433]">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    {igVerified ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                        Cuenta verificada en vivo con Meta. Ya puedes guardar.
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <Lock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                        Prueba la conexión primero para habilitar el guardado seguro.
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleTestInstagram}
                      disabled={testingIg}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-purple-50 hover:bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 dark:hover:bg-purple-500/20 border border-purple-200 dark:border-purple-500/30 transition cursor-pointer disabled:opacity-50"
                    >
                      <Zap className={`w-3.5 h-3.5 ${testingIg ? 'animate-spin' : ''}`} />
                      <span>
                        {testingIg
                          ? 'Verificando con Meta...'
                          : igVerified
                          ? 'Re-verificar'
                          : '1. Probar Conexión con Instagram'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveInstagram}
                      disabled={savingIg || (!igVerified && !hasIgToken) || !igAccountId.trim()}
                      className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                        (igVerified || hasIgToken) && !savingIg && igAccountId.trim()
                          ? 'bg-[#0052FF] hover:bg-[#0047E0] text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60'
                      }`}
                      title={!igVerified && !hasIgToken ? 'Primero debes probar y verificar la conexión con Instagram con éxito' : ''}
                    >
                      <Save className={`w-4 h-4 ${savingIg ? 'animate-spin' : ''}`} />
                      <span>{savingIg ? 'Guardando...' : '2. Guardar y Vincular Instagram Direct'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Plantillas de WhatsApp (Meta) para Ventana de 24 Horas y Nuevos Prospectos - Solo visible si el motor es Meta */}
            {activeWaEngine === 'meta' && (
            <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#232A3B] pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Plantillas de WhatsApp (Meta)</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Disponibles en el selector del chat cuando la ventana de 24 horas expire o al crear un nuevo lead
                    </p>
                  </div>
                </div>
              </div>

              {tplFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                    tplFeedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                      : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
                  }`}
                >
                  {tplFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 flex-shrink-0" />
                  )}
                  <span>{tplFeedback.message}</span>
                </div>
              )}

              {/* Formulario para agregar nueva plantilla */}
              <div className="p-4 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl space-y-3">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                  Vincular Nueva Plantilla desde Meta
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                      Nombre exacto en Meta <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="ej: reactivacion_lead"
                      value={newTplName}
                      onChange={(e) => setNewTplName(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                      className="w-full text-xs font-mono border border-slate-200 dark:border-[#232A3B] rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] bg-white dark:bg-[#131722]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                      Etiqueta en CRM (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="ej: Reactivación de Lead"
                      value={newTplLabel}
                      onChange={(e) => setNewTplLabel(e.target.value)}
                      className="w-full text-xs border border-slate-200 dark:border-[#232A3B] rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] bg-white dark:bg-[#131722]"
                    />
                  </div>
                  <div className="sm:col-span-1 flex items-end">
                    <button
                      type="button"
                      onClick={handleAddTemplate}
                      disabled={savingTpl || !newTplName.trim()}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {savingTpl ? 'Guardando...' : 'Agregar'}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Copia el nombre tal cual lo aprobaste en el <strong className="text-slate-700 dark:text-slate-300">Administrador de WhatsApp de Meta</strong> (sin espacios ni mayúsculas). El CRM solo requiere el nombre para invocar el envío oficial.
                </p>
              </div>

              {/* Listado de plantillas activas en el CRM */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Plantillas configuradas ({templates.length}):
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Disponibles en el selector del chat
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-[#1E2433] border border-slate-200 dark:border-[#232A3B] rounded-xl overflow-hidden bg-white dark:bg-[#090A0F]">
                  {templates.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">
                      No hay plantillas registradas. Agrega una arriba con el nombre exacto aprobado en Meta.
                    </div>
                  ) : (
                    templates.map((tpl) => (
                      <div
                        key={tpl.name}
                        className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1A1F2C]/50 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <div>
                            <p className="text-xs font-semibold text-slate-900 dark:text-white">
                              {tpl.label || tpl.name}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
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
                            className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition cursor-pointer"
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
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
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
            )}

        {/* Asistente Visual de IA Multinicho & Vacíos de Conocimiento */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-200 dark:border-[#232A3B] pb-3">
            <div className="p-2.5 bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] rounded-xl border border-[#0052FF]/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Asistente Comercial & Catálogo de Servicios
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Estructura el catálogo de productos o servicios, precios, tono de comunicación y respuestas automáticas
              </p>
            </div>
          </div>

          {/* Wizard Visual Guiado */}
          <StructuredPromptWizard
            initialPrompt={systemPrompt}
            initialStructuredData={structuredPromptData}
            companyName={initialData.orgName || 'Mi Empresa'}
            onPromptCompiled={(compiledXml, newStructuredData) => {
              setSystemPrompt(compiledXml);
              setStructuredPromptData(newStructuredData);
            }}
          />

          {/* Bucle de Aprendizaje: Vacíos de Conocimiento */}
          <div className="pt-2">
            <KnowledgeGapsList initialGaps={initialData.initialKnowledgeGaps || []} />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#0052FF] hover:bg-[#0047E0] text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </form>

      {/* Modal de Edición de Plantilla */}
      {templateToEdit && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-[#232A3B] animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center shrink-0">
                <Pencil className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Editar Plantilla
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Modifica el nombre técnico de Meta o su etiqueta.
                </p>
              </div>
            </div>

            {editError && (
              <div className="p-2.5 rounded-xl text-xs font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditTemplate} className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Nombre exacto en Meta <span className="text-rose-400">*</span>
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
                  className="w-full text-xs font-mono border border-slate-200 dark:border-[#232A3B] rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] bg-slate-50 dark:bg-[#090A0F]"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
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
                  className="w-full text-xs border border-slate-200 dark:border-[#232A3B] rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] bg-slate-50 dark:bg-[#090A0F]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Confirma con tu contraseña <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Tu contraseña de Synqo"
                    className="w-full text-xs border border-slate-200 dark:border-[#232A3B] rounded-xl pl-3 pr-9 py-2 text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] bg-slate-50 dark:bg-[#090A0F]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-0.5"
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
                  className="flex-1 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-xl border border-slate-200 dark:border-[#232A3B] transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editingTpl || !templateToEdit.name.trim() || !editPassword.trim()}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50"
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
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-[#232A3B] animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>

            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">
                ¿Eliminar plantilla de WhatsApp?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                ¿Estás seguro de que deseas quitar la plantilla{' '}
                <strong className="text-slate-800 dark:text-slate-200 font-mono">"{templateToDelete}"</strong> del CRM? Ya no estará disponible en el selector del Inbox.
              </p>
            </div>

            {deleteError && (
              <div className="p-2.5 rounded-xl text-xs font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <form onSubmit={confirmDeleteTemplate} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Confirma con tu contraseña <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showDeletePassword ? 'text' : 'password'}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Tu contraseña de Synqo"
                    className="w-full text-xs border border-slate-200 dark:border-[#232A3B] rounded-xl pl-3 pr-9 py-2 text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] bg-slate-50 dark:bg-[#090A0F]"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword(!showDeletePassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-0.5"
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
                  className="flex-1 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-xl border border-slate-200 dark:border-[#232A3B] transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={deletingTpl || !deletePassword.trim()}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
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

