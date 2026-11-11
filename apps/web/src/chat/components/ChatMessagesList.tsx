/**
 * Contenedor de lista de mensajes, estado vacío, tarjetas de propuesta, alertas y streaming.
 */
import React from 'react';
import type { Delta } from '@app/core';
import { AmongusAvatar } from '../AmongusAvatar';
import { ProposalCard } from '../ProposalCard';
import { ChatMessageItem } from '../ChatMessageItem';
import { renderStreamingContent } from '../chatFormatters';
import type { ProposalVoteState, VoteDecision } from '../voting/votingEngine';

export interface ChatMessagesListProps {
  safeMessages: any[];
  isLoading: boolean;
  activeChannel: 'group' | 'direct_bot';
  userName: string;
  isEn: boolean;
  speakingText: string | null;
  handleSpeakText: (text: string) => void;
  handleConfirm: (deltaId: string, delta: Delta) => Promise<void>;
  handleReject: (deltaId: string) => Promise<void>;
  appliedDeltaIds: Set<string>;
  rejectedDeltaIds: Set<string>;
  buildingDeltaId: string | null;
  existingClasses: Array<{ id: string; name: string }>;
  currentPreviewProposal: { deltaId: string; delta: Delta } | null;
  activeProposal: { deltaId: string; delta: Delta } | null;
  visibleInterpreterRefusal: string | null;
  visibleInterpreterError: string | null;
  interpreterRefusal: string | null;
  interpreterError: string | null;
  setDismissedRefusal: (val: string | null) => void;
  setDismissedError: (val: string | null) => void;
  interpreterPhase: 'idle' | 'thinking' | 'pending' | 'refused' | 'error';
  streamingBotMessage: string | null;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  // Soporte de votación colaborativa
  votingStates?: Record<string, ProposalVoteState>;
  onVote?: (deltaId: string, decision: VoteDecision) => void;
  peerUsersCount?: number;
}

