/**
 * Hook para interpretación de comandos UML en lenguaje natural, previsualizaciones fantasma,
 * confirmación y rechazo de deltas, entrada por voz y manipulación del lienzo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { projectYDocToDiagram, type Delta } from '@app/core';
import {
  confirmDelta,
  interpretCommand,
  rejectDelta,
} from '../api/diagramApi';
import { transcribeAudio } from '../api/voiceApi';
import { applyDeltaToYDoc } from '../canvas/applyDeltaToYDoc';
import { computeAutoLayout } from '../canvas/autoLayout';
import { executeLiveAmongusBuild } from '../canvas/liveConstruction';
import type { RemoteCursorPeer } from '../canvas/RemoteCursors';
import type { VoiceRecorder } from '../voice/recorder';
import { t, useT } from '../i18n';

export type InterpreterState =
  | { phase: 'idle' }
  | { phase: 'thinking' }
  | { phase: 'refused'; reason: string }
  | { phase: 'error'; message: string }
  | { phase: 'pending'; deltaId: string; delta: Delta };

export interface UseDiagramInterpreterOptions {
  doc: Y.Doc;
  roomId: string | null;
  version: number | null;
  status: 'loading' | 'ready' | 'error';
  activeRecorder: VoiceRecorder | null;
  setSaveMessage: (msg: string | null) => void;
}

export function useDiagramInterpreter({
  doc,
  roomId,
  version,
  status,
  activeRecorder,
  setSaveMessage,
}: UseDiagramInterpreterOptions) {
  const { lang } = useT();
  const [commandDraft, setCommandDraft] = useState('');
  const [interpreter, setInterpreter] = useState<InterpreterState>({ phase: 'idle' });
  const [recording, setRecording] = useState(false);
  const [ghostDelta, setGhostDelta] = useState<Delta | null>(null);
  const [virtualPeer, setVirtualPeer] = useState<RemoteCursorPeer | null>(null);
  const [buildingDeltaId, setBuildingDeltaId] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const speechRecognitionRef = useRef<any>(null);

  const activeProposal = useMemo(() => {
    if (interpreter.phase === 'pending') {
      return { deltaId: interpreter.deltaId, delta: interpreter.delta };
    }
    return null;
  }, [interpreter]);

  const apiFailureMessage = (error: unknown, fallback: string): string =>
    error instanceof Error ? error.message : fallback;

  const handleSubmitCommand = async (customText?: string): Promise<void> => {
    if (version === null || status !== 'ready' || roomId === null || interpreter.phase === 'thinking') {
      return;
    }
    const text = (typeof customText === 'string' ? customText : commandDraft).trim();
    if (text.length === 0) return;

    setInterpreter({ phase: 'thinking' });
    setGhostDelta(null);
    try {
      const outcome = await interpretCommand(roomId, text);
      if (outcome.status === 'pending') {
        setCommandDraft('');
        setGhostDelta(outcome.delta);
        setInterpreter({ phase: 'pending', deltaId: outcome.deltaId, delta: outcome.delta });
        return;
      }
      if (outcome.status === 'refused') {
        setCommandDraft('');
        setInterpreter({ phase: 'refused', reason: outcome.reason });
        return;
      }
      setInterpreter({ phase: 'error', message: outcome.message });
    } catch (error: unknown) {
      setInterpreter({ phase: 'error', message: apiFailureMessage(error, t('interpreter.reachFailed')) });
    }
  };

  const handleConfirmDelta = (targetDeltaId?: string, targetDelta?: Delta): void => {
    const deltaId = targetDeltaId ?? (interpreter.phase === 'pending' ? interpreter.deltaId : null);
    if (!deltaId) return;

    const fallbackDelta = targetDelta ?? (interpreter.phase === 'pending' ? interpreter.delta : null);
    setInterpreter({ phase: 'thinking' });
    setGhostDelta(null);
    setBuildingDeltaId(deltaId);

    const applyAndBuild = async (d: Delta) => {
      try {
        await executeLiveAmongusBuild({
          doc,
          delta: d,
          setVirtualPeer: (peer) => setVirtualPeer(peer),
          stepDelayMs: 20,
        });
      } catch {
        applyDeltaToYDoc(doc, d);
      } finally {
        setVirtualPeer(null);
        setBuildingDeltaId(null);
        setInterpreter({ phase: 'idle' });
      }
    };

    void confirmDelta(deltaId)
      .then(async (result) => {
        try {
          doc.getMap('meta').set(`applied_delta_${deltaId}`, Date.now());
        } catch {}
        await applyAndBuild(result.delta);
      })
      .catch((error: unknown) => {
        const errMsg = (error instanceof Error ? error.message : String(error)).toLowerCase();
        const isClientOrAlreadyApplied =
          errMsg.includes('already used') ||
          errMsg.includes('unknown or already used') ||
          errMsg.includes('already apply') ||
          errMsg.includes('already applied') ||
          errMsg.includes('not found') ||
          errMsg.includes('404');

        if (fallbackDelta && isClientOrAlreadyApplied) {
          void applyAndBuild(fallbackDelta).catch(() => {
            setVirtualPeer(null);
            setBuildingDeltaId(null);
            setInterpreter({ phase: 'idle' });
          });
          return;
        }

        setVirtualPeer(null);
        setBuildingDeltaId(null);

        if (isClientOrAlreadyApplied) {
          setInterpreter({ phase: 'idle' });
          return;
        }

        setInterpreter({ phase: 'error', message: apiFailureMessage(error, t('interpreter.confirmFailed')) });
      });
  };

  const handleRejectDelta = (targetDeltaId?: string): void => {
    const deltaId = targetDeltaId ?? (interpreter.phase === 'pending' ? interpreter.deltaId : null);
    if (!deltaId) return;

    setInterpreter({ phase: 'thinking' });
    setGhostDelta(null);

    void rejectDelta(deltaId)
      .then(() => {
        try {
          doc.getMap('meta').set(`rejected_delta_${deltaId}`, Date.now());
        } catch {}
        setInterpreter({ phase: 'idle' });
      })
      .catch((error: unknown) => {
        setInterpreter({ phase: 'idle' });
        setSaveMessage(apiFailureMessage(error, t('interpreter.discardFailed')));
      });
  };

  const handleAutoLayout = useCallback((): { ok: boolean; classCount: number } => {
    const current = projectYDocToDiagram(doc);
    if (!current.classes || current.classes.length === 0) {
      return { ok: false, classCount: 0 };
    }
    const positions = computeAutoLayout(current);
    const timestamp = new Date().toISOString();
    current.classes.forEach((c) => {
      const newPos = positions[c.id];
      if (newPos) {
        applyDeltaToYDoc(doc, {
          id: crypto.randomUUID(),
          diagramId: current.id,
          timestamp,
          kind: 'class',
          op: 'reposition',
          classId: c.id,
          newPosition: newPos,
        });
      }
    });
    return { ok: true, classCount: current.classes.length };
  }, [doc]);

  useEffect(() => {
    const onAutoLayoutEvent = () => { handleAutoLayout(); };
    window.addEventListener('canvas:auto-layout', onAutoLayoutEvent);
    return () => window.removeEventListener('canvas:auto-layout', onAutoLayoutEvent);
  }, [handleAutoLayout]);

  const handleClearCanvas = (): { ok: boolean; reason?: string; deltaId?: string; delta?: Delta } => {
    const current = projectYDocToDiagram(doc);
    if (!current.classes || current.classes.length === 0) {
      return { ok: false, reason: 'empty' };
    }
    const timestamp = new Date().toISOString();
    const clearDelta: Delta = {
      id: crypto.randomUUID(),
      diagramId: current.id,
      timestamp,
      kind: 'batch',
      deltas: current.classes.map((cls) => ({
        id: crypto.randomUUID(),
        diagramId: current.id,
        timestamp,
        kind: 'class' as const,
        op: 'delete' as const,
        classId: cls.id,
      })),
    };
    const deltaId = crypto.randomUUID();
    setGhostDelta(clearDelta);
    setInterpreter({ phase: 'pending', deltaId, delta: clearDelta });
    return { ok: true, deltaId, delta: clearDelta };
  };

  useEffect(() => {
    const onClear = () => { handleClearCanvas(); };
    window.addEventListener('canvas:clear', onClear);
    return () => window.removeEventListener('canvas:clear', onClear);
  }, [doc]);

  const handleToggleRecord = (): void => {
    if (status !== 'ready' || interpreter.phase === 'thinking') return;

    if (!recording) {
      if (activeRecorder !== null) {
        setRecording(true);
        void activeRecorder
          .startRecording()
          .catch((error: unknown) => {
            setRecording(false);
            setInterpreter({ phase: 'error', message: apiFailureMessage(error, t('voice.micUnavailable')) });
          });
        return;
      }

      const SpeechRec =
        typeof window !== 'undefined'
          ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          : null;

      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.lang = lang === 'en' ? 'en-US' : 'es-ES';
          rec.continuous = true;
          rec.interimResults = true;
          const initialDraft = commandDraft ? `${commandDraft.trim()} ` : '';

          rec.onresult = (e: any) => {
            let sessionTranscript = '';
            for (let i = 0; i < e.results.length; i++) {
              sessionTranscript += e.results[i][0]?.transcript || '';
            }
            if (sessionTranscript) {
              setCommandDraft(`${initialDraft}${sessionTranscript.trim()}`);
            }
          };

          rec.onerror = (e: any) => {
            if (e.error !== 'no-speech') {
              console.warn('SpeechRecognition error:', e.error);
            }
          };

          rec.onend = () => {
            setRecording(false);
          };

          speechRecognitionRef.current = rec;
          rec.start();
          setRecording(true);
          return;
        } catch {}
      }

      setRecording(false);
      return;
    }

    setRecording(false);

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
      return;
    }

    if (activeRecorder) {
      setIsTranscribing(true);
      void activeRecorder.stopRecording().then(
        ({ audio, mimeType }) => {
          if (version === null || roomId === null) {
            setIsTranscribing(false);
            return;
          }
          void transcribeAudio(roomId, audio, mimeType, true)
            .then((response) => {
              setIsTranscribing(false);
              if (response.transcript) {
                const text = response.transcript.trim();
                setCommandDraft((prev) => (prev ? `${prev.trim()} ${text}` : text));
              }
            })
            .catch((error: unknown) => {
              setIsTranscribing(false);
              setInterpreter({ phase: 'error', message: apiFailureMessage(error, t('voice.sttFailed')) });
            });
        },
        (error: unknown) => {
          setIsTranscribing(false);
          setInterpreter({ phase: 'error', message: apiFailureMessage(error, t('voice.recordingFailed')) });
        },
      );
    }
  };

  return {
    commandDraft,
    setCommandDraft,
    interpreter,
    setInterpreter,
    recording,
    ghostDelta,
    setGhostDelta,
    virtualPeer,
    buildingDeltaId,
    activeProposal,
    isTranscribing,
    handleSubmitCommand,
    handleConfirmDelta,
    handleRejectDelta,
    handleAutoLayout,
    handleClearCanvas,
    handleToggleRecord,
  };
}

