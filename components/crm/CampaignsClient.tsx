'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  XCircle,
  Sparkles,
  Users,
  CheckCircle2,
  Loader2,
  Zap,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  listCampaignsAction,
  previewCampaignAudienceAction,
  createCampaignAction,
  updateCampaignStatusAction,
  runCampaignTickNowAction,
  type TagRecord,
  type SavedSegmentRecord,
} from '@/app/actions/crm';
import {
  type CustomerFilters,
  normalizeCustomerFilters,
  describeCustomerFilters,
} from '@/lib/crm/customer-filters';
import { STAGE_LABELS_DEFAULT, formatCop, formatShortDate } from './crm-ui-helpers';

interface CampaignRow {
  id: string;
  name: string;
  objective: string;
  segment_filters: CustomerFilters;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled' | string;
  daily_cap: number;
  include_product_photo: boolean;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  stats: {
    total: number;
    pending: number;
    sent: number;
    skipped: number;
    failed: number;
    replied: number;
    converted: number;
    revenue: number;
  };
}

interface CampaignsClientProps {
  initialCampaigns: CampaignRow[];
  meta: {
    tags: TagRecord[];
    segments: SavedSegmentRecord[];
    whatsappProvider: 'meta' | 'evolution';
    stageLabels: Record<string, string>;
  };
  initialFilters?: CustomerFilters | null;
}

