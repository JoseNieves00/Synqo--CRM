'use client';

import React, { useState, useTransition, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Users,
  Coffee,
  Phone,
  DoorOpen,
  Plus,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  PlayCircle,
  HelpCircle,
  RefreshCw,
  Search,
  Sparkles,
  ShieldCheck,
  Check,
  X,
  Zap,
  MapPin,
} from 'lucide-react';
import {
  createQuickAppointmentAdmin,
  updateAppointmentStatusAdmin,
  cancelAppointmentAdmin,
  triggerManualReminderCheck,
  reportDelayAdmin,
  reassignAppointmentAdmin,
} from '@/app/actions/calendar-admin';

interface Specialist {
  id: string;
  name: string;
  phone: string | null;
  specialty: string | null;
  access_pin: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  is_active: boolean;
}

interface Room {
  id: string;
  name: string;
  capacity: number;
  description: string | null;
  is_active: boolean;
}

interface ServiceItem {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  category: string | null;
  is_active: boolean;
}

interface AppointmentItem {
  id: string;
  serviceId: string | null;
  serviceName: string;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  bookedVia: string;
  rescheduleCount: number;
  notes: string | null;
  clientNotifiedDelayAt: string | null;
  confirmationStatus: string | null;
  paymentStatus: string | null;
  amountPaid: number;
  client: { id: string; name: string; phone: string } | null;
  specialist: { id: string; name: string; specialty: string | null } | null;
  room: { id: string; name: string } | null;
}

interface CalendarViewClientProps {
  initialAppointments: AppointmentItem[];
  specialists: Specialist[];
  rooms: Room[];
  services: ServiceItem[];
  organization: {
    id: string;
    name: string;
    company_code: string;
  };
}

