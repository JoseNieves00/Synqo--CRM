'use client';

import React, { useEffect, useState } from 'react';
import {
  Bot,
  FlaskConical,
  HelpCircle,
  History,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Repeat,
  Send,
  Sparkles,
  TrendingUp,
  Wand2,
  X,
} from 'lucide-react';
import type { IndustryPreset } from '@/lib/ai/prompt-compiler';
import {
  PROMPT_BLUEPRINT_SLOTS,
  type BlueprintSlot,
} from '@/lib/ai/prompt-assistant/blueprint';
import {
  createEmptyAssistantState,
  type PendingSectionProposal,
  type PromptAssistantState,
} from '@/lib/ai/prompt-assistant/state';
import type { PromptVersionEntry } from '@/lib/ai/prompt-assistant/versions';
import type { HealthActionTarget, PromptHealthReport } from '@/lib/ai/prompt-assistant/health';
import { COMMON_HELP_CHIPS } from '@/lib/ai/prompt-assistant/guide';
import type { ImportedCatalogItem } from '@/lib/ai/prompt-assistant/file-import';
import {
  analyzeExistingPromptAction,
  applySectionProposalAction,
  askAssistantHelpAction,
  buildDeterministicSandboxQuestionsAction,
  extractPdfCatalogBlocksAction,
  generateFollowUpsFromAssistantAction,
  getPromptAssistantBootstrapAction,
  interpretAssistantAnswerAction,
  polishPromptDraftAction,
  refreshDailyConversationAuditAction,
  rejectSectionProposalAction,
  restorePromptVersionAction,
  saveImportedCatalogToPromptAction,
} from '@/app/actions/prompt-assistant';
import type { FollowUpSuggestionMap } from '@/components/settings/FollowUpSequencesSettings';
import { AssistantChat, type AssistantChatFeedItem } from './AssistantChat';
import { HealthChecklist } from './HealthChecklist';
import { SectionProposalCard } from './SectionProposalCard';
import type { PendingImportState } from './CatalogImportPreview';

type AssistantTab = 'build' | 'insights' | 'follow_ups' | 'help';

interface PromptAssistantPanelProps {
  currentPrompt: string;
  onApplyPromptFromAssistant: (
    newPrompt: string,
    highlightedSection?: string | null,
    structuredData?: Record<string, any>
  ) => void;
  onOpenSandboxWithQuestions: (questions: string[]) => void;
  onPrefillFollowUps: (suggestions: FollowUpSuggestionMap) => void;
  onNavigateSettingTarget: (target: HealthActionTarget) => void;
}

