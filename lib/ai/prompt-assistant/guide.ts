export interface GuideTopic {
  id: string;
  title: string;
  keywords: string[];
  answer: string;
}

export const SYNQO_HELP_TOPICS: GuideTopic[] = [
  {
    id: 'lead_categories',
    title: 'Clasificación automática en 4 niveles',
    keywords: ['categoria', 'categorias', 'temperatura', 'hot', 'caliente', 'tibio', 'frio', 'dudas', 'calificado', 'clasifica'],
    answer:
      'Synqo clasifica cada chat automáticamente en 4 niveles:\n• **Calificado · Listo (`hot`):** pidió medios de pago, enlace, agendar cita o entregó datos de cierre.\n• **Calificado · Con dudas (`qualified_doubt`):** eligió una opción específica y pregunta detalles (medidas, garantía, disponibilidad o envío).\n• **Tibio (`warm`):** pide precios generales o dice "lo pienso".\n• **Frío (`cold`):** rechazó explícitamente o se dio de baja.',
  },
  {
    id: 'follow_up_buckets',
    title: 'Cómo funciona Seguimiento y sus sub-filtros',
    keywords: ['seguimiento', 'seguimientos', 'venta a medias', 'ventas a medias', 'por reactivar', 'programado', 'recontacto', 'recordatorio'],
    answer:
      'En **Inbox → Seguimiento** los chats se dividen en 3 sub-bandejas excluyentes:\n• **⏰ Seguimientos programados:** tienen un recordatorio agendado (por la IA o por un asesor) o chat pospuesto.\n• **🛒 Ventas a Medias:** leads calificados o que cotizaron un producto específico sin recordatorio manual pendiente.\n• **❄️ Por Reactivar:** consultas generales en silencio ≥ 24h sin intento previo.\nLos contactos marcados como Frío (`cold`) nunca entran en Seguimiento.',
  },
  {
    id: 'human_handoff',
    title: 'Relevo a asesor humano y alertas',
    keywords: ['relevo', 'humano', 'asesor', 'pausa', 'pausar', 'handoff', 'comprobante', 'audio'],
    answer:
      'Cuando un cliente pide hablar con una persona, envía un comprobante de pago, hace un reclamo o manda un audio inaudible, la IA solicita relevo silencioso, mueve el chat a **Por Responder**, pausa sus respuestas y notifica al asesor disponible por WhatsApp.',
  },
  {
    id: 'knowledge_gaps',
    title: 'Vacíos de conocimiento (aprendizaje continuo)',
    keywords: ['vacio', 'vacios', 'conocimiento', 'no sabe', 'aprender', 'preguntas sin respuesta'],
    answer:
      'Si un cliente pregunta algo verificable que no está en tu prompt, la IA no inventa datos: registra el vacío en **Vacíos de Conocimiento** (Configuración). Cuando tú respondes ese punto, puedes integrarlo directo al prompt con un clic.',
  },
  {
    id: 'visual_gallery',
    title: 'Galería visual y tarjetas de producto',
    keywords: ['foto', 'fotos', 'imagen', 'imagenes', 'galeria', 'catalogo', 'tarjeta', 'send_product_card'],
    answer:
      'Sube las fotos de tus productos o servicios en **Fotos de Productos** con nombre, precio exacto y palabras clave. La IA enviará la imagen real al cliente por WhatsApp sin poner enlaces largos ni inventar precios.',
  },
  {
    id: 'meta_templates',
    title: 'Regla de 24 horas en WhatsApp Meta vs Evolution',
    keywords: ['meta', 'plantilla', 'plantillas', '24 horas', '24h', 'bloqueo', 'spam', 'evolution'],
    answer:
      'En **Meta Cloud API**, fuera de las 24 horas desde el último mensaje del cliente solo se pueden enviar **plantillas aprobadas** por Meta. Dentro de 24h (o con Evolution) la IA puede enviar texto libre respetando horario comercial, pausas anti-spam y máximo 2 toques por ciclo.',
  },
  {
    id: 'sandbox_test',
    title: 'Probar tu bot en Sandbox sin gastar mensajería',
    keywords: ['sandbox', 'probar', 'prueba', 'simulador', 'simular', 'test'],
    answer:
      'Usa **Probar Bot en Sandbox** en Configuración para simular una conversación real con tu prompt actual sin enviar mensajes reales a WhatsApp ni crear contactos ficticios.',
  },
  {
    id: 'token_alerts',
    title: 'Consultas gerenciales (#tokens / #admin) y alertas',
    keywords: ['token', 'tokens', 'pin', '#tokens', '#admin', 'cuota', 'excedente', 'alerta'],
    answer:
      'En **Alertas de Tokens y Consulta Gerencial** puedes definir en qué porcentajes (`x%`) recibir aviso automático y crear tu **PIN de 4 dígitos**. Al escribir `#tokens` o `#admin` desde el WhatsApp de administrador a tu línea, verás el consumo en vivo con 0 consumo de tokens.',
  },
];

export const COMMON_HELP_CHIPS = [
  '¿Cómo clasifica la IA a mis clientes?',
  '¿Cómo funciona Ventas a Medias y Seguimiento?',
  '¿Qué pasa con los mensajes después de 24 horas en Meta?',
  '¿Cómo subo fotos para que la IA las envíe?',
];

function normalizeSearch(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s#]/g, ' ')
    .trim();
}

/**
 * Busca coincidencia determinística en la guía de Synqo (0 tokens de IA).
 */
export function searchAssistantGuide(query: string): {
  matched: GuideTopic | null;
  closest: GuideTopic[];
} {
  const norm = normalizeSearch(query);
  if (!norm) return { matched: null, closest: SYNQO_HELP_TOPICS.slice(0, 2) };

  const tokens = norm.split(/\s+/).filter((t) => t.length >= 3);
  const scored = SYNQO_HELP_TOPICS.map((topic) => {
    let score = 0;
    for (const kw of topic.keywords) {
      const nkw = normalizeSearch(kw);
      if (norm.includes(nkw)) score += 3;
      else if (tokens.some((t) => nkw.includes(t) || t.includes(nkw))) score += 1;
    }
    return { topic, score };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (top && top.score >= 3) {
    return { matched: top.topic, closest: [top.topic] };
  }

  return {
    matched: null,
    closest: scored.slice(0, 2).map((s) => s.topic),
  };
}
