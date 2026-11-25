'use client';

import React, { useEffect, useState } from 'react';
import {
  Bell,
  Calendar,
  Check,
  CheckCheck,
  FileAudio,
  MessageSquare,
  Send,
  ShoppingBag,
  Sparkles,
  UserCheck,
  Video,
  Wand2,
} from 'lucide-react';

export type BusinessMode = 'products' | 'services' | 'hybrid';

interface ScenarioConfig {
  label: string;
  channel: string;
  contactName: string;
  stage: string;
  temperature: string;
  interest: string;
  messages: Array<{
    from: 'lead' | 'ai';
    type?: 'audio' | 'text' | 'card' | 'meet';
    text: string;
    cardTitle?: string;
    cardPrice?: string;
    meetTime?: string;
  }>;
  copilotTip: string;
}

const HERO_SCENARIOS: Record<BusinessMode, ScenarioConfig> = {
  products: {
    label: 'Productos',
    channel: 'WhatsApp',
    contactName: 'Camila Restrepo',
    stage: 'Cotizando · Caliente',
    temperature: 'Alta intención',
    interest: 'Cocinita Nórdica MDF',
    messages: [
      {
        from: 'lead',
        type: 'audio',
        text: 'Hola, me interesa la cocinita nórdica, ¿qué precio tiene y cómo la puedo pedir?',
      },
      {
        from: 'ai',
        type: 'card',
        cardTitle: 'Cocinita Nórdica MDF',
        cardPrice: '$480.000',
        text: '¡Hola Camila! Aquí tienes la referencia oficial. Podemos registrarte el pedido con envío o apartado.',
      },
      {
        from: 'lead',
        type: 'text',
        text: 'Me encanta, quiero pedirla para envío a Medellín.',
      },
      {
        from: 'ai',
        type: 'text',
        text: 'Perfecto. Te comparto nuestras cuentas oficiales y registro tu pedido ahora mismo.',
      },
    ],
    copilotTip: 'Pedido listo para confirmar con datos de envío y comprobante.',
  },
  services: {
    label: 'Servicios',
    channel: 'Instagram',
    contactName: 'Andrés Mejía',
    stage: 'Cita Agendada',
    temperature: 'Caliente',
    interest: 'Valoración Especializada',
    messages: [
      {
        from: 'lead',
        type: 'text',
        text: 'Hola! Tienen espacio mañana en la tarde para valoración?',
      },
      {
        from: 'ai',
        type: 'text',
        text: 'Hola Andrés. Tengo disponibilidad mañana a las 3:00 PM o 4:30 PM. ¿Cuál prefieres?',
      },
      {
        from: 'lead',
        type: 'text',
        text: 'A las 3:00 PM está perfecto.',
      },
      {
        from: 'ai',
        type: 'meet',
        meetTime: 'Mañana · 3:00 PM · Google Meet generado',
        text: 'Listo, tu cita quedó confirmada en Google Calendar y recibirás recordatorio 8h antes.',
      },
    ],
    copilotTip: 'Cita sincronizada con Google Calendar y protocolo Anti-No-Show activo.',
  },
  hybrid: {
    label: 'Híbrido',
    channel: 'WhatsApp',
    contactName: 'Laura Gómez',
    stage: 'Calificado',
    temperature: 'Duda puntual',
    interest: 'Kit Facial + Sesión',
    messages: [
      {
        from: 'lead',
        type: 'text',
        text: 'Quiero saber el precio de la limpieza facial y si venden el sérum para casa.',
      },
      {
        from: 'ai',
        type: 'card',
        cardTitle: 'Sérum Reparador 30ml',
        cardPrice: '$115.000',
        text: 'La sesión de limpieza vale $140.000 y el sérum oficial $115.000. ¿Agendamos tu cita o te armamos el pedido?',
      },
      {
        from: 'lead',
        type: 'text',
        text: 'Quiero ambos, agendar el viernes y llevar el sérum.',
      },
      {
        from: 'ai',
        type: 'meet',
        meetTime: 'Viernes · 10:00 AM · Reserva + Pedido',
        text: 'Excelente, dejo tu cita reservada y el sérum separado para entrega ese día.',
      },
    ],
    copilotTip: 'Catálogo de productos y agenda de servicios operando en el mismo hilo.',
  },
};

