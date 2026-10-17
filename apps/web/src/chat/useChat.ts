import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchChatMessages,
  getDeviceId,
  sendChatMessage,
  type ChatMessage,
} from './chatApi';

export interface UseChatOptions {
  diagramId: string;
  userName: string;
  pollIntervalMs?: number;
}

export function useChat({
  diagramId,
  userName,
  pollIntervalMs = 3000,
}: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeChannel, setActiveChannel] = useState<'group' | 'direct_bot'>('group');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const deviceIdRef = useRef<string>(getDeviceId());
  const prevCountRef = useRef<number>(0);

  const loadMessages = useCallback(async () => {
    if (!diagramId || !userName) return;
    try {
      const data = await fetchChatMessages(
        diagramId,
        activeChannel,
        deviceIdRef.current,
        userName,
      );
      setMessages(data);
      setError(null);

      // Si el chat está cerrado y hay nuevos mensajes, incrementar unreadCount
      if (!isOpen && data.length > prevCountRef.current) {
        setUnreadCount((prev) => prev + (data.length - prevCountRef.current));
      }
      prevCountRef.current = data.length;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar mensajes');
    }
  }, [diagramId, activeChannel, userName, isOpen]);

  // Carga inicial y cambio de canal o identidad
  useEffect(() => {
    setIsLoading(true);
    void loadMessages().finally(() => setIsLoading(false));
  }, [loadMessages]);

  // Polling periódico para nuevos mensajes
  useEffect(() => {
    if (!diagramId || !userName) return;
    const interval = setInterval(() => {
      void loadMessages();
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [diagramId, userName, pollIntervalMs, loadMessages]);

  // Al abrir el chat, resetear contador de no leídos
  const openChat = useCallback(() => {
    setIsOpen(true);
    setUnreadCount(0);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleChat = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) {
        setUnreadCount(0);
      }
      return !prev;
    });
  }, []);

  const send = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || !diagramId || !userName) return;

      try {
        await sendChatMessage(diagramId, {
          deviceId: deviceIdRef.current,
          senderName: userName,
          channelType: activeChannel,
          content: trimmed,
        });
        // Recargar inmediatamente después de enviar
        await loadMessages();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al enviar mensaje');
        throw err;
      }
    },
    [diagramId, userName, activeChannel, loadMessages],
  );

  return {
    messages,
    activeChannel,
    setActiveChannel,
    isOpen,
    openChat,
    closeChat,
    toggleChat,
    unreadCount,
    isLoading,
    error,
    sendMessage: send,
    deviceId: deviceIdRef.current,
  };
}
