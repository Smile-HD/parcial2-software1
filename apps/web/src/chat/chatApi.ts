/**
 * Cliente API y utilidades de almacenamiento para Chat Colaborativo y Amongus.
 * Maneja el aislamiento de dispositivo (deviceId) y persistencia en backend.
 */

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export const DEVICE_ID_STORAGE_KEY = 'uml_device_id';

export interface ChatMessage {
  id: string;
  diagramId: string;
  deviceId: string;
  senderName: string;
  senderType: 'user' | 'bot';
  channelType: 'group' | 'direct_bot';
  targetUser: string | null;
  content: string;
  createdAt: string;
  deltaId?: string;
  delta?: any;
}

export interface SendMessagePayload {
  deviceId: string;
  senderName: string;
  channelType: 'group' | 'direct_bot';
  content: string;
  language?: 'es' | 'en';
  peerUsers?: readonly string[];
}

/**
 * Obtiene o crea un identificador único persistente para este navegador/dispositivo.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'server-device';
  }
  let id = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!id) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID();
    } else {
      id = 'dev-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  }
  return id;
}

/**
 * Consulta los mensajes de chat para un diagrama y canal dados,
 * enviando deviceId y userName para aislar el canal directo con Amongus.
 */
export async function fetchChatMessages(
  diagramId: string,
  channel: 'group' | 'direct_bot',
  deviceId: string,
  userName: string,
): Promise<ChatMessage[]> {
  const params = new URLSearchParams({
    channel,
    deviceId,
    userName,
  });

  const response = await fetch(`${API_BASE_URL}/diagrams/${diagramId}/messages?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Error al cargar mensajes: ${response.status}`);
  }
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

/**
 * Envía un nuevo mensaje de chat al backend.
 */
export async function sendChatMessage(
  diagramId: string,
  payload: SendMessagePayload,
): Promise<ChatMessage> {
  const response = await fetch(`${API_BASE_URL}/diagrams/${diagramId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Error al enviar mensaje: ${response.status}`);
  }
  return response.json();
}

export interface StreamChatHandlers {
  onUserMessage?: (userMsg: ChatMessage) => void;
  onChunk?: (chunk: string) => void;
  onDone?: (botMsg?: ChatMessage) => void;
  onError?: (error: Error) => void;
}

/**
 * Envía un mensaje con streaming SSE para ver la respuesta de Amongus en tiempo real.
 */
export async function streamChatMessage(
  diagramId: string,
  payload: SendMessagePayload,
  handlers: StreamChatHandlers,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/diagrams/${diagramId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = new Error(`Error al enviar mensaje: ${response.status}`);
    handlers.onError?.(err);
    throw err;
  }

  if (!response.body) {
    const data = await response.json();
    handlers.onDone?.(data);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const eventStr of events) {
        if (!eventStr.trim()) continue;
        let eventType = 'message';
        let dataStr = '';
        for (const line of eventStr.split('\n')) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataStr = line.slice(5).trim();
          }
        }

        if (!dataStr) continue;
        try {
          const parsed = JSON.parse(dataStr);
          if (eventType === 'user_message') {
            handlers.onUserMessage?.(parsed);
          } else if (eventType === 'chunk') {
            handlers.onChunk?.(parsed.text ?? '');
          } else if (eventType === 'done') {
            handlers.onDone?.(parsed);
          }
        } catch {
          // Ignorar parsing parcial
        }
      }
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    handlers.onError?.(error);
    throw error;
  }
}