export function HeroInboxMotionDemo() {
  const [mode, setMode] = useState<BusinessMode>('products');
  const [visibleSteps, setVisibleSteps] = useState<number>(2);

  useEffect(() => {
    setVisibleSteps(2);
    const t1 = setTimeout(() => setVisibleSteps(3), 1400);
    const t2 = setTimeout(() => setVisibleSteps(4), 2800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [mode]);

  const scenario = HERO_SCENARIOS[mode];

  return (
    <div className="rounded-2xl border border-[#1E2433] bg-[#0D1017] shadow-2xl overflow-hidden">
      {/* Barra superior estilo ventana CRM */}
      <div className="px-4 py-3 border-b border-[#1E2433] bg-[#131722] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Inbox Synqo</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">{scenario.channel}</span>
        </div>

        {/* Selector de modelo sin pastillas decorativas */}
        <div className="inline-flex rounded-lg bg-[#090A0F] p-0.5 border border-[#1E2433]">
          {(['products', 'services', 'hybrid'] as BusinessMode[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                mode === key
                  ? 'bg-[#0052FF] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {HERO_SCENARIOS[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* Cuerpo dividido: Chat + Ficha 360 */}
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Hilo conversacional */}
        <div className="lg:col-span-8 p-4 sm:p-5 space-y-3 min-h-[340px] flex flex-col justify-between bg-[#090A0F]/60">
          <div className="space-y-3">
            {scenario.messages.slice(0, visibleSteps).map((m, idx) => (
              <div
                key={`${mode}-${idx}`}
                className={`flex ${m.from === 'lead' ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.from === 'lead'
                      ? 'bg-[#1A1F2C] text-slate-200 border border-[#232A3B]'
                      : 'bg-[#0052FF]/15 text-slate-100 border border-[#0052FF]/35'
                  }`}
                >
                  {m.type === 'audio' && (
                    <div className="flex items-center gap-2 text-[11px] text-[#00D2FF] mb-1 font-medium">
                      <FileAudio className="w-3.5 h-3.5" />
                      <span>Nota de voz transcrita automáticamente</span>
                    </div>
                  )}

                  {m.type === 'card' && (
                    <div className="mb-2 p-2.5 rounded-xl bg-[#131722] border border-[#232A3B] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-[#0052FF]/20 border border-[#0052FF]/30 flex items-center justify-center text-[#00D2FF]">
                          <ShoppingBag className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-white">{m.cardTitle}</div>
                          <div className="text-[11px] text-emerald-400 font-tabular font-semibold">
                            {m.cardPrice}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400">Catálogo oficial</span>
                    </div>
                  )}

                  {m.type === 'meet' && (
                    <div className="mb-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5">
                      <Video className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-[11px] font-medium text-emerald-200">
                        {m.meetTime}
                      </span>
                    </div>
                  )}

                  <p>{m.text}</p>
                </div>
              </div>
            ))}

            {visibleSteps < 4 && (
              <div className="flex justify-end">
                <div className="px-3 py-2 rounded-xl bg-[#131722] border border-[#1E2433] text-[11px] text-slate-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00D2FF] animate-ping" />
                  <span>Procesando siguiente acción...</span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[#1E2433] flex items-center justify-between text-[11px] text-slate-500">
            <span>IA activa con precios y reglas reales del negocio</span>
            <button
              type="button"
              onClick={() => setVisibleSteps((v) => (v >= 4 ? 2 : 4))}
              className="text-slate-300 hover:text-white transition cursor-pointer"
            >
              {visibleSteps >= 4 ? 'Repetir secuencia' : 'Ver completo'}
            </button>
          </div>
        </div>

        {/* Ficha 360 lateral */}
        <div className="lg:col-span-4 p-4 sm:p-5 border-t lg:border-t-0 lg:border-l border-[#1E2433] bg-[#131722]/70 space-y-4">
          <div>
            <div className="text-[11px] text-slate-400 mb-1">Ficha 360 del contacto</div>
            <div className="text-sm font-bold text-white">{scenario.contactName}</div>
            <div className="text-xs text-slate-400 mt-0.5">{scenario.interest}</div>
          </div>

          <div className="space-y-2.5 text-xs border-t border-[#1E2433] pt-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Etapa</span>
              <span className="text-white font-medium">{scenario.stage}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Temperatura</span>
              <span className="text-[#00D2FF] font-medium">{scenario.temperature}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#090A0F] border border-[#1E2433] space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
              <Sparkles className="w-3.5 h-3.5 text-[#00D2FF]" />
              <span>Copiloto Comercial</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">{scenario.copilotTip}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductivityFlowScenes() {
  const [handoffDraftSent, setHandoffDraftSent] = useState(false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Escena A: Atención instantánea sin improvisar */}
      <div className="rounded-2xl border border-[#1E2433] bg-[#111520] p-6 flex flex-col justify-between space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-white tracking-tight">
            Atención instantánea sin improvisar
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Transcribe notas de voz entrantes, consulta tu catálogo y responde con tus precios, fotos y
            medios de pago reales en segundos.
          </p>
        </div>

        <div className="rounded-xl bg-[#090A0F] border border-[#1E2433] p-4 space-y-3">
          <div className="flex items-center gap-2.5 text-xs text-slate-300">
            <FileAudio className="w-4 h-4 text-[#00D2FF] shrink-0" />
            <div className="flex-1 flex items-center gap-1 h-4">
              {[35, 70, 45, 90, 60, 80, 40, 75, 50, 65, 35].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-full bg-[#0052FF]/60 transition-all duration-500"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <span className="text-[10px] font-tabular text-slate-500">0:14</span>
          </div>
          <div className="text-[11px] text-slate-400 border-l-2 border-[#0052FF] pl-2.5">
            &ldquo;¿Tienen disponibilidad para hoy y qué valor tiene el envío?&rdquo;
          </div>
          <div className="flex items-center justify-between text-[11px] text-emerald-400 pt-1">
            <span>Catálogo y tarifas validados</span>
            <CheckCheck className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Escena B: Relevo inteligente en "Por responder" */}
      <div className="rounded-2xl border border-[#1E2433] bg-[#111520] p-6 flex flex-col justify-between space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-white tracking-tight">
            Relevo inteligente en &ldquo;Por responder&rdquo;
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Cuando el cliente envía un comprobante o pide un asesor, la IA se pausa, alerta al equipo
            y prepara un borrador sugerido.
          </p>
        </div>

        <div className="rounded-xl bg-[#090A0F] border border-[#1E2433] p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-amber-300 font-medium">
              <Bell className="w-3.5 h-3.5" />
              Relevo humano activado
            </span>
            <span className="text-[11px] text-slate-500">IA en pausa</span>
          </div>

          <div className="p-2.5 rounded-lg bg-[#131722] border border-[#1E2433] text-[11px] text-slate-300">
            {handoffDraftSent
              ? 'Respuesta enviada al cliente. Caso atendido en segundos.'
              : 'Borrador Copiloto: "Recibimos tu comprobante, ya estamos validando tu despacho."'}
          </div>

          <button
            type="button"
            onClick={() => setHandoffDraftSent((prev) => !prev)}
            className="w-full py-2 px-3 rounded-lg bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            {handoffDraftSent ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Atendido (reiniciar vista)</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Enviar borrador en 1 clic</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Escena C: De conversación a operación cerrada */}
      <div className="rounded-2xl border border-[#1E2433] bg-[#111520] p-6 flex flex-col justify-between space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-white tracking-tight">
            De conversación a operación cerrada
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Registra pedidos con abonos y saldo desde el chat o agenda citas sincronizadas con Google
            Calendar, Meet y recordatorio 8h antes.
          </p>
        </div>

        <div className="rounded-xl bg-[#090A0F] border border-[#1E2433] p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between p-2 rounded-lg bg-[#131722] border border-[#1E2433]">
            <span className="flex items-center gap-2 text-slate-200">
              <ShoppingBag className="w-3.5 h-3.5 text-[#00D2FF]" />
              Pedido #1042 registrado
            </span>
            <span className="text-emerald-400 font-tabular font-semibold">Confirmado</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-lg bg-[#131722] border border-[#1E2433]">
            <span className="flex items-center gap-2 text-slate-200">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              Google Calendar + Meet
            </span>
            <span className="text-slate-400">Recordatorio 8h</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type ImprovementTab = 'sandbox' | 'gaps' | 'campaigns';

export function ContinuousImprovementMotion() {
  const [tab, setTab] = useState<ImprovementTab>('sandbox');
  const [sandboxApplied, setSandboxApplied] = useState(false);
  const [gapResolved, setGapResolved] = useState(false);

  return (
    <div className="rounded-2xl border border-[#1E2433] bg-[#111520] overflow-hidden">
      <div className="border-b border-[#1E2433] px-4 sm:px-6 pt-4 flex flex-wrap gap-2 bg-[#131722]">
        {[
          { id: 'sandbox' as const, label: 'Sandbox y corrección directa' },
          { id: 'gaps' as const, label: 'Preguntas por resolver' },
          { id: 'campaigns' as const, label: 'Campañas IA y analítica' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
              tab === item.id
                ? 'border-[#0052FF] text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {tab === 'sandbox' && (
          <>
            <div className="lg:col-span-5 space-y-3">
              <h3 className="text-xl font-bold text-white tracking-tight">
                Prueba y corrige antes de salir con clientes reales
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Simula conversaciones en vivo con el mismo motor de producción. Si una respuesta no
                te convence, escribe la corrección y el sistema la ubica automáticamente en la sección
                exacta de tu prompt.
              </p>
            </div>
            <div className="lg:col-span-7 rounded-xl bg-[#090A0F] border border-[#1E2433] p-5 space-y-3 text-xs">
              <div className="text-slate-400">Respuesta simulada de la IA:</div>
              <div className="p-3 rounded-lg bg-[#131722] border border-[#1E2433] text-slate-200">
                &ldquo;Podemos hacerte descuento del 15% si pagas hoy.&rdquo;
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <span className="text-slate-300">
                  {sandboxApplied
                    ? 'Guardado en sección Políticas y Condiciones del prompt.'
                    : 'Corrección: "No damos descuentos en efectivo."'}
                </span>
                <button
                  type="button"
                  onClick={() => setSandboxApplied((p) => !p)}
                  className="px-3.5 py-2 rounded-lg bg-[#0052FF] hover:bg-[#0043D4] text-white font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>{sandboxApplied ? 'Regla aplicada' : 'Corregir en Sandbox'}</span>
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'gaps' && (
          <>
            <div className="lg:col-span-5 space-y-3">
              <h3 className="text-xl font-bold text-white tracking-tight">
                Cada duda resuelta entrena a tu agente para siempre
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Las preguntas que la IA no pudo contestar quedan registradas en un solo lugar. Al
                responderlas una vez, alimentan el prompt principal y quedan disponibles como atajo
                para el equipo.
              </p>
            </div>
            <div className="lg:col-span-7 rounded-xl bg-[#090A0F] border border-[#1E2433] p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Pregunta detectada en chat real</span>
                <span className="text-amber-300">{gapResolved ? 'Resuelta' : 'Pendiente'}</span>
              </div>
              <div className="p-3 rounded-lg bg-[#131722] border border-[#1E2433] text-white font-medium">
                &ldquo;¿Tienen garantía por defectos de fábrica y cuántos días cubre?&rdquo;
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-slate-400">
                  {gapResolved
                    ? 'Incorporada en Preguntas Frecuentes del prompt principal.'
                    : 'Respuesta del equipo: "Sí, 90 días de garantía directa."'}
                </span>
                <button
                  type="button"
                  onClick={() => setGapResolved((p) => !p)}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>{gapResolved ? 'IA entrenada' : 'Entrenar IA en 1 clic'}</span>
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'campaigns' && (
          <>
            <div className="lg:col-span-5 space-y-3">
              <h3 className="text-xl font-bold text-white tracking-tight">
                Seguimientos anti-visto, campañas y analítica real
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Activa secuencias automáticas cuando un lead deja en visto, lanza campañas IA
                segmentadas a prospectos tibios y revisa en tu Dashboard las causas reales de
                relevo a asesor.
              </p>
            </div>
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-[#090A0F] border border-[#1E2433] space-y-1.5">
                <div className="text-[11px] text-[#00D2FF] font-semibold">Seguimientos</div>
                <div className="text-sm font-bold text-white">Secuencias por embudo</div>
                <div className="text-[11px] text-slate-400">
                  Se detienen solas cuando el cliente responde o pasa a asesor
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#090A0F] border border-[#1E2433] space-y-1.5">
                <div className="text-[11px] text-emerald-400 font-semibold">Campañas IA</div>
                <div className="text-sm font-bold text-white">Reactivación segmentada</div>
                <div className="text-[11px] text-slate-400">
                  Filtra por temperatura, etiqueta o días sin respuesta
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#090A0F] border border-[#1E2433] space-y-1.5">
                <div className="text-[11px] text-slate-300 font-semibold">Dashboard</div>
                <div className="text-sm font-bold text-white">Autonomía y relevos</div>
                <div className="text-[11px] text-slate-400">
                  Mide chats resueltos por IA y tips según tu prompt real
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AdaptiveBusinessModelSection() {
  const [selected, setSelected] = useState<BusinessMode>('products');

  const details: Record<
    BusinessMode,
    { summary: string; activeModules: string[]; benefit: string }
  > = {
    products: {
      summary: 'Enfocado en venta directa, cotización rápida y control de despachos.',
      activeModules: [
        'Catálogo de Productos y Galería independiente',
        'Tarjetas visuales con foto y precio oficial en chat',
        'Módulo de Pedidos, abonos y seguimiento',
      ],
      benefit: 'Tu agente se concentra en cotizar, mostrar fotos y cerrar pedidos sin distraerse.',
    },
    services: {
      summary: 'Diseñado para agendas, consultas, citas presenciales o por videollamada.',
      activeModules: [
        'Catálogo de Servicios con duración y precio',
        'Calendario Nativo + sincronización Google Calendar y Meet',
        'Protocolo Anti-No-Show con recordatorio automático 8h antes',
        'Reprogramación y cancelación bidireccional',
      ],
      benefit: 'Llena tu agenda evitando cruces de horario y reduciendo ausencias.',
    },
    hybrid: {
      summary: 'Para negocios que venden productos y también agendan servicios en un mismo canal.',
      activeModules: [
        'Catálogo unificado organizado en Productos y Servicios',
        'Pedidos + Calendario Nativo y Google Meet activos',
        'Ficha 360 y Copiloto adaptados a ambos flujos',
        'Campañas IA segmentadas por interés',
      ],
      benefit: 'Un mismo cliente puede agendar su cita y llevar un producto en la misma conversación.',
    },
  };

  const current = details[selected];

  return (
    <div className="rounded-2xl border border-[#1E2433] bg-[#111520] p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <div className="lg:col-span-5 space-y-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Se adapta a cómo vende tu negocio
        </h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          Al activar tu empresa, Synqo enciende únicamente los módulos que necesitas para mantener
          respuestas precisas y menor consumo de tokens.
        </p>

        <div className="flex flex-col gap-2 pt-2">
          {(
            [
              { id: 'products', title: 'Productos' },
              { id: 'services', title: 'Servicios' },
              { id: 'hybrid', title: 'Modelo Híbrido (Productos + Servicios)' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item.id)}
              className={`px-4 py-3 rounded-xl text-left text-sm font-medium border transition cursor-pointer flex items-center justify-between ${
                selected === item.id
                  ? 'bg-[#0052FF]/15 border-[#0052FF] text-white'
                  : 'bg-[#090A0F] border-[#1E2433] text-slate-400 hover:text-white'
              }`}
            >
              <span>{item.title}</span>
              <MessageSquare
                className={`w-4 h-4 ${
                  selected === item.id ? 'text-[#00D2FF]' : 'text-slate-600'
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="lg:col-span-7 rounded-xl bg-[#090A0F] border border-[#1E2433] p-6 space-y-5">
        <div>
          <div className="text-xs text-[#00D2FF] font-semibold mb-1">Configuración sugerida</div>
          <p className="text-sm text-slate-200">{current.summary}</p>
        </div>

        <ul className="space-y-2.5 border-t border-[#1E2433] pt-4">
          {current.activeModules.map((mod) => (
            <li key={mod} className="flex items-start gap-2.5 text-sm text-slate-300">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{mod}</span>
            </li>
          ))}
        </ul>

        <div className="p-3.5 rounded-xl bg-[#131722] border border-[#1E2433] text-xs text-slate-300">
          {current.benefit}
        </div>
      </div>
    </div>
  );
}
