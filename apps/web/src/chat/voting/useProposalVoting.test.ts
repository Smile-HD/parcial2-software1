/**
 * Pruebas unitarias para el Hook useProposalVoting (Fase 3).
 * Verifica la reactividad en tiempo real y la sincronización con Yjs Awareness.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { useProposalVoting } from './useProposalVoting';

describe('useProposalVoting — Hook de Gobernanza Reactiva en Tiempo Real', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inicializa y sincroniza votos a través de Y.Doc', () => {
    const doc = new Y.Doc();
    const onAutoApply = vi.fn();
    const onAutoReject = vi.fn();

    const { result, unmount } = renderHook(() =>
      useProposalVoting({
        doc,
        currentUserId: 'dev-1',
        peerUserIds: ['dev-1', 'dev-2'],
        onAutoApply,
        onAutoReject,
      })
    );

    // Registrar una propuesta
    act(() => {
      result.current.initProposalVote('prop-100');
    });

    expect(result.current.votingStates['prop-100']).toBeDefined();
    expect(result.current.votingStates['prop-100']?.status).toBe('active');

    // dev-1 vota 'approve'
    act(() => {
      result.current.castVote('prop-100', 'approve');
    });

    expect(result.current.votingStates['prop-100']?.votes['dev-1']).toBe('approve');

    // dev-2 vota 'approve' en el Y.Doc directamente (emulando cliente remoto)
    act(() => {
      const votesMap = doc.getMap('proposal-votes');
      const current = JSON.parse(votesMap.get('prop-100') as string);
      current.votes['dev-2'] = 'approve';
      votesMap.set('prop-100', JSON.stringify(current));
    });

    // 2 de 2 votaron 'approve' -> se alcanza la mayoría absoluta y se dispara onAutoApply
    expect(onAutoApply).toHaveBeenCalledWith('prop-100');
    expect(result.current.votingStates['prop-100']?.status).toBe('approved');
    unmount();
  });

  it('quórum reactivo: al desconectarse un par, la mayoría restante resuelve la propuesta', () => {
    const doc = new Y.Doc();
    const onAutoApply = vi.fn();

    let peers = ['dev-1', 'dev-2'];
    const { result, rerender, unmount } = renderHook(
      ({ peerList }) =>
        useProposalVoting({
          doc,
          currentUserId: 'dev-1',
          peerUserIds: peerList,
          onAutoApply,
        }),
      { initialProps: { peerList: peers } }
    );

    act(() => {
      result.current.initProposalVote('prop-200');
      result.current.castVote('prop-200', 'approve');
    });

    // Con N=2 y 1 voto 'approve', aún no hay mayoría absoluta (falta dev-2)
    expect(result.current.votingStates['prop-200']?.status).toBe('active');
    expect(onAutoApply).not.toHaveBeenCalled();

    // dev-2 se desconecta de la sala (peerList pasa a ser solo dev-1)
    act(() => {
      rerender({ peerList: ['dev-1'] });
    });

    // El recálculo reactivo con N=1 hace que dev-1 sea 1/1 (mayoría absoluta instantánea)
    expect(result.current.votingStates['prop-200']?.status).toBe('approved');
    expect(onAutoApply).toHaveBeenCalledWith('prop-200');
    unmount();
  });
});
