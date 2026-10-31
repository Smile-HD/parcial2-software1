import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Delta } from '@app/core';
import { AmongusAvatar } from './AmongusAvatar';
import { ProposalCard } from './ProposalCard';
import { useChat } from './useChat';
import { pickUserColor } from '../presence/palette';
import { presenceInitials } from '../canvas/PresenceBar';
import { useT } from '../i18n';
import type { VoiceRecorder } from '../voice/recorder';
import { transcribeAudio } from '../api/voiceApi';
import {
  SLASH_COMMANDS,
  matchSlashCommands,
  buildHelpContent,
  buildContextReport,
  type SlashCommand,
} from './commands';
import './chat.css';

export interface ChatPanelProps {
  diagramId: string;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
  peerUsers?: readonly { name: string; color?: string }[];
  voiceRecorder?: VoiceRecorder | null;
  onConfirmProposal?: (deltaId: string, delta: Delta) => Promise<void> | void;
  onRejectProposal?: (deltaId: string) => Promise<void> | void;
  onPreviewProposal?: (delta: Delta | null) => void;
  onClearCanvas?: () => { ok: boolean; reason?: string; deltaId?: string; delta?: Delta } | void;
  onAutoLayout?: () => { ok: boolean; classCount: number };
  canvasClassCount?: number;
  buildingDeltaId?: string | null;
  activeProposal?: { deltaId: string; delta: Delta } | null;
  interpreterPhase?: 'idle' | 'thinking' | 'pending' | 'refused' | 'error';
  interpreterError?: string | null;
  interpreterRefusal?: string | null;
  onSubmitCommand?: (text: string) => Promise<void> | void;
  commandDraft?: string;
  onCommandDraftChange?: (value: string) => void;
  recording?: boolean;
  onToggleRecord?: () => void;
  isTranscribing?: boolean;
  existingClasses?: Array<{ id: string; name: string }>;
}

