import React from 'react';
import Link from 'next/link';
import { FileText, ArrowLeft, ShieldAlert, DollarSign, Bot, Scale, Ban, CheckCircle2 } from 'lucide-react';

export const metadata = {
  title: 'Condiciones Generales del Servicio (Términos de Uso) | Synqo CRM',
  description: 'Condiciones generales de contratación y términos de uso de la plataforma SaaS Synqo CRM, integraciones con WhatsApp Business Cloud API e Inteligencia Artificial.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      {/* Header Corporativo */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-slate-900 font-bold text-lg">
            <span className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center text-sm font-black shadow-sm">
              S
            </span>
            <span className="tracking-tight">Synqo CRM</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="text-xs font-medium text-slate-600 hover:text-black transition-colors"
            >
              Política de Privacidad
            </Link>
            <Link
              href="/login"
              className="text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-black transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Volver al CRM
            </Link>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-8 sm:p-14">
          
          {/* Badge y Encabezado */}
          <div className="flex items-center gap-2 text-blue-700 bg-blue-50 border border-blue-200/80 px-3 py-1 rounded-full w-fit mb-4">
            <FileText className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Contrato de Licenciamiento SaaS</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
            Condiciones Generales del Servicio y Uso de la Plataforma
          </h1>
          <p className="text-xs text-slate-500 mb-8 font-mono border-b border-slate-100 pb-4">
            Versión: 2.0 (Comercial Oficial) | Entrada en vigor: 26 de octubre de 2026<br />
            Proveedor del Servicio: <strong>JOSE DAVID NIEVES OROZCO</strong> (Operador de <strong>Synqo CRM</strong>) | NIT 1067598149-1 | Valledupar, Cesar, Colombia
          </p>

          <div className="space-y-8 text-sm leading-relaxed text-slate-600">
            
            {/* 1. Objeto y Partes */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2">1. Objeto del Contrato y Partes Contratantes</h2>
              <p className="mb-3">
                El presente Contrato de Términos y Condiciones Generales de Servicio (en adelante, &quot;el Contrato&quot;) regula el acceso, licenciamiento no exclusivo y uso de la plataforma de software multi-inquilino en la nube denominada <strong>Synqo CRM</strong> (en adelante, &quot;Synqo&quot; o &quot;el Software&quot;), provista y operada comercialmente por <strong>JOSE DAVID NIEVES OROZCO</strong>, persona natural comerciante con NIT 1067598149-1, domiciliada en Valledupar, Colombia (en adelante, &quot;el Proveedor&quot;).
              </p>
              <p>
                Al acceder, iniciar sesión, vincular credenciales de WhatsApp Business o registrar su pago, la persona natural o jurídica que contrata el servicio (en adelante, &quot;el Cliente&quot; o &quot;la Organización&quot;) declara haber leído, comprendido y aceptado en su totalidad las presentes condiciones, adquiriendo fuerza vinculante entre las partes.
              </p>
            </section>

            {/* 2. Planes, Capacidad y Cupos */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2">2. Estructura de Planes, Capacidad de Usuarios y Cuotas de Tokens</h2>
              <p className="mb-3">
                El Software se comercializa bajo la modalidad de suscripción periódica (mensual o anual) segmentada en planes comerciales con cuotas técnicas definidas:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs text-slate-700 mb-3">
                <li>
                  <strong>Plan Starter (Validación Comercial):</strong> Hasta 2 usuarios o agentes simultáneos, cuota mensual de 500.000 tokens de IA, prompt personalizable, integración Cal.com y soporte estándar.
                </li>
                <li>
                  <strong>Plan Pro (Comercial Recomendado):</strong> Hasta 5 usuarios o agentes simultáneos, cuota mensual de 2.500.000 tokens de IA, exportación de contactos a formato CSV / Excel, agendamiento Cal.com y soporte prioritario.
                </li>
                <li>
                  <strong>Plan Enterprise (Corporativo):</strong> Hasta 12 usuarios o agentes simultáneos, cuota mensual de 7.500.000 tokens de IA, exportación masiva completa, canal VIP exclusivo de soporte por WhatsApp y sesión de inducción personalizada.
                </li>
              </ul>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
                <strong>Regla de Boosters (Paquetes Extra de Tokens):</strong> Los paquetes adicionales de tokens adquiridos aplican de manera exclusiva para el mes en curso. Con cada renovación mensual regular, el sistema restablece automáticamente la cuota al volumen base contratado del plan, reiniciando el contador de consumo a cero (0).
              </div>
            </section>

            {/* 3. BLINDAJE CRÍTICO: Tarifas y Facturación de Meta Platforms */}
            <section className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-5 text-amber-950">
              <h2 className="text-base font-bold text-amber-900 mb-2 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-700" />
                3. Tarifas de Mensajería y Facturación Oficial de Meta Platforms (WhatsApp Cloud API)
              </h2>
              <p className="text-xs leading-relaxed mb-2">
                <strong>Synqo CRM actúa exclusivamente como software de gestión, interfaz operativa y proveedor tecnológico de integración.</strong> La contratación de Synqo NO incluye ni sustituye los costos propios de mensajería que <strong>Meta Platforms, Inc.</strong> factura por el uso de la WhatsApp Business Platform.
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs">
                <li>
                  <strong>Facturación Directa de Meta:</strong> Meta Platforms cobra por conversaciones (categorizadas como Marketing, Utilidad, Autenticación o Servicio) de acuerdo con su tarifario oficial vigente por país. Dichos cobros son facturados directamente por Meta a la Cuenta de WhatsApp Business (WABA) del Cliente mediante la tarjeta de crédito o línea comercial que el Cliente registre en su Meta Business Manager.
                </li>
                <li>
                  <strong>Indemnidad por Cobros de Meta:</strong> El Cliente es el único y exclusivo responsable legal y financiero ante Meta Platforms por los consumos, cargos por conversación, retenciones tributarias o deudas generadas por su número de teléfono. <strong>Synqo no asume, no intermedia y no responderá por ningún cobro emitido por Meta Platforms derivado de la actividad comercial del Cliente.</strong>
                </li>
              </ul>
            </section>

            {/* 4. BLINDAJE CRÍTICO: Exoneración sobre Inteligencia Artificial */}
            <section className="bg-slate-50 border border-slate-200 rounded-xl p-5">
              <h2 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Bot className="w-5 h-5 text-slate-700" />
                4. Exoneración de Responsabilidad sobre Respuestas de Inteligencia Artificial (OpenAI)
              </h2>
              <p className="text-xs leading-relaxed mb-2">
                La funcionalidad de asistente autónomo de Synqo CRM utiliza modelos de lenguaje natural generativo (LLM) provistos por OpenAI, LLC. El Cliente comprende y acepta expresamente la naturaleza probabilística de esta tecnología:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-700">
                <li>
                  <strong>Supervisión del Prompt y Contenido:</strong> El Cliente es el único responsable de redactar, configurar y mantener actualizadas las instrucciones (System Prompt) de su asistente en el panel de Ajustes, así como de calibrar los precios, políticas comerciales y datos brindados al público.
                </li>
                <li>
                  <strong>Exclusión de Responsabilidad por Alucinaciones o Errores de la IA:</strong> Synqo NO garantiza la infalibilidad matemática, veracidad absoluta ni precisión contractual de las respuestas emitidas por la Inteligencia Artificial.
                </li>
                <li>
                  <strong>Inexistencia de Vinculación Contractual no Autorizada:</strong> Synqo no será responsable por cotizaciones erróneas, descuentos no autorizados, acuerdos verbales imprecisos, citas conflictivas o daños comerciales que resulten de las respuestas dadas automáticamente por el bot a prospectos en WhatsApp. Corresponde al Cliente supervisar y validar periódicamente las interacciones de sus prospectos.
                </li>
              </ul>
            </section>

            {/* 5. BLINDAJE CRÍTICO: Políticas de WhatsApp, Spam y Bloqueos de Número */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Ban className="w-5 h-5 text-rose-600" />
                5. Uso Aceptable, Prohibición de SPAM e Indemnidad por Sanciones de Meta
              </h2>
              <p className="mb-2 text-xs">
                El Cliente se obliga a hacer un uso estrictamente legítimo de la plataforma y a cumplir con las normas de protección al consumidor y telecomunicaciones:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 mb-3">
                <li>
                  <strong>Consentimiento Previo (Opt-in Obligatorio):</strong> El Cliente garantiza que cuenta con la autorización previa, expresa e informada de todos los destinatarios a los que remite mensajes mediante la plataforma, conforme a la Ley 1581 de 2012 de Colombia y las normas de Meta.
                </li>
                <li>
                  <strong>Prohibición Terminante de SPAM:</strong> Queda prohibido el uso de bases de datos compradas, envíos masivos no autorizados (blastings de spam), esquemas piramidales, fraude, hostigamiento o cualquier actividad comercial prohibida por la <em>Política de Comercio de WhatsApp</em>.
                </li>
                <li>
                  <strong>Ventana de 24 Horas de WhatsApp:</strong> El Cliente reconoce que los mensajes de formato libre solo pueden emitirse dentro de la ventana de atención al cliente de 24 horas. Fuera de ese lapso, la plataforma exige el uso de plantillas pre-aprobadas por Meta.
                </li>
                <li>
                  <strong>Exoneración por Bloqueo o Baneo del Número Telefónico:</strong> Si Meta Platforms suspende, restringe la calidad (*Quality Rating Red*), reduce los límites de envío (*Messaging Limit*) o cancela la cuenta de WhatsApp Business del Cliente como consecuencia de quejas de usuarios por spam, reportes de infracción o violación de sus políticas, <strong>Synqo queda totalmente liberado de cualquier responsabilidad civil, comercial o pecuniaria</strong>. La gestión del número telefónico y la reputación comercial es responsabilidad exclusiva del Cliente.
                </li>
              </ul>
            </section>

            {/* 6. Ciclo de Cobranza, Suspensión por Mora y Retención de Datos */}
            <section className="bg-slate-50 border border-slate-200 rounded-xl p-5">
              <h2 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Scale className="w-5 h-5 text-slate-700" />
                6. Facturación, Suspensión Preventiva por Mora y Recuperación de Datos
              </h2>
              <p className="text-xs mb-3">
                El servicio opera mediante facturación manual asistida o enlaces seguros de pago bajo los siguientes términos:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">
                <div className="bg-white border border-slate-200 rounded p-3">
                  <span className="font-bold text-slate-900 block mb-1">Días 1 al 5 del Mes:</span>
                  Período ordinario de facturación y pago de la mensualidad o anualidad.
                </div>
                <div className="bg-white border border-slate-200 rounded p-3">
                  <span className="font-bold text-slate-900 block mb-1">Días 6 al 9 (Gracia):</span>
                  Período de cortesía operativa y notificación de pago pendiente.
                </div>
                <div className="bg-white border border-amber-300 bg-amber-50/50 rounded p-3 sm:col-span-2">
                  <span className="font-bold text-amber-900 block mb-1">Día 10 en Adelante (Suspensión Preventiva):</span>
                  Ante la falta de pago al décimo día de mora, el sistema suspenderá automáticamente el acceso a la plataforma web y **desconectará la atención automática por Inteligencia Artificial** para evitar sobrecostos en OpenAI. Los mensajes entrantes de WhatsApp continuarán registrándose en base de datos para no perder oportunidades comerciales del Cliente.
                </div>
              </div>
              <p className="text-xs text-slate-600">
                <strong>Derecho de Descarga y Propiedad de Leads:</strong> Aun durante el estado de suspensión preventiva, el Administrador del Cliente podrá solicitar o acceder a la descarga de su archivo completo de prospectos (formato CSV/Excel). A los <strong>30 días continuos de mora</strong>, Synqo podrá dar de baja definitiva la cuenta y programar la purga segura de las credenciales de conexión de conformidad con la política de retención.
              </p>
            </section>

            {/* 7. Propiedad Intelectual y Propiedad de los Datos */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2">7. Propiedad Intelectual y Titularidad de los Datos</h2>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                <li>
                  <strong>Propiedad de Synqo:</strong> Todos los derechos de propiedad intelectual, derechos de autor, código fuente, componentes visuales, marcas, algoritmos y desarrollos tecnológicos de Synqo CRM pertenecen con exclusividad a JOSE DAVID NIEVES OROZCO.
                </li>
                <li>
                  <strong>Propiedad del Cliente:</strong> Todas las bases de datos de prospectos, clientes, números telefónicos, notas comerciales e historiales de chat pertenecen con exclusividad al Cliente. Synqo jamás utilizará los contactos de sus clientes para comercializarlos ni transferirlos a terceros.
                </li>
              </ul>
            </section>

            {/* 8. Disponibilidad del Servicio (SLA) */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2">8. Nivel de Servicio (SLA) y Mantenimiento Técnico</h2>
              <p className="text-xs text-slate-600">
                El Proveedor realizará esfuerzos técnicos y comerciales razonables para mantener una disponibilidad de la plataforma del 99.5% del tiempo. Se excluyen del cómputo de disponibilidad: (i) Mantenimientos programados notificados con antelación; (ii) Interrupciones globales de proveedores terceros de infraestructura (Meta WhatsApp, OpenAI, Supabase, Vercel, AWS); y (iii) Eventos de fuerza mayor o fallas en las redes de telecomunicaciones del Cliente.
              </p>
            </section>

            {/* 9. Ley Aplicable y Jurisdicción */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2">9. Ley Aplicable y Solución de Controversias</h2>
              <p className="text-xs text-slate-600">
                El presente Contrato se regirá e interpretará conforme a las leyes vigentes de la <strong>República de Colombia</strong>. Cualquier diferencia o controversia que surja entre las partes se procurará solucionar en primera instancia mediante arreglo directo y conciliación ante un Centro de Conciliación legalmente constituido. En su defecto, las partes se someten a la jurisdicción ordinaria de los jueces de la República de Colombia.
              </p>
            </section>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        <p>© 2026 Synqo CRM — JOSE DAVID NIEVES OROZCO (NIT 1067598149-1). Todos los derechos reservados.</p>
        <p className="mt-1">
          <Link href="/privacy" className="hover:underline text-slate-500">Política de Privacidad</Link>
          {' · '}
          <Link href="/data-deletion" className="hover:underline text-slate-500">Eliminación de Datos</Link>
          {' · '}
          <a href="mailto:contacto@synqo.dev" className="hover:underline text-slate-500">contacto@synqo.dev</a>
        </p>
      </footer>
    </div>
  );
}
