'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  Download,
  Megaphone,
  Tag as TagIcon,
  Bookmark,
  Plus,
  Trash2,
  X,
  Sparkles,
  MessageSquare,
  UserRoundSearch,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Loader2,
  Check,
} from 'lucide-react';
import {
  listCustomersAction,
  listTagsAndSegmentsAction,
  exportCustomersCsvAction,
  createTagAction,
  deleteTagAction,
  assignTagsToContactsAction,
  saveSegmentAction,
  deleteSegmentAction,
  type CustomerDirectoryRow,
  type TagRecord,
  type SavedSegmentRecord,
} from '@/app/actions/crm';
import {
  type CustomerFilters,
  type CustomerSort,
  normalizeCustomerFilters,
  describeCustomerFilters,
} from '@/lib/crm/customer-filters';
import { LeadScoreBadge } from '@/components/leads/LeadScoreBadge';
import { Customer360Drawer } from './Customer360Drawer';
import {
  TAG_COLOR_CLASSES,
  STAGE_LABELS_DEFAULT,
  TEMPERATURE_META,
  formatCop,
  formatShortDate,
} from './crm-ui-helpers';
import { TAG_COLORS, type TagColor } from '@/lib/crm/constants';

interface CustomersDirectoryClientProps {
  initialData: {
    items: CustomerDirectoryRow[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  initialMeta: {
    tags: TagRecord[];
    segments: SavedSegmentRecord[];
    teamMembers: Array<{ id: string; full_name: string }>;
    whatsappProvider: 'meta' | 'evolution';
    stageLabels: Record<string, string>;
  };
  initialContactId?: string | null;
  initialSort?: CustomerSort;
}

export function CustomersDirectoryClient({
  initialData,
  initialMeta,
  initialContactId = null,
  initialSort = 'score',
}: CustomersDirectoryClientProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [meta, setMeta] = useState(initialMeta);
  const [filters, setFilters] = useState<CustomerFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState<CustomerSort>(initialSort);
  const [page, setPage] = useState(initialData.page);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Selection for batch tagging
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchTagId, setBatchTagId] = useState('');

  // Drawer Ficha 360
  const [drawerContactId, setDrawerContactId] = useState<string | null>(initialContactId);

  // Saved segment creation
  const [segmentName, setSegmentName] = useState('');
  const [showSaveSegment, setShowSaveSegment] = useState(false);

  // Tag manager modal/panel
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<TagColor>('blue');

  const fetchCustomers = useCallback(
    async (nextFilters: CustomerFilters, nextSort: CustomerSort, nextPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await listCustomersAction({
          filters: nextFilters,
          sort: nextSort,
          page: nextPage,
          pageSize: 25,
        });
        setData(res);
        setPage(res.page);
      } catch (e: any) {
        setError(e?.message || 'Error consultando clientes.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const refreshMeta = useCallback(async () => {
    try {
      const m = await listTagsAndSegmentsAction();
      setMeta(m);
    } catch {
      // ignore silent refresh failures
    }
  }, []);

  // Debounce search input
  useEffect(() => {
    const trimmed = searchInput.trim() || undefined;
    if (trimmed === filters.search) return;
    const handle = setTimeout(() => {
      const next = normalizeCustomerFilters({ ...filters, search: trimmed });
      setFilters(next);
      fetchCustomers(next, sort, 1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput, filters, sort, fetchCustomers]);

  const updateFilter = (patch: Partial<CustomerFilters>) => {
    const next = normalizeCustomerFilters({ ...filters, ...patch });
    setFilters(next);
    setSelectedIds([]);
    fetchCustomers(next, sort, 1);
  };

  const handleSortChange = (nextSort: CustomerSort) => {
    setSort(nextSort);
    fetchCustomers(filters, nextSort, 1);
  };

  const clearAllFilters = () => {
    setSearchInput('');
    setFilters({});
    setSelectedIds([]);
    fetchCustomers({}, sort, 1);
  };

  const applySavedSegment = (seg: SavedSegmentRecord) => {
    const norm = normalizeCustomerFilters(seg.filters);
    setSearchInput(norm.search || '');
    setFilters(norm);
    setSelectedIds([]);
    fetchCustomers(norm, sort, 1);
  };

  const handleSaveSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!segmentName.trim()) return;
    try {
      await saveSegmentAction({ name: segmentName.trim(), filters });
      setSegmentName('');
      setShowSaveSegment(false);
      await refreshMeta();
      setNotice('Segmento guardado.');
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el segmento.');
    }
  };

  const handleDeleteSegment = async (segmentId: string) => {
    try {
      await deleteSegmentAction(segmentId);
      await refreshMeta();
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar el segmento.');
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    try {
      await createTagAction({ name: newTagName.trim(), color: newTagColor });
      setNewTagName('');
      await refreshMeta();
      setNotice('Etiqueta creada.');
    } catch (err: any) {
      setError(err?.message || 'No se pudo crear la etiqueta.');
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    try {
      await deleteTagAction(tagId);
      if (filters.tagId === tagId) {
        updateFilter({ tagId: undefined });
      }
      await refreshMeta();
      await fetchCustomers(filters, sort, page);
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar la etiqueta.');
    }
  };

  const handleBatchTag = async () => {
    if (!batchTagId || selectedIds.length === 0) return;
    try {
      const res = await assignTagsToContactsAction({
        contactIds: selectedIds,
        tagIds: [batchTagId],
      });
      setNotice(`Etiqueta aplicada a ${res.assigned} clientes.`);
      setSelectedIds([]);
      await fetchCustomers(filters, sort, page);
    } catch (err: any) {
      setError(err?.message || 'Error aplicando etiqueta en lote.');
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await exportCustomersCsvAction({ filters, sort });
      const blob = new Blob([`\uFEFF${res.csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clientes-synqo-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice(`Exportados ${res.count} clientes a CSV.`);
    } catch (err: any) {
      setError(err?.message || 'Error exportando CSV.');
    } finally {
      setExporting(false);
    }
  };

  const handleCreateCampaignFromSegment = () => {
    const encoded = encodeURIComponent(JSON.stringify(filters));
    router.push(`/campanas?filters=${encoded}`);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === data.items.length && data.items.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.items.map((i) => i.id));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const activeTag = meta.tags.find((t) => t.id === filters.tagId);
  const stageLabels = { ...STAGE_LABELS_DEFAULT, ...(meta.stageLabels || {}) };
  const hasFilters = Boolean(
    filters.search ||
      (filters.stage && filters.stage !== 'all') ||
      (filters.temperature && filters.temperature !== 'all') ||
      typeof filters.scoreMin === 'number' ||
      typeof filters.scoreMax === 'number' ||
      filters.tagId ||
      (filters.assignedTo && filters.assignedTo !== 'all') ||
      (filters.channel && filters.channel !== 'all') ||
      typeof filters.inactiveDays === 'number' ||
      (filters.buyers && filters.buyers !== 'all')
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0052FF]/10 border border-[#0052FF]/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-[#0052FF] dark:text-[#00D2FF]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Base de Clientes
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-[#1C2233] text-slate-700 dark:text-slate-200">
                  {data.totalCount.toLocaleString('es-CO')}
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Búsqueda paginada, etiquetas manuales/IA, segmentos guardados y Ficha 360° con historial de pedidos.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTagManager((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] hover:border-slate-300 text-slate-700 dark:text-slate-200"
          >
            <TagIcon className="w-3.5 h-3.5" />
            Etiquetas ({meta.tags.length})
          </button>

          <button
            type="button"
            disabled={exporting}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] hover:border-slate-300 text-slate-700 dark:text-slate-200 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Exportar CSV
          </button>

          <button
            type="button"
            onClick={handleCreateCampaignFromSegment}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#0052FF] hover:bg-[#0040CC] text-white shadow-xs"
          >
            <Megaphone className="w-3.5 h-3.5" />
            Crear Campaña IA con este segmento
          </button>
        </div>
      </div>

      {/* Notices & Errors */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800/60 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800/60 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> {notice}
          </span>
          <button type="button" onClick={() => setNotice(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tag Manager Collapsible */}
      {showTagManager && (
        <div className="bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Administrar Etiquetas de la Organización
            </h2>
            <button type="button" onClick={() => setShowTagManager(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreateTag} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Nueva etiqueta (ej: vip, mayorista, interes-tenis)"
              className="flex-1 min-w-[200px] rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-3 py-1.5 text-xs"
            />
            <select
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value as TagColor)}
              className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
            >
              {TAG_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!newTagName.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0052FF] hover:bg-[#0040CC] disabled:opacity-50 text-white"
            >
              <Plus className="w-3.5 h-3.5" /> Crear
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {meta.tags.map((t) => (
              <span
                key={t.id}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  TAG_COLOR_CLASSES[t.color] || TAG_COLOR_CLASSES.slate
                }`}
              >
                {t.created_by_ai && <Sparkles className="w-3 h-3" />}
                {t.name}
                <button
                  type="button"
                  onClick={() => handleDeleteTag(t.id)}
                  className="opacity-65 hover:opacity-100"
                  title="Eliminar etiqueta"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Saved Segments Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <Bookmark className="w-3.5 h-3.5" /> Segmentos:
        </span>
        {meta.segments.map((seg) => (
          <div
            key={seg.id}
            className="inline-flex items-center rounded-full bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] text-xs overflow-hidden"
          >
            <button
              type="button"
              onClick={() => applySavedSegment(seg)}
              className="px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-[#1C2233] font-medium text-slate-700 dark:text-slate-200"
            >
              {seg.name}
            </button>
            <button
              type="button"
              onClick={() => handleDeleteSegment(seg.id)}
              className="px-1.5 py-1 text-slate-400 hover:text-rose-500 border-l border-slate-200 dark:border-[#232A3B]"
              title="Eliminar segmento"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {hasFilters && !showSaveSegment && (
          <button
            type="button"
            onClick={() => setShowSaveSegment(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-[#0052FF]/50 text-[#0052FF] dark:text-[#00D2FF] hover:bg-[#0052FF]/5"
          >
            <Plus className="w-3 h-3" /> Guardar filtro como segmento
          </button>
        )}
        {showSaveSegment && (
          <form onSubmit={handleSaveSegment} className="inline-flex items-center gap-1.5">
            <input
              type="text"
              value={segmentName}
              onChange={(e) => setSegmentName(e.target.value)}
              placeholder="Nombre del segmento..."
              className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] px-2.5 py-1 text-xs"
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#0052FF] text-white"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setShowSaveSegment(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>

      {/* Filters Card */}
      <div className="bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nombre, teléfono o @usuario..."
              className="w-full rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white"
            />
          </div>

          <select
            value={filters.stage || 'all'}
            onChange={(e) => updateFilter({ stage: e.target.value === 'all' ? undefined : e.target.value })}
            className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
          >
            <option value="all">Todas las etapas</option>
            {Object.entries(stageLabels).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={filters.temperature || 'all'}
            onChange={(e) => updateFilter({ temperature: e.target.value === 'all' ? undefined : e.target.value })}
            className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
          >
            <option value="all">Cualquier temperatura</option>
            <option value="hot">🔥 Listo para cerrar</option>
            <option value="qualified_doubt">💬 Con dudas</option>
            <option value="warm">🌤️ Tibio</option>
            <option value="cold">❄️ Frío</option>
            <option value="unclassified">Sin clasificar</option>
          </select>

          <select
            value={filters.tagId || 'all'}
            onChange={(e) => updateFilter({ tagId: e.target.value === 'all' ? undefined : e.target.value })}
            className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
          >
            <option value="all">Todas las etiquetas</option>
            {meta.tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value as CustomerSort)}
            className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-1.5 text-xs font-medium"
          >
            <option value="score">Orden: Mayor Score IA</option>
            <option value="recent">Orden: Última interacción</option>
            <option value="name">Orden: Nombre A–Z</option>
            <option value="created">Orden: Más recientes</option>
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 items-center">
          <select
            value={filters.channel || 'all'}
            onChange={(e) =>
              updateFilter({
                channel: e.target.value === 'all' ? undefined : (e.target.value as 'whatsapp' | 'instagram'),
              })
            }
            className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
          >
            <option value="all">Canal: Todos</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
          </select>

          <select
            value={filters.buyers || 'all'}
            onChange={(e) =>
              updateFilter({
                buyers: e.target.value === 'all' ? undefined : (e.target.value as 'buyers' | 'non_buyers'),
              })
            }
            className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
          >
            <option value="all">Compras: Todos</option>
            <option value="buyers">Solo compradores</option>
            <option value="non_buyers">Sin compras aún</option>
          </select>

          <select
            value={filters.assignedTo || 'all'}
            onChange={(e) => updateFilter({ assignedTo: e.target.value === 'all' ? undefined : e.target.value })}
            className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
          >
            <option value="all">Asesor: Todos</option>
            <option value="unassigned">Sin asignar</option>
            {meta.teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>

          <input
            type="number"
            min={0}
            max={100}
            value={filters.scoreMin ?? ''}
            onChange={(e) =>
              updateFilter({
                scoreMin: e.target.value === '' ? undefined : Math.max(0, Math.min(100, Number(e.target.value))),
              })
            }
            placeholder="Score mín. (0-100)"
            className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
          />

          <input
            type="number"
            min={1}
            value={filters.inactiveDays ?? ''}
            onChange={(e) =>
              updateFilter({
                inactiveDays: e.target.value === '' ? undefined : Math.max(1, Number(e.target.value)),
              })
            }
            placeholder="Inactivos +N días"
            className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {describeCustomerFilters(filters, activeTag?.name)}
          </span>
          {hasFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-[#0052FF] dark:text-[#00D2FF] hover:underline font-medium"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Batch Action Bar */}
      {selectedIds.length > 0 && (
        <div className="rounded-xl border border-[#0052FF]/30 bg-[#0052FF]/5 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            {selectedIds.length} cliente(s) seleccionados
          </span>
          <div className="flex items-center gap-2">
            <select
              value={batchTagId}
              onChange={(e) => setBatchTagId(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] px-2.5 py-1 text-xs"
            >
              <option value="">Elegir etiqueta...</option>
              {meta.tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!batchTagId}
              onClick={handleBatchTag}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#0052FF] hover:bg-[#0040CC] disabled:opacity-50 text-white"
            >
              Asignar etiqueta
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
            >
              Deseleccionar
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#0D111A]/60 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 pl-4 pr-2 w-9">
                  <input
                    type="checkbox"
                    checked={data.items.length > 0 && selectedIds.length === data.items.length}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="py-3 pr-3 font-semibold">Cliente</th>
                <th className="py-3 pr-3 font-semibold">Score / Temp</th>
                <th className="py-3 pr-3 font-semibold hidden md:table-cell">Etapa</th>
                <th className="py-3 pr-3 font-semibold hidden lg:table-cell">Etiquetas</th>
                <th className="py-3 pr-3 font-semibold hidden sm:table-cell">Compras / LTV</th>
                <th className="py-3 pr-3 font-semibold hidden xl:table-cell">Última activ.</th>
                <th className="py-3 pr-4 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#1E2536] text-sm">
              {loading && data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                    Cargando clientes...
                  </td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                    No se encontraron clientes con estos filtros.
                  </td>
                </tr>
              ) : (
                data.items.map((row) => {
                  const tempMeta = row.lead_temperature ? TEMPERATURE_META[row.lead_temperature] : null;
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-[#192030]/60 transition-colors"
                    >
                      <td className="py-3 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={() => toggleRow(row.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => setDrawerContactId(row.id)}
                          className="text-left group"
                        >
                          <div className="font-semibold text-slate-900 dark:text-white group-hover:text-[#0052FF] dark:group-hover:text-[#00D2FF] transition-colors">
                            {row.name || row.phone || 'Sin nombre'}
                          </div>
                          <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
                            <span>{row.phone}</span>
                            <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#1E2536] text-slate-500">
                              {row.channel || 'whatsapp'}
                            </span>
                          </div>
                        </button>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-col items-start gap-1">
                          {typeof row.lead_score === 'number' ? (
                            <LeadScoreBadge
                              score={row.lead_score}
                              breakdown={Array.isArray(row.lead_score_breakdown) ? row.lead_score_breakdown : null}
                              size="sm"
                            />
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                          {tempMeta && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${tempMeta.badgeClass}`}>
                              {tempMeta.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-3 hidden md:table-cell text-xs text-slate-700 dark:text-slate-200">
                        {stageLabels[row.pipeline_stage] || row.pipeline_stage}
                      </td>
                      <td className="py-3 pr-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1 max-w-[240px]">
                          {row.tags.slice(0, 4).map((t) => (
                            <span
                              key={t.id}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                                TAG_COLOR_CLASSES[t.color] || TAG_COLOR_CLASSES.slate
                              }`}
                            >
                              {t.source === 'ai' && <Sparkles className="w-2.5 h-2.5" />}
                              {t.name}
                            </span>
                          ))}
                          {row.tags.length > 4 && (
                            <span className="text-[11px] text-slate-400">+{row.tags.length - 4}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-3 hidden sm:table-cell text-xs">
                        <div className="font-mono font-semibold text-slate-900 dark:text-white">
                          {row.orders_total > 0 ? formatCop(row.orders_total) : '—'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {row.orders_count} {row.orders_count === 1 ? 'pedido' : 'pedidos'}
                        </div>
                      </td>
                      <td className="py-3 pr-3 hidden xl:table-cell text-xs text-slate-500">
                        {formatShortDate(row.last_interaction_at)}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDrawerContactId(row.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-[#1E2536] dark:hover:bg-[#273047] text-slate-700 dark:text-slate-200"
                          >
                            <UserRoundSearch className="w-3.5 h-3.5" />
                            Ficha 360
                          </button>
                          <Link
                            href={`/inbox/${row.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#0052FF] hover:bg-[#0040CC] text-white"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-[#232A3B] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            Mostrando página {data.page} de {data.totalPages} ({data.totalCount.toLocaleString('es-CO')} clientes)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={loading || data.page <= 1}
              onClick={() => fetchCustomers(filters, sort, data.page - 1)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#232A3B] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-[#1C2233]"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Anterior
            </button>
            <button
              type="button"
              disabled={loading || data.page >= data.totalPages}
              onClick={() => fetchCustomers(filters, sort, data.page + 1)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#232A3B] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-[#1C2233]"
            >
              Siguiente <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Ficha 360 Drawer */}
      <Customer360Drawer
        contactId={drawerContactId}
        onClose={() => setDrawerContactId(null)}
        onChanged={() => {
          fetchCustomers(filters, sort, page);
          refreshMeta();
        }}
      />
    </div>
  );
}
