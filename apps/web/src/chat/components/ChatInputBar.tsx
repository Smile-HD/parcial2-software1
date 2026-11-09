/**
 * Barra de entrada del panel de chat con soporte de autocompletado de comandos slash, menciones, micrófono y envío.
 */
import React from 'react';
import type { SlashCommand } from '../commands';
import type { VoiceRecorder } from '../../voice/recorder';

export interface ChatInputBarProps {
  isEn: boolean;
  draft: string;
  setDraft: (val: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  handleSend: (e?: React.FormEvent) => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  isSending: boolean;
  interpreterPhase: 'idle' | 'thinking' | 'pending' | 'refused' | 'error';
  isTranscribing: boolean;
  activeChannel: 'group' | 'direct_bot';
  voiceRecorder?: VoiceRecorder | null;
  activeRecording: boolean;
  onToggleRecord?: () => void;
  handleInternalToggleRecord: () => void;
  isSlashQuery: boolean;
  matchingCommands: SlashCommand[];
  selectedCommandIndex: number;
  isMentionQuery: boolean;
  matchingMentions: Array<{ name: string; role: string; isBot: boolean }>;
  selectedMentionIndex: number;
  handleSelectMention: (name: string) => void;
}

export function ChatInputBar({
  isEn,
  draft,
  setDraft,
  inputRef,
  handleSend,
  handleKeyDown,
  isSending,
  interpreterPhase,
  isTranscribing,
  activeChannel,
  voiceRecorder,
  activeRecording,
  onToggleRecord,
  handleInternalToggleRecord,
  isSlashQuery,
  matchingCommands,
  selectedCommandIndex,
  isMentionQuery,
  matchingMentions,
  selectedMentionIndex,
  handleSelectMention,
}: ChatInputBarProps) {
  return (
    <form onSubmit={handleSend} className="chat-panel__footer" style={{ position: 'relative' }}>
      {/* Popover de autocompletado de comandos slash */}
      {isSlashQuery && matchingCommands.length > 0 && (
        <div className="chat-panel__command-popover" role="listbox" aria-label={isEn ? 'Slash commands' : 'Comandos slash'}>
          {matchingCommands.map((cmd, idx) => {
            const isSelected = idx === selectedCommandIndex;
            return (
              <div
                key={cmd.name}
                className={`chat-panel__command-item ${isSelected ? 'chat-panel__command-item--active' : ''}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  if (cmd.name === 'audit' || cmd.name === 'suggest' || cmd.name === 'clear' || cmd.name === 'layout') {
                    setDraft(`/${cmd.name}`);
                  } else {
                    setDraft(`/${cmd.name} `);
                  }
                  inputRef.current?.focus();
                }}
              >
                <span className="chat-panel__command-usage">{isEn ? cmd.usageEn : cmd.usage}</span>
                <span className="chat-panel__command-desc">{isEn ? cmd.descriptionEn : cmd.description}</span>
                <span className={`chat-panel__command-badge ${cmd.scope === 'server' ? 'chat-panel__command-badge--server' : ''}`}>
                  {cmd.scope === 'server' ? 'IA' : '0ms'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Popover de autocompletado de menciones @ */}
      {!isSlashQuery && isMentionQuery && matchingMentions.length > 0 && (
        <div className="chat-panel__command-popover" role="listbox" aria-label={isEn ? 'Mentions' : 'Menciones'}>
          {matchingMentions.map((item, idx) => {
            const isSelected = idx === selectedMentionIndex;
            return (
              <div
                key={item.name}
                className={`chat-panel__command-item ${isSelected ? 'chat-panel__command-item--active' : ''}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelectMention(item.name)}
              >
                <span
                  className="chat-panel__command-usage"
                  style={{ fontWeight: 600, color: item.isBot ? '#7c3aed' : '#2563eb' }}
                >
                  @{item.name}
                </span>
                <span className="chat-panel__command-desc">{item.role}</span>
                <span className={`chat-panel__command-badge ${item.isBot ? 'chat-panel__command-badge--server' : ''}`}>
                  {item.isBot ? 'Bot' : 'User'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="chat-panel__input-group">
        <input
          ref={inputRef}
          type="text"
          className="chat-panel__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isTranscribing
              ? isEn
                ? 'Transcribing audio with Groq Whisper...'
                : 'Transcribiendo audio con Groq Whisper...'
              : activeChannel === 'group'
                ? isEn
                  ? 'Write a message or command...'
                  : 'Escribí un mensaje o comando...'
                : isEn
                  ? 'Ask a question or type a UML command...'
                  : 'Hacé una pregunta o comando UML...'
          }
          aria-label={isEn ? 'Natural language command' : 'Comando en lenguaje natural'}
          data-testid="chat-input"
          disabled={isSending || interpreterPhase === 'thinking' || isTranscribing}
        />

        {voiceRecorder !== null && (
          <button
            type="button"
            onClick={onToggleRecord ?? handleInternalToggleRecord}
            disabled={isSending || interpreterPhase === 'thinking' || isTranscribing}
            className={`chat-panel__record-btn ${activeRecording ? 'chat-panel__record-btn--active' : ''} ${isTranscribing ? 'chat-panel__record-btn--transcribing' : ''}`}
            aria-label={
              isTranscribing
                ? isEn ? 'Transcribing' : 'Transcribiendo'
                : activeRecording
                  ? isEn ? 'Stop' : 'Detener'
                  : isEn ? 'Record' : 'Grabar'
            }
            title={
              isTranscribing
                ? isEn ? 'Transcribing with Groq Whisper...' : 'Transcribiendo con Groq Whisper...'
                : activeRecording
                  ? isEn ? 'Stop recording' : 'Detener grabación'
                  : isEn ? 'Record voice' : 'Grabar voz'
            }
            data-testid="chat-record-btn"
          >
            {isTranscribing ? (
              <div className="chat-panel__transcribe-spinner" />
            ) : activeRecording ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
                <span className="sr-only">{isEn ? 'Stop' : 'Detener'}</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
                <span className="sr-only">{isEn ? 'Record' : 'Grabar'}</span>
              </>
            )}
          </button>
        )}

        <button
          type="submit"
          onClick={handleSend}
          className="chat-panel__send-btn"
          disabled={isSending || interpreterPhase === 'thinking' || draft.trim().length === 0}
          aria-label={isEn ? 'Send' : 'Enviar'}
          title={isEn ? 'Send' : 'Enviar'}
          data-testid="chat-send-btn"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          <span className="sr-only">{isEn ? 'Send' : 'Enviar'}</span>
        </button>
      </div>
    </form>
  );
}

