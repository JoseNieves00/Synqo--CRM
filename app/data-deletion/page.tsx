import React from 'react';
import Link from 'next/link';
import { Trash2, ArrowLeft, CheckCircle2, ShieldCheck, Mail, Lock } from 'lucide-react';

export const metadata = {
  title: 'Instrucciones para la Eliminación de Datos de Usuario (Data Deletion) | Synqo CRM',
  description: 'Instrucciones oficiales para la revocación de permisos de Meta WhatsApp y la supresión definitiva de datos de usuario en Synqo CRM conforme a las directrices de Meta Platform.',
};

export default function DataDeletionPage() {
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
          <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200/80 px-3 py-1 rounded-full w-fit mb-4">
            <Trash2 className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Cumplimiento Oficial Meta Developer Platform</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
            Instrucciones para la Eliminación de Datos de Usuario
          </h1>
          <p className="text-xs text-slate-500 mb-8 font-mono border-b border-slate-100 pb-4">
            Directriz de Cumplimiento: Meta Platform Policy — User Data Deletion Request Callback & Instructions<br />
            Responsable: <strong>JOSE DAVID NIEVES OROZCO</strong> (Operador de <strong>Synqo CRM</strong>) | NIT 1067598149-1 | Valledupar, Cesar, Colombia
          </p>

          <div className="space-y-8 text-sm leading-relaxed text-slate-600">
            <p>
              En estricto cumplimiento de las <strong>Políticas de la Plataforma Meta (Meta Platform Policies)</strong> y la <strong>Ley 1581 de 2012 de Colombia</strong>, <strong>Synqo CRM</strong> garantiza a todos los usuarios y organizaciones la posibilidad de desvincular sus cuentas de WhatsApp Business y solicitar en cualquier momento la eliminación total e irreversible de sus datos personales y comerciales almacenados en nuestros servidores.
            </p>

            {/* Método 1: Desvinculación en 1 Clic */}
            <section className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 m-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                Opción 1: Desvinculación Inmediata en 1-Clic desde Synqo CRM
              </h2>
              <p className="text-xs text-slate-600">
                Si eres el Administrador de tu empresa en Synqo CRM, puedes revocar las credenciales y desuscribir los webhooks de Meta de forma automática e inmediata:
              </p>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs text-slate-700">
                <li>Inicia sesión en tu cuenta de Synqo CRM con credenciales de Administrador.</li>
                <li>Dirígete a la pestaña de <strong>Ajustes (/settings)</strong> en el menú lateral principal.</li>
                <li>En la sección de <strong>Meta WhatsApp Cloud API</strong>, haz clic en el botón <strong>&quot;Desvincular Cuenta&quot;</strong>.</li>
                <li>
                  El sistema ejecutará automáticamente una llamada interna a Meta para desuscribir la aplicación (<code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">DELETE /{'{waba_id}'}/subscribed_apps</code>) y purgará de inmediato el token de acceso cifrado (AES-256) y el Identificador de Teléfono de nuestra base de datos.
                </li>
              </ol>
            </section>

            {/* Método 2: Revocación desde Meta / Facebook */}
            <section className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 m-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                Opción 2: Revocación desde tu Portafolio de Meta / Facebook Business
              </h2>
              <p className="text-xs text-slate-600">
                También puedes retirar el acceso a la aplicación de Synqo directamente desde la interfaz de control de privacidad de Facebook:
              </p>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs text-slate-700">
                <li>
                  Ingresa a tu cuenta de Facebook y accede al panel de{' '}
                  <a
                    href="https://www.facebook.com/settings?tab=business_tools"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 font-semibold underline"
                  >
                    Integraciones comerciales de Facebook
                  </a>.
                </li>
                <li>Localiza la aplicación autorizada denominada <strong>Synqo</strong>.</li>
                <li>Marca la casilla correspondiente y selecciona el botón <strong>Eliminar</strong>.</li>
                <li>Marca la opción para solicitar a Facebook que notifique a Synqo la revocación del token de usuario.</li>
              </ol>
            </section>

            {/* Método 3: Supresión Definitiva de Datos (Habeas Data) */}
            <section className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 m-0">
                <Mail className="w-5 h-5 text-blue-600 shrink-0" />
                Opción 3: Solicitud Formal de Supresión Definitiva de Datos (Habeas Data)
              </h2>
              <p className="text-xs text-slate-600">
                Si deseas la eliminación definitiva de todos los registros históricos, prospectos, conversaciones y metadatos de tu organización en nuestros servidores:
              </p>
              <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs space-y-2">
                <p>
                  Envía una solicitud por escrito al correo oficial de protección de datos:{' '}
                  <a href="mailto:contacto@synqo.dev" className="text-blue-600 font-bold underline">
                    contacto@synqo.dev
                  </a>
                </p>
                <ul className="list-disc pl-4 space-y-1 text-slate-600">
                  <li><strong>Asunto:</strong> Solicitud de Eliminación Definitiva de Datos — [Nombre de tu Organización].</li>
                  <li><strong>Información requerida:</strong> Nombre completo del titular, NIT o Cédula, y correo electrónico del Administrador registrado en Synqo.</li>
                  <li>
                    <strong>Plazo y SLA de Ejecución:</strong> Nuestro equipo de seguridad procesará la eliminación en un plazo no mayor a <strong>72 horas hábiles</strong>, enviándote un correo de confirmación con el código de verificación del borrado seguro de la base de datos.
                  </li>
                </ul>
              </div>
            </section>

            {/* Seguridad y Resguardo */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex items-start gap-3 text-xs text-slate-500">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong>Aislamiento y Destrucción Criptográfica:</strong> Al procesarse una baja de datos, las claves simétricas de descifrado asociadas a la organización quedan permanentemente inutilizadas, haciendo matemáticamente imposible recuperar cualquier fragmento de credenciales de WhatsApp o secretos de API.
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        <p>© 2026 Synqo CRM — JOSE DAVID NIEVES OROZCO (NIT 1067598149-1). Todos los derechos reservados.</p>
        <p className="mt-1">
          <Link href="/privacy" className="hover:underline text-slate-500">Política de Privacidad</Link>
          {' · '}
          <Link href="/terms" className="hover:underline text-slate-500">Condiciones del Servicio</Link>
          {' · '}
          <a href="mailto:contacto@synqo.dev" className="hover:underline text-slate-500">contacto@synqo.dev</a>
        </p>
      </footer>
    </div>
  );
}
