import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Delta } from '@app/core';
import { useChat } from './useChat';
import { useT } from '../i18n';
import type { VoiceRecorder } from '../voice/recorder';
import {
  buildHelpContent,
  buildContextReport,
} from './commands';
import { useAudioRecorder } from './useAudioRecorder';
import { useSlashCommands } from './useSlashCommands';
import { ChatHeader } from './components/ChatHeader';
import { ChatMessagesList } from './components/ChatMessagesList';
import { ChatInputBar } from './components/ChatInputBar';
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
  getCurrentDiagram?: () => any;
}

/**
 * Panel de Chat Colaborativo y Asistente Amongus Unificado.
 * Integra chat de equipo, canal directo con Amongus, entrada por voz,
 * y tarjetas de propuesta interactivas con previsualizacion fantasma en el lienzo.
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
  getCurrentDiagram,
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
  } = useChat({ diagramId, userName, language: lang, peerUsers, getCurrentDiagram });

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

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const {
    selectedCommandIndex,
    selectedMentionIndex,
    isSlashQuery,
    matchingCommands,
    isMentionQuery,
    matchingMentions,
    handleSelectMention,
    handleKeyDown: handleSlashKeyDown,
  } = useSlashCommands({
    draft,
    setDraft,
    inputRef,
    peerUsers,
    userName,
    isEn,
    onSendSubmit: (text) => void handleSend(undefined, text),
  });

  const [isSending, setIsSending] = useState(false);
  const {
    activeRecording,
    internalTranscribing,
    voiceError,
    setVoiceError,
    handleInternalToggleRecord,
  } = useAudioRecorder({
    diagramId,
    isEn,
    draft,
    setDraft,
    voiceRecorder,
    isSending,
    interpreterPhase,
    recordingProp: recording,
  });
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

  useEffect(() => {
    if (visibleInterpreterError) {
      const timer = setTimeout(() => {
        setDismissedError(interpreterError);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [visibleInterpreterError, interpreterError]);

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

  useEffect(() => {
    if (isOpen && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [safeMessages.length, activeProposal?.deltaId, visibleInterpreterError, interpreterRefusal, streamingBotMessage, isOpen]);

  const pendingChatProposal = useMemo(() => {
    const NOW = Date.now();
    for (let i = safeMessages.length - 1; i >= 0; i--) {
      const m = safeMessages[i];
      if (m?.delta && m.deltaId && !appliedDeltaIds.has(m.deltaId) && !rejectedDeltaIds.has(m.deltaId)) {
        const msgTime = new Date(m.createdAt).getTime();
        const isRecent = !isNaN(msgTime) && NOW - msgTime < 15 * 60 * 1000;
        if (isRecent) {
          return { deltaId: m.deltaId, delta: m.delta };
        }
      }
    }
    return null;
  }, [safeMessages, appliedDeltaIds, rejectedDeltaIds]);

  const currentPreviewProposal =
    activeProposal && !appliedDeltaIds.has(activeProposal.deltaId) && !rejectedDeltaIds.has(activeProposal.deltaId)
      ? activeProposal
      : pendingChatProposal;

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

    // /help
    if (trimmed === '/help' || trimmed.startsWith('/help ')) {
      const arg = trimmed.slice(5).trim();
      setDraft('');
      addLocalMessage({ senderType: 'user', senderName: userName, content: trimmed });
      const helpContent = buildHelpContent(arg || undefined, isEn);
      addLocalMessage({ senderType: 'bot', senderName: 'Amongus', content: helpContent });
      return;
    }

    // /reset
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

    // /context
    if (trimmed === '/context') {
      setDraft('');
      try {
        await sendMessage('/context');
      } catch {
        addLocalMessage({ senderType: 'user', senderName: userName, content: trimmed });
        addLocalMessage({
          senderType: 'bot',
          senderName: 'Amongus',
          content: buildContextReport(safeMessages.length, canvasClassCount, isEn),
        });
      }
      return;
    }

    // /layout
    if (trimmed === '/layout') {
      setDraft('');
      addLocalMessage({ senderType: 'user', senderName: userName, content: trimmed });
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

    // /apply
    if (trimmed === '/apply' || trimmed === '/aplicar' || trimmed.startsWith('/apply ') || trimmed.startsWith('/aplicar ')) {
      const specificArg = trimmed.replace(/^\/(?:apply|aplicar)\s*/i, '').trim();
      setDraft('');

      if (activeProposal && !appliedDeltaIds.has(activeProposal.deltaId) && !specificArg) {
        addLocalMessage({ senderType: 'user', senderName: userName, content: trimmed });
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

      const pendingMsg = [...safeMessages]
        .reverse()
        .find((m) => m.delta && m.deltaId && !appliedDeltaIds.has(m.deltaId) && !rejectedDeltaIds.has(m.deltaId));

      if (pendingMsg && pendingMsg.deltaId && pendingMsg.delta && !specificArg) {
        addLocalMessage({ senderType: 'user', senderName: userName, content: trimmed });
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

      await sendMessage(trimmed);
      return;
    }

    // /export
    if (trimmed === '/export' || trimmed.startsWith('/export ')) {
      const arg = trimmed.slice(7).trim().toLowerCase();
      setDraft('');
      addLocalMessage({ senderType: 'user', senderName: userName, content: trimmed });

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

    // /clear
    if (trimmed === '/clear' || trimmed === '/clear canvas' || trimmed === '/clear lienzo') {
      setDraft('');
      setDismissedError(interpreterError);
      setDismissedRefusal(interpreterRefusal);
      addLocalMessage({ senderType: 'user', senderName: userName, content: trimmed });
      if (onClearCanvas) {
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
      addLocalMessage({ senderType: 'user', senderName: userName, content: trimmed });
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
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    handleSlashKeyDown(e, () => void handleSend());
  };

  const handleConfirm = async (deltaId: string, delta: Delta) => {
    setAppliedDeltaIds((prev) => {
      const next = new Set([...prev, deltaId]);
      try {
        localStorage.setItem(`amongus_applied_deltas_${diagramId}`, JSON.stringify([...next]));
      } catch {}
      return next;
    });
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
      <ChatHeader
        isEn={isEn}
        activeChannel={activeChannel}
        setActiveChannel={setActiveChannel}
        onClose={onClose}
      />

      <ChatMessagesList
        safeMessages={safeMessages}
        isLoading={isLoading}
        activeChannel={activeChannel}
        userName={userName}
        isEn={isEn}
        speakingText={speakingText}
        handleSpeakText={handleSpeakText}
        handleConfirm={handleConfirm}
        handleReject={handleReject}
        appliedDeltaIds={appliedDeltaIds}
        rejectedDeltaIds={rejectedDeltaIds}
        buildingDeltaId={buildingDeltaId}
        existingClasses={existingClasses}
        currentPreviewProposal={currentPreviewProposal}
        activeProposal={activeProposal}
        visibleInterpreterRefusal={visibleInterpreterRefusal}
        visibleInterpreterError={visibleInterpreterError}
        interpreterRefusal={interpreterRefusal}
        interpreterError={interpreterError}
        setDismissedRefusal={setDismissedRefusal}
        setDismissedError={setDismissedError}
        interpreterPhase={interpreterPhase}
        streamingBotMessage={streamingBotMessage}
        messagesContainerRef={messagesContainerRef}
        messagesEndRef={messagesEndRef}
      />

      {(error || voiceError) && (
        <div
          role="alert"
          style={{ padding: '6px 12px', background: '#fee2e2', color: '#b91c1c', fontSize: '12px' }}
        >
          {error || voiceError}
        </div>
      )}

      <ChatInputBar
        isEn={isEn}
        draft={draft}
        setDraft={setDraft}
        inputRef={inputRef}
        handleSend={handleSend}
        handleKeyDown={handleKeyDown}
        isSending={isSending}
        interpreterPhase={interpreterPhase}
        isTranscribing={isTranscribing}
        activeChannel={activeChannel}
        voiceRecorder={voiceRecorder}
        activeRecording={activeRecording}
        onToggleRecord={onToggleRecord}
        handleInternalToggleRecord={handleInternalToggleRecord}
        isSlashQuery={isSlashQuery}
        matchingCommands={matchingCommands}
        selectedCommandIndex={selectedCommandIndex}
        isMentionQuery={isMentionQuery}
        matchingMentions={matchingMentions}
        selectedMentionIndex={selectedMentionIndex}
        handleSelectMention={handleSelectMention}
      />
    </div>
  );
}
