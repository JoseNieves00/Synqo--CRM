'use server';

import OpenAI from 'openai';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const KNOWLEDGE_BASE = `
GUÍA DE SOPORTE TÉCNICO Y PREGUNTAS FRECUENTES DE SYNQO CRM:

1. VENTANA DE 24 HORAS DE WHATSAPP:
- ¿Por qué no puedo enviar texto libre?: Meta exige que si han pasado más de 24 horas desde el último mensaje del CLIENTE, solo se pueden enviar plantillas pre-aprobadas en Meta.
- Solución: Haz clic en el botón "Plantilla de WhatsApp" arriba del chat y selecciona una plantilla aprobada para reactivar la conversación. Una vez el cliente responda, se abrirá de nuevo la ventana de 24 horas para escribir texto libre.

2. CONEXIÓN DE WHATSAPP BUSINESS & TOKENS DE META:
- ¿Cómo conectar WhatsApp?: Ve a Configuración > WhatsApp.
- Necesitas dos datos de Meta Business Suite (business.facebook.com/settings):
  1. Phone Number ID: Cópialo de WhatsApp > Configuración de la API.
  2. Token Permanente de Usuario del Sistema: Ve a Usuarios del Sistema, crea un token con permisos 'whatsapp_business_messaging' y 'whatsapp_business_management'.
- Nunca uses tokens temporales del Graph API Explorer porque vencen en 24 horas.

3. AGENDA Y CITAS AUTOMÁTICAS NATIVAS:
- ¿Cómo funciona la agenda?: Ve al menú lateral "Agenda / Calendario".
- Puedes configurar colaboradores, especialistas, salones o modalidades de atención (Presencial, Virtual o Visita a Domicilio).
- La IA consulta en tiempo real los cupos y agenda citas automáticamente sin depender de herramientas externas.

4. EQUIPO Y ASIGNACIÓN DE ASESORES:
- ¿Cómo invitar asesores?: Ve a Configuración > Pestaña "Equipo & Usuarios". Ingresa el nombre, correo y contraseña temporal.
- En su primer inicio de sesión, el sistema le pedirá cambiar su contraseña obligatoriamente por seguridad.
- Capacidad: Depende de tu plan (Starter: 2 asesores, Pro: 5 asesores, Enterprise: 12 asesores).

5. CONSUMO DE TOKENS IA:
- ¿Qué pasa si se agotan mis tokens?: La IA se pausa preventivamente para no generar cobros inesperados, pero tus asesores humanos pueden seguir respondiendo normalmente por el Inbox. Puedes solicitar una ampliación de tokens al administrador.
`;

export async function askClientCopilot(question: string, history: ChatMessage[] = []) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, answer: 'Por favor inicia sesión para usar el asistente.' };
  }

  const cleanQuestion = question.trim();
  if (!cleanQuestion) {
    return { success: false, answer: 'Por favor escribe una consulta.' };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      answer: 'El motor de respuestas automáticas está temporalmente inactivo. Puedes crear un ticket técnico con un desarrollador.',
    };
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: `Eres el Asistente de Ayuda y Soporte de Synqo CRM. Responde de forma muy concisa, cordial y directa usando la siguiente base de conocimiento:
${KNOWLEDGE_BASE}
Si la pregunta del usuario es sobre un error técnico no contemplado en la guía o una caída del sistema, indícale amablemente que use el botón "Crear Ticket Técnico" para que un desarrollador lo resuelva.`,
        },
        ...history.slice(-4),
        { role: 'user', content: cleanQuestion },
      ],
    });

    return {
      success: true,
      answer: response.choices[0]?.message?.content || 'No pude encontrar la respuesta. Por favor crea un ticket de soporte.',
    };
  } catch (err: any) {
    return {
      success: false,
      answer: 'Hubo un error de conexión con el asistente. Puedes reportar tu problema creando un ticket técnico directo.',
    };
  }
}

