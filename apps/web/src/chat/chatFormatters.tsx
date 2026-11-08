import React from 'react';

export function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return <code key={i} className="chat-inline-code">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export function renderFormattedContent(content: string, isEn: boolean): React.ReactNode {
  if (!content) return null;

  // Normaliza y separa items numerados o clases pegadas (ej. "...costo total. 5. **Clase...")
  const normalized = content
    .replace(/([.!?])\s*(?=\d+\.\s+\*\*)/g, '$1\n\n')
    .replace(/(?:\r\n|\r|\n)/g, '\n');

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="chat-formatted-body">
      {paragraphs.map((p, pIdx) => {
        // Detecta item estructurado de clase: ej. 1. **Clase "Nombre"** (atributos: [...]) - Explicación: ...
        const classMatch = p.match(/^(\d+\.?\s*)?\*\*(?:Clase\s+)?["']?([^"'*]+)["']?\*\*(.*)$/i);
        if (classMatch) {
          const [, prefix, className, rest] = classMatch;
          const attrMatch = rest.match(/\(atributos:\s*\[(.*?)\]\)|atributos:\s*\[(.*?)\]|\[(.*?)\]/i);
          const rawAttrs = attrMatch ? (attrMatch[1] || attrMatch[2] || attrMatch[3]) : null;

          let restWithoutAttrs = rest;
          if (attrMatch) {
            restWithoutAttrs = restWithoutAttrs.replace(attrMatch[0], '');
          }

          const relMatch = restWithoutAttrs.match(/\((?:relaciones|relaci[oó]n|relationships?):\s*\[(.*?)\]\)|\((?:relaciones|relaci[oó]n|relationships?):\s*([^)]+)\)|(?:relaciones|relaci[oó]n|relationships?):\s*\[(.*?)\]/i);
          const rawRels = relMatch ? (relMatch[1] || relMatch[2] || relMatch[3]) : null;

          let explanation = restWithoutAttrs;
          if (relMatch) {
            explanation = explanation.replace(relMatch[0], '');
          }
          explanation = explanation.replace(/^[\s-:–—]+(?:Explicación|Explicacion|Explanation)?[\s-:–—]*/i, '').trim();

          return (
            <div key={pIdx} className="chat-class-card">
              <div className="chat-class-card__header">
                {prefix && <span className="chat-class-card__num">{prefix.trim()}</span>}
                <span className="chat-class-card__badge">Clase</span>
                <span className="chat-class-card__name">{className.trim()}</span>
              </div>
              {rawAttrs && (
                <div className="chat-class-card__attrs">
                  <span className="chat-class-card__attrs-label">{isEn ? 'Attributes:' : 'Atributos:'}</span>
                  <div className="chat-class-card__attr-pills">
                    {rawAttrs.split(',').map((a, aIdx) => (
                      <span key={aIdx} className="chat-class-card__attr-pill">
                        {a.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {rawRels && (
                <div className="chat-class-card__rels">
                  <span className="chat-class-card__rels-label">{isEn ? 'Relationships:' : 'Relaciones:'}</span>
                  <div className="chat-class-card__rel-pills">
                    {rawRels.split(',').map((r, rIdx) => (
                      <span key={rIdx} className="chat-class-card__rel-pill">
                        {r.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {explanation && (
                <div className="chat-class-card__desc">
                  {parseInlineMarkdown(explanation)}
                </div>
              )}
            </div>
          );
        }

        return (
          <p key={pIdx} className="chat-formatted-p">
            {p.split('\n').map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {lIdx > 0 && <br />}
                {parseInlineMarkdown(line)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function renderStreamingContent(text: string, isEn: boolean) {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return (
      <div className="chat-panel__thinking">
        <span>{isEn ? 'Amongus is typing...' : 'Amongus está escribiendo...'}</span>
      </div>
    );
  }

  // Si detecta inicio de bloque JSON o estructura de modelado
  const isModelingJson = trimmed.startsWith('{') || trimmed.includes('```json') || trimmed.includes('"action"');
  if (isModelingJson) {
    const matches = Array.from(trimmed.matchAll(/"name":\s*"([^"]+)"/g)).map((m) => m[1]);
    const uniqueClasses = Array.from(new Set(matches)).filter((name) => name !== 'ClassName');
    const textWithoutJson = trimmed.replace(/```(?:json)?[\s\S]*?```/gi, '').replace(/{[\s\S]*$/, '').trim();

    return (
      <div className="chat-panel__streaming-proposal">
        <div className="chat-panel__streaming-title">
          <span className="chat-panel__pulse-dot" />
          <strong>{isEn ? 'Drafting UML Domain Model...' : 'Diseñando modelo UML en vivo...'}</strong>
        </div>
        {uniqueClasses.length > 0 && (
          <div className="chat-panel__streaming-classes">
            {uniqueClasses.map((cls) => (
              <span key={cls} className="chat-panel__streaming-class-tag">
                + {cls}
              </span>
            ))}
          </div>
        )}
        {textWithoutJson.length > 0 && (
          <p className="chat-panel__streaming-text">{textWithoutJson}</p>
        )}
      </div>
    );
  }

  // Respuesta conversacional / teórica: texto en vivo con cursor parpadeante
  return (
    <div className="chat-panel__streaming-text">
      {renderFormattedContent(trimmed, isEn)}
      <span className="chat-panel__cursor">▊</span>
    </div>
  );
}
