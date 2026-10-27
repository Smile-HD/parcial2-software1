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
  peerUsers?: readonly { name: string; color?: string }[];
}

export function useChat({
  diagramId,
  userName,
  language = 'es',
  pollIntervalMs = 3000,
  peerUsers,
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
        const serverMessages = Array.isArray(data) ? data : [];

        // Preservar mensajes locales que no se persisten en backend
        const localMessages = prev.filter((m) => m.id.startsWith('local-'));

        // Preservar mensajes optimistas temporales que aún no se confirmaron en el servidor
        const pendingTempMessages = prev.filter((m) => {
          if (!m.id.startsWith('temp-')) return false;
          return !serverMessages.some(
            (sm) => sm.content === m.content && sm.senderName === m.senderName
          );
        });

        // Fusión garantizada: servidor + locales + temporales pendientes
        const merged = [...serverMessages, ...localMessages, ...pendingTempMessages];
        merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (
          prev.length === merged.length &&
          prev.every(
            (m, idx) =>
              m.id === merged[idx]?.id &&
              m.content === merged[idx]?.content &&
              m.deltaId === merged[idx]?.deltaId,
          )
        ) {
          return prev;
        }
        return merged;
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

      const isSlash = trimmed.startsWith('/');
      const expectsBot = activeChannel === 'direct_bot' || trimmed.includes('@Amongus') || isSlash;
      if (expectsBot) {
        setStreamingBotMessage('');
      }

      const peerNames = peerUsers && peerUsers.length > 0
        ? peerUsers.map((u) => u.name).filter(Boolean)
        : [userName];
      if (!peerNames.includes(userName)) {
        peerNames.push(userName);
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
            peerUsers: peerNames,
          },
          {
            onUserMessage: (serverUserMsg: ChatMessage) => {
              setMessages((prev) => {
                const filtered = prev.filter((m) => m.id !== tempUserMsg.id);
                if (filtered.some((m) => m.id === serverUserMsg.id)) return filtered;
                return [...filtered, serverUserMsg];
              });
            },
            onChunk: (chunk) => {
              setStreamingBotMessage((prev) => (prev ?? '') + chunk);
            },
            onDone: (botMessage?: ChatMessage) => {
              if (botMessage && botMessage.id) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === botMessage.id)) return prev;
                  return [...prev, botMessage];
                });
              }
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
            peerUsers: peerNames,
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
    [diagramId, userName, activeChannel, language, peerUsers, loadMessages],
  );

  const addLocalMessage = useCallback(
    (msg: { senderType: 'user' | 'bot'; senderName: string; content: string; deltaId?: string; delta?: any }) => {
      const newMsg: ChatMessage = {
        id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        diagramId,
        deviceId: deviceIdRef.current,
        senderName: msg.senderName,
        senderType: msg.senderType,
        channelType: activeChannel,
        targetUser: null,
        content: msg.content,
        deltaId: msg.deltaId,
        delta: msg.delta,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, newMsg]);
    },
    [diagramId, activeChannel]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

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
    addLocalMessage,
    clearMessages,
    streamingBotMessage,
    deviceId: deviceIdRef.current,
  };
}
