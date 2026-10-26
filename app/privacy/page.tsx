import React from 'react';
import Link from 'next/link';
import { Shield, ArrowLeft, Lock, Database, Cpu, Globe, CheckCircle2, AlertTriangle } from 'lucide-react';

export const metadata = {
  title: 'Política de Privacidad y Tratamiento de Datos Personales | Synqo CRM',
  description: 'Política integral de tratamiento de datos personales de Synqo CRM conforme a la Ley 1581 de 2012 de Colombia, estándares internacionales de privacidad y requisitos de Meta WhatsApp Cloud API.',
};

export default function PrivacyPage() {
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
              href="/terms"
              className="text-xs font-medium text-slate-600 hover:text-black transition-colors"
            >
              Condiciones del Servicio
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
          <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-full w-fit mb-4">
            <Shield className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Cumplimiento Legal & Protección de Datos</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
            Política de Privacidad y Tratamiento de Datos Personales
          </h1>
          <p className="text-xs text-slate-500 mb-8 font-mono border-b border-slate-100 pb-4">
            Versión: 2.0 (Producción Oficial) | Fecha de expedición y última actualización: 26 de octubre de 2026<br />
            Responsable Legal: <strong>JOSE DAVID NIEVES OROZCO</strong> (Operador de <strong>Synqo CRM</strong>) | NIT 1067598149-1 | Valledupar, Cesar, Colombia
          </p>

          <div className="space-y-8 text-sm leading-relaxed text-slate-600">
            
            {/* 1. Marco Legal e Identificación */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                1. Marco Normativo e Identificación del Responsable
              </h2>
              <p className="mb-3">
                El presente documento contiene la Política de Tratamiento de la Información de <strong>Synqo CRM</strong> (en adelante, &quot;Synqo&quot; o &quot;la Plataforma&quot;), desarrollada y operada por <strong>JOSE DAVID NIEVES OROZCO</strong>, persona natural comerciante identificada con el NIT 1067598149-1, con domicilio en Valledupar, Cesar, República de Colombia, con buzón oficial de notificaciones en:{' '}
                <a href="mailto:contacto@synqo.dev" className="text-emerald-700 font-semibold underline">
                  contacto@synqo.dev
                </a>.
              </p>
              <p>
                Esta política se formula en riguroso cumplimiento de la <strong>Constitución Política de Colombia (Artículo 15)</strong>, la <strong>Ley Estatutaria 1581 de 2012</strong> (Régimen General de Protección de Datos Personales), el <strong>Decreto 1377 de 2013</strong> (compilado en el Decreto Único Reglamentario 1074 de 2015), la <strong>Ley 527 de 1999</strong> (Comercio Electrónico y Mensajes de Datos), así como las directrices técnicas y regulatorias emitidas por la <strong>Superintendencia de Industria y Comercio (SIC)</strong> y las directrices globales de la plataforma <strong>Meta Platforms, Inc. (WhatsApp Business Platform Policy)</strong>.
              </p>
            </section>

            {/* 2. Doble Calidad: Responsable y Encargado */}
            <section className="bg-slate-50 border border-slate-200 rounded-xl p-5">
              <h2 className="text-base font-bold text-slate-900 mb-2">
                2. Roles en el Tratamiento: Responsable vs. Encargado del Tratamiento
              </h2>
              <p className="mb-2">
                En el marco de la operación de Synqo CRM como plataforma SaaS B2B (Software as a Service Multi-Inquilino), se configuran dos escenarios diferenciados de tratamiento:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-700">
                <li>
                  <strong>Synqo como Responsable del Tratamiento:</strong> Respecto de los datos personales de contacto, registro, facturación y autenticación de los administradores y usuarios comerciales que adquieren y operan una cuenta en la plataforma.
                </li>
                <li>
                  <strong>Synqo como Encargado del Tratamiento:</strong> Respecto de las bases de datos de prospectos, clientes finales, números de teléfono destinatarios y el contenido de los mensajes de WhatsApp que cada empresa suscriptora transmite, almacena y procesa a través de la integración con WhatsApp Cloud API y OpenAI. En este caso, <strong>la empresa suscriptora actúa como Responsable del Tratamiento</strong> y garantiza contar con la debida autorización (Opt-in) de sus clientes finales.
                </li>
              </ul>
            </section>

            {/* 3. Categorías de Datos */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Database className="w-5 h-5 text-slate-700" />
                3. Categorías de Datos Personales Recopilados y Procesados
              </h2>
              <p className="mb-3">
                Para la correcta prestación de los servicios comerciales, Synqo recopila y procesa exclusivamente los siguientes datos:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <h3 className="font-bold text-slate-900 mb-1.5">A. Datos de Usuarios de la Plataforma</h3>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    <li>Nombre y apellidos de los operadores y agentes.</li>
                    <li>Dirección de correo electrónico corporativo.</li>
                    <li>Contraseñas cifradas criptográficamente (hashing irreversible).</li>
                    <li>Rol operativo asignado (Super Admin, Administrador, Miembro/Asesor).</li>
                    <li>Registros de inicio de sesión y telemetría de auditoría de seguridad.</li>
                  </ul>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <h3 className="font-bold text-slate-900 mb-1.5">B. Credenciales de Integración de Meta</h3>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    <li>Identificador de Cuenta de WhatsApp Business (WABA ID).</li>
                    <li>Identificador del Número de Teléfono (Phone Number ID).</li>
                    <li>Tokens de acceso OAuth permanentes o de larga duración.</li>
                    <li>Meta App Secret (almacenado bajo cifrado simétrico AES-256).</li>
                  </ul>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <h3 className="font-bold text-slate-900 mb-1.5">C. Datos de Prospectos y Chats de WhatsApp</h3>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    <li>Número de teléfono en formato E.164 (+57...).</li>
                    <li>Nombre visible del perfil de WhatsApp (Push Name).</li>
                    <li>Historial de mensajes de texto y estados de entrega (sent, delivered, read).</li>
                    <li>Archivos adjuntos y notas internas creadas por asesores.</li>
                    <li>Fase comercial en el embudo (Pipeline) y etiquetas personalizadas.</li>
                  </ul>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <h3 className="font-bold text-slate-900 mb-1.5">D. Datos de Agendamiento y Telemetría IA</h3>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    <li>Claves de API de agendamiento (Cal.com cifradas).</li>
                    <li>Fechas, horarios y enlaces de videollamadas o reuniones agendadas.</li>
                    <li>Métricas de consumo de tokens procesados con el motor de IA.</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 4. Finalidades del Tratamiento */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2">4. Finalidades del Tratamiento de los Datos</h2>
              <p className="mb-2">El tratamiento de los datos personales se realiza con las siguientes finalidades legítimas:</p>
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>
                  <strong>Operación del CRM y comunicación omnicanal:</strong> Permitir la recepción y envío bidireccional de mensajes a través del Webhook oficial de WhatsApp Cloud API en tiempo real.
                </li>
                <li>
                  <strong>Atención automatizada mediante Inteligencia Artificial:</strong> Analizar las consultas entrantes de prospectos a través de modelos de lenguaje natural (OpenAI GPT-4o) para formular respuestas orientativas y cualificar intenciones comerciales con base exclusiva en el prompt definido por la empresa.
                </li>
                <li>
                  <strong>Sincronización de citas y agendas:</strong> Gestionar la disponibilidad y confirmación de reuniones a través de la integración tecnológica con Cal.com.
                </li>
                <li>
                  <strong>Seguridad, aislamiento y prevención de fraudes:</strong> Garantizar el aislamiento de datos entre organizaciones mediante políticas estrictas de seguridad por fila (RLS en PostgreSQL), mitigar ataques de denegación de servicio (Rate Limiting) y validar la autenticidad criptográfica de los webhooks mediante firmas HMAC-SHA256.
                </li>
                <li>
                  <strong>Gestión de cobro y monitoreo de cuotas:</strong> Monitorear el volumen mensual de tokens consumidos y administrar el estado de cobertura del servicio contratado.
                </li>
              </ol>
              <p className="mt-3 text-xs bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Compromiso de No Comercialización:</strong> Synqo <strong>NO vende, NO arrienda, NO perfila comercialmente para terceros y NO transfiere</strong> con fines publicitarios los datos de los contactos ni el historial de conversaciones almacenado por sus clientes.
                </span>
              </p>
            </section>

            {/* 5. Subencargados y Transferencias Internacionales */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Globe className="w-5 h-5 text-slate-700" />
                5. Terceros Proveedores de Infraestructura (Subencargados Autorizados)
              </h2>
              <p className="mb-3">
                Para el adecuado funcionamiento de la infraestructura en la nube, Synqo contrata servicios tecnológicos con proveedores de clase mundial que cumplen los más altos estándares de seguridad (SOC 2 Tipo II, ISO 27001 y RGPD):
              </p>
              <div className="space-y-2 text-xs">
                <div className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="font-bold text-slate-900 flex items-center justify-between">
                    <span>Meta Platforms, Inc. / Meta Platforms Ireland Ltd.</span>
                    <span className="text-[11px] font-normal text-slate-500">EE.UU. / Irlanda</span>
                  </div>
                  <p className="text-slate-600 mt-1">
                    Proveedor de la infraestructura oficial de WhatsApp Business Platform (Cloud API). Procesa la transmisión de mensajes, validación de plantillas y webhooks.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="font-bold text-slate-900 flex items-center justify-between">
                    <span>OpenAI, LLC</span>
                    <span className="text-[11px] font-normal text-slate-500">EE.UU.</span>
                  </div>
                  <p className="text-slate-600 mt-1">
                    Proveedor del motor de Inteligencia Artificial para el análisis de lenguaje y formulación de respuestas automáticas. <strong>Conforme a los términos de API comercial de OpenAI, los datos transmitidos a través de nuestra integración no son utilizados para entrenar modelos públicos de lenguaje.</strong>
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="font-bold text-slate-900 flex items-center justify-between">
                    <span>Supabase Inc. (Infraestructura AWS / Postgres)</span>
                    <span className="text-[11px] font-normal text-slate-500">EE.UU.</span>
                  </div>
                  <p className="text-slate-600 mt-1">
                    Alojamiento de bases de datos relacionales con cifrado en reposo, autenticación y políticas activas de Row Level Security (RLS) para aislamiento estricto entre clientes.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="font-bold text-slate-900 flex items-center justify-between">
                    <span>Vercel Inc.</span>
                    <span className="text-[11px] font-normal text-slate-500">EE.UU. / Global Edge</span>
                  </div>
                  <p className="text-slate-600 mt-1">
                    Plataforma de despliegue y cómputo distribuido sin servidor (Serverless Edge Network) con protección SSL/TLS 1.3 de extremo a extremo.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="font-bold text-slate-900 flex items-center justify-between">
                    <span>Cal.com, Inc.</span>
                    <span className="text-[11px] font-normal text-slate-500">EE.UU.</span>
                  </div>
                  <p className="text-slate-600 mt-1">
                    Infraestructura para sincronización de calendarios y disponibilidad para agendamiento de citas comerciales.
                  </p>
                </div>
              </div>
            </section>

            {/* 6. Medidas de Seguridad y Cifrado */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Lock className="w-5 h-5 text-slate-700" />
                6. Medidas Técnicas y Criptográficas de Seguridad
              </h2>
              <p className="mb-2">
                Synqo implementa controles técnicos, humanos y administrativos para garantizar que los datos estén protegidos contra alteración, pérdida, consulta, uso o acceso no autorizado:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>
                  <strong>Cifrado Simétrico AES-256-GCM:</strong> Todos los tokens de acceso permanente de WhatsApp, secretos de aplicaciones y API Keys se cifran en reposo con claves criptográficas maestras de 32 bytes antes de ser almacenados en bases de datos.
                </li>
                <li>
                  <strong>Cifrado en Tránsito (TLS 1.3 / HTTPS):</strong> Toda comunicación entre el navegador del usuario, los servidores de Synqo y las APIs externas viaja a través de canales seguros cifrados.
                </li>
                <li>
                  <strong>Validación Criptográfica de Firmas (HMAC-SHA256):</strong> El webhook de WhatsApp valida la firma del encabezado <code>x-hub-signature-256</code> con la clave secreta de la aplicación de Meta, rechazando cualquier intento de suplantación externa.
                </li>
                <li>
                  <strong>Aislamiento Multi-Inquilino (RLS):</strong> El motor de base de datos impone políticas que impiden estrictamente que un asesor o empresa acceda a registros de otra organización.
                </li>
              </ul>
            </section>

            {/* 7. Derechos de los Titulares y Procedimiento ARCO */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                7. Derechos de los Titulares (Habeas Data) y Canales de Atención
              </h2>
              <p className="mb-2">
                Conforme al artículo 8 de la Ley 1581 de 2012, los titulares de la información gozan de los siguientes derechos:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs mb-3">
                <li>Conocer, actualizar y rectificar sus datos personales frente a Synqo.</li>
                <li>Solicitar prueba de la autorización otorgada al Responsable del tratamiento.</li>
                <li>Ser informado por el Responsable, previa solicitud, respecto del uso que le ha dado a sus datos personales.</li>
                <li>Presentar ante la Superintendencia de Industria y Comercio quejas por infracciones a la ley.</li>
                <li>Revocar la autorización y/o solicitar la supresión del dato en los términos legales.</li>
              </ul>
              
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs space-y-2">
                <h3 className="font-bold text-slate-900">Procedimiento para el Ejercicio de Derechos (Consultas y Reclamos):</h3>
                <p>
                  El titular o su apoderado podrá remitir su solicitud formal al correo:{' '}
                  <a href="mailto:contacto@synqo.dev" className="text-emerald-700 font-semibold underline">
                    contacto@synqo.dev
                  </a>
                  , indicando su nombre completo, número de documento de identificación, correo electrónico registrado y la descripción clara de los hechos y la petición.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-slate-600">
                  <li><strong>Término de respuesta para Consultas:</strong> Máximo diez (10) días hábiles contados a partir de la fecha de recibo.</li>
                  <li><strong>Término de respuesta para Reclamos o Supresión:</strong> Máximo quince (15) días hábiles contados a partir de la fecha de recibo.</li>
                </ul>
                <p className="pt-1">
                  Para instrucciones específicas de desconexión de WhatsApp y revocación de permisos de Meta, consulte nuestras{' '}
                  <Link href="/data-deletion" className="text-emerald-700 font-semibold underline">
                    Instrucciones de Eliminación de Datos de Usuario
                  </Link>.
                </p>
              </div>
            </section>

            {/* 8. Conservación y Política de Retención */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2">8. Período de Conservación y Eliminación Definitiva</h2>
              <p className="text-xs">
                Los datos personales serán conservados durante el tiempo estrictamente necesario para cumplir las finalidades descritas o durante el término en que permanezca vigente la relación contractual con la empresa suscriptora. Ante la terminación formal del servicio o una inactividad por mora superior a treinta (30) días calendario, Synqo procederá a la purga segura e irreversible de las credenciales de conexión de Meta y los datos asociados, conservando únicamente aquellos registros exigidos por la legislación contable, tributaria y comercial colombiana.
              </p>
            </section>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        <p>© 2026 Synqo CRM — JOSE DAVID NIEVES OROZCO (NIT 1067598149-1). Todos los derechos reservados.</p>
        <p className="mt-1">
          <Link href="/terms" className="hover:underline text-slate-500">Condiciones del Servicio</Link>
          {' · '}
          <Link href="/data-deletion" className="hover:underline text-slate-500">Eliminación de Datos</Link>
          {' · '}
          <a href="mailto:contacto@synqo.dev" className="hover:underline text-slate-500">contacto@synqo.dev</a>
        </p>
      </footer>
    </div>
  );
}
