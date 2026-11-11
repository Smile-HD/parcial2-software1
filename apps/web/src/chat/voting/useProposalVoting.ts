/**
 * Hook de reactividad en tiempo real para votación colaborativa y quórum inteligente (Fase 3).
 * Sincroniza el estado de las votaciones a través de Yjs (Y.Map('proposal-votes')),
 * recalculando el quórum ante eventos de presencia y timers de expiración/prórroga.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import {
  createInitialVoteState,
  evaluateProposalResolution,
  recordUserVote,
  type ProposalVoteState,
  type VoteDecision,
} from './votingEngine';

export interface UseProposalVotingOptions {
  doc: Y.Doc | null;
  currentUserId?: string;
  peerUserIds?: readonly string[];
  onAutoApply?: (proposalId: string) => void;
  onAutoReject?: (proposalId: string) => void;
}

export function useProposalVoting({
  doc,
  currentUserId,
  peerUserIds = [],
  onAutoApply,
  onAutoReject,
}: UseProposalVotingOptions) {
  const [votingStates, setVotingStates] = useState<Record<string, ProposalVoteState>>({});

  const callbacksRef = useRef({ onAutoApply, onAutoReject });
  useEffect(() => {
    callbacksRef.current = { onAutoApply, onAutoReject };
  }, [onAutoApply, onAutoReject]);

  const peersRef = useRef<readonly string[]>(peerUserIds);
  peersRef.current = peerUserIds;
  const peersKey = peerUserIds.join(',');

  // Manejador centralizado para transicionar y disparar efectos secundarios automáticos
  const applyStateUpdates = useCallback(
    (
      prevStates: Record<string, ProposalVoteState>,
      updatedMap: Record<string, ProposalVoteState>,
      activePeers: readonly string[]
    ): Record<string, ProposalVoteState> => {
      const now = Date.now();
      const next: Record<string, ProposalVoteState> = { ...prevStates };
      let hasChanges = false;

      for (const [id, rawState] of Object.entries(updatedMap)) {
        const resolved = evaluateProposalResolution(rawState, activePeers, now);
        const prior = prevStates[id];

        // Disparar callbacks si hubo transición hacia un estado terminal
        if (resolved.status === 'approved' && prior?.status !== 'approved') {
          callbacksRef.current.onAutoApply?.(id);
        } else if (
          (resolved.status === 'rejected' || resolved.status === 'expired_rejected') &&
          prior?.status !== 'rejected' &&
          prior?.status !== 'expired_rejected'
        ) {
          callbacksRef.current.onAutoReject?.(id);
        }

        if (
          !prior ||
          prior.status !== resolved.status ||
          prior.expiresAt !== resolved.expiresAt ||
          JSON.stringify(prior.votes) !== JSON.stringify(resolved.votes)
        ) {
          hasChanges = true;
        }

        next[id] = resolved;
      }

      return hasChanges ? next : prevStates;
    },
    []
  );

  // Sincronización reactiva con el mapa compartido de Yjs
  useEffect(() => {
    if (!doc) return;

    const yVotesMap = doc.getMap<string>('proposal-votes');

    // Carga inicial desde el Y.Doc
    const initialRaw: Record<string, ProposalVoteState> = {};
    yVotesMap.forEach((jsonStr, propId) => {
      try {
        initialRaw[propId] = JSON.parse(jsonStr) as ProposalVoteState;
      } catch {
        // ignorar entradas no parseables
      }
    });

    setVotingStates((prev) => applyStateUpdates(prev, initialRaw, peersRef.current));

    // Observador de cambios concurrentes de otros pares
    const observer = () => {
      const currentRaw: Record<string, ProposalVoteState> = {};
      yVotesMap.forEach((jsonStr, propId) => {
        try {
          currentRaw[propId] = JSON.parse(jsonStr) as ProposalVoteState;
        } catch {
          // ignorar
        }
      });
      setVotingStates((prev) => applyStateUpdates(prev, currentRaw, peersRef.current));
    };

    yVotesMap.observe(observer);
    return () => {
      yVotesMap.unobserve(observer);
    };
  }, [doc, applyStateUpdates]);

  // Recálculo reactivo cuando cambia la lista de miembros conectados (Quórum Dinámico)
  useEffect(() => {
    setVotingStates((prev) => applyStateUpdates(prev, prev, peersRef.current));
  }, [peersKey, applyStateUpdates]);

  // Temporizador periódico (cada 1s) para evaluar timeouts y prórrogas
  useEffect(() => {
    const timer = setInterval(() => {
      setVotingStates((prev) => {
        const hasActive = Object.values(prev).some(
          (s) => s.status === 'active' || s.status === 'overtime'
        );
        if (!hasActive) return prev;
        return applyStateUpdates(prev, prev, peersRef.current);
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [applyStateUpdates]);

  // Inicializa una nueva votación para una propuesta recién recibida
  const initProposalVote = useCallback(
    (proposalId: string, createdAt: number = Date.now()) => {
      const initial = createInitialVoteState(proposalId, createdAt);
      if (doc) {
        const yVotesMap = doc.getMap<string>('proposal-votes');
        if (!yVotesMap.has(proposalId)) {
          yVotesMap.set(proposalId, JSON.stringify(initial));
        }
      }
      setVotingStates((prev) => ({
        ...prev,
        [proposalId]: initial,
      }));
    },
    [doc]
  );

  // Emite o modifica el voto del usuario actual
  const castVote = useCallback(
    (proposalId: string, decision: VoteDecision) => {
      if (!currentUserId) return;

      setVotingStates((prev) => {
        const current = prev[proposalId] ?? createInitialVoteState(proposalId);
        const updated = recordUserVote(current, currentUserId, decision);

        // Persistir inmediatamente en el Y.Doc para propagar a los pares
        if (doc) {
          const yVotesMap = doc.getMap<string>('proposal-votes');
          yVotesMap.set(proposalId, JSON.stringify(updated));
        }

        return applyStateUpdates(prev, { [proposalId]: updated }, peerUserIds);
      });
    },
    [currentUserId, doc, applyStateUpdates, peerUserIds]
  );

  return {
    votingStates,
    initProposalVote,
    castVote,
  };
}
