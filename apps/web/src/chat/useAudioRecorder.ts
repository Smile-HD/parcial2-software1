import { useRef, useState } from 'react';
import type { VoiceRecorder } from '../voice/recorder';
import { transcribeAudio } from '../api/voiceApi';

export interface UseAudioRecorderOptions {
  diagramId: string;
  isEn: boolean;
  draft: string;
  setDraft: (val: string) => void;
  voiceRecorder?: VoiceRecorder | null;
  isSending: boolean;
  interpreterPhase?: string;
  recordingProp?: boolean;
}

export function useAudioRecorder({
  diagramId,
  isEn,
  draft,
  setDraft,
  voiceRecorder = null,
  isSending,
  interpreterPhase,
  recordingProp,
}: UseAudioRecorderOptions) {
  const [internalRecording, setInternalRecording] = useState(false);
  const [internalTranscribing, setInternalTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const activeRecording = recordingProp !== undefined ? recordingProp : internalRecording;

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

  return {
    activeRecording,
    internalTranscribing,
    voiceError,
    setVoiceError,
    handleInternalToggleRecord,
  };
}

