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
}

export function RoomsTab({ rooms: initialRooms }: RoomsTabProps) {
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0E121B] border border-[#1E2433]">
        <div>
          <div className="flex items-center gap-2">
            <DoorOpen className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Salones, Cabinas & Espacios Físicos</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Control de aforo por estación para academias, consultorios y barberías, evitando sobrecupo físico.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0040CC] text-white text-xs font-semibold shadow-md shadow-[#0052FF]/20 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Salón / Espacio</span>
        </button>
      </div>

      {/* Grid de Salones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-[#0E121B] rounded-2xl border border-[#1E2433] p-6 text-slate-400 text-xs">
            No hay salones o cabinas físicas registradas. Registra el primero para activar el control de aforo.
          </div>
        ) : (
          rooms.map((room) => (
            <div
              key={room.id}
              className="p-4 rounded-xl bg-[#0E121B] border border-[#1E2433] hover:border-[#232A3B] transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <DoorOpen className="w-4 h-4" />
                    </div>
                    <h4 className="font-bold text-white text-sm">{room.name}</h4>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Activo
                  </span>
                </div>

                <div className="mt-2 space-y-1.5 text-xs text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>Aforo Máximo:</span>
                    <span className="font-bold text-white">{room.capacity} persona(s)</span>
                  </div>

                  {room.description && (
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                      {room.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#1E2433] flex items-center justify-end gap-2">
                <button
                  onClick={() => handleOpenEdit(room)}
                  className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-[#131722] transition text-xs flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>
                <button
                  onClick={() => handleDelete(room.id)}
                  className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0E121B] border border-[#232A3B] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2433]">
              <div className="flex items-center gap-2">
                <DoorOpen className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  {editingRoom ? 'Editar Salón / Espacio' : 'Nuevo Salón o Estación'}
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
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

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nombre del Salón / Estación *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Salón 1 (Canto & Batería) o Silla 1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Capacidad Máxima (Aforo) *</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF]"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Para barbería o consulta médica usa 1. Para clases grupales de música usa la capacidad del salón.
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Descripción / Aislamiento Acústico</label>
                <textarea
                  rows={2}
                  placeholder="Ej. Equipado con batería acústica y panel insonorizado"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131722] border border-[#232A3B] rounded-lg text-slate-200 text-xs focus:outline-none focus:border-[#00D2FF] resize-none"
                />
              </div>

              <div className="pt-3 border-t border-[#1E2433] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-2 rounded-lg bg-[#131722] hover:bg-[#1A2030] text-slate-400 hover:text-white transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg bg-[#0052FF] hover:bg-[#0040CC] text-white font-semibold transition disabled:opacity-50"
                >
                  {isPending ? 'Guardando...' : editingRoom ? 'Guardar Cambios' : 'Crear Salón'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

