'use client';

import React, { useState, useTransition } from 'react';
import {
  DoorOpen,
  Plus,
  Users,
  Trash2,
  Pencil,
  CheckCircle2,
  Sparkles,
  X,
  Volume2,
} from 'lucide-react';
import {
  createRoomAdmin,
  updateRoomAdmin,
  deleteRoomAdmin,
} from '@/app/actions/calendar-admin';

interface RoomItem {
  id: string;
  name: string;
  capacity: number;
  description: string | null;
  is_active: boolean;
}

interface RoomsTabProps {
  rooms: RoomItem[];
  organizationId: string;
  roomLabel?: string;
}

export function RoomsTab({
  rooms: initialRooms,
  roomLabel = 'Espacio',
}: RoomsTabProps) {
  const [rooms, setRooms] = useState<RoomItem[]>(initialRooms);
  const [isPending, startTransition] = useTransition();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomItem | null>(null);
  const [form, setForm] = useState({
    name: '',
    capacity: 1,
    description: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  const handleOpenCreate = () => {
    setEditingRoom(null);
    setForm({ name: '', capacity: 1, description: '' });
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (room: RoomItem) => {
    setEditingRoom(room);
    setForm({
      name: room.name,
      capacity: room.capacity,
      description: room.description || '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    startTransition(async () => {
      try {
        if (editingRoom) {
          await updateRoomAdmin(editingRoom.id, {
            name: form.name,
            capacity: Number(form.capacity),
            description: form.description,
          });
          setRooms((prev) =>
            prev.map((r) =>
              r.id === editingRoom.id
                ? { ...r, name: form.name, capacity: Number(form.capacity), description: form.description }
                : r
            )
          );
        } else {
          const res = await createRoomAdmin({
            name: form.name,
            capacity: Number(form.capacity),
            description: form.description,
          });
          if (res.room) {
            setRooms((prev) => [
              ...prev,
              {
                id: res.room.id,
                name: form.name,
                capacity: Number(form.capacity),
                description: form.description || null,
                is_active: true,
              },
            ]);
          }
        }
        setModalOpen(false);
      } catch (err: any) {
        setFormError(err.message || 'Error al guardar salón');
      }
    });
  };

  const handleDelete = (roomId: string) => {
    if (!confirm('¿Seguro que deseas eliminar este salón o espacio?')) return;
    startTransition(async () => {
      try {
        await deleteRoomAdmin(roomId);
        setRooms((prev) => prev.filter((r) => r.id !== roomId));
      } catch (err: any) {
        alert(err.message || 'Error al eliminar salón');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <DoorOpen className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Gestión de {roomLabel}s</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Control de aforo por estación para {roomLabel.toLowerCase()}s, evitando sobrecupo físico.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0047E0] text-white text-xs font-semibold shadow-xs transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo {roomLabel}</span>
        </button>
      </div>

      {/* Grid de Salones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-6 text-slate-500 dark:text-slate-400 text-xs shadow-xs">
            No hay {roomLabel.toLowerCase()}s registrados. Registra el primero para activar el control de aforo.
          </div>
        ) : (
          rooms.map((room) => (
            <div
              key={room.id}
              className="p-4 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] hover:border-slate-300 dark:hover:border-[#00D2FF]/30 transition flex flex-col justify-between shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                      <DoorOpen className="w-4 h-4" />
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">{room.name}</h4>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    Activo
                  </span>
                </div>

                <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>Aforo Máximo:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{room.capacity} persona(s)</span>
                  </div>

                  {room.description && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {room.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#1E2433] flex items-center justify-end gap-2">
                <button
                  onClick={() => handleOpenEdit(room)}
                  className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#131722] transition text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>
                <button
                  onClick={() => handleDelete(room.id)}
                  className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Crear / Editar Salón */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0E121B] border border-slate-200 dark:border-[#232A3B] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1E2433]">
              <div className="flex items-center gap-2">
                <DoorOpen className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {editingRoom ? `Editar ${roomLabel}` : `Nuevo ${roomLabel}`}
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Nombre del {roomLabel} *</label>
                <input
                  type="text"
                  required
                  placeholder={`Ej. ${roomLabel} 1 o Principal`}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-10 px-3.5 bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Capacidad Máxima (Aforo) *</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                  className="w-full h-10 px-3.5 bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Define el aforo máximo simultáneo para citas o reservas en este espacio.
                </span>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Descripción o Notas de Espacio</label>
                <textarea
                  rows={2}
                  placeholder="Ej. Equipamiento disponible, ubicación interior o notas especiales"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-[#1E2433] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#131722] hover:bg-slate-200 dark:hover:bg-[#1A2030] text-slate-600 dark:text-slate-300 dark:hover:text-white transition font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0040CC] text-white font-semibold transition disabled:opacity-50 shadow-xs cursor-pointer"
                >
                  {isPending ? 'Guardando...' : editingRoom ? 'Guardar Cambios' : `Crear ${roomLabel}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