const CAMPAIGN_STATUS_META: Record<string, { label: string; className: string }> = {
  running: {
    label: 'En ejecución',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  paused: {
    label: 'Pausada',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  },
  completed: {
    label: 'Completada',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  },
  cancelled: {
    label: 'Cancelada',
    className: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  },
  draft: {
    label: 'Borrador',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
};

export function CampaignsClient({
  initialCampaigns,
  meta,
  initialFilters = null,
}: CampaignsClientProps) {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>(initialCampaigns);
  const [showWizard, setShowWizard] = useState<boolean>(() => {
    if (!initialFilters) return false;
    const f = normalizeCustomerFilters(initialFilters);
    return Boolean(
      f.search ||
        (f.stage && f.stage !== 'all') ||
        (f.temperature && f.temperature !== 'all') ||
        typeof f.scoreMin === 'number' ||
        typeof f.scoreMax === 'number' ||
        f.tagId ||
        (f.assignedTo && f.assignedTo !== 'all') ||
        (f.channel && f.channel !== 'all') ||
        typeof f.inactiveDays === 'number' ||
        (f.buyers && f.buyers !== 'all')
    );
  });
  const [filters, setFilters] = useState<CustomerFilters>(
    initialFilters ? normalizeCustomerFilters(initialFilters) : {}
  );
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [dailyCap, setDailyCap] = useState(50);
  const [includeProductPhoto, setIncludeProductPhoto] = useState(true);

  const [preview, setPreview] = useState<{
    totalEligible: number;
    metaEligibleNow: number;
    whatsappProvider: 'meta' | 'evolution';
    sample: Array<{ id: string; name: string; phone: string; lead_score: number | null }>;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [runningTick, setRunningTick] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const stageLabels = { ...STAGE_LABELS_DEFAULT, ...(meta.stageLabels || {}) };

  const refreshCampaigns = useCallback(async () => {
    try {
      const list = await listCampaignsAction();
      setCampaigns(list as CampaignRow[]);
    } catch (e: any) {
      setError(e?.message || 'Error actualizando campañas.');
    }
  }, []);

  const loadPreview = useCallback(async (f: CustomerFilters) => {
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await previewCampaignAudienceAction(f);
      setPreview(res);
    } catch (e: any) {
      setError(e?.message || 'Error calculando audiencia.');
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    if (showWizard) {
      loadPreview(filters);
    }
  }, [showWizard, filters, loadPreview]);

  const updateFilter = (patch: Partial<CustomerFilters>) => {
    setFilters((prev) => normalizeCustomerFilters({ ...prev, ...patch }));
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || objective.trim().length < 5) return;
    setCreating(true);
    setError(null);
    try {
      const res = await createCampaignAction({
        name: name.trim(),
        objective: objective.trim(),
        filters,
        dailyCap,
        includeProductPhoto,
      });
      setName('');
      setObjective('');
      setShowWizard(false);
      setNotice(`Campaña creada y en ejecución para ${res.recipients} destinatarios.`);
      await refreshCampaigns();
    } catch (err: any) {
      setError(err?.message || 'Error creando la campaña.');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (
    campaignId: string,
    status: 'running' | 'paused' | 'cancelled'
  ) => {
    setBusyId(campaignId);
    setError(null);
    try {
      await updateCampaignStatusAction({ campaignId, status });
      await refreshCampaigns();
    } catch (err: any) {
      setError(err?.message || 'Error actualizando estado.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRunTickNow = async () => {
    setRunningTick(true);
    setError(null);
    try {
      const res = await runCampaignTickNowAction();
      setNotice(
        `Lote ejecutado: ${res.sent} enviados, ${res.skipped} omitidos, ${res.failed} fallidos, ${res.completed} completadas.`
      );
      await refreshCampaigns();
    } catch (err: any) {
      setError(err?.message || 'Error ejecutando lote de campaña.');
    } finally {
      setRunningTick(false);
    }
  };

  const tagMap = new Map(meta.tags.map((t) => [t.id, t.name]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#0052FF]/10 border border-[#0052FF]/20 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-[#0052FF] dark:text-[#00D2FF]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Campañas IA a Segmentos
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mensajes 1-a-1 redactados por IA según tu objetivo, historial y catálogo, respetando ventana y tope diario.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={runningTick}
            onClick={handleRunTickNow}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] hover:border-slate-300 text-slate-700 dark:text-slate-200 disabled:opacity-50"
          >
            {runningTick ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-amber-500" />
            )}
            Ejecutar lote ahora
          </button>

          <button
            type="button"
            onClick={() => setShowWizard((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#0052FF] hover:bg-[#0040CC] text-white shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            {showWizard ? 'Cerrar asistente' : 'Nueva Campaña IA'}
          </button>
        </div>
      </div>

      {/* Notices */}
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
            <CheckCircle2 className="w-3.5 h-3.5" /> {notice}
          </span>
          <button type="button" onClick={() => setNotice(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Wizard */}
      {showWizard && (
        <form
          onSubmit={handleCreateCampaign}
          className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-5 space-y-5 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#1E2536] pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Configurar Nueva Campaña IA
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowWizard(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancelar
            </button>
          </div>

          {/* Preset Saved Segments */}
          {meta.segments.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Usar segmento guardado:</span>
              {meta.segments.map((seg) => (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => setFilters(normalizeCustomerFilters(seg.filters))}
                  className="px-2.5 py-1 rounded-full text-xs border border-slate-200 dark:border-[#232A3B] hover:border-[#0052FF] text-slate-700 dark:text-slate-200"
                >
                  {seg.name}
                </button>
              ))}
            </div>
          )}

          {/* Segment Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select
              value={filters.stage || 'all'}
              onChange={(e) => updateFilter({ stage: e.target.value === 'all' ? undefined : e.target.value })}
              className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-2 text-xs"
            >
              <option value="all">Etapa: Todas</option>
              {Object.entries(stageLabels).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={filters.temperature || 'all'}
              onChange={(e) =>
                updateFilter({ temperature: e.target.value === 'all' ? undefined : e.target.value })
              }
              className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-2 text-xs"
            >
              <option value="all">Temperatura: Cualquiera</option>
              <option value="hot">🔥 Listo para cerrar</option>
              <option value="qualified_doubt">💬 Con dudas</option>
              <option value="warm">🌤️ Tibio</option>
              <option value="cold">❄️ Frío</option>
            </select>

            <select
              value={filters.tagId || 'all'}
              onChange={(e) => updateFilter({ tagId: e.target.value === 'all' ? undefined : e.target.value })}
              className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-2 text-xs"
            >
              <option value="all">Etiqueta: Todas</option>
              {meta.tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <select
              value={filters.buyers || 'all'}
              onChange={(e) =>
                updateFilter({
                  buyers: e.target.value === 'all' ? undefined : (e.target.value as 'buyers' | 'non_buyers'),
                })
              }
              className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-2 text-xs"
            >
              <option value="all">Compras: Todos</option>
              <option value="buyers">Solo compradores (recompra)</option>
              <option value="non_buyers">Sin compras aún</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={filters.channel || 'all'}
              onChange={(e) =>
                updateFilter({
                  channel: e.target.value === 'all' ? undefined : (e.target.value as 'whatsapp' | 'instagram'),
                })
              }
              className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-2 text-xs"
            >
              <option value="all">Canal: Todos</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
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
              placeholder="Score mínimo (0-100)"
              className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-2 text-xs"
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
              className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-2.5 py-2 text-xs"
            />
          </div>

          {/* Live Audience Preview */}
          <div className="rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#0D111A] p-4 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
                <Users className="w-4 h-4 text-[#0052FF]" />
                {loadingPreview ? (
                  <span>Calculando audiencia...</span>
                ) : preview ? (
                  <span>
                    Audiencia estimada: {preview.totalEligible} clientes (máx. 500 por campaña)
                  </span>
                ) : (
                  <span>Sin vista previa</span>
                )}
              </div>
              <span className="text-[11px] text-slate-500">
                {describeCustomerFilters(filters, filters.tagId ? tagMap.get(filters.tagId) : null)}
              </span>
            </div>

            {preview && preview.whatsappProvider === 'meta' && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Tu línea usa <strong>Meta Cloud API</strong>: actualmente{' '}
                  <strong>{preview.metaEligibleNow}</strong> de {preview.totalEligible} están dentro
                  de ventana de 24h y pueden recibir mensaje libre ahora. Los demás serán omitidos por política de Meta.
                </span>
              </div>
            )}

            {preview && preview.sample.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {preview.sample.map((s) => (
                  <span
                    key={s.id}
                    className="px-2 py-0.5 rounded-md bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] text-[11px] text-slate-600 dark:text-slate-300"
                  >
                    {s.name} {typeof s.lead_score === 'number' ? `(${s.lead_score})` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Campaign Name & AI Prompt */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nombre de la campaña *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Reactivación Tibios Contraentrega Mayo"
                className="w-full rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tope diario de envíos
              </label>
              <input
                type="number"
                min={5}
                max={500}
                value={dailyCap}
                onChange={(e) => setDailyCap(Math.max(5, Math.min(500, Number(e.target.value) || 50)))}
                className="w-full rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Objetivo e instrucciones para que la IA redacte cada mensaje *
            </label>
            <textarea
              rows={3}
              required
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Ej: Retoma la conversación mencionando el producto que preguntó el cliente, destaca que contamos con pago contraentrega sin riesgo y pregunta si desea apartar su talla hoy."
              className="w-full rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0D111A] px-3 py-2 text-xs"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeProductPhoto}
                onChange={(e) => setIncludeProductPhoto(e.target.checked)}
                className="rounded"
              />
              Incluir foto del producto de interés cuando exista en el catálogo
            </label>

            <button
              type="submit"
              disabled={creating || !name.trim() || objective.trim().length < 5}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white"
            >
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Lanzar Campaña IA
            </button>
          </div>
        </form>
      )}

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <div className="bg-white dark:bg-[#131722] rounded-2xl border border-dashed border-slate-200 dark:border-[#232A3B] py-14 px-6 text-center space-y-2">
          <Megaphone className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Aún no has creado campañas IA a segmentos
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Filtra tus clientes por etiqueta, temperatura o compras previas y deja que la IA envíe mensajes personalizados con seguimiento de respuestas y ventas en COP.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => {
            const s = c.stats;
            const statusMeta = CAMPAIGN_STATUS_META[c.status] || CAMPAIGN_STATUS_META.draft;
            const processed = s.sent + s.skipped + s.failed;
            const pct = s.total > 0 ? Math.min(100, Math.round((processed / s.total) * 100)) : 0;

            return (
              <div
                key={c.id}
                className="bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] p-5 space-y-4 shadow-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{c.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {formatShortDate(c.created_at)} · Tope {c.daily_cap}/día
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{c.objective}</p>
                    <p className="text-[11px] text-slate-400">
                      Segmento:{' '}
                      {describeCustomerFilters(
                        c.segment_filters || {},
                        c.segment_filters?.tagId ? tagMap.get(c.segment_filters.tagId) : null
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.status === 'running' && (
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => handleStatusChange(c.id, 'paused')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50"
                      >
                        <Pause className="w-3.5 h-3.5" /> Pausar
                      </button>
                    )}
                    {c.status === 'paused' && (
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => handleStatusChange(c.id, 'running')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50"
                      >
                        <Play className="w-3.5 h-3.5" /> Reanudar
                      </button>
                    )}
                    {(c.status === 'running' || c.status === 'paused') && (
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => handleStatusChange(c.id, 'cancelled')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Cancelar
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>
                      Progreso: {processed} / {s.total} procesados ({s.pending} pendientes)
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#1E2536] overflow-hidden">
                    <div
                      className="h-full bg-[#0052FF] dark:bg-[#00D2FF] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 pt-1 text-xs">
                  <div className="rounded-lg bg-slate-50 dark:bg-[#0D111A] p-2.5">
                    <div className="text-[10px] text-slate-400">Enviados</div>
                    <div className="font-bold text-slate-900 dark:text-white">{s.sent}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-[#0D111A] p-2.5">
                    <div className="text-[10px] text-slate-400">Pendientes</div>
                    <div className="font-bold text-slate-900 dark:text-white">{s.pending}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-[#0D111A] p-2.5">
                    <div className="text-[10px] text-slate-400">Omitidos</div>
                    <div className="font-bold text-slate-900 dark:text-white">{s.skipped}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-[#0D111A] p-2.5">
                    <div className="text-[10px] text-slate-400">Respondieron</div>
                    <div className="font-bold text-blue-600 dark:text-blue-400">{s.replied}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-[#0D111A] p-2.5">
                    <div className="text-[10px] text-slate-400">Convirtieron</div>
                    <div className="font-bold text-emerald-600 dark:text-emerald-400">
                      {s.converted}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-[#0D111A] p-2.5">
                    <div className="text-[10px] text-slate-400">Ingresos atribuidos</div>
                    <div className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {formatCop(s.revenue)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
