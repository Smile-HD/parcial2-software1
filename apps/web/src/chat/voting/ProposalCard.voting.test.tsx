/**
 * Pruebas unitarias para ProposalCard con soporte de votación inteligente (Fase 2).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Delta } from '@app/core';
import { ProposalCard } from '../ProposalCard';
import { createInitialVoteState, type ProposalVoteState } from './votingEngine';

const dummyDelta: Delta = {
  kind: 'class',
  op: 'create',
  id: 'delta-1',
  diagramId: 'diag-1',
  timestamp: new Date().toISOString(),
  classId: 'c1',
  name: 'Factura',
};

describe('ProposalCard — Votación Colaborativa', () => {
  it('renderiza temporizador y botones de votación con contadores', () => {
    const onConfirm = vi.fn();
    const onReject = vi.fn();
    const onVote = vi.fn();

    const votingState: ProposalVoteState = {
      ...createInitialVoteState('delta-1', Date.now()),
      votes: {
        'user-1': 'approve',
        'user-2': 'reject',
      },
    };

    render(
      <ProposalCard
        deltaId="delta-1"
        delta={dummyDelta}
        onConfirm={onConfirm}
        onReject={onReject}
        votingState={votingState}
        onVote={onVote}
        currentUserId="user-1"
        peerUsersCount={3}
      />
    );

    // Debe mostrar la sección de votación y botones
    expect(screen.getByTestId('proposal-voting-section')).not.toBeNull();
    expect(screen.getByTestId('vote-approve-btn')).not.toBeNull();
    expect(screen.getByTestId('vote-reject-btn')).not.toBeNull();
    // Votos registrados: 1 a favor, 1 en contra
    expect(screen.getByTestId('vote-approve-count').textContent).toBe('1');
    expect(screen.getByTestId('vote-reject-count').textContent).toBe('1');
  });

  it('permite emitir y cambiar el voto al hacer clic en Aprobar y Rechazar', () => {
    const onVote = vi.fn();
    const votingState = createInitialVoteState('delta-1', Date.now());

    render(
      <ProposalCard
        deltaId="delta-1"
        delta={dummyDelta}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        votingState={votingState}
        onVote={onVote}
        currentUserId="user-me"
        peerUsersCount={2}
      />
    );

    const approveBtn = screen.getByTestId('vote-approve-btn');
    fireEvent.click(approveBtn);
    expect(onVote).toHaveBeenCalledWith('delta-1', 'approve');

    const rejectBtn = screen.getByTestId('vote-reject-btn');
    fireEvent.click(rejectBtn);
    expect(onVote).toHaveBeenCalledWith('delta-1', 'reject');
  });

  it('muestra etiqueta de prórroga (Overtime) cuando la votación está en tiempo extra de desempate', () => {
    const votingState: ProposalVoteState = {
      ...createInitialVoteState('delta-1', Date.now()),
      status: 'overtime',
      isOvertime: true,
      expiresAt: Date.now() + 45_000,
    };

    render(
      <ProposalCard
        deltaId="delta-1"
        delta={dummyDelta}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        votingState={votingState}
        currentUserId="user-1"
      />
    );

    expect(screen.getByText(/Prórroga|Overtime/i)).not.toBeNull();
  });

  it('muestra mensaje de inactividad cuando la propuesta expiró sin votos', () => {
    const votingState: ProposalVoteState = {
      ...createInitialVoteState('delta-1', Date.now() - 200_000),
      status: 'expired_rejected',
    };

    render(
      <ProposalCard
        deltaId="delta-1"
        delta={dummyDelta}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        votingState={votingState}
      />
    );

    expect(screen.getByText(/Rechazada por inactividad|Rejected due to inactivity/i)).not.toBeNull();
  });
});
