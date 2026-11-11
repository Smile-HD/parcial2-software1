import React from 'react';
import type { Delta } from '@app/core';
import { AmongusAvatar } from './AmongusAvatar.js';
import { ProposalCard } from './ProposalCard.js';
import { pickUserColor } from '../presence/palette.js';
import { presenceInitials } from '../canvas/PresenceBar.js';
import { renderFormattedContent } from './chatFormatters.js';
import type { ProposalVoteState, VoteDecision } from './voting/votingEngine.js';

export interface ChatMessageItemProps {
  msg: {
    id: string;
    senderType: string;
    senderName: string;
    content: string;
    createdAt: string;
    delta?: Delta;
    deltaId?: string;
  };
  userName: string;
  isEn: boolean;
  speakingText: string | null;
  handleSpeakText: (text: string) => void;
  handleConfirm: (deltaId: string, delta: Delta) => Promise<void> | void;
  handleReject: (deltaId: string) => Promise<void> | void;
  appliedDeltaIds: Set<string>;
  rejectedDeltaIds: Set<string>;
  buildingDeltaId?: string | null;
  existingClasses?: Array<{ id: string; name: string }>;
  currentPreviewProposal?: { deltaId: string; delta: Delta } | null;
  // Soporte de votación colaborativa
  votingStates?: Record<string, ProposalVoteState>;
  onVote?: (deltaId: string, decision: VoteDecision) => void;
  peerUsersCount?: number;
}

export function ChatMessageItem({
  msg,
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
  votingStates,
  onVote,
  peerUsersCount,
}: ChatMessageItemProps) {
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
      {!isSelf && (
        <div className="chat-message__avatar-container">
          {isBot ? (
            <>
              <AmongusAvatar size={30} />
              <span className="sr-only">Amongus</span>
            </>
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
          {isBot && Boolean(msg.content) && (
            <button
              type="button"
              onClick={() => handleSpeakText(msg.content)}
              className="chat-message__speak-btn"
              title={
                speakingText === msg.content
                  ? isEn
                    ? 'Stop listening'
                    : 'Detener audio'
                  : isEn
                    ? 'Listen message'
                    : 'Escuchar mensaje'
              }
              aria-label={
                speakingText === msg.content
                  ? isEn
                    ? 'Stop listening'
                    : 'Detener audio'
                  : isEn
                    ? 'Listen message'
                    : 'Escuchar mensaje'
              }
            >
              {speakingText === msg.content ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </button>
          )}
          <span className="chat-message__time">
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="chat-message__bubble">
          {renderFormattedContent(msg.content, isEn)}
          {msg.delta && msg.deltaId && (
            <ProposalCard
              deltaId={msg.deltaId}
              delta={msg.delta}
              onConfirm={handleConfirm}
              onReject={handleReject}
              isApplied={appliedDeltaIds.has(msg.deltaId)}
              isRejected={rejectedDeltaIds.has(msg.deltaId)}
              isBuilding={buildingDeltaId === msg.deltaId}
              existingClasses={existingClasses}
              isSuperseded={
                !appliedDeltaIds.has(msg.deltaId) &&
                !rejectedDeltaIds.has(msg.deltaId) &&
                Boolean(currentPreviewProposal) &&
                currentPreviewProposal?.deltaId !== msg.deltaId
              }
              votingState={msg.deltaId && votingStates ? votingStates[msg.deltaId] : undefined}
              onVote={onVote}
              currentUserId={userName}
              peerUsersCount={peerUsersCount}
            />
          )}
        </div>
      </div>
    </div>
  );
}
