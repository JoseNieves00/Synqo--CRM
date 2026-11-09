/**
 * Catálogo pragmático de plantillas comerciales pre-aprobadas en Meta WhatsApp Business.
 * Se utilizan cuando la ventana de 24 horas del lead ha expirado.
 * Este archivo no contiene dependencias de servidor y es 100% seguro para componentes cliente.
 */
export const META_TEMPLATES = {
  hello_world: {
    name: 'hello_world',
    label: 'Saludo Oficial (hello_world)',
    description: 'Plantilla estándar de Meta para iniciar contacto con nuevos prospectos.',
  },
  recordatorio_cita: {
    name: 'recordatorio_cita',
    label: 'Recordatorio de Cita Agendada',
    description: 'Recuerda al prospecto su cita próxima con opción de confirmar.',
  },
  reactivacion_lead: {
    name: 'reactivacion_lead',
    label: 'Reactivación de Contacto',
    description: 'Pregunta al lead si aún está interesado en retomar la conversación.',
  },
  seguimiento_general: {
    name: 'seguimiento_general',
    label: 'Seguimiento de Propuesta',
    description: 'Informa que tenemos novedades sobre su solicitud o requerimiento.',
  },
} as const;

export type MetaTemplateKey = keyof typeof META_TEMPLATES;
