import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchChatMessages,
  getDeviceId,
  sendChatMessage,
  streamChatMessage,
  type ChatMessage,
} from './chatApi';

export interface UseChatOptions {
  diagramId: string;
  userName: string;
  language?: 'es' | 'en';
  pollIntervalMs?: number;
}

export function useChat({
  diagramId,
  userName,
  language = 'es',
  pollIntervalMs = 3000,
}: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeChannel, setActiveChannel] = useState<'group' | 'direct_bot'>('group');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [streamingBotMessage, setStreamingBotMessage] = useState<string | null>(null);

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
      setMessages((prev) => {
        const next = Array.isArray(data) ? data : [];
        if (prev.length === next.length) {
          const isSame = prev.every(
            (m, idx) =>
              m.id === next[idx]?.id &&
              m.content === next[idx]?.content &&
              m.deltaId === next[idx]?.deltaId,
          );
          if (isSame) return prev;
        }
        return next;
      });
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

      // Mensaje optimista para respuesta visual instantánea
      const tempUserMsg: ChatMessage = {
        id: 'temp-' + Date.now(),
        diagramId,
        deviceId: deviceIdRef.current,
        senderName: userName,
        senderType: 'user',
        channelType: activeChannel,
        targetUser: activeChannel === 'direct_bot' ? 'Amongus' : null,
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      const expectsBot = activeChannel === 'direct_bot' || trimmed.includes('@Amongus');
      if (expectsBot) {
        setStreamingBotMessage('');
      }

      try {
        await streamChatMessage(
          diagramId,
          {
            deviceId: deviceIdRef.current,
            senderName: userName,
            channelType: activeChannel,
            content: trimmed,
            language,
          },
          {
            onChunk: (chunk) => {
              setStreamingBotMessage((prev) => (prev ?? '') + chunk);
            },
            onDone: () => {
              setStreamingBotMessage(null);
              void loadMessages();
            },
            onError: () => {
              setStreamingBotMessage(null);
            },
          },
        );
      } catch {
        // Fallback a envío REST estándar si SSE falló
        try {
          await sendChatMessage(diagramId, {
            deviceId: deviceIdRef.current,
            senderName: userName,
            channelType: activeChannel,
            content: trimmed,
            language,
          });
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Error al enviar mensaje');
          throw err;
        } finally {
          setStreamingBotMessage(null);
          await loadMessages();
        }
      }
    },
    [diagramId, userName, activeChannel, language, loadMessages],
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
    streamingBotMessage,
    deviceId: deviceIdRef.current,
  };
}