export function CalendarViewClient({
  initialAppointments,
  specialists,
  rooms,
  services,
  organization,
}: CalendarViewClientProps) {
  const [appointments, setAppointments] = useState<AppointmentItem[]>(initialAppointments);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'list' | 'team'>('day');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<string>('all');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();
  const [isRunningCheck, setIsRunningCheck] = useState(false);

  // Modales
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentItem | null>(null);

  const handleRunCheck = async () => {
    setIsRunningCheck(true);
    try {
      const res = await triggerManualReminderCheck();
      alert(`⚡ Verificación completada:\n• Recordatorios enviados: ${res.remindersSent}\n• Citas auto-canceladas (sin confirmación 8h): ${res.autoCancelledCount}\n• Citas procesadas: ${res.processedCount}`);
    } catch (err: any) {
      alert(`Error al verificar recordatorios: ${err.message}`);
    } finally {
      setIsRunningCheck(false);
    }
  };

  // Formulario de nueva cita rápida
  const [formData, setFormData] = useState({
    contactName: '',
    contactPhone: '',
    studentName: '',
    recurringWeeks: 1,
    serviceId: services[0]?.id || '',
    specialistId: 'auto',
    roomId: 'auto',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    notes: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Filtrado de citas
  const filteredAppointments = useMemo(() => {
    return appointments.filter((appt) => {
      // Filtro de especialista
      if (selectedSpecialistId !== 'all' && appt.specialist?.id !== selectedSpecialistId) {
        return false;
      }
      // Filtro de salón
      if (selectedRoomId !== 'all' && appt.room?.id !== selectedRoomId) {
        return false;
      }
      // Búsqueda de texto (cliente o servicio)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const clientMatch = appt.client?.name.toLowerCase().includes(query) || appt.client?.phone.includes(query);
        const serviceMatch = appt.serviceName.toLowerCase().includes(query);
        const specMatch = appt.specialist?.name.toLowerCase().includes(query);
        if (!clientMatch && !serviceMatch && !specMatch) return false;
      }
      return true;
    });
  }, [appointments, selectedSpecialistId, selectedRoomId, searchQuery]);

  // Citas para la vista del día seleccionado
  const dayAppointments = useMemo(() => {
    const targetDateStr = currentDate.toISOString().split('T')[0];
    return filteredAppointments.filter((appt) => {
      const apptDateStr = new Date(appt.startTime).toISOString().split('T')[0];
      return apptDateStr === targetDateStr;
    });
  }, [filteredAppointments, currentDate]);

  // Navegación de fechas
  const handlePrevDate = () => {
    const next = new Date(currentDate);
    if (viewMode === 'day') next.setDate(next.getDate() - 1);
    else if (viewMode === 'week') next.setDate(next.getDate() - 7);
    setCurrentDate(next);
  };

  const handleNextDate = () => {
    const next = new Date(currentDate);
    if (viewMode === 'day') next.setDate(next.getDate() + 1);
    else if (viewMode === 'week') next.setDate(next.getDate() + 7);
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Creación de cita rápida
  const handleCreateAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.contactPhone || !formData.serviceId) {
      setFormError('Por favor ingresa el teléfono del cliente y el servicio.');
      return;
    }

    startTransition(async () => {
      try {
        const startIso = new Date(`${formData.date}T${formData.time}:00`).toISOString();
        const res = await createQuickAppointmentAdmin({
          contactName: formData.contactName,
          contactPhone: formData.contactPhone,
          serviceId: formData.serviceId,
          specialistId: formData.specialistId,
          roomId: formData.roomId,
          startTime: startIso,
          notes: formData.notes,
          studentName: formData.studentName,
          recurringWeeks: Number(formData.recurringWeeks) || 1,
        });

        if (res.appointment) {
          const serviceObj = services.find((s) => s.id === formData.serviceId);
          const specObj = specialists.find((s) => s.id === res.appointment.specialist_id);
          const roomObj = rooms.find((r) => r.id === res.appointment.room_id);

          const newItem: AppointmentItem = {
            id: res.appointment.id,
            serviceId: res.appointment.service_id,
            serviceName: res.appointment.service_name,
            durationMinutes: res.appointment.duration_minutes,
            startTime: res.appointment.start_time,
            endTime: res.appointment.end_time,
            status: 'confirmed',
            bookedVia: 'manual_reception',
            rescheduleCount: 0,
            notes: res.appointment.notes,
            clientNotifiedDelayAt: null,
            confirmationStatus: 'confirmed',
            paymentStatus: 'pending',
            amountPaid: 0,
            client: {
              id: res.appointment.contact_id || '',
              name: formData.studentName ? `${formData.studentName} (${formData.contactName || 'Acudiente'})` : (formData.contactName || 'Cliente Mostrador'),
              phone: formData.contactPhone,
            },
            specialist: specObj ? { id: specObj.id, name: specObj.name, specialty: specObj.specialty } : null,
            room: roomObj ? { id: roomObj.id, name: roomObj.name } : null,
          };

          setAppointments((prev) => [newItem, ...prev]);
          setIsNewModalOpen(false);
          setFormData({
            contactName: '',
            contactPhone: '',
            studentName: '',
            recurringWeeks: 1,
            serviceId: services[0]?.id || '',
            specialistId: 'auto',
            roomId: 'auto',
            date: new Date().toISOString().split('T')[0],
            time: '10:00',
            notes: '',
          });
        }
      } catch (err: any) {
        setFormError(err.message || 'Error al agendar cita');
      }
    });
  };

  // Cambio de estado de cita
  const handleUpdateStatus = (
    appointmentId: string,
    newStatus: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
  ) => {
    startTransition(async () => {
      try {
        await updateAppointmentStatusAdmin(appointmentId, newStatus);
        setAppointments((prev) =>
          prev.map((a) => (a.id === appointmentId ? { ...a, status: newStatus } : a))
        );
        if (selectedAppointment && selectedAppointment.id === appointmentId) {
          setSelectedAppointment({ ...selectedAppointment, status: newStatus });
        }
      } catch (err: any) {
        alert(err.message || 'Error al actualizar estado');
      }
    });
  };

  // Check-In de Recepción: Cliente llegó físicamente a la sala
  const handleMarkArrival = (appointmentId: string) => {
    startTransition(async () => {
      try {
        const currentAppt = appointments.find((a) => a.id === appointmentId);
        const existingNotes = currentAppt?.notes || '';
        if (existingNotes.includes('[Llegó')) return;
        const timeNow = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
        const newNotes = `[Llegó a Recepción ${timeNow}] ${existingNotes}`.trim();
        await updateAppointmentStatusAdmin(appointmentId, currentAppt?.status || 'confirmed', newNotes);
        setAppointments((prev) =>
          prev.map((a) => (a.id === appointmentId ? { ...a, notes: newNotes } : a))
        );
        if (selectedAppointment && selectedAppointment.id === appointmentId) {
          setSelectedAppointment({ ...selectedAppointment, notes: newNotes });
        }
      } catch (err: any) {
        alert(err.message || 'Error registrando llegada');
      }
    });
  };

  // Compartir agenda del día por WhatsApp al colaborador (Respaldo si no usa la app o se le descargó el móvil)
  const handleShareSpecialistAgendaWhatsApp = () => {
    if (selectedSpecialistId === 'all') return;
    const spec = specialists.find((s) => s.id === selectedSpecialistId);
    if (!spec) return;

    const specAppts = dayAppointments
      .filter((a) => a.specialist?.id === spec.id && a.status !== 'cancelled')
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    const dateStr = currentDate.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });

    if (specAppts.length === 0) {
      alert(`No hay citas programadas para ${spec.name} el ${dateStr}.`);
      return;
    }

    let text = `📅 *Agenda de Hoy - ${spec.name}*\n📆 ${dateStr.toUpperCase()}\n\n`;
    specAppts.forEach((a, idx) => {
      const time = formatTime(a.startTime);
      const roomStr = a.room?.name ? ` [${a.room.name}]` : '';
      text += `${idx + 1}. *${time}* - ${a.client?.name || 'Cliente'} • ${a.serviceName}${roomStr}\n`;
    });
    text += `\nTotal: ${specAppts.length} turnos programados.`;

    const cleanPhone = spec.phone?.replace(/[^0-9]/g, '') || '';
    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(waUrl, '_blank');
  };

  // Notificar retraso de 15 min desde recepción al siguiente cliente
  const handleAdminReportDelay = (appointmentId: string) => {
    startTransition(async () => {
      try {
        const res = await reportDelayAdmin(appointmentId, 15);
        if (res.nextContact) {
          const clientName = res.nextContact.name || 'el siguiente cliente';
          const confirmMsg = `⏳ Retraso de 15 min registrado en el sistema.\nSiguiente cliente en turno: ${clientName} (${res.nextContact.phone}).\n\n¿Deseas abrir WhatsApp para enviarle el aviso de cortesía?`;
          if (confirm(confirmMsg) && res.nextContact.phone) {
            const clean = res.nextContact.phone.replace(/[^0-9]/g, '');
            const msg = `Hola ${clientName}, te escribimos para avisarte que tenemos una demora estimada de 15 minutos en el turno anterior. Puedes llegar un poco más tarde para que no tengas que esperar en sala. ¡Muchas gracias!`;
            window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
          }
        } else {
          alert('⏳ Retraso de 15 min registrado. No hay clientes posteriores agendados con este colaborador.');
        }
      } catch (err: any) {
        alert(err.message || 'Error reportando retraso');
      }
    });
  };

  // Reasignar cita a otro colaborador disponible ante un imprevisto
  const handleAdminReassign = (appointmentId: string, newSpecialistId: string) => {
    if (!newSpecialistId) return;
    startTransition(async () => {
      try {
        const res = await reassignAppointmentAdmin(appointmentId, newSpecialistId);
        const specObj = specialists.find((s) => s.id === newSpecialistId);
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === appointmentId
              ? { ...a, specialist: specObj ? { id: specObj.id, name: specObj.name, specialty: specObj.specialty } : null }
              : a
          )
        );
        if (selectedAppointment && selectedAppointment.id === appointmentId) {
          setSelectedAppointment({
            ...selectedAppointment,
            specialist: specObj ? { id: specObj.id, name: specObj.name, specialty: specObj.specialty } : null,
          });
        }
        alert(`✅ Cita reasignada exitosamente a ${res.specialistName}.`);
      } catch (err: any) {
        alert(err.message || 'Error al reasignar cita');
      }
    });
  };

  // Cancelación
  const handleCancelAppointment = (appointmentId: string) => {
    if (!confirm('¿Seguro que deseas cancelar esta cita? Se liberará el horario de inmediato.')) return;
    startTransition(async () => {
      try {
        await cancelAppointmentAdmin(appointmentId, 'Cancelada por el administrador');
        setAppointments((prev) =>
          prev.map((a) => (a.id === appointmentId ? { ...a, status: 'cancelled' } : a))
        );
        setSelectedAppointment(null);
      } catch (err: any) {
        alert(err.message || 'Error al cancelar cita');
      }
    });
  };

  // Helper de badges de estado
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Confirmada
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 animate-pulse">
            <PlayCircle className="w-3 h-3" /> En atención
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-300 border border-slate-500/30">
            <Check className="w-3 h-3" /> Finalizada
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" /> Cancelada
          </span>
        );
      case 'no_show':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" /> No asistió
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30">
            <Clock className="w-3 h-3" /> Pendiente
          </span>
        );
    }
  };

  // Formato de hora legible
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0E14] text-slate-100">
      {/* Header Superior del Calendario */}
      <div className="border-b border-[#1E2433] bg-[#0E121B] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00D2FF]/10 border border-[#00D2FF]/30 flex items-center justify-center text-[#00D2FF]">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Agenda & Calendario Nativo</h1>
              <p className="text-xs text-slate-400">
                Gestión multi-especialista y salones sin colisiones
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Switcher de Vista */}
          <div className="flex items-center bg-[#131722] border border-[#232A3B] rounded-lg p-1 text-xs font-medium">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-md transition ${
                viewMode === 'day'
                  ? 'bg-[#0052FF] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Día
            </button>
            <button
              onClick={() => setViewMode('team')}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                viewMode === 'team'
                  ? 'bg-[#0052FF] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Colaboradores</span>
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-md transition ${
                viewMode === 'week'
                  ? 'bg-[#0052FF] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md transition ${
                viewMode === 'list'
                  ? 'bg-[#0052FF] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Lista
            </button>
          </div>

          {/* Botón Verificación 8h / Recordatorios */}
          <button
            onClick={handleRunCheck}
            disabled={isRunningCheck}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#131722] hover:bg-[#1A2030] border border-[#232A3B] text-slate-300 hover:text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
            title="Verificar y enviar recordatorios con curfew 20:00 y auto-cancelar citas a las 8 horas"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-400 ${isRunningCheck ? 'animate-spin' : ''}`} />
            <span>{isRunningCheck ? 'Verificando...' : 'Verificar 8h / Recordatorios'}</span>
          </button>

          {/* Botón Nueva Cita Rápida */}
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#0052FF] to-[#00D2FF] text-white text-xs font-semibold rounded-lg shadow-md shadow-[#0052FF]/20 hover:opacity-95 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Agendar Cita Rápida</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros y Navegación de Fecha */}
      <div className="border-b border-[#1E2433] bg-[#0E121B]/60 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Controles de Fecha */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevDate}
            className="p-1.5 rounded-md bg-[#131722] border border-[#232A3B] text-slate-300 hover:text-white hover:bg-[#1A2030] transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleToday}
            className="px-2.5 py-1 rounded-md bg-[#131722] border border-[#232A3B] text-slate-300 hover:text-white transition font-medium"
          >
            Hoy
          </button>
          <button
            onClick={handleNextDate}
            className="p-1.5 rounded-md bg-[#131722] border border-[#232A3B] text-slate-300 hover:text-white hover:bg-[#1A2030] transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <span className="font-semibold text-slate-200 capitalize ml-2 text-sm">
            {currentDate.toLocaleDateString('es-CO', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>

        {/* Filtros Dropdown */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar cliente, servicio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-[#00D2FF]"
            />
          </div>

          {/* Filtro Especialista */}
          <div className="flex items-center gap-1.5">
            <select
              value={selectedSpecialistId}
              onChange={(e) => setSelectedSpecialistId(e.target.value)}
              className="px-2.5 py-1.5 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
            >
              <option value="all">Todos los Especialistas ({specialists.length})</option>
              {specialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.specialty || 'General'})
                </option>
              ))}
            </select>

            {selectedSpecialistId !== 'all' && (
              <button
                type="button"
                onClick={handleShareSpecialistAgendaWhatsApp}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition"
                title="Enviar la lista de citas de hoy directamente al WhatsApp personal del especialista"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Enviar por WhatsApp</span>
              </button>
            )}
          </div>

          {/* Filtro Salón */}
          {rooms.length > 0 && (
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="px-2.5 py-1.5 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
            >
              <option value="all">Todos los Salones ({rooms.length})</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (Aforo: {r.capacity})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Contenido Principal de Calendario */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Vista Día */}
        {viewMode === 'day' && (
          <div className="space-y-3">
            {dayAppointments.length === 0 ? (
              <div className="text-center py-16 bg-[#0E121B] rounded-2xl border border-[#1E2433] p-8">
                <CalendarIcon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-white">No hay citas para este día</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  No hay reservas agendadas con los filtros seleccionados. Puedes crear una nueva cita rápida o esperar las reservas automáticas de la IA.
                </p>
                <button
                  onClick={() => setIsNewModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#0052FF] text-white text-xs font-semibold rounded-lg hover:bg-[#0040CC] transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agendar Cita Rápida</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {dayAppointments.map((appt) => (
                  <div
                    key={appt.id}
                    onClick={() => setSelectedAppointment(appt)}
                    className="p-4 rounded-xl bg-[#131722] border border-[#232A3B] hover:border-[#00D2FF]/50 transition cursor-pointer flex flex-col justify-between group shadow-sm hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                          <Clock className="w-3.5 h-3.5 text-[#00D2FF]" />
                          <span>{formatTime(appt.startTime)} - {formatTime(appt.endTime)}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({appt.durationMinutes} min)</span>
                        </div>
                        {getStatusBadge(appt.status)}
                      </div>

                      <h4 className="font-semibold text-white text-sm group-hover:text-[#00D2FF] transition truncate">
                        {appt.serviceName}
                      </h4>

                      <div className="mt-2 space-y-1 text-xs text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium text-slate-200 truncate">
                            {appt.client?.name || 'Cliente'}
                          </span>
                          {appt.client?.phone && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({appt.client.phone})
                            </span>
                          )}
                        </div>

                        {appt.specialist && (
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            <span>Colaborador:</span>
                            <span className="text-slate-200 font-medium">{appt.specialist.name}</span>
                          </div>
                        )}

                        {appt.room && (
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <DoorOpen className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Salón:</span>
                            <span className="text-slate-200 font-medium">{appt.room.name}</span>
                          </div>
                        )}

                        {appt.clientNotifiedDelayAt && (
                          <div className="mt-2 p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Colaborador notificó 15m de retraso</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-[#1E2433] flex items-center justify-between text-[11px] text-slate-400">
                      <span className="capitalize">Origen: {appt.bookedVia.replace('_', ' ')}</span>
                      <span className="text-[#00D2FF] group-hover:underline">Ver detalles →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Vista Colaboradores & Torre de Control (Estado en vivo, cola y disponibilidad) */}
        {viewMode === 'team' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-white">
                Torre de Control: Estado en Vivo y Cola de Cada Colaborador
              </span>
              <span>{specialists.length} especialistas registrados</span>
            </div>

            {specialists.length === 0 ? (
              <div className="text-center py-16 bg-[#0E121B] rounded-2xl border border-[#1E2433] p-8">
                <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-white">No hay especialistas registrados</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Agrega especialistas en Configuración &gt; Colaboradores para monitorear sus estados y colas.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {specialists.map((spec) => {
                  const specAppts = dayAppointments
                    .filter((a) => a.specialist?.id === spec.id && a.status !== 'cancelled')
                    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

                  const inProgressAppt = specAppts.find((a) => a.status === 'in_progress');
                  const waitingAppt = specAppts.find(
                    (a) => a.status === 'confirmed' && (a.notes?.includes('[Llegó') || a.notes?.includes('[En Sala'))
                  );

                  return (
                    <div
                      key={spec.id}
                      className="p-4 rounded-2xl bg-[#0E121B] border border-[#1E2433] hover:border-[#232A3B] transition space-y-3.5 flex flex-col justify-between shadow-sm"
                    >
                      {/* Cabecera del Especialista con Estado en Vivo */}
                      <div>
                        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#1E2433]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0052FF] to-[#00D2FF] flex items-center justify-center text-white font-bold text-xs shadow-md">
                              {spec.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-white leading-tight">{spec.name}</h4>
                              <span className="text-[11px] text-slate-400 block">{spec.specialty || 'General'}</span>
                            </div>
                          </div>

                          {/* Badge de Estado en Vivo */}
                          {inProgressAppt ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                              Atendiendo
                            </span>
                          ) : waitingAppt ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              En Sala
                            </span>
                          ) : spec.is_active ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Libre Ahora
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-500 border border-slate-700">
                              Inactivo
                            </span>
                          )}
                        </div>

                        {/* Turno Actual o Espera */}
                        {inProgressAppt && (
                          <div className="mt-3 p-2.5 rounded-xl bg-blue-950/40 border border-blue-800/40 space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300 block">
                              En Atención Ahora:
                            </span>
                            <div className="text-xs font-black text-white">{inProgressAppt.client?.name}</div>
                            <div className="text-[11px] text-slate-300 flex items-center justify-between">
                              <span>{inProgressAppt.serviceName}</span>
                              <span className="font-mono text-blue-400 font-semibold">{formatTime(inProgressAppt.endTime)}</span>
                            </div>
                          </div>
                        )}

                        {waitingAppt && !inProgressAppt && (
                          <div className="mt-3 p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/40 space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
                              Esperando en Sala:
                            </span>
                            <div className="text-xs font-black text-white">{waitingAppt.client?.name}</div>
                            <div className="text-[11px] text-slate-300">{waitingAppt.serviceName}</div>
                          </div>
                        )}

                        {/* Cola de Citas del Día */}
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                            <span>Cola de Hoy ({specAppts.length} citas)</span>
                          </div>

                          {specAppts.length === 0 ? (
                            <div className="py-4 text-center rounded-xl bg-[#131722]/50 border border-[#232A3B] text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                              <Coffee className="w-3.5 h-3.5" />
                              <span>Sin citas agendadas hoy</span>
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {specAppts.map((appt) => {
                                const isDone = appt.status === 'completed';
                                const inProg = appt.status === 'in_progress';
                                return (
                                  <div
                                    key={appt.id}
                                    onClick={() => setSelectedAppointment(appt)}
                                    className={`p-2 rounded-lg text-xs border transition cursor-pointer flex items-center justify-between gap-2 ${
                                      isDone
                                        ? 'bg-[#131722]/30 border-[#1E2433] opacity-50'
                                        : inProg
                                        ? 'bg-blue-950/50 border-blue-600/50'
                                        : 'bg-[#131722] border-[#232A3B] hover:border-[#00D2FF]/40'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="font-semibold text-white truncate text-[11px]">
                                        {appt.client?.name || 'Cliente'}
                                      </div>
                                      <div className="text-[10px] text-slate-400 truncate">
                                        {appt.serviceName} {appt.room?.name ? `• ${appt.room.name}` : ''}
                                      </div>
                                    </div>
                                    <span className="font-mono text-[10px] font-semibold text-slate-300 flex-shrink-0">
                                      {formatTime(appt.startTime)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botones Rápidos de la Recepcionista para este Especialista */}
                      <div className="pt-2 border-t border-[#1E2433] flex items-center gap-2">
                        <button
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, specialistId: spec.id }));
                            setIsNewModalOpen(true);
                          }}
                          className="flex-1 py-1.5 bg-[#131722] hover:bg-[#1A2030] border border-[#232A3B] text-slate-200 hover:text-white text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3 text-[#00D2FF]" />
                          <span>Agendar</span>
                        </button>

                        {spec.phone && (
                          <button
                            onClick={() => {
                              setSelectedSpecialistId(spec.id);
                              setTimeout(() => handleShareSpecialistAgendaWhatsApp(), 50);
                            }}
                            className="p-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-lg transition"
                            title={`Enviar agenda del día por WhatsApp a ${spec.name}`}
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Vista Lista / Próximas */}
        {(viewMode === 'list' || viewMode === 'week') && (
          <div className="bg-[#0E121B] rounded-2xl border border-[#1E2433] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#131722] text-slate-400 border-b border-[#232A3B]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Horario & Fecha</th>
                    <th className="py-3 px-4 font-semibold">Cliente</th>
                    <th className="py-3 px-4 font-semibold">Servicio</th>
                    <th className="py-3 px-4 font-semibold">Colaborador</th>
                    <th className="py-3 px-4 font-semibold">Salón / Espacio</th>
                    <th className="py-3 px-4 font-semibold">Estado</th>
                    <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2433]">
                  {filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No hay citas registradas con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredAppointments.map((appt) => (
                      <tr key={appt.id} className="hover:bg-[#131722]/50 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">
                            {formatTime(appt.startTime)} - {formatTime(appt.endTime)}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {new Date(appt.startTime).toLocaleDateString('es-CO', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-200">{appt.client?.name || 'Cliente'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{appt.client?.phone}</div>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-200">
                          {appt.serviceName}
                          <span className="block text-[10px] text-slate-400">{appt.durationMinutes} min</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {appt.specialist ? appt.specialist.name : <span className="text-slate-500">Sin asignar</span>}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {appt.room ? appt.room.name : <span className="text-slate-500">Sin salón</span>}
                        </td>
                        <td className="py-3.5 px-4">{getStatusBadge(appt.status)}</td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedAppointment(appt)}
                            className="px-2.5 py-1 rounded bg-[#131722] hover:bg-[#1A2030] border border-[#232A3B] text-slate-300 hover:text-white transition"
                          >
                            Detalles
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Nueva Cita Rápida */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0E121B] border border-[#232A3B] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2433]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#00D2FF]" />
                <h3 className="text-base font-bold text-white">Agendar Cita Rápida</h3>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateAppointment} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Nombre del Cliente</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Juan Pérez"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Celular / WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    placeholder="Ej. +573001234567"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
                  />
                </div>
              </div>

              {/* Nombre de Alumno / Paciente si es academia, clínica o menor de edad */}
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Nombre del Alumno o Paciente <span className="text-slate-500 font-normal">(Opcional si es distinto al titular de WhatsApp)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej. Samuel (Hijo - 8 años)"
                  value={formData.studentName}
                  onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Servicio *</label>
                <select
                  value={formData.serviceId}
                  onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes} min) - ${Number(s.price).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Colaborador / Especialista</label>
                  <select
                    value={formData.specialistId}
                    onChange={(e) => setFormData({ ...formData, specialistId: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
                  >
                    <option value="auto">Cualquiera disponible (Auto)</option>
                    {specialists.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.specialty || 'General'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Salón / Espacio</label>
                  <select
                    value={formData.roomId}
                    onChange={(e) => setFormData({ ...formData, roomId: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
                  >
                    <option value="auto">Auto (Según aforo)</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} (Capacidad: {r.capacity})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Fecha</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Hora</label>
                  <input
                    type="time"
                    required
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
                  />
                </div>
              </div>

              {/* Frecuencia / Clases Semanales (Para Academias / Terapias) */}
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Modalidad de Agendamiento
                </label>
                <select
                  value={formData.recurringWeeks}
                  onChange={(e) => setFormData({ ...formData, recurringWeeks: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
                >
                  <option value={1}>Sesión Única (1 cita)</option>
                  <option value={4}>Recurrente: 4 Semanas (1 mes de clases semanales)</option>
                  <option value={8}>Recurrente: 8 Semanas (2 meses de clases semanales)</option>
                  <option value={12}>Recurrente: 12 Semanas (Trimestre completo)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Notas u Observaciones</label>
                <textarea
                  rows={2}
                  placeholder="Detalles específicos para la sesión o requerimientos especiales"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF] resize-none"
                />
              </div>

              <div className="pt-3 border-t border-[#1E2433] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-3 py-2 rounded-lg bg-[#131722] hover:bg-[#1A2030] text-slate-400 hover:text-white transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg bg-[#0052FF] hover:bg-[#0040CC] text-white font-semibold flex items-center gap-2 transition disabled:opacity-50"
                >
                  {isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirmar y Bloquear Horario</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalle de Cita */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0E121B] border border-[#232A3B] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2433]">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-[#00D2FF]" />
                <h3 className="text-base font-bold text-white">Detalle de la Cita</h3>
              </div>
              <button
                onClick={() => setSelectedAppointment(null)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-[#131722] border border-[#232A3B] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{selectedAppointment.serviceName}</span>
                  {getStatusBadge(selectedAppointment.status)}
                </div>
                <div className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#00D2FF]" />
                  <span>
                    {formatTime(selectedAppointment.startTime)} - {formatTime(selectedAppointment.endTime)} (
                    {selectedAppointment.durationMinutes} min)
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 p-3 rounded-xl bg-[#131722]/50 border border-[#232A3B]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Cliente:</span>
                  <span className="font-semibold text-white">{selectedAppointment.client?.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Teléfono:</span>
                  <span className="font-mono text-slate-200">{selectedAppointment.client?.phone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Colaborador:</span>
                  <span className="text-slate-200">{selectedAppointment.specialist?.name || 'Auto'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Salón:</span>
                  <span className="text-slate-200">{selectedAppointment.room?.name || 'Auto'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Canal de origen:</span>
                  <span className="capitalize text-slate-300">
                    {selectedAppointment.bookedVia.replace('_', ' ')}
                  </span>
                </div>
                {selectedAppointment.notes && (
                  <div className="pt-2 border-t border-[#1E2433]">
                    <span className="text-slate-400 block mb-0.5">Notas:</span>
                    <p className="text-slate-300 bg-[#0E121B] p-2 rounded border border-[#232A3B]">
                      {selectedAppointment.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Check-in Recepción Rápido */}
              <div className="pt-2 border-t border-[#1E2433]">
                <button
                  onClick={() => handleMarkArrival(selectedAppointment.id)}
                  className="w-full py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center justify-center gap-2 transition"
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  <span>📍 Llegó a Recepción (Notificar al Colaborador)</span>
                </button>
              </div>

              {/* Gestión de Demoras e Imprevistos */}
              <div className="pt-2 border-t border-[#1E2433] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold block text-[11px]">Control de Imprevistos & Demoras:</span>
                  <button
                    type="button"
                    onClick={() => handleAdminReportDelay(selectedAppointment.id)}
                    className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold rounded-lg transition flex items-center gap-1"
                    title="Registrar retraso y avisar al siguiente cliente en cola"
                  >
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>Avisar +15m Retraso</span>
                  </button>
                </div>

                {/* Reasignar a otro especialista si el asignado falta o se enferma */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 flex-shrink-0">Reasignar:</span>
                  <select
                    value={selectedAppointment.specialist?.id || ''}
                    onChange={(e) => handleAdminReassign(selectedAppointment.id, e.target.value)}
                    className="flex-1 px-2 py-1 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
                  >
                    <option value="" disabled>Seleccionar otro colaborador...</option>
                    {specialists.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.specialty || 'General'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Botones de Cambio Rápido de Estado */}
              <div className="space-y-1.5 pt-1">
                <span className="text-slate-400 font-semibold block text-[11px]">Cambiar Estado:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleUpdateStatus(selectedAppointment.id, 'in_progress')}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium transition"
                  >
                    ▶ En Atención
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedAppointment.id, 'completed')}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium transition"
                  >
                    ✓ Finalizada
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedAppointment.id, 'no_show')}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-medium transition"
                  >
                    ⚠ No Asistió
                  </button>
                  <button
                    onClick={() => handleCancelAppointment(selectedAppointment.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-medium transition"
                  >
                    ✕ Cancelar Cita
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

