import React from 'react';

/**
 * Parsea y formatea texto enriquecido de WhatsApp y Markdown estándar:
 * - Negrita: *texto* o **texto**
 * - Cursiva: _texto_
 * - Tachado: ~texto~
 * - Monoespaciado: `texto`
 * - Enlaces: https://...
 * 
 * Es 100% seguro contra XSS porque genera elementos nativos de React en lugar de dangerouslySetInnerHTML.
 */
export function formatWhatsAppRichText(content: string): React.ReactNode {
  if (!content) return '';

  // Normalizar **negrita** (estilo markdown estándar común de LLMs) a *negrita* (estilo WhatsApp)
  // para que ambos formatos funcionen de manera idéntica y limpia.
  const normalized = content.replace(/\*\*([^*\n]+?)\*\*/g, '*$1*');

  // Regex para WhatsApp: links, *bold*, _italic_, ~strikethrough~, `code`
  // Nota: solo emparejar dentro de una misma línea y sin espacios vacíos.
  const tokenRegex = /(https?:\/\/[^\s<>'"]+)|(?:\*([^*\n]+?)\*)|(?:_([^_\n]+?)_)|(?:~([^~\n]+?)~)|(?:`([^`\n]+?)`)/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      elements.push(normalized.substring(lastIndex, match.index));
    }

    const key = `rt-${match.index}`;

    if (match[1]) {
      // URL / Enlace
      const url = match[1];
      elements.push(
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-blue-500 hover:text-blue-600 dark:text-blue-400 break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>
      );
    } else if (match[2]) {
      // *Negrita*
      elements.push(
        <strong key={key} className="font-semibold text-inherit">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // _Cursiva_
      elements.push(
        <em key={key} className="italic text-inherit">
          {match[3]}
        </em>
      );
    } else if (match[4]) {
      // ~Tachado~
      elements.push(
        <del key={key} className="line-through opacity-85">
          {match[4]}
        </del>
      );
    } else if (match[5]) {
      // `Código`
      elements.push(
        <code key={key} className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-[0.9em]">
          {match[5]}
        </code>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < normalized.length) {
    elements.push(normalized.substring(lastIndex));
  }

  return elements.length === 1 && typeof elements[0] === 'string' ? elements[0] : <>{elements}</>;
}
