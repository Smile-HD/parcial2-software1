/**
 * Grabador de voz del navegador (PR 8, tarea 8.3).
 *
 * Envuelve MediaRecorder + getUserMedia tras la interfaz inyectable `VoiceRecorder`
 * para que App.tsx siga siendo comprobable con tests. Retorna null cuando el navegador
 * no ofrece la API de grabación — la UI oculta el control en ese caso.
 */

export interface RecordedAudio {
  audio: Uint8Array;
  mimeType: string;
}

export interface VoiceRecorder {
  /** Solicita el micrófono e inicia la grabación. */
  startRecording(): Promise<void>;
  /** Detiene la grabación activa y se resuelve con el audio codificado. */
  stopRecording(): Promise<RecordedAudio>;
}

export function createBrowserVoiceRecorder(): VoiceRecorder | null {
  if (
    typeof window === 'undefined' ||
    typeof MediaRecorder === 'undefined' ||
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return null;
  }

  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];

  return {
    startRecording(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((mediaStream) => {
            stream = mediaStream;
            chunks = [];
            const mimeType = MediaRecorder.isTypeSupported('audio/webm')
              ? 'audio/webm'
              : MediaRecorder.isTypeSupported('audio/mp4')
                ? 'audio/mp4'
                : undefined;
            recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
            recorder.ondataavailable = (event: BlobEvent) => {
              if (event.data && event.data.size > 0) {
                chunks.push(event.data);
              }
            };
            recorder.start(250);
            resolve();
          })
          .catch(reject);
      });
    },

    stopRecording(): Promise<RecordedAudio> {
      return new Promise<RecordedAudio>((resolve, reject) => {
        const current = recorder;
        if (current === null) {
          reject(new Error('No active recording'));
          return;
        }
        current.onstop = () => {
          stream?.getTracks().forEach((track) => track.stop());
          const resolvedMimeType = current.mimeType || (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4');
          const blob = new Blob(chunks, { type: resolvedMimeType });
          if (blob.size === 0) {
            reject(new Error('Audio recording is empty. Please speak clearly into the microphone.'));
            return;
          }
          void blob
            .arrayBuffer()
            .then((buffer) => {
              resolve({ audio: new Uint8Array(buffer), mimeType: resolvedMimeType });
            })
            .catch(reject);
        };
        if (current.state !== 'inactive') {
          current.stop();
        } else {
          current.onstop?.(new Event('stop'));
        }
      });
    },
  };
}