export function PromptAssistantPanel({
  currentPrompt,
  onApplyPromptFromAssistant,
  onOpenSandboxWithQuestions,
  onPrefillFollowUps,
  onNavigateSettingTarget,
}: PromptAssistantPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AssistantTab>('build');
  const [bootstrapped, setBootstrapped] = useState(false);
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);

  const [state, setState] = useState<PromptAssistantState>(() =>
    createEmptyAssistantState('new')
  );
  const [versions, setVersions] = useState<PromptVersionEntry[]>([]);
  const [health, setHealth] = useState<PromptHealthReport | null>(null);
  const [preset, setPreset] = useState<IndustryPreset>('custom');
  const [whatsappProvider, setWhatsappProvider] = useState<'meta' | 'evolution'>('meta');
  const [activeSlotId, setActiveSlotId] = useState<string | null>(
    PROMPT_BLUEPRINT_SLOTS[0].id
  );
  const [dailyLimitReached, setDailyLimitReached] = useState(false);
  const [catalogInlineMax, setCatalogInlineMax] = useState(15);

  const [feed, setFeed] = useState<AssistantChatFeedItem[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [pendingImport, setPendingImport] = useState<PendingImportState | null>(null);

  const [showVersionsMenu, setShowVersionsMenu] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [openingSandbox, setOpeningSandbox] = useState(false);
  const [refreshingAudit, setRefreshingAudit] = useState(false);

  // Seguimientos tab
  const [fuArguments, setFuArguments] = useState('');
  const [fuTone, setFuTone] = useState('Cercano y consultivo');
  const [fuFrequency, setFuFrequency] = useState('Cada 12-24h según categoría');
  const [generatingFollowUps, setGeneratingFollowUps] = useState(false);

  // Ayuda tab
  const [helpQuestion, setHelpQuestion] = useState('');
  const [askingHelp, setAskingHelp] = useState(false);
  const [helpReply, setHelpReply] = useState<{ title: string; answer: string } | null>(null);

  const loadBootstrap = async () => {
    setLoadingBootstrap(true);
    try {
      const res = await getPromptAssistantBootstrapAction({ currentPrompt });
      setState(res.state);
      setVersions(res.versions || []);
      setHealth(res.health);
      setPreset(res.preset);
      setWhatsappProvider(res.whatsappProvider);
      setActiveSlotId(res.nextSlotId || PROMPT_BLUEPRINT_SLOTS[0].id);
      setDailyLimitReached(Boolean(res.dailyLimitReached));
      if (res.catalogInlineMax) setCatalogInlineMax(res.catalogInlineMax);
      setBootstrapped(true);
    } catch (err: any) {
      pushNotice(err?.message || 'No se pudo cargar el asistente.');
    } finally {
      setLoadingBootstrap(false);
    }
  };

  useEffect(() => {
    if (isOpen && !bootstrapped && !loadingBootstrap) {
      loadBootstrap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const refreshHealth = async (promptOverride?: string) => {
    try {
      const res = await getPromptAssistantBootstrapAction({
        currentPrompt: promptOverride !== undefined ? promptOverride : currentPrompt,
      });
      setHealth(res.health);
      setVersions(res.versions || []);
      setDailyLimitReached(Boolean(res.dailyLimitReached));
      if (res.catalogInlineMax) setCatalogInlineMax(res.catalogInlineMax);
    } catch {}
  };

  const pushNotice = (text: string) => {
    setFeed((prev) => [
      ...prev.slice(-14),
      { id: `notice-${Date.now()}-${Math.random()}`, role: 'notice', text },
    ]);
  };

  const handleSubmitAnswer = async (slot: BlueprintSlot, answer: string) => {
    setFeed((prev) => [
      ...prev.slice(-14),
      { id: `u-${Date.now()}`, role: 'user', text: answer },
    ]);

    try {
      const res = await interpretAssistantAnswerAction({
        sectionId: slot.sectionId,
        slotId: slot.id,
        answer,
        currentPrompt,
      });

      if (res.limitReached) {
        setDailyLimitReached(true);
        pushNotice(res.assistantMessage);
        return;
      }

      if (res.state) setState(res.state);
      if (Array.isArray(res.versions)) setVersions(res.versions);
      if (res.nextSlotId) setActiveSlotId(res.nextSlotId);

      if (res.patchedPrompt) {
        onApplyPromptFromAssistant(
          res.patchedPrompt,
          res.highlightedSection || slot.sectionTitle,
          (res as any).structuredData
        );
      }

      setFeed((prev) => [
        ...prev.slice(-14),
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.assistantMessage || 'Listo.',
        },
      ]);

      await refreshHealth(res.patchedPrompt || currentPrompt);
    } catch (err: any) {
      pushNotice(err?.message || 'No se pudo procesar tu respuesta.');
    }
  };

  const handleAnalyzeExisting = async () => {
    try {
      const res = await analyzeExistingPromptAction({ currentPrompt });
      if (res.limitReached) {
        setDailyLimitReached(true);
        pushNotice(
          'Alcanzaste el límite automático por hoy. Puedes responder las preguntas clave o editar el texto manualmente arriba.'
        );
        return;
      }
      if (res.state) setState(res.state);
      setConflicts(res.conflicts || []);
      if (res.nextSlotId) setActiveSlotId(res.nextSlotId);
      const propCount = res.proposals?.length || 0;
      setFeed((prev) => [
        ...prev.slice(-14),
        {
          id: `an-${Date.now()}`,
          role: 'assistant',
          text:
            propCount > 0
              ? `Analicé tu prompt actual sin modificar nada. Encontré ${propCount} oportunidad(es) de mejora arriba para que revises y decidas cuál aplicar.`
              : 'Tu prompt actual se ve muy completo en las secciones clave. Puedes revisar la pestaña Ayuda para validar detalles o probarlo en Sandbox.',
        },
      ]);
      await refreshHealth();
    } catch (err: any) {
      pushNotice(err?.message || 'Error al analizar tu prompt actual.');
    }
  };

  const handleAcceptProposal = async (proposal: PendingSectionProposal) => {
    try {
      const res = await applySectionProposalAction({
        proposalId: proposal.id,
        sectionId: proposal.sectionId,
        sectionTitle: proposal.sectionTitle,
        proposedText: proposal.proposedText,
        currentPrompt,
      });
      setVersions(res.versions || []);
      setState((prev) => ({
        ...prev,
        pendingProposals: res.remainingProposals || [],
        sectionStatus: { ...prev.sectionStatus, [proposal.sectionId]: 'complete' },
      }));
      onApplyPromptFromAssistant(
        res.patchedPrompt,
        res.highlightedSection,
        (res as any).structuredData
      );
      await refreshHealth(res.patchedPrompt);
    } catch (err: any) {
      pushNotice(err?.message || 'No se pudo aplicar la propuesta.');
    }
  };

  const handleRejectProposal = async (proposalId: string) => {
    try {
      const res = await rejectSectionProposalAction({ proposalId });
      setState((prev) => ({
        ...prev,
        pendingProposals: res.remainingProposals || [],
      }));
    } catch (err: any) {
      pushNotice(err?.message || 'No se pudo descartar la propuesta.');
    }
  };

  const handleSaveImportedCatalog = async (items: ImportedCatalogItem[]) => {
    try {
      const res = await saveImportedCatalogToPromptAction({
        items,
        currentPrompt,
      });
      setVersions(res.versions || []);
      setPendingImport(null);
      onApplyPromptFromAssistant(res.patchedPrompt, 'Catálogo', (res as any).structuredData);
      setFeed((prev) => [
        ...prev.slice(-14),
        {
          id: `cat-${Date.now()}`,
          role: 'assistant',
          text: `Agregué ${res.importedCount} opción(es) a ## Catálogo.${
            res.missingPhotoItems?.length > 0
              ? ` Recuerda que ${res.missingPhotoItems.length} ítem(s) aún no tienen foto en Fotos de Productos.`
              : ''
          }`,
        },
      ]);
      await refreshHealth(res.patchedPrompt);
    } catch (err: any) {
      pushNotice(err?.message || 'No se pudo guardar el catálogo importado.');
    }
  };

  const handleExtractPdfBlocks = async (
    blocks: string[],
    meta: { fileName: string }
  ) => {
    try {
      const res = await extractPdfCatalogBlocksAction({ blocks });
      if (res.limitReached) {
        setDailyLimitReached(true);
        pushNotice('Alcanzaste el límite de extracción automática por hoy.');
        return;
      }
      if (!res.items || res.items.length === 0) {
        setPendingImport(null);
        pushNotice(
          'No logramos identificar filas claras de productos con precio en ese PDF. Prueba subirlo como Excel o CSV.'
        );
        return;
      }
      setPendingImport({
        type: 'pdf_items',
        fileName: meta.fileName,
        items: res.items,
        exceededInlineLimit: res.items.length > catalogInlineMax,
        catalogInlineMax,
      });
    } catch (err: any) {
      pushNotice(err?.message || 'No se pudo extraer el PDF.');
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    setShowVersionsMenu(false);
    try {
      const res = await restorePromptVersionAction({ versionId, currentPrompt });
      setVersions(res.versions || []);
      onApplyPromptFromAssistant(res.restoredPrompt, null, (res as any).structuredData);
      pushNotice('Se restauró la versión seleccionada sin perder tu historial.');
      await refreshHealth(res.restoredPrompt);
    } catch (err: any) {
      pushNotice(err?.message || 'No se pudo restaurar la versión.');
    }
  };

  const handlePolishPrompt = async () => {
    if (polishing || currentPrompt.trim().length < 40) return;
    setPolishing(true);
    try {
      const res = await polishPromptDraftAction({ currentPrompt });
      if (res.limitReached) {
        setDailyLimitReached(true);
        pushNotice('Alcanzaste el límite automático por hoy.');
        return;
      }
      setVersions(res.versions || []);
      if (res.polishedPrompt) {
        onApplyPromptFromAssistant(res.polishedPrompt, null, (res as any).structuredData);
        pushNotice('Redacción optimizada conservando todos tus datos y precios intactos.');
      }
      await refreshHealth(res.polishedPrompt || currentPrompt);
    } catch (err: any) {
      pushNotice(err?.message || 'No se pudo pulir el texto.');
    } finally {
      setPolishing(false);
    }
  };

  const handleOpenSandbox = async () => {
    setOpeningSandbox(true);
    try {
      const res = await buildDeterministicSandboxQuestionsAction({ currentPrompt });
      onOpenSandboxWithQuestions(res.questions || []);
    } catch {
      onOpenSandboxWithQuestions([]);
    } finally {
      setOpeningSandbox(false);
    }
  };

  const handleRefreshAudit = async (force = false) => {
    if (refreshingAudit) return;
    setRefreshingAudit(true);
    try {
      const res = await refreshDailyConversationAuditAction({ force });
      setState(res.state);
      if (res.ranAi) {
        pushNotice('Análisis actualizado con las conversaciones reales recientes.');
      } else if (res.skippedReason === 'insufficient_conversations' || res.skippedReason === 'insufficient_sample') {
        pushNotice('Se necesitan al menos 3 conversaciones recientes para generar estadísticas.');
      } else if (res.skippedReason === 'no_new_activity' || res.skippedReason === 'already_audited_today') {
        pushNotice('Ya tienes el análisis al día con tus últimas conversaciones.');
      }
    } catch (err: any) {
      pushNotice(err?.message || 'No se pudo actualizar el análisis.');
    } finally {
      setRefreshingAudit(false);
    }
  };

  const handleGenerateFollowUps = async () => {
    setGeneratingFollowUps(true);
    try {
      const res = await generateFollowUpsFromAssistantAction({
        argumentsHint: fuArguments.trim() || undefined,
        toneHint: fuTone.trim() || undefined,
        frequencyHint: fuFrequency.trim() || undefined,
      });
      if (res.success && res.suggestions) {
        onPrefillFollowUps(res.suggestions as FollowUpSuggestionMap);
        setIsOpen(false);
      }
    } catch (err: any) {
      pushNotice(err?.message || 'Error al generar borradores de seguimiento.');
      setActiveTab('build');
    } finally {
      setGeneratingFollowUps(false);
    }
  };

  const handleAskHelp = async (qOverride?: string) => {
    const q = (qOverride ?? helpQuestion).trim();
    if (!q || askingHelp) return;
    if (!qOverride) setHelpQuestion('');
    setAskingHelp(true);
    try {
      const res = await askAssistantHelpAction({ question: q });
      if (res.limitReached) setDailyLimitReached(true);
      setHelpReply({
        title: res.topicTitle || 'Guía de Synqo',
        answer: res.answer,
      });
    } catch (err: any) {
      setHelpReply({
        title: 'Aviso',
        answer: err?.message || 'No se pudo consultar la guía.',
      });
    } finally {
      setAskingHelp(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-[990] px-4 py-3 rounded-2xl bg-[#0052FF] hover:bg-[#0043D4] text-white shadow-2xl shadow-blue-900/25 flex items-center gap-2.5 text-xs font-bold transition-transform hover:scale-[1.02] cursor-pointer border border-blue-400/30"
      >
        <div className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <span>Asistente de Prompt</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[990] w-[calc(100vw-2rem)] sm:w-[440px] h-[82vh] max-h-[700px] bg-white dark:bg-[#0E121B] border border-slate-200 dark:border-[#1E2433] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Cabecera */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-[#131722] border-b border-slate-200 dark:border-[#1E2433] shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Asistente de Prompt</span>
                {health && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-[10px] font-mono text-emerald-700 dark:text-emerald-300">
                    {health.completenessPct}%
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Arma o mejora tu bot sin perder información
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
            title="Minimizar asistente"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barra de acciones rápidas: Versiones / Pulir / Sandbox */}
        <div className="flex flex-wrap items-center gap-1.5 relative">
          <button
            type="button"
            onClick={() => setShowVersionsMenu((v) => !v)}
            disabled={versions.length === 0}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0E121B] text-[11px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer disabled:opacity-40"
            title="Restaurar una versión anterior del prompt"
          >
            <History className="w-3 h-3" />
            <span>Historial ({versions.length})</span>
          </button>

          <button
            type="button"
            onClick={handlePolishPrompt}
            disabled={polishing || currentPrompt.trim().length < 40 || dailyLimitReached}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0E121B] text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-[#0052FF] flex items-center gap-1 cursor-pointer disabled:opacity-40"
            title="Mejorar claridad y brevedad sin cambiar datos ni precios"
          >
            {polishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            <span>Pulir redacción</span>
          </button>

          <button
            type="button"
            onClick={handleOpenSandbox}
            disabled={openingSandbox}
            className="px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-700/40 bg-emerald-50/70 dark:bg-emerald-950/20 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 cursor-pointer disabled:opacity-40 ml-auto"
          >
            {openingSandbox ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <FlaskConical className="w-3 h-3" />
            )}
            <span>Probar mi bot</span>
          </button>

          {showVersionsMenu && versions.length > 0 && (
            <div className="absolute top-8 left-0 z-20 w-72 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] shadow-xl p-1.5 space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Restaurar versión previa
              </div>
              {versions.map((ver) => (
                <button
                  key={ver.id}
                  type="button"
                  onClick={() => handleRestoreVersion(ver.id)}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E2433] text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <div className="font-semibold truncate">{ver.reason}</div>
                  <div className="text-[10px] text-slate-400">
                    {new Date(ver.createdAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pestañas */}
        <div className="grid grid-cols-4 gap-1 bg-slate-200/60 dark:bg-[#090A0F] p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('build')}
            className={`py-1.5 rounded-lg text-[10px] sm:text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition ${
              activeTab === 'build'
                ? 'bg-white dark:bg-[#131722] text-[#0052FF] dark:text-[#00D2FF] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <MessageSquarePlus className="w-3.5 h-3.5 shrink-0" />
            <span>Construir</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('insights')}
            className={`py-1.5 rounded-lg text-[10px] sm:text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition relative ${
              activeTab === 'insights'
                ? 'bg-white dark:bg-[#131722] text-[#0052FF] dark:text-[#00D2FF] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
            <span>Insights</span>
            {(state.dailyInsights?.dailyTips?.length || 0) > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('follow_ups')}
            className={`py-1.5 rounded-lg text-[10px] sm:text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition ${
              activeTab === 'follow_ups'
                ? 'bg-white dark:bg-[#131722] text-[#0052FF] dark:text-[#00D2FF] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Repeat className="w-3.5 h-3.5 shrink-0" />
            <span>Seguim.</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('help')}
            className={`py-1.5 rounded-lg text-[10px] sm:text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition ${
              activeTab === 'help'
                ? 'bg-white dark:bg-[#131722] text-[#0052FF] dark:text-[#00D2FF] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Ayuda</span>
          </button>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 min-h-0 flex flex-col">
        {loadingBootstrap ? (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#0052FF]" />
            <span>Preparando tu asistente...</span>
          </div>
        ) : activeTab === 'build' ? (
          <AssistantChat
            state={state}
            preset={preset}
            currentPrompt={currentPrompt}
            activeSlotId={activeSlotId}
            onSelectSlot={(id) => setActiveSlotId(id)}
            feed={feed}
            conflicts={conflicts}
            dailyLimitReached={dailyLimitReached}
            onSubmitAnswer={handleSubmitAnswer}
            onAnalyzeExisting={handleAnalyzeExisting}
            onAcceptProposal={handleAcceptProposal}
            onRejectProposal={handleRejectProposal}
            onPolishPrompt={handlePolishPrompt}
            polishingPrompt={polishing}
            onSaveImportedCatalog={handleSaveImportedCatalog}
            onExtractPdfBlocks={handleExtractPdfBlocks}
            pendingImport={pendingImport}
            setPendingImport={setPendingImport}
            onPushNotice={pushNotice}
          />
        ) : activeTab === 'insights' ? (
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
            <div className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/80 dark:bg-[#090A0F] p-3">
              <div className="space-y-0.5 min-w-0">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Diagnóstico diario autónomo</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {state.dailyInsights
                    ? `${state.dailyInsights.summaryHeadline} (Muestra: ${state.dailyInsights.analyzedCount} chats)`
                    : 'Analizamos automáticamente tus chats convertidos vs no convertidos para detectar qué mejorar.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRefreshAudit(true)}
                disabled={refreshingAudit || dailyLimitReached}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-[#0052FF] flex items-center gap-1 cursor-pointer disabled:opacity-40 shrink-0"
                title="Analizar conversaciones recientes"
              >
                <RefreshCw className={`w-3 h-3 ${refreshingAudit ? 'animate-spin' : ''}`} />
                <span>{refreshingAudit ? 'Analizando...' : 'Actualizar'}</span>
              </button>
            </div>

            {state.dailyInsights ? (
              <>
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/70 dark:bg-emerald-950/20 p-2">
                    <div className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                      {state.dailyInsights.categoryStats.converted}
                    </div>
                    <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400 font-medium">
                      Convertidos
                    </div>
                  </div>
                  <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 bg-blue-50/70 dark:bg-blue-950/20 p-2">
                    <div className="text-sm font-black text-blue-700 dark:text-blue-300">
                      {state.dailyInsights.categoryStats.inDoubt}
                    </div>
                    <div className="text-[10px] text-blue-700/80 dark:text-blue-400 font-medium">
                      En duda
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-950/20 p-2">
                    <div className="text-sm font-black text-amber-700 dark:text-amber-300">
                      {state.dailyInsights.categoryStats.stalledWarm}
                    </div>
                    <div className="text-[10px] text-amber-700/80 dark:text-amber-400 font-medium">
                      Tibios
                    </div>
                  </div>
                  <div className="rounded-xl border border-rose-200 dark:border-rose-800/40 bg-rose-50/70 dark:bg-rose-950/20 p-2">
                    <div className="text-sm font-black text-rose-700 dark:text-rose-300">
                      {state.dailyInsights.categoryStats.lost}
                    </div>
                    <div className="text-[10px] text-rose-700/80 dark:text-rose-400 font-medium">
                      Perdidos
                    </div>
                  </div>
                </div>

                {state.dailyInsights.dailyTips.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Tips de hoy basados en tus chats
                    </div>
                    <div className="space-y-1.5">
                      {state.dailyInsights.dailyTips.map((tip, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] p-2.5 text-[11px] text-slate-700 dark:text-slate-200 leading-relaxed flex gap-2"
                        >
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">•</span>
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {state.dailyInsights.detectedNeeds.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Necesidades reales y faltantes detectados
                    </div>
                    <div className="space-y-1.5">
                      {state.dailyInsights.detectedNeeds.map((need, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-amber-200/80 dark:border-amber-700/40 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[11px] text-slate-900 dark:text-white">
                              {need.topic}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                need.impact === 'high'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                              }`}
                            >
                              {need.impact === 'high' ? 'Prioritario' : 'Mejora'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            {need.evidence}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {state.pendingProposals.filter((p) => p.source === 'daily_audit').length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Propuestas listas para aplicar a tu Prompt
                    </div>
                    {state.pendingProposals
                      .filter((p) => p.source === 'daily_audit')
                      .map((prop) => (
                        <SectionProposalCard
                          key={prop.id}
                          proposal={prop}
                          onAccept={handleAcceptProposal}
                          onReject={handleRejectProposal}
                        />
                      ))}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-[#232A3B] p-6 text-center space-y-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Aún no hay un análisis diario generado para esta empresa. El sistema lo ejecutará automáticamente cada día con tus conversaciones activas, o puedes correrlo ahora.
                </p>
                <button
                  type="button"
                  onClick={() => handleRefreshAudit(true)}
                  disabled={refreshingAudit}
                  className="px-3 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {refreshingAudit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Analizar conversaciones recientes</span>
                </button>
              </div>
            )}
          </div>
        ) : activeTab === 'follow_ups' ? (
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
            <div className="rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F] p-3 space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">
                Diseña tus secuencias de recontacto
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Usamos tus instrucciones actuales y estas pistas para llenar borradores en{' '}
                <strong>Seguimientos</strong>. Podrás revisarlos antes de guardar.
              </p>
            </div>

            {whatsappProvider === 'meta' && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50/70 dark:bg-amber-950/20 p-2.5 text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
                <strong>Aviso WhatsApp Meta:</strong> para escribir a clientes después de 24 horas desde su último mensaje, deberás asociar una{' '}
                <strong>plantilla aprobada por Meta</strong> en cada paso.
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                ¿Qué argumentos o beneficios debe resaltar la IA?
              </label>
              <textarea
                rows={3}
                value={fuArguments}
                onChange={(e) => setFuArguments(e.target.value)}
                placeholder="Ej: envío rápido, garantía directa, pago contra entrega, cupos limitados..."
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  Tono preferido
                </label>
                <input
                  type="text"
                  value={fuTone}
                  onChange={(e) => setFuTone(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  Frecuencia sugerida
                </label>
                <input
                  type="text"
                  value={fuFrequency}
                  onChange={(e) => setFuFrequency(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateFollowUps}
              disabled={generatingFollowUps}
              className="w-full py-2.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {generatingFollowUps ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>Generar mis seguimientos</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            {health && (
              <HealthChecklist
                health={health}
                onAction={(target) => {
                  if (target === 'assistant') {
                    setActiveTab('build');
                  } else if (target === 'sandbox') {
                    handleOpenSandbox();
                  } else {
                    setIsOpen(false);
                    onNavigateSettingTarget(target);
                  }
                }}
              />
            )}

            <div className="border-t border-slate-200 dark:border-[#1E2433] pt-3 space-y-2.5">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                ¿Cómo funciona la IA en Synqo?
              </div>

              <div className="flex flex-wrap gap-1.5">
                {COMMON_HELP_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleAskHelp(chip)}
                    disabled={askingHelp}
                    className="text-left px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#131722] hover:bg-slate-200 dark:hover:bg-[#1E2433] border border-slate-200 dark:border-[#232A3B] text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {helpReply && (
                <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 bg-blue-50/70 dark:bg-blue-950/20 p-3 text-xs space-y-1">
                  <div className="font-bold text-[#0052FF] dark:text-[#00D2FF]">
                    {helpReply.title}
                  </div>
                  <p className="text-[11px] text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {helpReply.answer}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={helpQuestion}
                  onChange={(e) => setHelpQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAskHelp();
                    }
                  }}
                  placeholder="Pregunta sobre clasificación, relevos, Meta..."
                  className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => handleAskHelp()}
                  disabled={askingHelp || !helpQuestion.trim()}
                  className="p-2 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white cursor-pointer disabled:opacity-40"
                >
                  {askingHelp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
