/**
 * Sanea el mensaje de entrada del lead antes de enviarlo a OpenAI.
 * Elimina caracteres de control, delimitadores que intenten emular el System Prompt,
 * y acota la longitud para evitar ataques de agotamiento de contexto / buffer.
 */
export function sanitizeLeadMessage(rawText: string): string {
  if (!rawText) return '';

  return rawText
    // Recortar caracteres invisibles o de control de formato Unicode
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Neutralizar intentos de inyección de delimitadores comunes en modelos LLM
    .replace(/<\|.*?\|>/g, '')
    .replace(/\[SYSTEM\]/gi, '[USUARIO_DIJO]')
    .replace(/\[INSTRUCTION\]/gi, '')
    .replace(/System:\s*/gi, '')
    .replace(/Assistant:\s*/gi, '')
    // Acotar longitud máxima por mensaje para evitar abusos de token budget
    .slice(0, 1000)
    .trim();
}

/**
 * Escapa caracteres HTML para renderizado seguro en React (prevención de Stored XSS).
 */
export function sanitizeHtmlText(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

