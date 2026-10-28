'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Building2,
  Package,
  Target,
  ShieldCheck,
  Clock,
  Code2,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  HelpCircle,
  VolumeX,
  Volume2,
} from 'lucide-react';
import {
  StructuredPromptData,
  IndustryPreset,
  BrandTone,
  ClosingGoal,
  CatalogItem,
  INDUSTRY_BLUEPRINTS,
  compileStructuredPrompt,
} from '@/lib/ai/prompt-compiler';

interface StructuredPromptWizardProps {
  initialPrompt?: string | null;
  initialStructuredData?: any;
  companyName?: string;
  onPromptCompiled: (compiledXml: string, structuredData: StructuredPromptData) => void;
}

export function StructuredPromptWizard({
  initialPrompt,
  initialStructuredData,
  companyName = 'Mi Empresa',
  onPromptCompiled,
}: StructuredPromptWizardProps) {
  // Detectar si la empresa ya tiene un prompt previo en texto libre (sin XML ni structured_data)
  const isExistingCustomText = Boolean(
    initialPrompt &&
    initialPrompt.trim().length > 0 &&
    !initialStructuredData &&
    !initialPrompt.includes('<identidad_y_rol>')
  );

  // Modo principal: 'custom_text' (texto libre previo), 'wizard' (asistente guiado), 'xml' (avanzado)
  const [topMode, setTopMode] = useState<'custom_text' | 'wizard' | 'xml'>(() => {
    if (isExistingCustomText) return 'custom_text';
    return 'wizard';
  });

  // Inicializar con datos guardados o blueprint por defecto
  const [data, setData] = useState<StructuredPromptData>(() => {
    if (initialStructuredData && initialStructuredData.identity) {
      return initialStructuredData as StructuredPromptData;
    }
    return INDUSTRY_BLUEPRINTS.services(companyName);
  });

  const [activeTab, setActiveTab] = useState<'identity' | 'catalog' | 'funnel' | 'policies' | 'handoff' | 'preview'>('identity');
  const [manualXmlPrompt, setManualXmlPrompt] = useState<string>(() => {
    return initialPrompt || compileStructuredPrompt(data);
  });

  // Re-compilar únicamente cuando se está utilizando activamente el Asistente Guiado
  useEffect(() => {
    if (topMode === 'wizard') {
      const compiled = compileStructuredPrompt(data);
      setManualXmlPrompt(compiled);
      onPromptCompiled(compiled, data);
    }
  }, [data, topMode, onPromptCompiled]);

  // Cambiar de plantilla de industria
  const handleSelectPreset = (preset: IndustryPreset) => {
    const blueprintGenerator = INDUSTRY_BLUEPRINTS[preset];
    if (blueprintGenerator) {
      const newData = blueprintGenerator(companyName);
      setData(newData);
      if (topMode === 'wizard') {
        const compiled = compileStructuredPrompt(newData);
        setManualXmlPrompt(compiled);
        onPromptCompiled(compiled, newData);
      }
    }
  };

  // Manejo de productos en el catálogo
  const handleAddProduct = () => {
    const newItem: CatalogItem = {
      id: Date.now().toString(),
      name: '',
      price: '',
      description: '',
      includes: '',
      excludes: '',
      isPopular: false,
    };
    setData((prev) => ({
      ...prev,
      catalog: [...prev.catalog, newItem],
    }));
  };

  const handleUpdateProduct = (id: string, updates: Partial<CatalogItem>) => {
    setData((prev) => ({
      ...prev,
      catalog: prev.catalog.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  };

  const handleRemoveProduct = (id: string) => {
    setData((prev) => ({
      ...prev,
      catalog: prev.catalog.filter((p) => p.id !== id),
    }));
  };

  // Métodos de pago comunes
  const AVAILABLE_PAYMENTS = [
    'Transferencia Bancolombia',
    'Nequi / Daviplata',
    'Tarjeta de Crédito / Débito',
    'Pago Contra Entrega en efectivo',
    'PSE / Wompi / Bold',
    'Efectivo en sede',
  ];

  const handleTogglePayment = (method: string) => {
    setData((prev) => {
      const exists = prev.policies.paymentMethods.includes(method);
      return {
        ...prev,
        policies: {
          ...prev.policies,
          paymentMethods: exists
            ? prev.policies.paymentMethods.filter((m) => m !== method)
            : [...prev.policies.paymentMethods, method],
        },
      };
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden space-y-4 p-5 sm:p-6">
      {/* Barra Superior con Selector de Modo de Edición */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#0052FF]" />
            Entrenamiento & Instrucciones del Asistente IA
          </h3>
          <p className="text-[11px] text-gray-500">
            Configura el conocimiento comercial, catálogo, precios y políticas con las que responde la IA en WhatsApp.
          </p>
        </div>

        {/* Selector de Modos */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setTopMode('wizard');
              const compiled = compileStructuredPrompt(data);
              setManualXmlPrompt(compiled);
              onPromptCompiled(compiled, data);
            }}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              topMode === 'wizard'
                ? 'bg-white text-[#0052FF] shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Asistente Visual</span>
          </button>

          <button
            type="button"
            onClick={() => setTopMode('custom_text')}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              topMode === 'custom_text'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>📝 Texto Libre</span>
          </button>

          <button
            type="button"
            onClick={() => setTopMode('xml')}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              topMode === 'xml'
                ? 'bg-white text-purple-700 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>XML</span>
          </button>
        </div>
      </div>

      {topMode === 'custom_text' ? (
        /* Modo 1: Texto Libre (Prompt Personalizado Intacto) */
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-blue-900 flex items-center gap-2">
                <span>📝 Modo Texto Libre (Prompt Personalizado)</span>
              </div>
              <p className="text-[11px] text-blue-700 mt-0.5">
                La IA está respondiendo con este texto exacto. Puedes editar tus instrucciones libremente o pulsar &quot;Migrar a Asistente Visual&quot; si deseas estructurarlo por pestañas de catálogo y políticas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setTopMode('wizard');
                const compiled = compileStructuredPrompt(data);
                setManualXmlPrompt(compiled);
                onPromptCompiled(compiled, data);
              }}
              className="px-3.5 py-2 rounded-xl bg-[#0052FF] text-white text-xs font-bold shadow-xs hover:bg-[#0047E0] transition cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Migrar a Asistente Visual</span>
            </button>
          </div>

          <textarea
            rows={15}
            value={manualXmlPrompt}
            onChange={(e) => {
              setManualXmlPrompt(e.target.value);
              onPromptCompiled(e.target.value, data);
            }}
            placeholder="Escribe aquí las instrucciones de tu asistente..."
            className="w-full text-xs font-sans leading-relaxed p-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF] bg-white text-gray-900"
          />
        </div>
      ) : topMode === 'xml' ? (
        /* Modo 2: XML Avanzado */
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 text-xs flex items-center gap-2">
            <Code2 className="w-4 h-4 text-purple-600 flex-shrink-0" />
            <span>
              Modo Avanzado: Puedes editar directamente el System Prompt delimitado en XML. La IA leerá exactamente este texto.
            </span>
          </div>
          <textarea
            rows={15}
            value={manualXmlPrompt}
            onChange={(e) => {
              setManualXmlPrompt(e.target.value);
              onPromptCompiled(e.target.value, data);
            }}
            className="w-full text-xs font-mono p-3.5 rounded-xl border border-gray-300 bg-slate-950 text-emerald-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
          />
        </div>
      ) : (
        /* Modo 3: Asistente Guiado Visual por Secciones */
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Selector de Industria */}
          <div className="space-y-1.5 border-b border-gray-100 pb-3">
            <div className="text-xs font-bold text-gray-700">
              Plantilla de Industria:
            </div>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none whitespace-nowrap">
              {[
                { id: 'services', label: '💼 Servicios & B2B' },
                { id: 'ecommerce', label: '🛍️ E-commerce & Retail' },
                { id: 'health', label: '🦷 Salud & Estética' },
                { id: 'real_estate', label: '🏡 Inmobiliaria' },
                { id: 'gastronomy', label: '🍽️ Gastronomía' },
              ].map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id as IndustryPreset)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex-shrink-0 border ${
                    data.preset === preset.id
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-bold'
                      : 'bg-slate-50 hover:bg-slate-100 text-gray-600 border-gray-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          {/* Sub-Pestañas del Asistente */}
          <div className="flex items-center gap-1.5 border-b border-gray-100 pb-2.5 overflow-x-auto scrollbar-none whitespace-nowrap">
            {[
              { id: 'identity', label: '1. Identidad & Tono', icon: Building2 },
              { id: 'catalog', label: `2. Catálogo (${data.catalog.length})`, icon: Package },
              { id: 'funnel', label: '3. Ruta de Venta', icon: Target },
              { id: 'policies', label: '4. Políticas & Pagos', icon: ShieldCheck },
              { id: 'handoff', label: '5. Relevo Silencioso', icon: VolumeX },
              { id: 'preview', label: '6. Vista Previa', icon: Code2 },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex-shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-[#0052FF] text-white shadow-2xs font-bold'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: IDENTIDAD Y TONO */}
          {activeTab === 'identity' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Nombre Comercial de la Empresa
                  </label>
                  <input
                    type="text"
                    value={data.identity.name}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        identity: { ...prev.identity, name: e.target.value },
                      }))
                    }
                    placeholder="Ej: Filippo Cucine"
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Ubicación y Cobertura Geográfica
                  </label>
                  <input
                    type="text"
                    value={data.identity.cityCoverage}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        identity: { ...prev.identity, cityCoverage: e.target.value },
                      }))
                    }
                    placeholder="Ej: Bogotá y envíos nacionales a todo el país"
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Propuesta de Valor Única (¿Qué vendes y por qué elegirte a ti?)
                </label>
                <textarea
                  rows={2}
                  value={data.identity.oneLiner}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      identity: { ...prev.identity, oneLiner: e.target.value },
                    }))
                  }
                  placeholder="Ej: Cocinas integrales de diseño italiano a medida con materiales hidrófugos y garantía de 5 años..."
                  className="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                />
              </div>

              {/* Selector Visual de Tono */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  Tono de Comunicación en WhatsApp
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'friendly_whatsapp',
                      title: '🟢 Cercano & WhatsApp',
                      desc: 'Cercano, cálido, empático, mensajes directos de 1 a 3 líneas con emojis sutiles.',
                    },
                    {
                      id: 'corporate_consultive',
                      title: '🔵 Corporativo & Consultivo',
                      desc: 'Educado, profesional, enfocado en ROI comercial y soluciones B2B estructuradas.',
                    },
                    {
                      id: 'exclusive_premium',
                      title: '🟣 Exclusivo & Premium',
                      desc: 'Elegante, distinguido, resalta calidad superior y trato preferencial sin rodeos.',
                    },
                  ].map((tone) => (
                    <button
                      key={tone.id}
                      type="button"
                      onClick={() =>
                        setData((prev) => ({
                          ...prev,
                          identity: { ...prev.identity, tone: tone.id as BrandTone },
                        }))
                      }
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        data.identity.tone === tone.id
                          ? 'border-[#0052FF] bg-blue-50/50 ring-2 ring-[#0052FF]/20 shadow-xs'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <p className="text-xs font-bold text-gray-900 mb-1">{tone.title}</p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">{tone.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CATALOGO Y PRODUCTOS */}
          {activeTab === 'catalog' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-gray-900">
                    Productos o Servicios Principales
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    La IA utilizará estos nombres y precios exactos para blindarse contra alucinaciones.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddProduct}
                  className="px-3 py-1.5 bg-[#0052FF] hover:bg-[#0047E0] text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir Producto</span>
                </button>
              </div>

              {data.catalog.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 border border-dashed border-gray-200 rounded-2xl space-y-2">
                  <Package className="w-8 h-8 text-gray-400 mx-auto" />
                  <p className="text-xs text-gray-500">No has registrado productos o servicios aún.</p>
                  <button
                    type="button"
                    onClick={handleAddProduct}
                    className="text-xs text-[#0052FF] font-bold hover:underline cursor-pointer"
                  >
                    + Añadir el primero
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.catalog.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-4 bg-slate-50/70 border border-gray-200 rounded-2xl space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-[#0052FF]" />
                          Producto / Servicio #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveProduct(item.id)}
                          className="p-1 text-gray-400 hover:text-rose-600 transition cursor-pointer"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                            Nombre del Producto o Servicio
                          </label>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleUpdateProduct(item.id, { name: e.target.value })}
                            placeholder="Ej: Cocina Lineal 2.40m"
                            className="w-full text-xs p-2 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                            Precio o Rango Exacto
                          </label>
                          <input
                            type="text"
                            value={item.price}
                            onChange={(e) => handleUpdateProduct(item.id, { price: e.target.value })}
                            placeholder="Ej: $4.800.000 COP o Desde $150 USD"
                            className="w-full text-xs p-2 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                          Descripción Comercial
                        </label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleUpdateProduct(item.id, { description: e.target.value })}
                          placeholder="Ej: Muebles superior e inferior con mesón de granito y cierre lento..."
                          className="w-full text-xs p-2 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-emerald-700 mb-1">
                            ¿Qué incluye? (Opcional)
                          </label>
                          <input
                            type="text"
                            value={item.includes || ''}
                            onChange={(e) => handleUpdateProduct(item.id, { includes: e.target.value })}
                            placeholder="Ej: Transporte e instalación en Bogotá"
                            className="w-full text-xs p-2 rounded-lg border border-emerald-200 bg-emerald-50/30 text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-rose-700 mb-1">
                            ¿Qué NO incluye? (Evita alucinaciones)
                          </label>
                          <input
                            type="text"
                            value={item.excludes || ''}
                            onChange={(e) => handleUpdateProduct(item.id, { excludes: e.target.value })}
                            placeholder="Ej: Electrodomésticos ni grifería"
                            className="w-full text-xs p-2 rounded-lg border border-rose-200 bg-rose-50/30 text-rose-950 focus:outline-none focus:ring-2 focus:ring-rose-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RUTA DE VENTA Y FUNNEL */}
          {activeTab === 'funnel' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Objetivo Principal de Cierre (Meta de la IA)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'book_cal',
                      title: '🗓️ Agendar Cita en Calendario',
                      desc: 'La IA ofrece horarios de Cal.com y agenda automáticamente citas o demos.',
                    },
                    {
                      id: 'take_order',
                      title: '📦 Cerrar Pedido en WhatsApp',
                      desc: 'La IA pide dirección, ciudad y confirma el método de pago directo.',
                    },
                    {
                      id: 'handoff_qualified',
                      title: '👤 Calificar y Pasar a Asesor',
                      desc: 'La IA recopila datos del cliente y transfiere al asesor humano listo para cerrar.',
                    },
                  ].map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() =>
                        setData((prev) => ({
                          ...prev,
                          funnel: { ...prev.funnel, closingGoal: goal.id as ClosingGoal },
                        }))
                      }
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        data.funnel.closingGoal === goal.id
                          ? 'border-[#0052FF] bg-blue-50/50 ring-2 ring-[#0052FF]/20 shadow-xs'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <p className="text-xs font-bold text-gray-900 mb-1">{goal.title}</p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">{goal.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Preguntas Clave de Diagnóstico (Fase 1: Haz máx 1 pregunta a la vez)
                </label>
                <textarea
                  rows={2}
                  value={data.funnel.diagnosisQuestions.join('\n')}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      funnel: {
                        ...prev.funnel,
                        diagnosisQuestions: e.target.value.split('\n').filter((q) => q.trim()),
                      },
                    }))
                  }
                  placeholder="Una pregunta por línea (ej: ¿En qué ciudad te encuentras?, ¿Para cuántas personas buscas?)"
                  className="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Argumentos de Valor Diferenciales (Fase 2)
                </label>
                <textarea
                  rows={2}
                  value={data.funnel.valuePropBullets.join('\n')}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      funnel: {
                        ...prev.funnel,
                        valuePropBullets: e.target.value.split('\n').filter((b) => b.trim()),
                      },
                    }))
                  }
                  placeholder="Un beneficio por línea (ej: Envíos contra entrega, Garantía de 2 años, Instalación gratis)"
                  className="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                />
              </div>
            </div>
          )}

          {/* TAB 4: POLITICAS Y PAGOS */}
          {activeTab === 'policies' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  Métodos de Pago Aceptados
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AVAILABLE_PAYMENTS.map((payment) => {
                    const isChecked = data.policies.paymentMethods.includes(payment);
                    return (
                      <button
                        key={payment}
                        type="button"
                        onClick={() => handleTogglePayment(payment)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition cursor-pointer text-left ${
                          isChecked
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-md flex items-center justify-center border ${
                            isChecked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-gray-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3" />}
                        </div>
                        <span className="truncate">{payment}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Políticas de Envío o Despacho
                  </label>
                  <textarea
                    rows={2}
                    value={data.policies.shippingInfo}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        policies: { ...prev.policies, shippingInfo: e.target.value },
                      }))
                    }
                    placeholder="Ej: Entregas en 24 a 48 horas en Bogotá. Resto del país 3 a 5 días hábiles..."
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Garantías y Cambios
                  </label>
                  <textarea
                    rows={2}
                    value={data.policies.warrantyInfo}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        policies: { ...prev.policies, warrantyInfo: e.target.value },
                      }))
                    }
                    placeholder="Ej: 30 días de garantía directa por defectos de fabricación y 5 días para cambios de talla..."
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: RELEVO SILENCIOSO Y HORARIOS */}
          {activeTab === 'handoff' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-slate-50 border border-gray-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-slate-200 text-slate-700 rounded-xl">
                      {data.handoff.mode === 'silent' ? <VolumeX className="w-5 h-5 text-indigo-600" /> : <Volume2 className="w-5 h-5 text-gray-600" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">
                        Modo de Relevo hacia el Asesor Humano (Handoff)
                      </h4>
                      <p className="text-[11px] text-gray-500">
                        {data.handoff.mode === 'silent'
                          ? 'Silencio Total (Recomendado): La IA no envía nada al cliente y el asesor humano responde directamente.'
                          : 'Mensaje de Espera: La IA envía un texto diciendo que consultará con el equipo.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setData((prev) => ({
                        ...prev,
                        handoff: {
                          ...prev.handoff,
                          mode: prev.handoff.mode === 'silent' ? 'message' : 'silent',
                        },
                      }))
                    }
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      data.handoff.mode === 'silent'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    {data.handoff.mode === 'silent' ? 'Silencio Total Activo' : 'Modo con Mensaje'}
                  </button>
                </div>
              </div>

              {/* Horario Laboral y Salvavidas Fuera de Horario */}
              <div className="p-4 bg-white border border-gray-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#0052FF]" />
                    <span className="text-xs font-bold text-gray-900">
                      Horario de Atención Comercial (Hora Colombia)
                    </span>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-600">
                    <input
                      type="checkbox"
                      checked={data.handoff.afterHoursEnabled}
                      onChange={(e) =>
                        setData((prev) => ({
                          ...prev,
                          handoff: { ...prev.handoff, afterHoursEnabled: e.target.checked },
                        }))
                      }
                      className="rounded text-[#0052FF] focus:ring-[#0052FF]"
                    />
                    <span>Activar Salvavidas Nocturno</span>
                  </label>
                </div>

                {data.handoff.afterHoursEnabled && (
                  <div className="space-y-3 pt-2 border-t border-gray-100 animate-in fade-in duration-150">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                          Hora de Apertura
                        </label>
                        <input
                          type="time"
                          value={data.handoff.businessHours.start}
                          onChange={(e) =>
                            setData((prev) => ({
                              ...prev,
                              handoff: {
                                ...prev.handoff,
                                businessHours: { ...prev.handoff.businessHours, start: e.target.value },
                              },
                            }))
                          }
                          className="w-full text-xs p-2 rounded-lg border border-gray-300"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                          Hora de Cierre
                        </label>
                        <input
                          type="time"
                          value={data.handoff.businessHours.end}
                          onChange={(e) =>
                            setData((prev) => ({
                              ...prev,
                              handoff: {
                                ...prev.handoff,
                                businessHours: { ...prev.handoff.businessHours, end: e.target.value },
                              },
                            }))
                          }
                          className="w-full text-xs p-2 rounded-lg border border-gray-300"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Mensaje Amable Fuera de Horario (Solo se envía si el cliente escribe de noche)
                      </label>
                      <textarea
                        rows={2}
                        value={data.handoff.afterHoursMessage}
                        onChange={(e) =>
                          setData((prev) => ({
                            ...prev,
                            handoff: { ...prev.handoff, afterHoursMessage: e.target.value },
                          }))
                        }
                        placeholder="Ej: ¡Hola! En este momento nuestro equipo ha finalizado jornada. A primera hora de la mañana retomamos para confirmarte..."
                        className="w-full text-xs p-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: VISTA PREVIA XML COMPILADO */}
          {activeTab === 'preview' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-gray-700 flex items-center gap-1.5">
                  <Code2 className="w-4 h-4 text-[#0052FF]" />
                  System Prompt Compilado (Arquitectura XML)
                </span>
                <span className="text-[11px] text-gray-400 font-mono">
                  ~{Math.round(manualXmlPrompt.length / 4)} tokens estimados
                </span>
              </div>
              <div className="p-4 bg-slate-950 text-emerald-300 rounded-xl font-mono text-xs overflow-auto max-h-72 border border-slate-800 whitespace-pre-wrap leading-relaxed">
                {manualXmlPrompt}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

