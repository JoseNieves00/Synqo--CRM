'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  MessageSquare,
  Plus,
  AlertTriangle,
  CheckCircle2,
  User,
  LogOut,
  Send,
  Phone,
  MapPin,
  Trash2,
  Sparkles,
  ChevronRight,
  Shield,
  Coffee,
} from 'lucide-react';
import {
  StaffSession,
  StaffAppointmentItem,
  StaffUnavailabilityItem,
  StaffChatMessageItem,
  staffLogin,
  staffLoginWithPhone,
  staffLogout,
  getStaffTodayAgenda,
  staffRegisterWalkIn,
  staffReportDelay,
  staffUpdateAppointmentStatus,
  staffGetAvailability,
  staffSaveWeeklySchedule,
  staffBlockTime,
  staffDeleteBlock,
  getStaffChatMessages,
  sendStaffChatMessage,
} from '@/app/actions/staff';

interface StaffMobileAppProps {
  initialSession: StaffSession | null;
}

const DAYS_OF_WEEK = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' },
];

export function StaffMobileApp({ initialSession }: StaffMobileAppProps) {
  const [session, setSession] = useState<StaffSession | null>(initialSession);
  const [activeTab, setActiveTab] = useState<'agenda' | 'disponibilidad' | 'chat'>('agenda');

  // Estado de Login
  const [loginMode, setLoginMode] = useState<'phone' | 'code'>('phone');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Estado de Agenda
  const [agenda, setAgenda] = useState<StaffAppointmentItem[]>([]);
  const [agendaStats, setAgendaStats] = useState({ totalToday: 0, completedToday: 0, pendingToday: 0 });
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [expandedApptId, setExpandedApptId] = useState<string | null>(null);

  // Estado de Disponibilidad
  const [weeklySchedule, setWeeklySchedule] = useState<any>({});
  const [unavailabilities, setUnavailabilities] = useState<StaffUnavailabilityItem[]>([]);
  const [availLoading, setAvailLoading] = useState(false);

  // Modal de Bloqueo Flexible
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockStartTime, setBlockStartTime] = useState('14:00');
  const [blockEndTime, setBlockEndTime] = useState('16:00');
  const [blockReason, setBlockReason] = useState('Cita médica');
  const [blockIsAllDay, setBlockIsAllDay] = useState(false);
  const [blockSubmitting, setBlockSubmitting] = useState(false);

  // Estado de Chat Interno
  const [messages, setMessages] = useState<StaffChatMessageItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);

  // Mensaje de feedback temporal
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Cargar datos según la pestaña activa y auto-refrescar al desbloquear pantalla
  useEffect(() => {
    if (!session) return;

    if (activeTab === 'agenda') {
      loadAgenda();
    } else if (activeTab === 'disponibilidad') {
      loadAvailability();
    } else if (activeTab === 'chat') {
      loadChat();
    }

    // Reactivación al desbloquear el celular o volver a la pestaña de Safari/Chrome
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (activeTab === 'agenda') loadAgenda();
        else if (activeTab === 'chat') loadChat();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onVisibilityChange);

    // Sondeo de bajo impacto cada 45s cuando la pantalla está activa
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        if (activeTab === 'agenda') loadAgenda();
        else if (activeTab === 'chat') loadChat();
      }
    }, 45000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onVisibilityChange);
      clearInterval(pollInterval);
    };
  }, [session, activeTab]);

  const loadAgenda = async () => {
    setAgendaLoading(true);
    try {
      const res = await getStaffTodayAgenda();
      setAgenda(res.appointments);
      setAgendaStats(res.stats);
    } catch (err: any) {
      showFeedback(err.message || 'Error cargando agenda', 'error');
    } finally {
      setAgendaLoading(false);
    }
  };

  const loadAvailability = async () => {
    setAvailLoading(true);
    try {
      const res = await staffGetAvailability();
      setWeeklySchedule(res.weeklySchedule || {});
      setUnavailabilities(res.unavailabilities || []);
    } catch (err: any) {
      showFeedback(err.message || 'Error cargando disponibilidad', 'error');
    } finally {
      setAvailLoading(false);
    }
  };

  const loadChat = async () => {
    setChatLoading(true);
    try {
      const res = await getStaffChatMessages();
      setMessages(res);
    } catch (err: any) {
      showFeedback(err.message || 'Error cargando chat', 'error');
    } finally {
      setChatLoading(false);
    }
  };

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      if (loginMode === 'phone') {
        const res = await staffLoginWithPhone({
          phone: loginPhone,
          password: loginPassword,
        });
        if (res.success && res.session) {
          setSession(res.session);
        }
      } else {
        const res = await staffLogin(loginCode, loginPin);
        if (res.success && res.session) {
          setSession(res.session);
        }
      }
    } catch (err: any) {
      setLoginError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoginLoading(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    await staffLogout();
    setSession(null);
  };

  // Registrar Walk-in (Cliente en local)
  const handleWalkIn = async () => {
    try {
      await staffRegisterWalkIn(40, 'Cliente en el local');
      showFeedback('✅ Cliente en el local registrado (40 min bloqueados).');
      loadAgenda();
    } catch (err: any) {
      showFeedback(err.message || 'Error al registrar cliente en sala', 'error');
    }
  };

  // Reportar retraso de 15 min
  const handleReportDelay = async (apptId: string) => {
    try {
      const res = await staffReportDelay(apptId, 15);
      showFeedback(`⏳ Aviso registrado: +15 min de retraso. ${res.nextContact ? `Avisado a ${res.nextContact.name || 'siguiente cliente'}` : ''}`);
      loadAgenda();
    } catch (err: any) {
      showFeedback(err.message || 'Error registrando retraso', 'error');
    }
  };

  // Marcar estado (En atención o Finalizado)
  const handleUpdateStatus = async (apptId: string, newStatus: 'in_progress' | 'completed') => {
    try {
      await staffUpdateAppointmentStatus(apptId, newStatus);
      showFeedback(newStatus === 'completed' ? '🎉 Servicio finalizado.' : '✂️ Servicio iniciado.');
      loadAgenda();
    } catch (err: any) {
      showFeedback(err.message || 'Error actualizando estado', 'error');
    }
  };

  // Guardar bloqueo de horario
  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBlockSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const startISO = `${today}T${blockStartTime}:00-05:00`;
      const endISO = `${today}T${blockEndTime}:00-05:00`;

      const res = await staffBlockTime({
        startTime: startISO,
        endTime: endISO,
        reason: blockReason,
        isAllDay: blockIsAllDay,
      });

      showFeedback(`⚠️ Bloqueo registrado exitosamente. ${res.affectedCount > 0 ? `${res.affectedCount} citas afectadas notadas.` : ''}`);
      setIsBlockModalOpen(false);
      loadAvailability();
    } catch (err: any) {
      showFeedback(err.message || 'Error registrando bloqueo', 'error');
    } finally {
      setBlockSubmitting(false);
    }
  };

  // Eliminar bloqueo
  const handleDeleteBlock = async (blockId: string) => {
    try {
      await staffDeleteBlock(blockId);
      showFeedback('Bloqueo eliminado. Horario liberado.');
      loadAvailability();
    } catch (err: any) {
      showFeedback(err.message || 'Error eliminando bloqueo', 'error');
    }
  };

  // Enviar mensaje de chat
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || sendingMsg) return;

    setSendingMsg(true);
    try {
      await sendStaffChatMessage(chatInput);
      setChatInput('');
      loadChat();
    } catch (err: any) {
      showFeedback(err.message || 'Error enviando mensaje', 'error');
    } finally {
      setSendingMsg(false);
    }
  };

  // ==========================================
  // VISTA 1: LOGIN CON CÓDIGO + PIN
  // ==========================================
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center px-4 py-8 max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#0052FF] rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-[#0052FF]/30 mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Portal Colaboradores</h1>
          <p className="text-slate-400 text-xs mt-1">
            Acceso móvil para barberos, profesores y especialistas
          </p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
          {/* Selector de Modo de Acceso */}
          <div className="flex bg-slate-900 p-1 rounded-xl mb-4 text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setLoginMode('phone'); setLoginError(null); }}
              className={`flex-1 py-1.5 rounded-lg transition ${
                loginMode === 'phone'
                  ? 'bg-[#0052FF] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Celular + Contraseña
            </button>
            <button
              type="button"
              onClick={() => { setLoginMode('code'); setLoginError(null); }}
              className={`flex-1 py-1.5 rounded-lg transition ${
                loginMode === 'code'
                  ? 'bg-[#0052FF] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Código + PIN
            </button>
          </div>

          {loginError && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {loginMode === 'phone' ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Número de Celular
                  </label>
                  <input
                    type="tel"
                    required
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="Ej. 3001234567 o +57300..."
                    className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-transparent placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tu Contraseña (o PIN)
                  </label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-transparent placeholder:text-slate-600"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Código de Empresa
                  </label>
                  <input
                    type="text"
                    required
                    value={loginCode}
                    onChange={(e) => setLoginCode(e.target.value.toUpperCase())}
                    placeholder="Ej. BARB01 o ACAD26"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700 text-white font-mono font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-transparent text-sm placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tu PIN de 4 Dígitos
                  </label>
                  <input
                    type="password"
                    required
                    maxLength={6}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value)}
                    placeholder="••••"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700 text-white font-mono font-black text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-transparent placeholder:text-slate-600"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3.5 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-50 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-[#0052FF]/20 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {loginLoading ? 'Verificando...' : 'Entrar a mi Agenda'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-700/60 text-center space-y-2">
            <span className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              Sesión cifrada con AES-256 (30 días)
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VISTA 2: APLICACIÓN MÓVIL DEL COLABORADOR
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col max-w-md mx-auto relative pb-20 select-none">
      {/* Toast de feedback */}
      {feedback && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-bold shadow-xl border animate-in fade-in slide-in-from-top-4 duration-200 ${
          feedback.type === 'error'
            ? 'bg-rose-950 text-rose-200 border-rose-800'
            : 'bg-emerald-950 text-emerald-200 border-emerald-800'
        }`}>
          {feedback.text}
        </div>
      )}

      {/* Barra Superior de Cabecera */}
      <header className="p-4 bg-slate-900 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0052FF] to-indigo-500 flex items-center justify-center text-white font-black text-sm shadow-md">
              {session.specialistName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="font-bold text-sm text-white leading-tight">{session.specialistName}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-slate-400 font-medium">{session.specialty}</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                  {session.companyCode}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Cerrar sesión en este dispositivo"
            className="p-2 text-slate-400 hover:text-rose-400 transition rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Contenido Principal por Pestaña */}
      <main className="flex-1 p-4 overflow-y-auto">
        {/* ==================================================== */}
        {/* PESTAÑA 1: AGENDA DE HOY                             */}
        {/* ==================================================== */}
        {activeTab === 'agenda' && (
          <div className="space-y-4">
            {/* Banner de Resumen Numérico Minimalista */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-900/80 p-2.5 rounded-2xl border border-slate-800/80">
                <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Hoy</span>
                <span className="text-lg font-black text-white">{agendaStats.totalToday}</span>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-2xl border border-slate-800/80">
                <span className="text-[9px] text-emerald-400 font-bold block uppercase tracking-wider">Listas</span>
                <span className="text-lg font-black text-emerald-400">{agendaStats.completedToday}</span>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-2xl border border-slate-800/80">
                <span className="text-[9px] text-amber-400 font-bold block uppercase tracking-wider">Pendientes</span>
                <span className="text-lg font-black text-amber-400">{agendaStats.pendingToday}</span>
              </div>
            </div>

            {/* 🌟 HERO CARD: ESTADO EN VIVO (Glanceable Status) */}
            {(() => {
              const inProgressAppt = agenda.find((a) => a.status === 'in_progress');
              const waitingInLobbyAppt = agenda.find(
                (a) => a.status === 'confirmed' && (a.notes?.includes('[Llegó') || a.notes?.includes('[En Sala'))
              );
              const nextUpcomingAppt = agenda.find(
                (a) => a.status === 'confirmed' && new Date(a.startTime).getTime() >= Date.now() - 15 * 60 * 1000
              );

              // 1. Atendiendo en este instante
              if (inProgressAppt) {
                const start = new Date(inProgressAppt.startTime);
                const end = new Date(inProgressAppt.endTime);
                const now = Date.now();
                const totalDuration = Math.max(1, end.getTime() - start.getTime());
                const elapsed = Math.max(0, Math.min(totalDuration, now - start.getTime()));
                const progressPercent = Math.min(100, Math.round((elapsed / totalDuration) * 100));

                const formatTime = (d: Date) =>
                  d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });

                return (
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/70 via-slate-900 to-slate-900 border border-emerald-500/40 shadow-xl shadow-emerald-950/40 space-y-3 transition-all duration-300 ease-out">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10B981]" />
                        <span className="text-[11px] font-black text-emerald-400 uppercase tracking-wider">
                          Atendiendo Ahora
                        </span>
                      </div>
                      <span className="text-[11px] font-mono font-semibold text-slate-300">
                        {formatTime(start)} - {formatTime(end)}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl font-black text-white tracking-tight leading-tight">
                        {inProgressAppt.clientName}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-300">
                        <span className="font-semibold text-emerald-300">{inProgressAppt.serviceName}</span>
                        {inProgressAppt.roomName && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-slate-400 flex items-center gap-1 font-medium">
                              <MapPin className="w-3 h-3 text-purple-400" />
                              {inProgressAppt.roomName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Barra de progreso visual sutil y continua */}
                    <div className="space-y-1.5 pt-1">
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                        <span>{inProgressAppt.durationMinutes} min de sesión</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleReportDelay(inProgressAppt.id)}
                            className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 active:scale-95"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>+15m Retraso</span>
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(inProgressAppt.id, 'completed')}
                            className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 active:scale-95"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Listo</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // 2. Cliente esperando en recepción
              if (waitingInLobbyAppt) {
                return (
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/60 via-slate-900 to-slate-900 border border-amber-500/40 shadow-xl shadow-amber-950/30 space-y-2.5 transition-all duration-300 ease-out">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_#F59E0B]" />
                        <span className="text-[11px] font-black text-amber-400 uppercase tracking-wider">
                          En Sala de Espera
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-amber-300">Llegó a recepción</span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-black text-white">{waitingInLobbyAppt.clientName}</h3>
                        <span className="text-xs text-slate-400 block">{waitingInLobbyAppt.serviceName}</span>
                      </div>
                      <button
                        onClick={() => handleUpdateStatus(waitingInLobbyAppt.id, 'in_progress')}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow transition active:scale-95"
                      >
                        Pasar
                      </button>
                    </div>
                  </div>
                );
              }

              // 3. Libre en este momento con próximo turno
              if (nextUpcomingAppt) {
                const start = new Date(nextUpcomingAppt.startTime);
                const formatTime = (d: Date) =>
                  d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });

                return (
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-md space-y-2.5 transition-all duration-300 ease-out">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Coffee className="w-4 h-4 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                          Libre en este momento
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-[#00D2FF]">
                        Próximo: {formatTime(start)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">{nextUpcomingAppt.clientName}</span>
                        <span className="text-[11px] text-slate-400 block">{nextUpcomingAppt.serviceName}</span>
                      </div>
                      {nextUpcomingAppt.roomName && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
                          {nextUpcomingAppt.roomName}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              // 4. Todo listo por hoy
              return (
                <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 text-center space-y-1">
                  <Sparkles className="w-5 h-5 text-emerald-400 mx-auto" />
                  <span className="text-xs font-bold text-white block">Jornada al Día</span>
                  <span className="text-[11px] text-slate-400 block">No tienes más turnos pendientes por hoy.</span>
                </div>
              );
            })()}

            {/* Botón Rápido: Cliente en el Local (Adaptable: Oculto para Academias/Clínicas) */}
            {session.enabledModules?.walk_in_booking !== false && (
              <div className="p-3 bg-gradient-to-r from-blue-950/30 to-indigo-950/30 border border-blue-900/40 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-white block">¿Llegó cliente sin cita previa?</span>
                  <span className="text-[10px] text-slate-400 block">Bloquea tu horario de inmediato (40 min)</span>
                </div>
                <button
                  onClick={handleWalkIn}
                  className="px-3 py-1.5 bg-[#0052FF] hover:bg-[#0047E0] text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-1 cursor-pointer flex-shrink-0 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>En local</span>
                </button>
              </div>
            )}

            {/* Timeline Cronológico Minimalista y Limpio */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#0052FF]" />
                  Cronograma de Hoy
                </span>
                <span className="text-[10px] text-slate-500 font-normal lowercase">toca para ver detalles</span>
              </div>

              {agendaLoading ? (
                <div className="py-12 text-center text-xs text-slate-500">Cargando turnos...</div>
              ) : agenda.length === 0 ? (
                <div className="py-12 text-center bg-slate-900/50 rounded-2xl border border-slate-800 p-6 space-y-2">
                  <Coffee className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">No tienes más citas agendadas hoy</p>
                  <p className="text-xs text-slate-500">
                    Cualquier nuevo agendamiento por WhatsApp te notificará automáticamente aquí.
                  </p>
                </div>
              ) : (
                agenda.map((appt) => {
                  const startTime = new Date(appt.startTime);
                  const endTime = new Date(appt.endTime);
                  const timeFormatted = `${startTime.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${endTime.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                  const isDone = appt.status === 'completed';
                  const inProgress = appt.status === 'in_progress';
                  const isExpanded = expandedApptId === appt.id;

                  return (
                    <div
                      key={appt.id}
                      onClick={() => setExpandedApptId(isExpanded ? null : appt.id)}
                      className={`p-3 rounded-2xl border transition-all duration-200 cursor-pointer ${
                        isDone
                          ? 'bg-slate-900/30 border-slate-800/40 opacity-55'
                          : inProgress
                          ? 'bg-blue-950/40 border-blue-600/60 shadow-lg shadow-blue-950/30 ring-1 ring-blue-500/30'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700/80 active:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Columna Hora */}
                          <div className="text-left flex-shrink-0">
                            <span className="text-xs font-mono font-bold text-white block">
                              {startTime.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono block">
                              {appt.durationMinutes}m
                            </span>
                          </div>

                          <div className="h-7 w-[1px] bg-slate-800 flex-shrink-0" />

                          {/* Info Principal */}
                          <div className="min-w-0">
                            <span className="text-xs font-black text-white block truncate leading-tight">
                              {appt.clientName}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400">
                              <span className="truncate">{appt.serviceName}</span>
                              {appt.roomName && (
                                <>
                                  <span className="text-slate-600">•</span>
                                  <span className="text-purple-400 font-medium truncate">{appt.roomName}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Badge de Estado Sutil */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              isDone
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : inProgress
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {isDone ? 'Listo' : inProgress ? 'En Atención' : 'Confirmado'}
                          </span>
                          <ChevronRight
                            className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${
                              isExpanded ? 'rotate-90' : ''
                            }`}
                          />
                        </div>
                      </div>

                      {/* Sección Plegable Suave con Acciones Opcionales */}
                      {isExpanded && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-2.5 animate-in fade-in duration-200"
                        >
                          {appt.notes && (
                            <p className="text-[11px] text-slate-300 bg-slate-950/60 p-2 rounded-xl border border-slate-800/60">
                              💬 {appt.notes}
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-1">
                            {appt.clientPhone ? (
                              <a
                                href={`tel:${appt.clientPhone}`}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition active:scale-95"
                              >
                                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Llamar</span>
                              </a>
                            ) : <div />}

                            {!isDone && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleReportDelay(appt.id)}
                                  className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold rounded-xl border border-amber-500/20 transition active:scale-95 flex items-center gap-1"
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>+15m</span>
                                </button>
                                {!inProgress ? (
                                  <button
                                    onClick={() => handleUpdateStatus(appt.id, 'in_progress')}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition active:scale-95"
                                  >
                                    Atender
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleUpdateStatus(appt.id, 'completed')}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition active:scale-95"
                                  >
                                    Listo ✓
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* PESTAÑA 2: DISPONIBILIDAD Y BLOQUEOS FLEXIBLES       */}
        {/* ==================================================== */}
        {activeTab === 'disponibilidad' && (
          <div className="space-y-4">
            {/* Botón de Emergencia / Bloqueo Flexible */}
            <div className="p-4 bg-rose-950/30 border border-rose-900/60 rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <h4 className="text-xs font-bold text-white">Bloqueo Horario Flexible</h4>
              </div>
              <p className="text-[11px] text-slate-300 leading-tight">
                ¿Tienes una cita médica o diligencia imprevista? Bloquea las horas que necesitas para que la IA no agende a nadie.
              </p>
              <button
                onClick={() => setIsBlockModalOpen(true)}
                className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition shadow-md shadow-rose-950/50 cursor-pointer"
              >
                Bloquear Horas / Día
              </button>
            </div>

            {/* Listado de Bloqueos Activos */}
            {unavailabilities.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Bloqueos Activos
                </h4>
                {unavailabilities.map((u) => {
                  const s = new Date(u.startTime);
                  const e = new Date(u.endTime);
                  return (
                    <div
                      key={u.id}
                      className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-white block">
                          {u.isAllDay ? 'Todo el día' : `${s.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${e.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })}`}
                        </span>
                        <span className="text-[10px] text-slate-400">{u.reason || 'Sin motivo'}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteBlock(u.id)}
                        className="text-slate-400 hover:text-rose-400 p-1.5 transition"
                        title="Liberar horario"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Horario Semanal Habitual */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Mi Horario Semanal Habitual
              </h4>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800 text-xs">
                {DAYS_OF_WEEK.map((day) => {
                  const dayConfig = weeklySchedule[day.key] || { enabled: false, slots: [] };
                  const isEnabled = dayConfig.enabled;
                  const firstSlot = dayConfig.slots?.[0] || { start: '09:00', end: '18:00' };

                  return (
                    <div key={day.key} className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => {
                            const updated = {
                              ...weeklySchedule,
                              [day.key]: {
                                enabled: e.target.checked,
                                slots: e.target.checked
                                  ? [{ start: firstSlot.start, end: firstSlot.end }]
                                  : [],
                              },
                            };
                            setWeeklySchedule(updated);
                          }}
                          className="rounded text-[#0052FF] focus:ring-[#0052FF] bg-slate-800 border-slate-700"
                        />
                        <span className={`font-semibold ${isEnabled ? 'text-white' : 'text-slate-500'}`}>
                          {day.label}
                        </span>
                      </div>

                      {isEnabled ? (
                        <div className="flex items-center gap-1 font-mono text-[11px] text-slate-300">
                          <span>{firstSlot.start}</span>
                          <span className="text-slate-500">-</span>
                          <span>{firstSlot.end}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-600 font-semibold uppercase">Descanso</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={async () => {
                  try {
                    await staffSaveWeeklySchedule(weeklySchedule);
                    showFeedback('Disponibilidad semanal guardada con éxito.');
                  } catch (err: any) {
                    showFeedback(err.message || 'Error guardando horario', 'error');
                  }
                }}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition border border-slate-700 mt-2 cursor-pointer"
              >
                Guardar Horario Semanal
              </button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* PESTAÑA 3: CHAT INTERNO CON LA SEDE / ADMINISTRACIÓN */}
        {/* ==================================================== */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-[calc(100vh-140px)]">
            <div className="flex-1 overflow-y-auto space-y-3 pb-3">
              {chatLoading ? (
                <div className="py-12 text-center text-xs text-slate-500">Cargando mensajes...</div>
              ) : messages.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No hay mensajes registrados. Escribe abajo para hablar con el mostrador o recepción.
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.senderType === 'specialist';
                  const time = new Date(m.createdAt).toLocaleTimeString('es-CO', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  });

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                          isMe
                            ? 'bg-[#0052FF] text-white rounded-br-xs'
                            : 'bg-slate-800 text-slate-100 rounded-bl-xs border border-slate-700/80'
                        }`}
                      >
                        {!isMe && (
                          <span className="text-[10px] font-bold text-purple-300 block mb-0.5">
                            {m.senderName || 'Administración'}
                          </span>
                        )}
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                      <span className="text-[9px] text-slate-500 mt-1 px-1 font-mono">{time}</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input bar de chat */}
            <form onSubmit={handleSendMessage} className="pt-2 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Escribe al mostrador / administración..."
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
              />
              <button
                type="submit"
                disabled={sendingMsg || !chatInput.trim()}
                className="px-3.5 py-2 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Modal de Bloqueo Horario Flexible */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xs w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Registrar Bloqueo de Horario
            </h3>

            <form onSubmit={handleSaveBlock} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Motivo
                </label>
                <select
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="Cita médica">Cita médica</option>
                  <option value="Trámite personal / bancario">Trámite personal / bancario</option>
                  <option value="Almuerzo / Descanso">Almuerzo / Descanso</option>
                  <option value="Emergencia familiar">Emergencia familiar</option>
                  <option value="Bloqueo temporal">Otro motivo</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Hora Inicio
                  </label>
                  <input
                    type="time"
                    value={blockStartTime}
                    onChange={(e) => setBlockStartTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Hora Fin
                  </label>
                  <input
                    type="time"
                    value={blockEndTime}
                    onChange={(e) => setBlockEndTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blockIsAllDay}
                  onChange={(e) => setBlockIsAllDay(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 bg-slate-800 border-slate-700"
                />
                <span className="text-xs text-slate-300">Bloquear el día completo</span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBlockModalOpen(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={blockSubmitting}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition"
                >
                  {blockSubmitting ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barra Inferior de Navegación Móvil (Tab Bar) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-900 border-t border-slate-800 flex justify-around p-2 z-40">
        <button
          onClick={() => setActiveTab('agenda')}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition cursor-pointer ${
            activeTab === 'agenda' ? 'text-[#0052FF] font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-5 h-5" />
          <span className="text-[10px]">Agenda</span>
        </button>

        <button
          onClick={() => setActiveTab('disponibilidad')}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition cursor-pointer ${
            activeTab === 'disponibilidad' ? 'text-[#0052FF] font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[10px]">Horarios</span>
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition cursor-pointer ${
            activeTab === 'chat' ? 'text-[#0052FF] font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px]">Chat Sede</span>
        </button>
      </nav>
    </div>
  );
}

