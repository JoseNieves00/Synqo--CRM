'use client';

import React, { useState, useMemo } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  Loader2,
  Sparkles,
  Copy,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Smartphone,
  ShieldCheck,
  DoorOpen,
  Calendar,
  MessageSquare,
  Users,
  CreditCard,
  Megaphone,
  Info,
  QrCode,
} from 'lucide-react';
import { provisionCompany } from '@/app/actions/superadmin';
import type { EnabledModules } from '@/lib/supabase/types';

// ─── Interfaces & Presets ──────────────────────────────────────────────────────

export interface IndustryPresetConfig {
  id: string;
  name: string;
  emoji: string;
  description: string;
  keywords: string[];
  defaultModules: EnabledModules;
  defaultSpecialistLabel: string;
  defaultRoomLabel: string;
  specialistSuggestions: string[];
  roomSuggestions: string[];
}

export const INDUSTRY_PRESETS: IndustryPresetConfig[] = [
  {
    id: 'health',
    name: 'Salud & Odontología',
    emoji: '🦷',
    description: 'Odontología, consultorios médicos, psicología, estética clínica…',
    keywords: ['odont', 'dent', 'clinic', 'medic', 'salud', 'doctor', 'psico', 'fisio', 'pediatr', 'dental', 'sonrisa'],
    defaultModules: {
      native_calendar: true,
      physical_rooms: true,
      staff_mobile_portal: true,
      quick_pay: false,
      anti_no_show: true,
      ad_attribution: false,
    },
    defaultSpecialistLabel: 'Doctor',
    defaultRoomLabel: 'Consultorio',
    specialistSuggestions: ['Doctor', 'Odontólogo', 'Especialista', 'Terapeuta', 'Cirujano'],
    roomSuggestions: ['Consultorio', 'Box Dental', 'Cabina', 'Sala de Procedimientos'],
  },
  {
    id: 'services',
    name: 'Belleza & Estética',
    emoji: '✂️',
    description: 'Barberías, peluquerías, salones de uñas, spas y estética…',
    keywords: ['barber', 'estetic', 'peluquer', 'spa', 'salon', 'unas', 'cejas', 'lash', 'belleza', 'capilar'],
    defaultModules: {
      native_calendar: true,
      physical_rooms: true,
      staff_mobile_portal: true,
      quick_pay: false,
      anti_no_show: true,
      ad_attribution: false,
    },
    defaultSpecialistLabel: 'Especialista',
    defaultRoomLabel: 'Cabina',
    specialistSuggestions: ['Especialista', 'Barbero', 'Estilista', 'Manicurista', 'Terapeuta'],
    roomSuggestions: ['Cabina', 'Sillón', 'Puesto', 'Box', 'Estación'],
  },
  {
    id: 'fitness',
    name: 'Fitness & Deporte',
    emoji: '🏋️',
    description: 'Gimnasios, crossfit, yoga, pilates y entrenadores personales…',
    keywords: ['gym', 'fitness', 'entren', 'crossfit', 'yoga', 'pilates', 'deport', 'boxeo', 'pesas'],
    defaultModules: {
      native_calendar: true,
      physical_rooms: true,
      staff_mobile_portal: true,
      quick_pay: false,
      anti_no_show: true,
      ad_attribution: false,
    },
    defaultSpecialistLabel: 'Entrenador',
    defaultRoomLabel: 'Sala',
    specialistSuggestions: ['Entrenador', 'Coach', 'Instructor', 'Profesor'],
    roomSuggestions: ['Sala', 'Salón', 'Box', 'Zona', 'Área'],
  },
  {
    id: 'education',
    name: 'Academia & Cursos',
    emoji: '🎓',
    description: 'Escuelas de idiomas, música, tutorías, academias y clases…',
    keywords: ['academi', 'escuel', 'curso', 'taller', 'idiom', 'clase', 'tutor', 'educa', 'musica', 'canto'],
    defaultModules: {
      native_calendar: true,
      physical_rooms: true,
      staff_mobile_portal: true,
      quick_pay: false,
      anti_no_show: true,
      ad_attribution: false,
    },
    defaultSpecialistLabel: 'Instructor',
    defaultRoomLabel: 'Aula',
    specialistSuggestions: ['Instructor', 'Profesor', 'Tutor', 'Maestro'],
    roomSuggestions: ['Aula', 'Salón', 'Sala', 'Estudio'],
  },
  {
    id: 'gastronomy',
    name: 'Gastronomía & Bares',
    emoji: '🍽️',
    description: 'Restaurantes, cafeterías, gastrobares y eventos culinarios…',
    keywords: ['restaur', 'bar', 'cafe', 'gastro', 'comida', 'burger', 'pizza', 'cocina', 'asador'],
    defaultModules: {
      native_calendar: false,
      physical_rooms: true,
      staff_mobile_portal: false,
      quick_pay: false,
      anti_no_show: false,
      ad_attribution: false,
    },
    defaultSpecialistLabel: 'Chef',
    defaultRoomLabel: 'Mesa',
    specialistSuggestions: ['Chef', 'Mesero', 'Capitán', 'Bartender'],
    roomSuggestions: ['Mesa', 'Terraza', 'Salón VIP', 'Barra'],
  },
  {
    id: 'real_estate',
    name: 'Bienes Raíces',
    emoji: '🏠',
    description: 'Inmobiliarias, corretaje, constructoras y venta de proyectos…',
    keywords: ['inmobil', 'propied', 'real estate', 'bienes', 'inmueble', 'apartamento', 'lote'],
    defaultModules: {
      native_calendar: true,
      physical_rooms: false,
      staff_mobile_portal: true,
      quick_pay: false,
      anti_no_show: true,
      ad_attribution: false,
    },
    defaultSpecialistLabel: 'Agente',
    defaultRoomLabel: 'Sala de juntas',
    specialistSuggestions: ['Agente', 'Asesor Inmobiliario', 'Broker', 'Consultor'],
    roomSuggestions: ['Sala de juntas', 'Sala de firmas', 'Oficina'],
  },
  {
    id: 'professional',
    name: 'Servicios Profesionales',
    emoji: '💼',
    description: 'Abogados, contadores, agencias de marketing y consultores…',
    keywords: ['legal', 'abogad', 'contab', 'asesor', 'consultor', 'segur', 'financ', 'agencia'],
    defaultModules: {
      native_calendar: true,
      physical_rooms: false,
      staff_mobile_portal: true,
      quick_pay: false,
      anti_no_show: true,
      ad_attribution: false,
    },
    defaultSpecialistLabel: 'Consultor',
    defaultRoomLabel: 'Sala de reuniones',
    specialistSuggestions: ['Consultor', 'Asesor', 'Abogado', 'Especialista', 'Auditor'],
    roomSuggestions: ['Sala de reuniones', 'Oficina', 'Despacho'],
  },
  {
    id: 'custom',
    name: 'General / A Medida',
    emoji: '⚡',
    description: 'Cualquier otro tipo de negocio. Configuración 100% modular y libre.',
    keywords: [],
    defaultModules: {
      native_calendar: true,
      physical_rooms: false,
      staff_mobile_portal: true,
      quick_pay: false,
      anti_no_show: true,
      ad_attribution: false,
    },
    defaultSpecialistLabel: 'Colaborador',
    defaultRoomLabel: 'Espacio',
    specialistSuggestions: ['Colaborador', 'Agente', 'Especialista', 'Asesor'],
    roomSuggestions: ['Espacio', 'Sala', 'Área', 'Estación'],
  },
];

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export function ProvisionWizard({ onSuccess, onCancel }: Props) {
  // Pasos: 0 = Info Empresa & Detección, 1 = Módulos & Nomenclatura, 2 = Revisión, 3 = Éxito
  const [step, setStep] = useState<number>(0);

  // Datos de la empresa
  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState(() => `EMPR${Math.floor(1000 + Math.random() * 9000)}`);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('custom');
  const [detectedBadge, setDetectedBadge] = useState<string | null>(null);

  // Credenciales Admin
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState(() => `Synqo${Math.floor(1000 + Math.random() * 9000)}!`);
  const [showPassword, setShowPassword] = useState(false);
  const [maxUsers, setMaxUsers] = useState<number>(3);

  // Módulos
  const [modules, setModules] = useState<EnabledModules>({
    native_calendar: true,
    physical_rooms: false,
    staff_mobile_portal: true,
    quick_pay: false,
    anti_no_show: true,
    ad_attribution: false,
  });

  // Nombres 100% personalizables
  const [specialistLabel, setSpecialistLabel] = useState('Colaborador');
  const [roomLabel, setRoomLabel] = useState('Espacio');

  // WhatsApp Provider (meta o evolution configurable por Super Admin)
  const [whatsappProvider, setWhatsappProvider] = useState<'meta' | 'evolution'>('evolution');

  // Estados de envío y éxito
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    companyName: string;
    companyCode: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  } | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Detección inteligente por nombre de empresa (en tiempo real)
  const handleCompanyNameChange = (value: string) => {
    setCompanyName(value);
    const lower = value.toLowerCase().trim();

    if (!lower) {
      setDetectedBadge(null);
      return;
    }

    // Buscar preset coincidente por palabras clave
    for (const preset of INDUSTRY_PRESETS) {
      if (preset.id === 'custom') continue;
      const matched = preset.keywords.some((k) => lower.includes(k));
      if (matched) {
        setSelectedPresetId(preset.id);
        setModules(preset.defaultModules);
        setSpecialistLabel(preset.defaultSpecialistLabel);
        setRoomLabel(preset.defaultRoomLabel);
        setDetectedBadge(
          `✨ Detectamos giro de ${preset.name}: pre-configuramos agenda de citas, ${preset.defaultSpecialistLabel.toLowerCase()}s y ${preset.defaultRoomLabel.toLowerCase()}s automáticamente.`
        );
        return;
      }
    }
  };

  // Selección manual de preset rápido
  const handleSelectPreset = (preset: IndustryPresetConfig) => {
    setSelectedPresetId(preset.id);
    setModules(preset.defaultModules);
    setSpecialistLabel(preset.defaultSpecialistLabel);
    setRoomLabel(preset.defaultRoomLabel);
    setDetectedBadge(
      `Seleccionaste preset ${preset.emoji} ${preset.name}: módulos y nombres configurados para este rubro.`
    );
  };

  // Preset actual para sugerencias de chips
  const currentPreset = useMemo(
    () => INDUSTRY_PRESETS.find((p) => p.id === selectedPresetId) || INDUSTRY_PRESETS[INDUSTRY_PRESETS.length - 1],
    [selectedPresetId]
  );

  // Validación de paso 0 (Info)
  const isStep0Valid = Boolean(
    companyName.trim().length >= 2 &&
    adminName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim()) &&
    adminPassword.length >= 8
  );

  // Condicionales de nomenclatura según módulos seleccionados
  const needsSpecialistLabel = Boolean(modules.native_calendar || modules.staff_mobile_portal);
  const needsRoomLabel = Boolean(modules.physical_rooms);

  // Validación de paso 1 (Servicios & Nomenclatura condicionada)
  const isStep1Valid = Boolean(
    (!needsSpecialistLabel || specialistLabel.trim().length >= 2) &&
    (!needsRoomLabel || roomLabel.trim().length >= 2) &&
    (!modules.staff_mobile_portal || companyCode.trim().length >= 3)
  );

  // Envío final
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await provisionCompany({
        companyName: companyName.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPassword,
        maxUsers,
        companyCode: companyCode.trim().toUpperCase() || undefined,
        industryPreset: selectedPresetId,
        enabledModules: modules,
        specialistLabel: needsSpecialistLabel ? specialistLabel.trim() : (specialistLabel.trim() || 'Colaborador'),
        roomLabel: needsRoomLabel ? roomLabel.trim() : (roomLabel.trim() || 'Espacio'),
        whatsappProvider,
      });

      setSuccessData({
        companyName: companyName.trim(),
        companyCode: res.credentials?.companyCode || companyCode.trim().toUpperCase(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPassword,
      });

      setStep(3); // Pantalla de éxito
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al aprovisionar la empresa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copiar todo el mensaje para WhatsApp
  const handleCopyWhatsAppMessage = () => {
    if (!successData) return;
    const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : 'https://crm.synqo.dev/login';

    const activeList: string[] = [];
    if (modules.native_calendar) activeList.push('📅 Agenda & Citas por WhatsApp');
    if (modules.staff_mobile_portal) activeList.push(`👥 Portal móvil para ${specialistLabel}s`);
    if (modules.physical_rooms) activeList.push(`🏠 Control de ${roomLabel}s y aforo`);
    if (modules.quick_pay) activeList.push('💳 Pagos Rápidos (Quick Pay)');

    const companyCodeLine = modules.staff_mobile_portal
      ? `🔑 Código de Empresa (Colaboradores): ${successData.companyCode}\n`
      : '';

    const message = `🎉 ¡Bienvenido a Synqo!

Tus credenciales de acceso inicial como Administrador:
🏢 Empresa: ${successData.companyName}
${companyCodeLine}👤 Usuario / Email: ${successData.adminEmail}
🔒 Contraseña inicial: ${successData.adminPassword}

👉 Inicia sesión aquí: ${loginUrl}

Módulos activos:
${activeList.map((m) => `• ${m}`).join('\n')}

Por seguridad te sugerimos cambiar tu contraseña una vez ingreses al sistema. ¡Estamos listos para potenciar tus ventas y citas!`;

    navigator.clipboard.writeText(message);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const handleCopySingleField = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-gray-200 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in zoom-in-95 duration-200 text-gray-900">
        
        {/* Cabecera del Wizard */}
        <div className="px-6 py-4 border-b border-gray-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0052FF]/10 text-[#0052FF] flex items-center justify-center font-bold shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                Aprovisionar Nueva Empresa (Multi-Nicho)
              </h2>
              <p className="text-xs text-gray-500">
                {step === 0 && 'Paso 1: Información básica y detección inteligente del negocio'}
                {step === 1 && 'Paso 2: Servicios, módulos y nomenclatura 100% personalizada'}
                {step === 2 && 'Paso 3: Revisión final y activación inmediata'}
                {step === 3 && '🎉 ¡Empresa aprovisionada exitosamente!'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={step === 3 ? () => { onSuccess(); onCancel(); } : onCancel}
            className="text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de progreso de 3 pasos (oculta en pantalla de éxito) */}
        {step < 3 && (
          <div className="px-6 py-3 bg-slate-50/50 border-b border-gray-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${step === 0 ? 'bg-[#0052FF] text-white shadow-xs' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                {step > 0 ? '✓' : '1'}
              </span>
              <span className={step === 0 ? 'font-bold text-gray-900' : 'text-gray-500'}>
                Empresa & Credenciales
              </span>
            </div>

            <ChevronRight className="w-4 h-4 text-gray-300" />

            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${step === 1 ? 'bg-[#0052FF] text-white shadow-xs' : step > 1 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400'}`}>
                {step > 1 ? '✓' : '2'}
              </span>
              <span className={step === 1 ? 'font-bold text-gray-900' : 'text-gray-500'}>
                Servicios & Nomenclatura
              </span>
            </div>

            <ChevronRight className="w-4 h-4 text-gray-300" />

            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${step === 2 ? 'bg-[#0052FF] text-white shadow-xs' : 'bg-gray-100 text-gray-400'}`}>
                3
              </span>
              <span className={step === 2 ? 'font-bold text-gray-900' : 'text-gray-500'}>
                Revisión & Confirmación
              </span>
            </div>
          </div>
        )}

        {/* Contenido Dinámico por Paso */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ═════════════════════════════════════════════════════════════════════
              PASO 0: Información de la Empresa, Detección Inteligente & Acceso
          ═════════════════════════════════════════════════════════════════════ */}
          {step === 0 && (
            <div className="space-y-6">
              
              {/* Bloque Empresa y Detección */}
              <div className="p-5 rounded-2xl bg-slate-50/50 border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#0052FF]" />
                    <h3 className="text-sm font-bold text-gray-900">Datos de la Empresa</h3>
                  </div>
                  <span className="text-[11px] text-gray-500">
                    Escribe el nombre y detectaremos el nicho automáticamente
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Nombre de la Empresa *
                  </label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => handleCompanyNameChange(e.target.value)}
                    placeholder="Ej. Odontología San Lucas, Barbería King, FitGym…"
                    className="w-full h-10 px-3.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition font-medium shadow-xs"
                  />
                </div>

                {/* Banner de Detección Inteligente */}
                {detectedBadge && (
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#0052FF] shrink-0" />
                      <span>{detectedBadge}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetectedBadge(null)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline cursor-pointer shrink-0"
                    >
                      Entendido
                    </button>
                  </div>
                )}

                {/* Selector Opcional de Presets Rápidos (1 Clic) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">
                    O selecciona un preset rápido con 1 clic:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {INDUSTRY_PRESETS.map((preset) => {
                      const isSelected = selectedPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectPreset(preset)}
                          className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50/80 border-[#0052FF] text-blue-900 ring-2 ring-[#0052FF]/20 shadow-xs'
                              : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50/60 shadow-2xs'
                          }`}
                        >
                          <span className="text-lg">{preset.emoji}</span>
                          <div className="truncate">
                            <span className="block text-xs font-semibold leading-tight truncate">
                              {preset.name}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bloque Credenciales de Acceso */}
              <div className="p-5 rounded-2xl bg-slate-50/50 border border-gray-200 space-y-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#0052FF]" />
                  <h3 className="text-sm font-bold text-gray-900">Credenciales del Administrador Inicial</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Nombre del Administrador *
                    </label>
                    <input
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Ej. Dr. Carlos Mendoza"
                      className="w-full h-10 px-3.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition font-medium shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Correo Electrónico (Login) *
                    </label>
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@clinica.com"
                      className="w-full h-10 px-3.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition font-mono shadow-xs"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-gray-700">
                        Contraseña Inicial *
                      </label>
                      <button
                        type="button"
                        onClick={() => setAdminPassword(`Synqo${Math.floor(1000 + Math.random() * 9000)}!`)}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-[#0052FF] hover:bg-blue-100 font-semibold transition cursor-pointer"
                      >
                        Generar
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        className="w-full h-10 pl-3.5 pr-10 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 font-mono focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition p-1"
                        title={showPassword ? 'Ocultar' : 'Mostrar'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloque Capacidad & Usuarios */}
              <div className="p-5 rounded-2xl bg-slate-50/50 border border-gray-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-blue-50 text-[#0052FF] rounded-xl border border-blue-200/50">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Cupo de Usuarios Autorizados</h3>
                      <p className="text-[11px] text-gray-500">
                        Cantidad máxima de miembros de equipo, administradores o asesores que podrán iniciar sesión.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-white border border-gray-200 px-3.5 py-2 rounded-xl shadow-2xs">
                    <span className="text-xs text-gray-700 font-semibold">Usuarios autorizados:</span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={maxUsers}
                      onChange={(e) => setMaxUsers(parseInt(e.target.value, 10) || 1)}
                      className="w-16 h-8 px-2 text-center rounded-lg bg-slate-50 border border-gray-200 text-sm font-black text-gray-900 focus:outline-none focus:border-[#0052FF]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════════
              PASO 1: Módulos Activos y Nomenclatura 100% Personalizada
          ═════════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-6">
              
              {/* Notificación explicativa */}
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-[#0052FF] shrink-0" />
                <div>
                  <strong className="block font-semibold text-gray-900">
                    Personalización Multi-Nicho para: {companyName || 'Nueva Empresa'}
                  </strong>
                  Activa primero los servicios que tendrá la empresa. Los campos de nomenclatura se adaptarán de inmediato según lo que enciendas.
                </div>
              </div>

              {/* 1. Módulos Habilitados (Define qué servicios tendrá la empresa) */}
              <div className="p-5 rounded-2xl bg-slate-50/50 border border-gray-200 space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#0052FF]" />
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Módulos & Servicios Habilitados</h3>
                    <p className="text-[11px] text-gray-500">
                      Selecciona las funcionalidades contratadas para este negocio.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  
                  {/* 1. Calendario y Citas */}
                  <label className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                    modules.native_calendar ? 'bg-blue-50/60 border-[#0052FF]/40 shadow-2xs' : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={modules.native_calendar}
                      onChange={(e) => setModules((prev) => ({ ...prev, native_calendar: e.target.checked }))}
                      className="mt-1 w-4 h-4 rounded text-[#0052FF] focus:ring-[#0052FF]/20 border-gray-300"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#0052FF]" />
                        Agenda & Citas por WhatsApp
                      </span>
                      <span className="text-[11px] text-gray-500 block mt-0.5 leading-relaxed">
                        Permite que el asistente y el equipo agenden, reprogramen y validen citas automáticamente.
                      </span>
                    </div>
                  </label>

                  {/* 2. Portal de Colaboradores */}
                  <label className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                    modules.staff_mobile_portal ? 'bg-blue-50/60 border-[#0052FF]/40 shadow-2xs' : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={modules.staff_mobile_portal}
                      onChange={(e) => setModules((prev) => ({ ...prev, staff_mobile_portal: e.target.checked }))}
                      className="mt-1 w-4 h-4 rounded text-[#0052FF] focus:ring-[#0052FF]/20 border-gray-300"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-[#0052FF]" />
                        Portal Móvil para Colaboradores
                      </span>
                      <span className="text-[11px] text-gray-500 block mt-0.5 leading-relaxed">
                        Acceso móvil con PIN rápido para que los profesionales vean su agenda del día.
                      </span>
                    </div>
                  </label>

                  {/* 3. Espacios Físicos */}
                  <label className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                    modules.physical_rooms ? 'bg-blue-50/60 border-[#0052FF]/40 shadow-2xs' : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={modules.physical_rooms}
                      onChange={(e) => setModules((prev) => ({ ...prev, physical_rooms: e.target.checked }))}
                      className="mt-1 w-4 h-4 rounded text-[#0052FF] focus:ring-[#0052FF]/20 border-gray-300"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <DoorOpen className="w-3.5 h-3.5 text-emerald-600" />
                        Control de Espacios Físicos & Aforo
                      </span>
                      <span className="text-[11px] text-gray-500 block mt-0.5 leading-relaxed">
                        Asignación de consultorios, cabinas o estaciones por turno para evitar sobrecupo.
                      </span>
                    </div>
                  </label>

                  {/* 4. Pagos Rápidos */}
                  <label className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                    modules.quick_pay ? 'bg-blue-50/60 border-[#0052FF]/40 shadow-2xs' : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={modules.quick_pay}
                      onChange={(e) => setModules((prev) => ({ ...prev, quick_pay: e.target.checked }))}
                      className="mt-1 w-4 h-4 rounded text-[#0052FF] focus:ring-[#0052FF]/20 border-gray-300"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-[#0052FF]" />
                        Cobros Rápidos (Quick Pay)
                      </span>
                      <span className="text-[11px] text-gray-500 block mt-0.5 leading-relaxed">
                        Registro de método de pago (Efectivo, Nequi, Datáfono) al concretar el servicio.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* 2. Nombres y Términos del Negocio (Condicionado estrictamente por los módulos activados) */}
              {(needsSpecialistLabel || needsRoomLabel) ? (
                <div className="p-5 rounded-2xl bg-slate-50/50 border border-gray-200 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#0052FF]" />
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Nombres y Términos del Negocio</h3>
                      <p className="text-[11px] text-gray-500">
                        Personaliza cómo se llamará a cada elemento en base a los módulos que activaste.
                      </p>
                    </div>
                  </div>

                  <div className={`grid gap-5 ${needsSpecialistLabel && needsRoomLabel ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                    {/* Etiqueta de Colaborador (solo si tiene Agenda o Portal Móvil) */}
                    {needsSpecialistLabel && (
                      <div className="p-4 rounded-xl bg-white border border-gray-200 space-y-3 shadow-2xs animate-in fade-in">
                        <label className="block text-xs font-semibold text-gray-700">
                          ¿Cómo llaman a los profesionales/colaboradores? *
                        </label>
                        <input
                          type="text"
                          required
                          value={specialistLabel}
                          onChange={(e) => setSpecialistLabel(e.target.value)}
                          placeholder="Doctor, Odontólogo, Barbero, Entrenador…"
                          className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-gray-200 text-sm text-[#0052FF] font-bold focus:outline-none focus:border-[#0052FF] focus:bg-white focus:ring-4 focus:ring-[#0052FF]/10 transition"
                        />
                        <div>
                          <span className="text-[10px] text-gray-500 block mb-1.5 font-medium">Sugerencias rápidas:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {currentPreset.specialistSuggestions.map((sug) => (
                              <button
                                key={sug}
                                type="button"
                                onClick={() => setSpecialistLabel(sug)}
                                className={`text-xs px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                                  specialistLabel.toLowerCase() === sug.toLowerCase()
                                    ? 'bg-[#0052FF] text-white border-[#0052FF] shadow-xs'
                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:text-gray-900 hover:bg-gray-100'
                                }`}
                              >
                                {sug}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Etiqueta de Espacios (solo si tiene Control de Espacios Físicos) */}
                    {needsRoomLabel && (
                      <div className="p-4 rounded-xl bg-white border border-gray-200 space-y-3 shadow-2xs animate-in fade-in">
                        <label className="block text-xs font-semibold text-gray-700">
                          ¿Cómo llaman a los espacios o estaciones físicas? *
                        </label>
                        <input
                          type="text"
                          required
                          value={roomLabel}
                          onChange={(e) => setRoomLabel(e.target.value)}
                          placeholder="Consultorio, Box Dental, Cabina, Salón…"
                          className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-gray-200 text-sm text-[#0052FF] font-bold focus:outline-none focus:border-[#0052FF] focus:bg-white focus:ring-4 focus:ring-[#0052FF]/10 transition"
                        />
                        <div>
                          <span className="text-[10px] text-gray-500 block mb-1.5 font-medium">Sugerencias rápidas:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {currentPreset.roomSuggestions.map((sug) => (
                              <button
                                key={sug}
                                type="button"
                                onClick={() => setRoomLabel(sug)}
                                className={`text-xs px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                                  roomLabel.toLowerCase() === sug.toLowerCase()
                                    ? 'bg-[#0052FF] text-white border-[#0052FF] shadow-xs'
                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:text-gray-900 hover:bg-gray-100'
                                }`}
                              >
                                {sug}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-gray-300 text-xs text-gray-500 flex items-center gap-3">
                  <Info className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>
                    Empresa configurada sin módulos de agenda ni espacios físicos. No se requiere configurar términos personalizados.
                  </span>
                </div>
              )}

              {/* 3. Código de Empresa: solo si activaron portal de colaboradores */}
              {modules.staff_mobile_portal && (
                <div className="p-4 rounded-xl bg-white border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in shadow-2xs">
                  <div>
                    <span className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-[#0052FF]" />
                      Código de acceso móvil para {specialistLabel}s
                    </span>
                    <span className="text-[11px] text-gray-500 block">
                      Tus {specialistLabel.toLowerCase()}s usarán este código + su PIN para ver su agenda en el portal móvil.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={companyCode}
                      onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                      maxLength={10}
                      className="w-28 h-8 px-3 rounded-lg bg-slate-50 border border-gray-200 text-xs font-mono font-bold text-[#0052FF] uppercase text-center focus:outline-none focus:border-[#0052FF]"
                    />
                    <button
                      type="button"
                      onClick={() => setCompanyCode(`EMPR${Math.floor(1000 + Math.random() * 9000)}`)}
                      className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1.5 rounded-lg transition font-semibold cursor-pointer"
                    >
                      Auto
                    </button>
                  </div>
                </div>
              )}

              {/* 4. Motor de Mensajería: Meta vs Z-API */}
              <div className="p-5 rounded-2xl bg-slate-50/50 border border-gray-200 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#0052FF]" />
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Motor de Conexión de WhatsApp</h3>
                    <p className="text-[11px] text-gray-500">
                      Define el protocolo de mensajería para esta empresa. En sus Ajustes solo verán la opción asignada aquí.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label
                    className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                      whatsappProvider === 'evolution'
                        ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="provisionWaProvider"
                      value="evolution"
                      checked={whatsappProvider === 'evolution'}
                      onChange={() => setWhatsappProvider('evolution')}
                      className="mt-0.5 w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 block flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                        Evolution API (VPS Propio)
                      </span>
                      <span className="text-[11px] text-gray-500 block leading-tight mt-0.5">
                        Self-Hosted • Vinculación por QR o código de 8 dígitos. Sin costos de Meta ni límites de ventana 24h.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                      whatsappProvider === 'meta'
                        ? 'bg-blue-50/80 border-[#0052FF] ring-2 ring-[#0052FF]/20 shadow-xs'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="provisionWaProvider"
                      value="meta"
                      checked={whatsappProvider === 'meta'}
                      onChange={() => setWhatsappProvider('meta')}
                      className="mt-0.5 w-4 h-4 text-[#0052FF] focus:ring-[#0052FF]/20 border-gray-300"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 block flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-[#0052FF]" />
                        Meta Cloud API (Oficial WABA)
                      </span>
                      <span className="text-[11px] text-gray-500 block leading-tight mt-0.5">
                        Canal corporativo Meta • Requiere ID telefónico, tokens permanentes y plantillas HSM aprobadas.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════════
              PASO 2: Revisión Final
          ═════════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-slate-50/50 border border-gray-200 space-y-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Resumen de Aprovisionamiento
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-xl bg-white border border-gray-200 space-y-2 shadow-2xs">
                    <span className="text-[11px] font-bold text-[#0052FF] uppercase tracking-wider block">
                      Empresa & Acceso
                    </span>
                    <div><strong className="text-gray-500 font-medium">Empresa:</strong> <span className="text-gray-900 font-bold ml-1">{companyName}</span></div>
                    {modules.staff_mobile_portal && (
                      <div><strong className="text-gray-500 font-medium">Código Equipo:</strong> <span className="text-[#0052FF] font-mono font-bold ml-1">{companyCode}</span></div>
                    )}
                    <div><strong className="text-gray-500 font-medium">Admin:</strong> <span className="text-gray-900 ml-1">{adminName}</span></div>
                    <div><strong className="text-gray-500 font-medium">Email:</strong> <span className="text-gray-900 font-mono ml-1">{adminEmail}</span></div>
                    <div><strong className="text-gray-500 font-medium">Usuarios Autorizados:</strong> <span className="text-gray-900 font-bold ml-1">{maxUsers} usuarios</span></div>
                  </div>

                  <div className="p-4 rounded-xl bg-white border border-gray-200 space-y-2 shadow-2xs">
                    <span className="text-[11px] font-bold text-[#0052FF] uppercase tracking-wider block">
                      Nomenclatura & Módulos
                    </span>
                    {needsSpecialistLabel && (
                      <div><strong className="text-gray-500 font-medium">Colaboradores:</strong> <span className="text-gray-900 font-semibold ml-1">{specialistLabel}s</span></div>
                    )}
                    {needsRoomLabel && (
                      <div><strong className="text-gray-500 font-medium">Espacios Físicos:</strong> <span className="text-gray-900 font-semibold ml-1">{roomLabel}s</span></div>
                    )}
                    {!needsSpecialistLabel && !needsRoomLabel && (
                      <div className="text-gray-400 italic text-[11px]">Sin términos específicos requeridos</div>
                    )}
                    <div><strong className="text-gray-500 font-medium">Motor WhatsApp:</strong> <span className="text-gray-900 font-semibold ml-1">{whatsappProvider === 'evolution' ? '⚡ Evolution API (VPS)' : '🏢 Meta Cloud API'}</span></div>
                    <div className="pt-2 border-t border-gray-100">
                      <strong className="text-gray-500 font-medium block mb-1">Módulos habilitados:</strong>
                      <div className="flex flex-wrap gap-1.5">
                        {modules.native_calendar && <span className="bg-blue-50 text-[#0052FF] border border-blue-200/60 px-2 py-0.5 rounded text-[10px] font-semibold">📅 Agenda</span>}
                        {modules.staff_mobile_portal && <span className="bg-blue-50 text-[#0052FF] border border-blue-200/60 px-2 py-0.5 rounded text-[10px] font-semibold">👥 {specialistLabel}s</span>}
                        {modules.physical_rooms && <span className="bg-blue-50 text-[#0052FF] border border-blue-200/60 px-2 py-0.5 rounded text-[10px] font-semibold">🏠 {roomLabel}s</span>}
                        {modules.quick_pay && <span className="bg-blue-50 text-[#0052FF] border border-blue-200/60 px-2 py-0.5 rounded text-[10px] font-semibold">💳 Quick Pay</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {errorMessage && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                    {errorMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════════
              PASO 3: Éxito & Copiar Credenciales para WhatsApp
          ═════════════════════════════════════════════════════════════════════ */}
          {step === 3 && successData && (
            <div className="space-y-6 animate-in zoom-in-95 duration-200">
              <div className="text-center space-y-2 py-2">
                <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-extrabold text-gray-900">
                  ¡Empresa Aprovisionada Exitosamente!
                </h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  La organización <strong className="text-gray-900">{successData.companyName}</strong> ya está activa con su base de datos, módulos y usuario administrador configurados.
                </p>
              </div>

              {/* Botón Destacado: Copiar Mensaje para WhatsApp */}
              <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-center sm:text-left">
                  <span className="text-xs font-bold text-gray-900 flex items-center justify-center sm:justify-start gap-1.5">
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    Enviar Accesos al Cliente por WhatsApp
                  </span>
                  <p className="text-[11px] text-gray-500">
                    Copia un mensaje formateado con el enlace, usuario, contraseña y código de empresa.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCopyWhatsAppMessage}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  {copiedAll ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>¡Mensaje Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Mensaje para WhatsApp</span>
                    </>
                  )}
                </button>
              </div>

              {/* Tarjeta de Credenciales Individuales */}
              <div className="p-5 rounded-2xl bg-slate-50/50 border border-gray-200 space-y-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                  Detalles de Acceso
                </span>

                <div className={`grid grid-cols-1 ${modules.staff_mobile_portal ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3 text-xs`}>
                  {modules.staff_mobile_portal && (
                    <div className="p-3 rounded-xl bg-white border border-gray-200 flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="text-[10px] text-gray-500 block">Código Colaboradores</span>
                        <strong className="text-[#0052FF] font-mono text-sm">{successData.companyCode}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopySingleField(successData.companyCode, 'code')}
                        className="text-gray-400 hover:text-gray-700 p-1.5 cursor-pointer"
                        title="Copiar código"
                      >
                        {copiedField === 'code' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}

                  <div className="p-3 rounded-xl bg-white border border-gray-200 flex items-center justify-between shadow-2xs">
                    <div>
                      <span className="text-[10px] text-gray-500 block">Usuario / Email</span>
                      <strong className="text-gray-900 font-mono text-xs">{successData.adminEmail}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopySingleField(successData.adminEmail, 'email')}
                      className="text-gray-400 hover:text-gray-700 p-1.5 cursor-pointer"
                      title="Copiar email"
                    >
                      {copiedField === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-gray-200 flex items-center justify-between shadow-2xs">
                    <div>
                      <span className="text-[10px] text-gray-500 block">Contraseña Inicial</span>
                      <strong className="text-gray-900 font-mono text-xs">{successData.adminPassword}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopySingleField(successData.adminPassword, 'password')}
                      className="text-gray-400 hover:text-gray-700 p-1.5 cursor-pointer"
                      title="Copiar contraseña"
                    >
                      {copiedField === 'password' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-gray-200 flex items-center justify-between shadow-2xs">
                    <div>
                      <span className="text-[10px] text-gray-500 block">Enlace de Inicio</span>
                      <strong className="text-[#0052FF] font-mono text-xs">https://crm.synqo.dev/login</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopySingleField('https://crm.synqo.dev/login', 'url')}
                      className="text-gray-400 hover:text-gray-700 p-1.5 cursor-pointer"
                      title="Copiar link"
                    >
                      {copiedField === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer con Navegación */}
        <div className="px-6 py-4 border-t border-gray-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          {step < 3 ? (
            <>
              <button
                type="button"
                onClick={step === 0 ? onCancel : () => setStep(step - 1)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition cursor-pointer flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                {step === 0 ? 'Cancelar' : 'Atrás'}
              </button>

              {step < 2 ? (
                <button
                  type="button"
                  disabled={(step === 0 && !isStep0Valid) || (step === 1 && !isStep1Valid)}
                  onClick={() => setStep(step + 1)}
                  className="px-6 py-2.5 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition cursor-pointer flex items-center gap-2"
                >
                  <span>Continuar</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                  className="px-6 py-2.5 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/25 transition cursor-pointer flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Aprovisionando Empresa...</span>
                    </>
                  ) : (
                    <>
                      <Building2 className="w-4 h-4" />
                      <span>Crear y Habilitar Empresa</span>
                    </>
                  )}
                </button>
              )}
            </>
          ) : (
            <div className="w-full flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  onSuccess();
                  onCancel();
                }}
                className="px-6 py-2.5 bg-[#0052FF] hover:bg-[#0047E0] text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition cursor-pointer"
              >
                Finalizar y Ver en Consola
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