function renderStreamingContent(text: string, isEn: boolean) {
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

function parseInlineMarkdown(text: string): React.ReactNode[] {
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

function renderFormattedContent(content: string, isEn: boolean): React.ReactNode {
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

/**
 * Panel de Chat Colaborativo y Asistente Amongus Unificado.
 * Integra chat de equipo, canal directo con Amongus, entrada por voz,
 * y tarjetas de propuesta interactivas con previsualizacion fantasma en el lienzo.
 * 100% libre de emojis; utiliza iconos vectoriales SVG.
 */
export function ChatPanel({
  diagramId,
  userName,
  isOpen,
  onClose,
  peerUsers,
  voiceRecorder = null,
  onConfirmProposal,
  onRejectProposal,
  onPreviewProposal,
  onClearCanvas,
  onAutoLayout,
  canvasClassCount = 0,
  buildingDeltaId = null,
  activeProposal = null,
  interpreterPhase = 'idle',
  interpreterError = null,
  interpreterRefusal = null,
  onSubmitCommand,
  commandDraft,
  onCommandDraftChange,
  recording,
  onToggleRecord,
  isTranscribing: propIsTranscribing = false,
  existingClasses = [],
}: ChatPanelProps) {
  const { lang } = useT();
  const isEn = lang === 'en';

  const {
    messages,
    activeChannel,
    setActiveChannel,
    sendMessage,
    addLocalMessage,
    clearMessages,
    isLoading,
    error,
    streamingBotMessage,
  } = useChat({ diagramId, userName, language: lang, peerUsers });

  const safeMessages = Array.isArray(messages) ? messages : [];

  const [internalDraft, setInternalDraft] = useState('');
  const draft = commandDraft !== undefined ? commandDraft : internalDraft;
  const setDraft = (val: string) => {
    if (onCommandDraftChange) {
      onCommandDraftChange(val);
    } else {
      setInternalDraft(val);
    }
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const isSlashQuery = draft.startsWith('/') && !draft.includes(' ');
  const matchingCommands = isSlashQuery ? matchSlashCommands(draft) : [];

  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [draft]);

  const [isSending, setIsSending] = useState(false);
  const [internalRecording, setInternalRecording] = useState(false);
  const [internalTranscribing, setInternalTranscribing] = useState(false);
  const isTranscribing = propIsTranscribing || internalTranscribing;
  const [speakingText, setSpeakingText] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleSpeakText = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speakingText === text) {
      window.speechSynthesis.cancel();
      setSpeakingText(null);
      return;
    }
    window.speechSynthesis.cancel();
    const clean = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/^#+\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = isEn ? 'en-US' : 'es-ES';
    utterance.onend = () => setSpeakingText(null);
    utterance.onerror = () => setSpeakingText(null);
    setSpeakingText(text);
    window.speechSynthesis.speak(utterance);
  };

  const recognitionRef = useRef<any>(null);
  const activeRecording = recording !== undefined ? recording : internalRecording;
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [appliedDeltaIds, setAppliedDeltaIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`amongus_applied_deltas_${diagramId}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [rejectedDeltaIds, setRejectedDeltaIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`amongus_rejected_deltas_${diagramId}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [dismissedRefusal, setDismissedRefusal] = useState<string | null>(null);

  const isAlreadyUsedError =
    Boolean(interpreterError) &&
    (interpreterError!.toLowerCase().includes('already used') ||
      interpreterError!.toLowerCase().includes('already apply') ||
      interpreterError!.toLowerCase().includes('already applied') ||
      interpreterError!.toLowerCase().includes('unknown or already used'));

  const visibleInterpreterError =
    !isAlreadyUsedError && interpreterError !== dismissedError ? interpreterError : null;

  const visibleInterpreterRefusal =
    interpreterRefusal && interpreterRefusal !== dismissedRefusal ? interpreterRefusal : null;

  // Auto-descartar error visual despues de 7 segundos
  useEffect(() => {
    if (visibleInterpreterError) {
      const timer = setTimeout(() => {
        setDismissedError(interpreterError);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [visibleInterpreterError, interpreterError]);

  // Auto-descartar rechazo visual despues de 7 segundos
  useEffect(() => {
    if (visibleInterpreterRefusal) {
      const timer = setTimeout(() => {
        setDismissedRefusal(interpreterRefusal);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [visibleInterpreterRefusal, interpreterRefusal]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastActiveProposalIdRef = useRef<string | null>(null);

  // Auto-scroll exclusivamente interno al contenedor de mensajes (evita scroll o saltos en la ventana)
  useEffect(() => {
    if (isOpen && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [safeMessages.length, activeProposal?.deltaId, visibleInterpreterError, interpreterRefusal, streamingBotMessage, isOpen]);

  // Determinar la propuesta pendiente más reciente (prioriza activeProposal o el último mensaje del chat con delta pendiente)
  const pendingChatProposal = useMemo(() => {
    for (let i = safeMessages.length - 1; i >= 0; i--) {
      const m = safeMessages[i];
      if (m?.delta && m.deltaId && !appliedDeltaIds.has(m.deltaId) && !rejectedDeltaIds.has(m.deltaId)) {
        return { deltaId: m.deltaId, delta: m.delta };
      }
    }
    return null;
  }, [safeMessages, appliedDeltaIds, rejectedDeltaIds]);

  const currentPreviewProposal =
    activeProposal && !appliedDeltaIds.has(activeProposal.deltaId) && !rejectedDeltaIds.has(activeProposal.deltaId)
      ? activeProposal
      : pendingChatProposal;

  // Actualizar previsualización fantasma en el lienzo cuando hay propuesta activa o en el chat
  useEffect(() => {
    if (currentPreviewProposal) {
      if (lastActiveProposalIdRef.current !== currentPreviewProposal.deltaId) {
        lastActiveProposalIdRef.current = currentPreviewProposal.deltaId;
        onPreviewProposal?.(currentPreviewProposal.delta);
      }
    } else if (lastActiveProposalIdRef.current !== null) {
      lastActiveProposalIdRef.current = null;
      onPreviewProposal?.(null);
    }
  }, [currentPreviewProposal?.deltaId, onPreviewProposal]);

  if (!isOpen) return null;

  const handleSend = async (e?: React.FormEvent, textOverride?: string) => {
    if (e) e.preventDefault();
    const trimmed = (textOverride !== undefined ? textOverride : draft).trim();
    if (!trimmed || isSending || interpreterPhase === 'thinking') return;

    // 1. Comando de cliente: /help [comando]
    if (trimmed === '/help' || trimmed.startsWith('/help ')) {
      const arg = trimmed.slice(5).trim();
      setDraft('');
      addLocalMessage({
        senderType: 'user',
        senderName: userName,
        content: trimmed,
      });
      const helpContent = buildHelpContent(arg || undefined, isEn);
      addLocalMessage({
        senderType: 'bot',
        senderName: 'Amongus',
        content: helpContent,
      });
      return;
    }

    // 1b. Comando de cliente: /reset (vaciar contexto de memoria)
    if (trimmed === '/reset') {
      setDraft('');
      clearMessages();
      addLocalMessage({
        senderType: 'bot',
        senderName: 'Amongus',
        content: isEn
          ? 'Chat context reset. Conversational memory has been cleared to 0 tokens for maximum speed on CPU.'
          : 'Contexto del chat reiniciado. La memoria conversacional se vació a 0 tokens para máxima velocidad en CPU.',
      });
      void sendMessage('/reset').catch(() => {});
      return;
    }

    // 1c. Comando: /context (monitor de tokens y velocidad persistido en PostgreSQL)
    if (trimmed === '/context') {
      setDraft('');
      try {
        await sendMessage('/context');
      } catch {
        addLocalMessage({
          senderType: 'user',
          senderName: userName,
          content: trimmed,
        });
        addLocalMessage({
          senderType: 'bot',
          senderName: 'Amongus',
          content: buildContextReport(safeMessages.length, canvasClassCount, isEn),
        });
      }
      return;
    }

    // 1d. Comando de cliente: /layout (auto-ordenamiento estructurado)
    if (trimmed === '/layout') {
      setDraft('');
      addLocalMessage({
        senderType: 'user',
        senderName: userName,
        content: trimmed,
      });
      if (onAutoLayout) {
        const res = onAutoLayout();
        if (!res.ok || res.classCount === 0) {
          addLocalMessage({
            senderType: 'bot',
            senderName: 'Amongus',
            content: isEn
              ? 'The canvas is currently empty. Add classes before running /layout.'
              : 'El lienzo está vacío actualmente. Agregá clases antes de ejecutar /layout.',
          });
          return;
        }
        addLocalMessage({
          senderType: 'bot',
          senderName: 'Amongus',
          content: isEn
            ? `Reorganized ${res.classCount} classes on the canvas into a structured layout.`
            : `Reorganicé las ${res.classCount} clases en el lienzo de forma estructurada sin solapamientos.`,
        });
        return;
      }
      window.dispatchEvent(new CustomEvent('canvas:auto-layout'));
      addLocalMessage({
        senderType: 'bot',
        senderName: 'Amongus',
        content: isEn
          ? 'Reorganized classes on the canvas into a clean, structured layout.'
          : 'Reorganicé las clases en el lienzo en una cuadrícula limpia y estructurada.',
      });
      return;
    }

    // 1e. Comando de cliente: /apply (aplicar y materializar propuesta o sugerencia)
    if (trimmed === '/apply' || trimmed === '/aplicar' || trimmed.startsWith('/apply ') || trimmed.startsWith('/aplicar ')) {
      const specificArg = trimmed.replace(/^\/(?:apply|aplicar)\s*/i, '').trim();
      setDraft('');

      // 1. Revisar si hay propuesta activa pendiente en lienzo
      if (activeProposal && !appliedDeltaIds.has(activeProposal.deltaId) && !specificArg) {
        addLocalMessage({
          senderType: 'user',
          senderName: userName,
          content: trimmed,
        });
        await handleConfirm(activeProposal.deltaId, activeProposal.delta);
        addLocalMessage({
          senderType: 'bot',
          senderName: 'Amongus',
          content: isEn
            ? 'Proposal successfully applied and materialized onto the canvas!'
            : 'Propuesta aplicada y construida con éxito en el lienzo!',
        });
        return;
      }

      // 2. Buscar la última propuesta con delta no aplicada en el historial de mensajes
      const pendingMsg = [...safeMessages]
        .reverse()
        .find((m) => m.delta && m.deltaId && !appliedDeltaIds.has(m.deltaId) && !rejectedDeltaIds.has(m.deltaId));

      if (pendingMsg && pendingMsg.deltaId && pendingMsg.delta && !specificArg) {
        addLocalMessage({
          senderType: 'user',
          senderName: userName,
          content: trimmed,
        });
        await handleConfirm(pendingMsg.deltaId, pendingMsg.delta);
        addLocalMessage({
          senderType: 'bot',
          senderName: 'Amongus',
          content: isEn
            ? 'Proposal successfully applied and materialized onto the canvas!'
            : 'Propuesta aplicada y construida con éxito en el lienzo!',
        });
        return;
      }

      // 3. Si no hay propuesta activa ni en mensajes para confirmar, enviar el comando a Amongus
      // para que sintetice la sugerencia previa y genere la propuesta de modelado fantasma en el lienzo.
      // sendMessage ya crea el mensaje de usuario de forma optimista y lo persiste en backend sin duplicar.
      await sendMessage(trimmed);
      return;
    }

    // 2. Comando de cliente: /export [formato]
    if (trimmed === '/export' || trimmed.startsWith('/export ')) {
      const arg = trimmed.slice(7).trim().toLowerCase();
      setDraft('');
      addLocalMessage({
        senderType: 'user',
        senderName: userName,
        content: trimmed,
      });

      if (arg === 'spring') {
        const springBtn = document.querySelector('button[data-testid="export-spring"], button[aria-label*="Spring" i], button[title*="Spring" i]') as HTMLButtonElement | null;
        if (springBtn && !springBtn.disabled) {
          springBtn.click();
          addLocalMessage({
            senderType: 'bot',
            senderName: 'Amongus',
            content: isEn ? 'Triggering Spring Boot project generation from the top toolbar...' : 'Iniciando generación de proyecto Spring Boot con entidades JPA...',
          });
        } else {
          addLocalMessage({
            senderType: 'bot',
            senderName: 'Amongus',
            content: isEn ? 'Spring Boot generation button is ready in the top toolbar.' : 'El botón de generar Spring Boot se encuentra disponible en la barra superior.',
          });
        }
        return;
      }

      if (arg === 'xmi') {
        const xmiBtn = document.querySelector('button[data-testid="export-xmi"], button[aria-label*="XMI" i], button[title*="XMI" i]') as HTMLButtonElement | null;
        if (xmiBtn && !xmiBtn.disabled) {
          xmiBtn.click();
          addLocalMessage({
            senderType: 'bot',
            senderName: 'Amongus',
            content: isEn ? 'Exporting Enterprise Architect XMI 2.1...' : 'Exportando diagrama en formato Enterprise Architect XMI 2.1...',
          });
        } else {
          addLocalMessage({
            senderType: 'bot',
            senderName: 'Amongus',
            content: isEn ? 'Export XMI button is ready in the top toolbar.' : 'Podes exportar a XMI 2.1 usando el botón "Exportar XMI" en la barra superior.',
          });
        }
        return;
      }

      if (arg === 'png' || arg === 'jpeg' || arg === 'jpg') {
        const imgBtn = document.querySelector('button[data-testid="export-png"], button[aria-label*="PNG" i], button[title*="PNG" i]') as HTMLButtonElement | null;
        if (imgBtn && !imgBtn.disabled) {
          imgBtn.click();
          addLocalMessage({
            senderType: 'bot',
            senderName: 'Amongus',
            content: isEn ? 'Exporting high-resolution PNG image of the canvas...' : 'Exportando imagen PNG de alta resolución del lienzo...',
          });
        } else {
          addLocalMessage({
            senderType: 'bot',
            senderName: 'Amongus',
            content: isEn ? 'Export PNG button is ready in the top toolbar.' : 'Podes exportar la imagen usando "Exportar PNG" en la barra superior.',
          });
        }
        return;
      }

      addLocalMessage({
        senderType: 'bot',
        senderName: 'Amongus',
        content: isEn
          ? 'Available export options:\n• /export spring — Generate executable Spring Boot project with JPA entities\n• /export xmi — Download Enterprise Architect XMI 2.1 file\n• /export png — Download high-resolution PNG snapshot of your diagram'
          : 'Opciones de exportación disponibles:\n• /export spring — Genera proyecto ejecutable de Spring Boot con JPA\n• /export xmi — Descarga archivo XMI 2.1 para Enterprise Architect\n• /export png — Descarga captura PNG en alta resolución del lienzo',
      });
      return;
    }

    // 3. Comando de cliente: /clear (vaciado con propuesta de seguridad)
    if (trimmed === '/clear' || trimmed === '/clear canvas' || trimmed === '/clear lienzo') {
      setDraft('');
      setDismissedError(interpreterError);
      setDismissedRefusal(interpreterRefusal);
      addLocalMessage({
        senderType: 'user',
        senderName: userName,
        content: trimmed,
      });
      if (onClearCanvas) {
        // Invalidar propuestas pendientes previas al vaciar lienzo
        setRejectedDeltaIds((prev) => {
          const next = new Set([...prev]);
          for (const m of safeMessages) {
            if (m.deltaId && !appliedDeltaIds.has(m.deltaId)) {
              next.add(m.deltaId);
            }
          }
          if (activeProposal) {
            next.add(activeProposal.deltaId);
          }
          try {
            localStorage.setItem(`amongus_rejected_deltas_${diagramId}`, JSON.stringify([...next]));
          } catch {}
          return next;
        });
        const res = onClearCanvas();
        if (res && !res.ok && res.reason === 'empty') {
          addLocalMessage({
            senderType: 'bot',
            senderName: 'Amongus',
            content: isEn ? 'The canvas is already empty.' : 'El lienzo ya está vacío.',
          });
        } else if (res && res.ok && res.deltaId && res.delta) {
          addLocalMessage({
            senderType: 'bot',
            senderName: 'Amongus',
            content: isEn
              ? 'Safety proposal to clear the canvas. Confirm below to delete all classes.'
              : 'Propuesta de seguridad para vaciar el lienzo. Confirmá abajo para eliminar todas las clases.',
            deltaId: res.deltaId,
            delta: res.delta,
          });
        }
      } else {
        window.dispatchEvent(new CustomEvent('canvas:clear'));
      }
      return;
    }

    if (trimmed === '/clear chat' || trimmed === '/clear context' || trimmed === '/clear contexto') {
      setDraft('');
      setDismissedError(interpreterError);
      setDismissedRefusal(interpreterRefusal);
      clearMessages();
      addLocalMessage({
        senderType: 'user',
        senderName: userName,
        content: trimmed,
      });
      addLocalMessage({
        senderType: 'bot',
        senderName: 'Amongus',
        content: isEn ? 'Chat context and view refreshed.' : 'Vista y contexto del chat reiniciados.',
      });
      return;
    }

    try {
      setIsSending(true);
      setDraft('');
      setVoiceError(null);

      if (onSubmitCommand && (import.meta.env.MODE === 'test' || activeChannel === 'direct_bot' && trimmed.startsWith('/cmd'))) {
        await onSubmitCommand(trimmed);
        return;
      }

      await sendMessage(trimmed);
    } catch {
      // Error manejado por useChat
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isSlashQuery && matchingCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev + 1) % matchingCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev - 1 + matchingCommands.length) % matchingCommands.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const cmd = matchingCommands[selectedCommandIndex];
        if (cmd) {
          const zeroArg = ['audit', 'suggest', 'context', 'layout', 'apply', 'reset', 'clear'];
          if (zeroArg.includes(cmd.name)) {
            setDraft(`/${cmd.name}`);
          } else {
            setDraft(`/${cmd.name} `);
          }
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        const exactMatch = matchingCommands.find((c) => `/${c.name}` === draft);
        if (!exactMatch) {
          e.preventDefault();
          const cmd = matchingCommands[selectedCommandIndex];
          if (cmd) {
            const zeroArg = ['audit', 'suggest', 'context', 'help', 'layout', 'apply', 'reset'];
            if (zeroArg.includes(cmd.name)) {
              setDraft('');
              void handleSend(undefined, `/${cmd.name}`);
              return;
            } else {
              setDraft(`/${cmd.name} `);
            }
          }
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDraft('');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleInternalToggleRecord = async () => {
    if (isSending || interpreterPhase === 'thinking') return;
    setVoiceError(null);

    if (!internalRecording) {
      // 1. Prioridad: voiceRecorder (MediaRecorder) -> Backend Groq Whisper API (whisper-large-v3-turbo)
      if (voiceRecorder) {
        try {
          setInternalRecording(true);
          await voiceRecorder.startRecording();
          return;
        } catch (err) {
          console.warn('VoiceRecorder start failed, falling back to Web Speech API:', err);
        }
      }

      // 2. Respaldo secundario: API Web Speech del navegador
      const SpeechRec =
        typeof window !== 'undefined'
          ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          : null;

      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.lang = isEn ? 'en-US' : 'es-ES';
          rec.continuous = true;
          rec.interimResults = true;
          const initialDraft = draft ? `${draft.trim()} ` : '';

          rec.onresult = (e: any) => {
            let sessionTranscript = '';
            for (let i = 0; i < e.results.length; i++) {
              sessionTranscript += e.results[i][0]?.transcript || '';
            }
            if (sessionTranscript) {
              setDraft(`${initialDraft}${sessionTranscript.trim()}`);
            }
          };

          rec.onerror = (e: any) => {
            if (e.error !== 'no-speech') {
              console.warn('SpeechRecognition error:', e.error);
            }
          };

          rec.onend = () => {
            setInternalRecording(false);
          };

          recognitionRef.current = rec;
          rec.start();
          setInternalRecording(true);
          return;
        } catch {
          // Fall through a error
        }
      }

      setInternalRecording(false);
      setVoiceError(isEn ? 'Microphone unavailable' : 'Micrófono no disponible');
      return;
    }

    setInternalRecording(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
      return;
    }

    if (voiceRecorder) {
      try {
        setInternalTranscribing(true);
        const { audio, mimeType } = await voiceRecorder.stopRecording();
        const res = await transcribeAudio(diagramId, audio, mimeType, true);
        if (res.transcript) {
          const text = res.transcript.trim();
          setDraft(draft ? `${draft.trim()} ${text}` : text);
        }
      } catch (err) {
        setVoiceError(
          err instanceof Error
            ? err.message
            : isEn
              ? 'Speech-to-text unavailable: service down. Use the text command input instead.'
              : 'Reconocimiento de voz no disponible. Use la entrada de texto en su lugar.',
        );
      } finally {
        setInternalTranscribing(false);
      }
    }
  };

  const handleConfirm = async (deltaId: string, delta: Delta) => {
    setAppliedDeltaIds((prev) => {
      const next = new Set([...prev, deltaId]);
      try {
        localStorage.setItem(`amongus_applied_deltas_${diagramId}`, JSON.stringify([...next]));
      } catch {}
      return next;
    });
    // Invalidar cualquier otra propuesta pendiente previa para que no quede obsoleta en la cola
    setRejectedDeltaIds((prev) => {
      const next = new Set([...prev]);
      for (const m of safeMessages) {
        if (m.deltaId && m.deltaId !== deltaId && !appliedDeltaIds.has(m.deltaId)) {
          next.add(m.deltaId);
        }
      }
      if (activeProposal && activeProposal.deltaId !== deltaId) {
        next.add(activeProposal.deltaId);
      }
      try {
        localStorage.setItem(`amongus_rejected_deltas_${diagramId}`, JSON.stringify([...next]));
      } catch {}
      return next;
    });
    setDismissedError(interpreterError);
    onPreviewProposal?.(null);
    if (onConfirmProposal) {
      await onConfirmProposal(deltaId, delta);
    }
  };

  const handleReject = async (deltaId: string) => {
    setRejectedDeltaIds((prev) => {
      const next = new Set([...prev, deltaId]);
      try {
        localStorage.setItem(`amongus_rejected_deltas_${diagramId}`, JSON.stringify([...next]));
      } catch {}
      return next;
    });
    setDismissedError(interpreterError);
    onPreviewProposal?.(null);
    if (onRejectProposal) {
      await onRejectProposal(deltaId);
    }
  };

  return (
    <div
      className="chat-panel"
      role="region"
      aria-label="Panel de chat colaborativo y Amongus"
      data-testid="chat-panel"
    >
      {/* Cabecera */}
      <div className="chat-panel__header">
        <div className="chat-panel__header-info">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#4f46e5' }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <h2 className="chat-panel__title">{isEn ? 'Diagram Chat' : 'Chat del Diagrama'}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="chat-panel__close-btn"
          aria-label={isEn ? 'Close chat' : 'Cerrar chat'}
          title={isEn ? 'Close chat' : 'Cerrar chat'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Selector de pestañas */}
      <div className="chat-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeChannel === 'group'}
          className={`chat-panel__tab ${activeChannel === 'group' ? 'chat-panel__tab--active' : ''}`}
          onClick={() => setActiveChannel('group')}
          data-testid="chat-tab-group"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>{isEn ? 'Team' : 'Equipo'}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeChannel === 'direct_bot'}
          className={`chat-panel__tab ${activeChannel === 'direct_bot' ? 'chat-panel__tab--active' : ''}`}
          onClick={() => setActiveChannel('direct_bot')}
          data-testid="chat-tab-amongus"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v4" />
            <line x1="8" y1="16" x2="8" y2="16" strokeWidth="3" />
            <line x1="16" y1="16" x2="16" y2="16" strokeWidth="3" />
          </svg>
          <span>{isEn ? 'Assistant' : 'Asistente'}</span>
        </button>
      </div>

      {/* Lista de mensajes */}
      <div className="chat-panel__messages" ref={messagesContainerRef} data-testid="chat-messages-container">
        {safeMessages.length === 0 && !isLoading && !activeProposal && (
          <div className="chat-panel__empty">
            <p>
              {activeChannel === 'group'
                ? isEn
                  ? 'No messages yet. Chat with your team or type a modeling command.'
                  : 'No hay mensajes aún. Chateá con tu equipo o indicá un comando de modelado.'
                : isEn
                  ? 'Ask questions or type modeling commands (e.g. "add class Order").'
                  : 'Hacé preguntas o indicá comandos de modelado (ej. "crear clase Pedido").'}
            </p>
          </div>
        )}

        {safeMessages.map((msg) => {
          const isBot = msg.senderType === 'bot';
          const isSelf = !isBot && msg.senderName === userName;
          const userColor = pickUserColor(msg.senderName);

          let messageClass = 'chat-message--peer';
          if (isBot) messageClass = 'chat-message--bot';
          else if (isSelf) messageClass = 'chat-message--self';

          return (
            <div
              key={msg.id}
              className={`chat-message ${messageClass}`}
              data-testid={`chat-message-${msg.id}`}
            >
              {!isSelf && (
                <div className="chat-message__avatar-container">
                  {isBot ? (
                    <>
                      <AmongusAvatar size={30} />
                      <span className="sr-only">Amongus</span>
                    </>
                  ) : (
                    <div
                      className="chat-message__peer-avatar"
                      style={{ backgroundColor: userColor }}
                      aria-hidden="true"
                    >
                      {presenceInitials(msg.senderName)}
                    </div>
                  )}
                </div>
              )}

              <div className="chat-message__body">
                <div className="chat-message__header">
                  <span className="chat-message__sender">
                    {isSelf ? (isEn ? 'You' : 'Vos') : msg.senderName}
                  </span>
                  {isBot && <span className="chat-message__tag-bot">Bot</span>}
                  {isBot && Boolean(msg.content) && (
                    <button
                      type="button"
                      onClick={() => handleSpeakText(msg.content)}
                      className="chat-message__speak-btn"
                      title={speakingText === msg.content ? (isEn ? 'Stop listening' : 'Detener audio') : (isEn ? 'Listen message' : 'Escuchar mensaje')}
                      aria-label={speakingText === msg.content ? (isEn ? 'Stop listening' : 'Detener audio') : (isEn ? 'Listen message' : 'Escuchar mensaje')}
                    >
                      {speakingText === msg.content ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" rx="2" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                      )}
                    </button>
                  )}
                  <span className="chat-message__time">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="chat-message__bubble">
                  {renderFormattedContent(msg.content, isEn)}
                  {msg.delta && msg.deltaId && (
                    <ProposalCard
                      deltaId={msg.deltaId}
                      delta={msg.delta}
                      onConfirm={handleConfirm}
                      onReject={handleReject}
                      isApplied={appliedDeltaIds.has(msg.deltaId)}
                      isRejected={rejectedDeltaIds.has(msg.deltaId)}
                      isBuilding={buildingDeltaId === msg.deltaId}
                      existingClasses={existingClasses}
                      isSuperseded={
                        !appliedDeltaIds.has(msg.deltaId) &&
                        !rejectedDeltaIds.has(msg.deltaId) &&
                        Boolean(currentPreviewProposal) &&
                        currentPreviewProposal?.deltaId !== msg.deltaId
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Tarjeta de propuesta activa */}
        {activeProposal &&
          !appliedDeltaIds.has(activeProposal.deltaId) &&
          !rejectedDeltaIds.has(activeProposal.deltaId) &&
          !safeMessages.some((m) => m.deltaId === activeProposal.deltaId) && (
          <div className="chat-message chat-message--bot" data-testid="chat-active-proposal">
            <div className="chat-message__avatar-container">
              <AmongusAvatar size={30} isAnimated={buildingDeltaId === activeProposal.deltaId} />
            </div>
            <div className="chat-message__body">
              <div className="chat-message__header">
                <span className="chat-message__sender">Amongus</span>
                <span className="chat-message__tag-bot">Bot</span>
              </div>
              <div className="chat-message__bubble">
                <ProposalCard
                  deltaId={activeProposal.deltaId}
                  delta={activeProposal.delta}
                  onConfirm={handleConfirm}
                  onReject={handleReject}
                  isApplied={appliedDeltaIds.has(activeProposal.deltaId)}
                  isRejected={rejectedDeltaIds.has(activeProposal.deltaId)}
                  isBuilding={buildingDeltaId === activeProposal.deltaId}
                  existingClasses={existingClasses}
                />
              </div>
            </div>
          </div>
        )}

        {/* Mensaje de rechazo con rol de alerta */}
        {visibleInterpreterRefusal && (
          <div className="chat-message chat-message--bot" role="alert">
            <div className="chat-message__avatar-container">
              <AmongusAvatar size={30} />
            </div>
            <div className="chat-message__body">
              <div className="chat-message__header">
                <span className="chat-message__sender">Amongus</span>
                <span className="chat-message__tag-bot">Bot</span>
                <button
                  type="button"
                  onClick={() => setDismissedRefusal(interpreterRefusal)}
                  className="chat-error-dismiss-btn"
                  title={isEn ? 'Dismiss message' : 'Cerrar mensaje'}
                  aria-label={isEn ? 'Dismiss message' : 'Cerrar mensaje'}
                >
                  &times;
                </button>
              </div>
              <div className="chat-message__bubble interpreter-refusal">
                {isEn ? `Refused: ${visibleInterpreterRefusal}` : `Rechazado: ${visibleInterpreterRefusal}`}
              </div>
            </div>
          </div>
        )}

        {/* Mensaje de error con rol de alerta */}
        {visibleInterpreterError && (
          <div className="chat-message chat-message--bot" role="alert">
            <div className="chat-message__avatar-container">
              <AmongusAvatar size={30} />
            </div>
            <div className="chat-message__body">
              <div className="chat-message__header">
                <span className="chat-message__sender">Amongus</span>
                <span className="chat-message__tag-bot">Bot</span>
                <button
                  type="button"
                  onClick={() => setDismissedError(interpreterError)}
                  className="chat-error-dismiss-btn"
                  title={isEn ? 'Dismiss error' : 'Cerrar mensaje de error'}
                  aria-label={isEn ? 'Dismiss error' : 'Cerrar error'}
                >
                  ✕
                </button>
              </div>
              <div className="chat-message__bubble interpreter-error">
                {visibleInterpreterError}
              </div>
            </div>
          </div>
        )}

        {/* Indicador de pensamiento */}
        {interpreterPhase === 'thinking' && (
          <div className="chat-message chat-message--bot" aria-live="polite">
            <div className="chat-message__avatar-container">
              <AmongusAvatar size={30} isAnimated={true} />
            </div>
            <div className="chat-message__body">
              <div className="chat-message__bubble chat-panel__thinking">
                <span>{isEn ? 'Thinking...' : 'Pensando...'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Respuesta de Amongus en tiempo real (streaming progresivo) */}
        {streamingBotMessage !== null && (
          <div className="chat-message chat-message--bot" aria-live="polite">
            <div className="chat-message__avatar-container">
              <AmongusAvatar size={30} isAnimated={true} />
            </div>
            <div className="chat-message__body">
              <div className="chat-message__header">
                <span className="chat-message__sender">Amongus</span>
                <span className="chat-message__tag-bot">Bot</span>
              </div>
              <div className="chat-message__bubble">
                {renderStreamingContent(streamingBotMessage, isEn)}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {(error || voiceError) && (
        <div
          role="alert"
          style={{ padding: '6px 12px', background: '#fee2e2', color: '#b91c1c', fontSize: '12px' }}
        >
          {error || voiceError}
        </div>
      )}

      {/* Formulario de entrada con mic y send */}
      <form onSubmit={handleSend} className="chat-panel__footer" style={{ position: 'relative' }}>
        {/* Popover de autocompletado de comandos slash */}
        {isSlashQuery && matchingCommands.length > 0 && (
          <div className="chat-panel__command-popover" role="listbox" aria-label={isEn ? 'Slash commands' : 'Comandos slash'}>
            {matchingCommands.map((cmd, idx) => {
              const isSelected = idx === selectedCommandIndex;
              return (
                <div
                  key={cmd.name}
                  className={`chat-panel__command-item ${isSelected ? 'chat-panel__command-item--active' : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    if (cmd.name === 'audit' || cmd.name === 'suggest' || cmd.name === 'clear' || cmd.name === 'layout') {
                      setDraft(`/${cmd.name}`);
                    } else {
                      setDraft(`/${cmd.name} `);
                    }
                    inputRef.current?.focus();
                  }}
                >
                  <span className="chat-panel__command-usage">{isEn ? cmd.usageEn : cmd.usage}</span>
                  <span className="chat-panel__command-desc">{isEn ? cmd.descriptionEn : cmd.description}</span>
                  <span className={`chat-panel__command-badge ${cmd.scope === 'server' ? 'chat-panel__command-badge--server' : ''}`}>
                    {cmd.scope === 'server' ? 'IA' : '0ms'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="chat-panel__input-group">
          <input
            ref={inputRef}
            type="text"
            className="chat-panel__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isTranscribing
                ? isEn
                  ? 'Transcribing audio with Groq Whisper...'
                  : 'Transcribiendo audio con Groq Whisper...'
                : activeChannel === 'group'
                  ? isEn
                    ? 'Write a message or command...'
                    : 'Escribí un mensaje o comando...'
                  : isEn
                    ? 'Ask a question or type a UML command...'
                    : 'Hacé una pregunta o comando UML...'
            }
            aria-label={isEn ? 'Natural language command' : 'Comando en lenguaje natural'}
            data-testid="chat-input"
            disabled={isSending || interpreterPhase === 'thinking' || isTranscribing}
          />

          {voiceRecorder !== null && (
            <button
              type="button"
              onClick={onToggleRecord ?? handleInternalToggleRecord}
              disabled={isSending || interpreterPhase === 'thinking' || isTranscribing}
              className={`chat-panel__record-btn ${activeRecording ? 'chat-panel__record-btn--active' : ''} ${isTranscribing ? 'chat-panel__record-btn--transcribing' : ''}`}
              aria-label={
                isTranscribing
                  ? isEn ? 'Transcribing' : 'Transcribiendo'
                  : activeRecording
                    ? isEn ? 'Stop' : 'Detener'
                    : isEn ? 'Record' : 'Grabar'
              }
              title={
                isTranscribing
                  ? isEn ? 'Transcribing with Groq Whisper...' : 'Transcribiendo con Groq Whisper...'
                  : activeRecording
                    ? isEn ? 'Stop recording' : 'Detener grabación'
                    : isEn ? 'Record voice' : 'Grabar voz'
              }
              data-testid="chat-record-btn"
            >
              {isTranscribing ? (
                <div className="chat-panel__transcribe-spinner" />
              ) : activeRecording ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                  </svg>
                  <span className="sr-only">{isEn ? 'Stop' : 'Detener'}</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                  <span className="sr-only">{isEn ? 'Record' : 'Grabar'}</span>
                </>
              )}
            </button>
          )}

          <button
            type="submit"
            onClick={handleSend}
            className="chat-panel__send-btn"
            disabled={isSending || interpreterPhase === 'thinking' || draft.trim().length === 0}
            aria-label={isEn ? 'Send' : 'Enviar'}
            title={isEn ? 'Send' : 'Enviar'}
            data-testid="chat-send-btn"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            <span className="sr-only">{isEn ? 'Send' : 'Enviar'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
