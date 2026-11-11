/**
 * Pruebas unitarias para el motor matemático de votación y quórum inteligente (Fase 1).
 * Verifica los requisitos formales de gobernanza de propuestas en el chat grupal:
 * - Temporizador de 3 minutos (180s)
 * - Rechazo automático por inactividad si nadie vota
 * - Tiempo extra de 1 minuto (60s) en caso de empate
 * - Flexibilidad de cambio de voto
 * - Mayoría absoluta irreversible (cierre anticipado inteligente)
 * - Quórum reactivo ante desconexiones
 */
import { describe, expect, it } from 'vitest';
import {
  createInitialVoteState,
  evaluateProposalResolution,
  isPendingVoteDecisive,
  recordUserVote,
  VOTING_DURATION_MS,
  OVERTIME_DURATION_MS,
  type ProposalVoteState,
} from './votingEngine';

describe('votingEngine — Motor Matemático de Votación y Quórum', () => {
  const T0 = 1_000_000; // Marca temporal base en milisegundos

  it('1.1.1 Caso: Cero votos al expirar los 180s produce rechazo automático por inactividad (expired_rejected)', () => {
    const state = createInitialVoteState('prop-1', T0);
    expect(state.status).toBe('active');
    expect(state.expiresAt).toBe(T0 + VOTING_DURATION_MS);

    // Evaluamos tras 180 segundos sin ningún voto
    const resolved = evaluateProposalResolution(state, ['user-1', 'user-2'], T0 + VOTING_DURATION_MS + 1);
    expect(resolved.status).toBe('expired_rejected');
  });

  it('1.1.2 Caso: Todos votaron -> resolución inmediata por mayoría simple', () => {
    let state = createInitialVoteState('prop-1', T0);
    state = recordUserVote(state, 'user-1', 'approve');
    state = recordUserVote(state, 'user-2', 'approve');

    // 2 usuarios conectados, 2 votaron 'approve' -> 100% participación antes del timeout
    const resolved = evaluateProposalResolution(state, ['user-1', 'user-2'], T0 + 10_000);
    expect(resolved.status).toBe('approved');
  });

  it('1.1.3 Caso: Mayoría absoluta irreversible (ej. 3 A vs 0 R con N=5) -> resolución anticipada sin esperar a los otros 2', () => {
    let state = createInitialVoteState('prop-1', T0);
    state = recordUserVote(state, 'user-1', 'approve');
    state = recordUserVote(state, 'user-2', 'approve');
    state = recordUserVote(state, 'user-3', 'approve');

    // N=5 humanos. Mayoría absoluta = floor(5/2) + 1 = 3.
    // 3 votos 'approve' son inalcanzables aunque los 2 restantes votaran 'reject'.
    const resolved = evaluateProposalResolution(state, ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'], T0 + 15_000);
    expect(resolved.status).toBe('approved');
  });

  it('1.1.3b Caso: Mayoría absoluta de rechazo irreversible (ej. 0 A vs 3 R con N=5) -> rechazo anticipado', () => {
    let state = createInitialVoteState('prop-1', T0);
    state = recordUserVote(state, 'user-1', 'reject');
    state = recordUserVote(state, 'user-2', 'reject');
    state = recordUserVote(state, 'user-3', 'reject');

    const resolved = evaluateProposalResolution(state, ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'], T0 + 15_000);
    expect(resolved.status).toBe('rejected');
  });

  it('1.1.4 Caso: Resultado reversible (ej. 1 A vs 1 R con N=3) -> la votación permanece activa esperando los votos determinantes', () => {
    let state = createInitialVoteState('prop-1', T0);
    state = recordUserVote(state, 'user-1', 'approve');
    state = recordUserVote(state, 'user-2', 'reject');

    // N=3. Falta user-3. Si vota A gana A, si vota R gana R. Voto determinante pendiente.
    const resolved = evaluateProposalResolution(state, ['user-1', 'user-2', 'user-3'], T0 + 20_000);
    expect(resolved.status).toBe('active');
  });

  it('1.1.5 Caso: Empate al expirar los 180s con votos emitidos -> entra en prórroga (overtime) de 60s', () => {
    let state = createInitialVoteState('prop-1', T0);
    state = recordUserVote(state, 'user-1', 'approve');
    state = recordUserVote(state, 'user-2', 'reject');

    // Expiran los 180s con 1 A vs 1 R
    const resolved = evaluateProposalResolution(state, ['user-1', 'user-2', 'user-3'], T0 + VOTING_DURATION_MS + 1);
    expect(resolved.status).toBe('overtime');
    expect(resolved.isOvertime).toBe(true);
    // Nuevo tiempo límite = expiración previa + 60s
    expect(resolved.expiresAt).toBe(T0 + VOTING_DURATION_MS + OVERTIME_DURATION_MS);
  });

  it('1.1.5b Caso: Empate persistente al agotarse el tiempo extra de 60s -> rechazo por falta de mayoría', () => {
    let state = createInitialVoteState('prop-1', T0);
    state = recordUserVote(state, 'user-1', 'approve');
    state = recordUserVote(state, 'user-2', 'reject');

    // Pasa a overtime
    state = evaluateProposalResolution(state, ['user-1', 'user-2', 'user-3'], T0 + VOTING_DURATION_MS + 1);
    expect(state.status).toBe('overtime');

    // Expiran los 60s adicionales sin desempate
    const finalResolved = evaluateProposalResolution(state, ['user-1', 'user-2', 'user-3'], state.expiresAt + 1);
    expect(finalResolved.status).toBe('rejected');
  });

  it('1.1.6 Caso: Desconexión de usuario recalcula quórum y resuelve si la mayoría restante es definitiva', () => {
    let state = createInitialVoteState('prop-1', T0);
    state = recordUserVote(state, 'user-1', 'approve');

    // Originalmente había 2 usuarios (user-1 y user-2). Con 1 voto de 2 aún no hay mayoría absoluta.
    let check = evaluateProposalResolution(state, ['user-1', 'user-2'], T0 + 5_000);
    expect(check.status).toBe('active');

    // user-2 se desconecta. El censo humano se reduce a ['user-1']. N=1. Mayoría absoluta = 1.
    // El voto existente de user-1 ahora constituye el 100% del quórum activo.
    const resolved = evaluateProposalResolution(state, ['user-1'], T0 + 6_000);
    expect(resolved.status).toBe('approved');
  });

  it('1.1.7 Caso: Cambio de voto (flip de Rechazar a Aprobar) reevalúa el estado inmediatamente', () => {
    let state = createInitialVoteState('prop-1', T0);
    state = recordUserVote(state, 'user-1', 'reject');
    state = recordUserVote(state, 'user-2', 'approve');

    // Con N=2: 1 A vs 1 R -> activo esperando o empate
    let check = evaluateProposalResolution(state, ['user-1', 'user-2'], T0 + 5_000);
    expect(check.status).toBe('overtime'); // Al estar todos votados en 1 vs 1 pasa a overtime

    // user-1 cambia de opinión y vota 'approve'
    state = recordUserVote(state, 'user-1', 'approve');
    const resolved = evaluateProposalResolution(state, ['user-1', 'user-2'], T0 + 10_000);
    expect(resolved.status).toBe('approved');
  });

  it('isPendingVoteDecisive calcula correctamente si los votos pendientes pueden alterar el resultado', () => {
    // N=3, 2 votos A, 0 votos R -> falta 1 voto. Incluso si vota R, queda 2 vs 1 (gana A). No es decisivo.
    expect(isPendingVoteDecisive(2, 0, 3)).toBe(false);

    // N=3, 1 voto A, 0 votos R -> faltan 2 votos. Pueden votar 2 R y revertir (1 vs 2). Es decisivo.
    expect(isPendingVoteDecisive(1, 0, 3)).toBe(true);

    // N=4, 1 voto A, 1 voto R -> faltan 2 votos. Es decisivo.
    expect(isPendingVoteDecisive(1, 1, 4)).toBe(true);

    // N=4, 3 votos A, 0 votos R -> falta 1 voto. No es decisivo.
    expect(isPendingVoteDecisive(3, 0, 4)).toBe(false);
  });
});

