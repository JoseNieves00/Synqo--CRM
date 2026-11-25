'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Lock, MessageCircle, ShieldCheck, X } from 'lucide-react';
import {
  AdaptiveBusinessModelSection,
  BusinessMode,
  ContinuousImprovementMotion,
  HeroInboxMotionDemo,
  ProductivityFlowScenes,
} from './LandingMotionScenes';

const DEMO_WHATSAPP_NUMBER = '573224921265';

export function SynqoLandingClient() {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [businessModel, setBusinessModel] = useState<BusinessMode>('products');

  const handleOpenWhatsAppDemo = (e: React.FormEvent) => {
    e.preventDefault();
    const modelLabel =
      businessModel === 'products'
        ? 'Productos'
        : businessModel === 'services'
        ? 'Servicios'
        : 'Híbrido (Productos + Servicios)';
    const cleanName = businessName.trim();
    const text = cleanName
      ? `Hola, quiero solicitar una demo de Synqo CRM para "${cleanName}" (modelo: ${modelLabel}).`
      : `Hola, quiero solicitar una demo de Synqo CRM (modelo: ${modelLabel}).`;

    const url = `https://wa.me/${DEMO_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setIsDemoModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#090A0F] text-slate-100 flex flex-col">
      {/* Navegación minimalista */}
      <header className="sticky top-0 z-30 border-b border-[#1E2433] bg-[#090A0F]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/brand/isotipo-128w.png"
              alt="Synqo CRM"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="font-bold text-base tracking-tight text-white">Synqo CRM</span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-400">
            <a href="#productividad" className="hover:text-white transition">
              Productividad
            </a>
            <a href="#mejora-continua" className="hover:text-white transition">
              Entrenamiento IA
            </a>
            <a href="#modelos" className="hover:text-white transition">
              Modelos de negocio
            </a>
            <a href="#seguridad" className="hover:text-white transition">
              Seguridad y Google
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-300 hover:text-white px-3 py-1.5 transition"
            >
              Iniciar sesión
            </Link>
            <button
              type="button"
              onClick={() => setIsDemoModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-sm font-semibold transition cursor-pointer"
            >
              Solicitar demo
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero + Simulador vivo del Inbox */}
        <section className="max-w-6xl mx-auto px-6 pt-14 pb-20 space-y-12">
          <div className="max-w-3xl space-y-5">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.1]">
              Tu equipo comercial y tu agente IA operando en el mismo Inbox.
            </h1>
            <p className="text-base sm:text-lg text-slate-400 leading-relaxed">
              Centraliza WhatsApp e Instagram, responde con tus precios y fotos reales, agenda citas
              con Google Meet, gestiona pedidos y entrega el chat a un asesor humano cuando hace
              falta cerrar.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setIsDemoModalOpen(true)}
                className="px-6 py-3 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-sm font-semibold inline-flex items-center gap-2 transition cursor-pointer"
              >
                <span>Solicitar demostración</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <Link
                href="/login"
                className="px-6 py-3 rounded-xl border border-[#232A3B] hover:border-slate-500 text-slate-200 text-sm font-semibold transition"
              >
                Ingresar al CRM
              </Link>
            </div>
          </div>

          <HeroInboxMotionDemo />
        </section>

        {/* Productividad operativa en el día a día */}
        <section id="productividad" className="max-w-6xl mx-auto px-6 py-16 space-y-8 border-t border-[#1E2433]">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Diseñado para que ningún cliente se quede esperando
            </h2>
            <p className="text-sm sm:text-base text-slate-400">
              Cada módulo trabaja conectado al mismo historial para ahorrar horas de respuesta
              manual y evitar fugas en el cierre.
            </p>
          </div>

          <ProductivityFlowScenes />

          {/* Ganchos reales con previsualización visual de interfaz */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4">
            <div className="p-6 rounded-2xl border border-[#1E2433] bg-[#111520] space-y-4">
              <div className="rounded-xl bg-[#090A0F] border border-[#1E2433] p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#0052FF]/15 border border-[#0052FF]/30 flex items-center justify-center text-xs font-bold text-[#00D2FF]">
                    PDF
                  </div>
                  <div className="text-xs">
                    <div className="text-white font-semibold">catalogo_2026.pdf / .xlsx</div>
                    <div className="text-slate-500">o dictado por nota de voz</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-[#00D2FF] shrink-0" />
                <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
                  Agente listo
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Arranca sin saber de prompts</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Sube tu catálogo en PDF o Excel/CSV, pega texto o dicta por voz y el Asistente de
                  Prompts estructura tu agente comercial.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-[#1E2433] bg-[#111520] space-y-4">
              <div className="rounded-xl bg-[#090A0F] border border-[#1E2433] p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 grid grid-cols-2 gap-0.5 p-2">
                    <span className="bg-emerald-400 rounded-[2px]" />
                    <span className="bg-emerald-400/40 rounded-[2px]" />
                    <span className="bg-emerald-400/40 rounded-[2px]" />
                    <span className="bg-emerald-400 rounded-[2px]" />
                  </div>
                  <div className="text-xs">
                    <div className="text-white font-semibold">Meta Cloud API / QR</div>
                    <div className="text-slate-500">+ Instagram Messaging</div>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-emerald-400">Conectado</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">WhatsApp oficial o por QR</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Opera con Meta Cloud API oficial o vincula tu línea actual escaneando un código QR
                  junto con tu cuenta de Instagram.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-[#1E2433] bg-[#111520] space-y-4">
              <div className="rounded-xl bg-[#090A0F] border border-[#1E2433] p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="font-mono text-[#00D2FF]">/pagos</span>
                  <span className="text-slate-500">Atajo rápido del asesor</span>
                </div>
                <div className="p-2 rounded-lg bg-[#131722] border border-[#1E2433] text-[11px] text-slate-400">
                  Resumen IA generado + 2 opciones de mensaje para reactivar al cliente.
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Resúmenes, atajos y reactivación</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Tus asesores ven un resumen instantáneo del chat, responden con atajos rápidos y
                  generan mensajes de reactivación con 1 clic.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-[#1E2433] bg-[#111520] space-y-4">
              <div className="rounded-xl bg-[#090A0F] border border-[#1E2433] p-4 flex items-center justify-between text-xs">
                <div>
                  <div className="text-white font-semibold">Cliente VIP · Atención Manual</div>
                  <div className="text-[11px] text-slate-500">Sin intervención ni gasto de tokens</div>
                </div>
                <div className="w-9 h-5 rounded-full bg-[#1E2433] p-0.5 flex items-center">
                  <span className="w-4 h-4 rounded-full bg-slate-400" />
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Contactos exentos de IA</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Marca clientes VIP o casos puntuales en modo 100% manual para que la IA nunca
                  intervenga ni consuma tokens en esos hilos.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Entrenamiento continuo: Sandbox, Preguntas por resolver, Campañas */}
        <section id="mejora-continua" className="max-w-6xl mx-auto px-6 py-16 space-y-8 border-t border-[#1E2433]">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Un agente que mejora con la operación real de tu negocio
            </h2>
            <p className="text-sm sm:text-base text-slate-400">
              Ajusta respuestas en el Sandbox, resuelve dudas nuevas una sola vez y reactiva
              prospectos desde Campañas IA.
            </p>
          </div>

          <ContinuousImprovementMotion />
        </section>

        {/* Adaptación por modelo de negocio */}
        <section id="modelos" className="max-w-6xl mx-auto px-6 py-16 border-t border-[#1E2433]">
          <AdaptiveBusinessModelSection />
        </section>

        {/* Seguridad, integraciones oficiales y transparencia Google Calendar */}
        <section id="seguridad" className="max-w-6xl mx-auto px-6 py-16 border-t border-[#1E2433]">
          <div className="rounded-2xl border border-[#1E2433] bg-[#111520] p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                <ShieldCheck className="w-5 h-5" />
                <span>Seguridad y Google Workspace</span>
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Integraciones oficiales con control de permisos
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Synqo CRM opera sobre Meta WhatsApp Cloud API, Evolution API, Instagram Messaging y
                Google Calendar / Google Meet con credenciales cifradas en servidor.
              </p>
            </div>

            <div className="lg:col-span-7 space-y-3 text-sm text-slate-300">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                <span>
                  Solo accedemos a Google Calendar cuando un administrador autoriza la conexión
                  explícitamente desde Ajustes.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                <span>
                  Los permisos de calendario se usan exclusivamente para consultar disponibilidad,
                  crear eventos con enlace de Google Meet y sincronizar reprogramaciones o
                  cancelaciones.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                <span>
                  No vendemos datos ni los utilizamos para publicidad. Cumplimos con la Ley 1581 de
                  2012 y políticas de Meta y Google.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="max-w-6xl mx-auto px-6 py-16 border-t border-[#1E2433]">
          <div className="rounded-2xl bg-[#131722] border border-[#232A3B] p-8 sm:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-xl space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                ¿Quieres ver Synqo funcionando con el flujo de tu empresa?
              </h2>
              <p className="text-sm text-slate-400">
                Te mostramos en vivo el Inbox, el agente IA y la configuración ideal para tu modelo
                de negocio.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsDemoModalOpen(true)}
                className="px-6 py-3 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-sm font-semibold inline-flex items-center gap-2 transition cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Solicitar demo por WhatsApp</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer legal */}
      <footer className="border-t border-[#1E2433] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Synqo CRM · Valledupar, Colombia · contacto@synqo.dev</span>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-white transition">
              Política de Privacidad
            </Link>
            <Link href="/terms" className="hover:text-white transition">
              Condiciones del Servicio
            </Link>
            <Link href="/data-deletion" className="hover:text-white transition">
              Eliminación de Datos
            </Link>
          </div>
        </div>
      </footer>

      {/* Modal rápido de solicitud de demo conectado a WhatsApp */}
      {isDemoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#131722] border border-[#232A3B] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white">Solicitar demostración</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Te conectamos directo por WhatsApp con el contexto de tu negocio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDemoModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOpenWhatsAppDemo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nombre de tu negocio
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Ej. Clínica Sonrisas o Tienda Nova"
                  className="w-full h-10 px-3.5 rounded-xl bg-[#090A0F] border border-[#232A3B] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#0052FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  ¿Qué ofrece tu empresa?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'products', label: 'Productos' },
                      { id: 'services', label: 'Servicios' },
                      { id: 'hybrid', label: 'Ambos' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setBusinessModel(opt.id)}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        businessModel === opt.id
                          ? 'bg-[#0052FF] border-[#0052FF] text-white'
                          : 'bg-[#090A0F] border-[#232A3B] text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Continuar a WhatsApp</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
