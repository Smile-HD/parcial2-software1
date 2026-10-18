import React, { useEffect, useRef, useState } from 'react';
import { AmongusAvatar } from './AmongusAvatar';
import { useChat } from './useChat';
import { pickUserColor } from '../presence/palette';
import { presenceInitials } from '../canvas/PresenceBar';
import { useT } from '../i18n';
import './chat.css';

export interface ChatPanelProps {
  diagramId: string;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
  peerUsers?: readonly { name: string; color?: string }[];
}

/**
 * Panel de Chat Colaborativo y Asistente Amongus.
 * Soporta canal de equipo y canal privado 1 a 1 con Amongus.
 * 100% libre de emojis; utiliza iconos vectoriales SVG.
 */
export function ChatPanel({
  diagramId,
  userName,
  isOpen,
  onClose,
  peerUsers,
}: ChatPanelProps) {
  const { lang } = useT();
  const isEn = lang === 'en';

  const {
    messages,
    activeChannel,
    setActiveChannel,
    sendMessage,
    isLoading,
    error,
  } = useChat({ diagramId, userName, language: lang });

  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al final con cada nuevo mensaje
  useEffect(() => {
    if (isOpen && typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isSending) return;

    try {
      setIsSending(true);
      setDraft('');
      await sendMessage(trimmed);
    } catch {
      // El error ya es reportado por el hook
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
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
          <AmongusAvatar size={24} isAnimated={false} />
          <h2 className="chat-panel__title">{isEn ? 'Diagram Chat' : 'Chat del Diagrama'}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="chat-panel__close-btn"
          aria-label={isEn ? 'Close chat' : 'Cerrar chat'}
          title={isEn ? 'Close chat' : 'Cerrar chat'}
        >
          {/* Icono SVG de cerrar (X) */}
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
          {/* Icono de equipo (usuarios) */}
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
          {/* Icono de Amongus / Asistente */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v4" />
            <line x1="8" y1="16" x2="8" y2="16" strokeWidth="3" />
            <line x1="16" y1="16" x2="16" y2="16" strokeWidth="3" />
          </svg>
          <span>Amongus</span>
        </button>
      </div>

      {/* Lista de mensajes */}
      <div className="chat-panel__messages" data-testid="chat-messages-container">
        {messages.length === 0 && !isLoading && (
          <div className="chat-panel__empty">
            {activeChannel === 'group' ? (
              isEn ? (
                <>
                  <p>No messages in this canvas yet.</p>
                  <p>Start the conversation with your team or mention @Amongus!</p>
                </>
              ) : (
                <>
                  <p>No hay mensajes en este lienzo aún.</p>
                  <p>¡Iniciá la conversación con tu equipo o mencioná a @Amongus!</p>
                </>
              )
            ) : isEn ? (
              <>
                <AmongusAvatar size={48} />
                <p><strong>Private chat with Amongus</strong></p>
                <p>Ask questions about your UML classes, relationships, or design suggestions.</p>
              </>
            ) : (
              <>
                <AmongusAvatar size={48} />
                <p><strong>Chat privado con Amongus</strong></p>
                <p>Hacé preguntas sobre tus clases UML, relaciones o pedí sugerencias de modelado.</p>
              </>
            )}
          </div>
        )}

        {messages.map((msg) => {
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
              {/* Avatar para bot o peers */}
              {!isSelf && (
                <div className="chat-message__avatar-container">
                  {isBot ? (
                    <AmongusAvatar size={30} />
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
                  <span className="chat-message__time">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="chat-message__bubble">
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div style={{ padding: '4px 12px', background: '#fee2e2', color: '#b91c1c', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {/* Formulario de entrada */}
      <form onSubmit={handleSend} className="chat-panel__footer">
        <div className="chat-panel__input-group">
          <input
            type="text"
            className="chat-panel__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeChannel === 'group'
                ? isEn
                  ? 'Write a message or @Amongus...'
                  : 'Escribí un mensaje o @Amongus...'
                : isEn
                  ? 'Ask something to Amongus...'
                  : 'Preguntale algo a Amongus...'
            }
            aria-label={isEn ? 'Chat message' : 'Mensaje de chat'}
            data-testid="chat-input"
            disabled={isSending}
          />
          <button
            type="submit"
            className="chat-panel__send-btn"
            disabled={isSending || draft.trim().length === 0}
            aria-label={isEn ? 'Send message' : 'Enviar mensaje'}
            data-testid="chat-send-btn"
          >
            {/* Icono de enviar (avión de papel SVG) */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