export function ChatMessagesList({
  safeMessages,
  isLoading,
  activeChannel,
  userName,
  isEn,
  speakingText,
  handleSpeakText,
  handleConfirm,
  handleReject,
  appliedDeltaIds,
  rejectedDeltaIds,
  buildingDeltaId,
  existingClasses,
  currentPreviewProposal,
  activeProposal,
  visibleInterpreterRefusal,
  visibleInterpreterError,
  interpreterRefusal,
  interpreterError,
  setDismissedRefusal,
  setDismissedError,
  interpreterPhase,
  streamingBotMessage,
  messagesContainerRef,
  messagesEndRef,
  votingStates,
  onVote,
  peerUsersCount,
}: ChatMessagesListProps) {
  return (
    <div className="chat-panel__messages" ref={messagesContainerRef} data-testid="chat-messages-container">
      {safeMessages.length === 0 && !isLoading && !activeProposal && (
        <div className="chat-panel__empty">
          <p>
            {activeChannel === 'group'
              ? isEn
                ? 'No messages yet. Chat with your team or type a modeling command.'
                : 'No hay mensajes aún. Chateá con tu equipo o indicá un comando de modelado.'
              : isEn
                ? 'Ask questions or type modeling commands (e.g. "add class Order").'
                : 'Hacé preguntas o indicá comandos de modelado (ej. "crear clase Pedido").'}
          </p>
        </div>
      )}

      {safeMessages.map((msg) => (
        <ChatMessageItem
          key={msg.id}
          msg={msg}
          userName={userName}
          isEn={isEn}
          speakingText={speakingText}
          handleSpeakText={handleSpeakText}
          handleConfirm={handleConfirm}
          handleReject={handleReject}
          appliedDeltaIds={appliedDeltaIds}
          rejectedDeltaIds={rejectedDeltaIds}
          buildingDeltaId={buildingDeltaId}
          existingClasses={existingClasses}
          currentPreviewProposal={currentPreviewProposal}
          votingStates={votingStates}
          onVote={onVote}
          peerUsersCount={peerUsersCount}
        />
      ))}

      {/* Tarjeta de propuesta activa */}
      {activeProposal &&
        !appliedDeltaIds.has(activeProposal.deltaId) &&
        !rejectedDeltaIds.has(activeProposal.deltaId) &&
        !safeMessages.some((m) => m.deltaId === activeProposal.deltaId) && (
        <div className="chat-message chat-message--bot" data-testid="chat-active-proposal">
          <div className="chat-message__avatar-container">
            <AmongusAvatar size={30} isAnimated={buildingDeltaId === activeProposal.deltaId} />
          </div>
          <div className="chat-message__body">
            <div className="chat-message__header">
              <span className="chat-message__sender">Amongus</span>
              <span className="chat-message__tag-bot">Bot</span>
            </div>
            <div className="chat-message__bubble">
              <ProposalCard
                deltaId={activeProposal.deltaId}
                delta={activeProposal.delta}
                onConfirm={handleConfirm}
                onReject={handleReject}
                isApplied={appliedDeltaIds.has(activeProposal.deltaId)}
                isRejected={rejectedDeltaIds.has(activeProposal.deltaId)}
                isBuilding={buildingDeltaId === activeProposal.deltaId}
                existingClasses={existingClasses}
                votingState={votingStates && activeProposal.deltaId ? votingStates[activeProposal.deltaId] : undefined}
                onVote={onVote}
                currentUserId={userName}
                peerUsersCount={peerUsersCount}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mensaje de rechazo con rol de alerta */}
      {visibleInterpreterRefusal && (
        <div className="chat-message chat-message--bot" role="alert">
          <div className="chat-message__avatar-container">
            <AmongusAvatar size={30} />
          </div>
          <div className="chat-message__body">
            <div className="chat-message__header">
              <span className="chat-message__sender">Amongus</span>
              <span className="chat-message__tag-bot">Bot</span>
              <button
                type="button"
                onClick={() => setDismissedRefusal(interpreterRefusal)}
                className="chat-error-dismiss-btn"
                title={isEn ? 'Dismiss message' : 'Cerrar mensaje'}
                aria-label={isEn ? 'Dismiss message' : 'Cerrar mensaje'}
              >
                &times;
              </button>
            </div>
            <div className="chat-message__bubble interpreter-refusal">
              {isEn ? `Refused: ${visibleInterpreterRefusal}` : `Rechazado: ${visibleInterpreterRefusal}`}
            </div>
          </div>
        </div>
      )}

      {/* Mensaje de error con rol de alerta */}
      {visibleInterpreterError && (
        <div className="chat-message chat-message--bot" role="alert">
          <div className="chat-message__avatar-container">
            <AmongusAvatar size={30} />
          </div>
          <div className="chat-message__body">
            <div className="chat-message__header">
              <span className="chat-message__sender">Amongus</span>
              <span className="chat-message__tag-bot">Bot</span>
              <button
                type="button"
                onClick={() => setDismissedError(interpreterError)}
                className="chat-error-dismiss-btn"
                title={isEn ? 'Dismiss error' : 'Cerrar mensaje de error'}
                aria-label={isEn ? 'Dismiss error' : 'Cerrar error'}
              >
                ✕
              </button>
            </div>
            <div className="chat-message__bubble interpreter-error">
              {visibleInterpreterError}
            </div>
          </div>
        </div>
      )}

      {/* Indicador de pensamiento */}
      {interpreterPhase === 'thinking' && (
        <div className="chat-message chat-message--bot" aria-live="polite">
          <div className="chat-message__avatar-container">
            <AmongusAvatar size={30} isAnimated={true} />
          </div>
          <div className="chat-message__body">
            <div className="chat-message__bubble chat-panel__thinking">
              <span>{isEn ? 'Thinking...' : 'Pensando...'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Respuesta de Amongus en tiempo real */}
      {streamingBotMessage !== null && (
        <div className="chat-message chat-message--bot" aria-live="polite">
          <div className="chat-message__avatar-container">
            <AmongusAvatar size={30} isAnimated={true} />
          </div>
          <div className="chat-message__body">
            <div className="chat-message__header">
              <span className="chat-message__sender">Amongus</span>
              <span className="chat-message__tag-bot">Bot</span>
            </div>
            <div className="chat-message__bubble">
              {renderStreamingContent(streamingBotMessage, isEn)}
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

