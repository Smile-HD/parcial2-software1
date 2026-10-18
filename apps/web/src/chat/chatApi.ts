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
}

export interface SendMessagePayload {
  deviceId: string;
  senderName: string;
  channelType: 'group' | 'direct_bot';
  content: string;
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
  return response.json();
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
