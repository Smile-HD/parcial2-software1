/**
 * Cabecera y selector de canales para el panel de chat.
 */
import React from 'react';

export interface ChatHeaderProps {
  isEn: boolean;
  activeChannel: 'group' | 'direct_bot';
  setActiveChannel: (channel: 'group' | 'direct_bot') => void;
  onClose: () => void;
}

export function ChatHeader({
  isEn,
  activeChannel,
  setActiveChannel,
  onClose,
}: ChatHeaderProps) {
  return (
    <>
      <div className="chat-panel__header">
        <div className="chat-panel__header-info">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: '#4f46e5' }}
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <h2 className="chat-panel__title">{isEn ? 'Diagram Chat' : 'Chat del Diagrama'}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="chat-panel__close-btn"
          aria-label={isEn ? 'Close chat' : 'Cerrar chat'}
          title={isEn ? 'Close chat' : 'Cerrar chat'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="chat-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeChannel === 'group'}
          className={`chat-panel__tab ${activeChannel === 'group' ? 'chat-panel__tab--active' : ''}`}
          onClick={() => setActiveChannel('group')}
          data-testid="chat-tab-group"
        >
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v4" />
            <line x1="8" y1="16" x2="8" y2="16" strokeWidth="3" />
            <line x1="16" y1="16" x2="16" y2="16" strokeWidth="3" />
          </svg>
          <span>{isEn ? 'Assistant' : 'Asistente'}</span>
        </button>
      </div>
    </>
  );
}

