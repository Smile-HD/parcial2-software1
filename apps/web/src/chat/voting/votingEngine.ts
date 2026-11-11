/**
 * Motor Matemático Puro de Votación y Quórum Inteligente para Propuestas (Fase 1).
 * Implementa la lógica de gobernanza democrática en tiempo real:
 * - Ventana reglamentaria de 3 minutos (180s)
 * - Prórroga de desempate de 1 minuto (60s) ante empates
 * - Flexibilidad para cambio de decisión (flip de voto)
 * - Cierre anticipado determinista ante Mayoría Absoluta Irreversible
 * - Recálculo reactivo de quórum ante altas y bajas de miembros en awareness
 */

export type VoteDecision = 'approve' | 'reject';

export type ProposalVoteStatus =
  | 'active'
  | 'overtime'
  | 'approved'
  | 'rejected'
  | 'expired_rejected';

export interface ProposalVoteState {
  proposalId: string;
  createdAt: number;
  expiresAt: number;
  isOvertime: boolean;
  status: ProposalVoteStatus;
  votes: Record<string, VoteDecision>;
}

/** Duración reglamentaria de la votación: 3 minutos (180.000 ms). */
export const VOTING_DURATION_MS = 180_000;

/** Duración de la prórroga de desempate: 1 minuto (60.000 ms). */
export const OVERTIME_DURATION_MS = 60_000;

/**
 * Crea el estado inicial para una nueva propuesta sujeta a votación grupal.
 */
export function createInitialVoteState(
  proposalId: string,
  createdAt: number = Date.now()
): ProposalVoteState {
  return {
    proposalId,
    createdAt,
    expiresAt: createdAt + VOTING_DURATION_MS,
    isOvertime: false,
    status: 'active',
    votes: {},
  };
}

/**
 * Registra o actualiza el voto de un usuario (permite cambiar de opinión durante el tiempo activo).
 */
export function recordUserVote(
  state: ProposalVoteState,
  userId: string,
  decision: VoteDecision
): ProposalVoteState {
  // Si la votación ya concluyó, no se admiten más votos ni cambios
  if (
    state.status === 'approved' ||
    state.status === 'rejected' ||
    state.status === 'expired_rejected'
  ) {
    return state;
  }

  return {
    ...state,
    votes: {
      ...state.votes,
      [userId]: decision,
    },
  };
}

/**
 * Determina si los votos pendientes de emitir tienen la capacidad matemática
 * de alterar el ganador actual o forzar un empate.
 */
export function isPendingVoteDecisive(
  approveCount: number,
  rejectCount: number,
  totalUsers: number
): boolean {
  const pending = Math.max(0, totalUsers - (approveCount + rejectCount));
  if (pending === 0) return false;

  // Mayoría absoluta necesaria para asegurar la victoria sin depender de los pendientes
  const absoluteMajority = Math.floor(totalUsers / 2) + 1;

  // Si alguna opción ya tiene mayoría absoluta, los votos restantes no son decisivos
  if (approveCount >= absoluteMajority || rejectCount >= absoluteMajority) {
    return false;
  }

  // Si la diferencia actual es menor o igual a los votos pendientes, los pendientes pueden empatar o revertir
  const diff = Math.abs(approveCount - rejectCount);
  return diff <= pending;
}

/**
 * Evalúa el estado de resolución de una propuesta en base a los votos emitidos,
 * los miembros humanos actualmente conectados en la sala y el tiempo actual.
 */
export function evaluateProposalResolution(
  state: ProposalVoteState,
  activeUserIds: readonly string[],
  currentTime: number = Date.now()
): ProposalVoteState {
  // Si ya alcanzó un estado terminal, no se recalcula
  if (
    state.status === 'approved' ||
    state.status === 'rejected' ||
    state.status === 'expired_rejected'
  ) {
    return state;
  }

  const activeSet = new Set(activeUserIds);
  const totalHumanMembers = Math.max(1, activeUserIds.length);

  // Computar votos emitidos por miembros humanos válidos conectados
  let approveCount = 0;
  let rejectCount = 0;

  for (const [userId, decision] of Object.entries(state.votes)) {
    if (activeSet.has(userId)) {
      if (decision === 'approve') approveCount++;
      else if (decision === 'reject') rejectCount++;
    }
  }

  const totalVotesCast = approveCount + rejectCount;
  const pendingVotes = Math.max(0, totalHumanMembers - totalVotesCast);
  const absoluteMajority = Math.floor(totalHumanMembers / 2) + 1;

  // 1. Cierre anticipado: Mayoría absoluta irreversible
  if (approveCount >= absoluteMajority) {
    return { ...state, status: 'approved' };
  }
  if (rejectCount >= absoluteMajority) {
    return { ...state, status: 'rejected' };
  }

  // 2. Cierre anticipado: Todos los miembros conectados han votado
  if (pendingVotes === 0) {
    if (approveCount > rejectCount) {
      return { ...state, status: 'approved' };
    }
    if (rejectCount > approveCount) {
      return { ...state, status: 'rejected' };
    }

    // Empate con 100% de participación
    if (!state.isOvertime) {
      return {
        ...state,
        status: 'overtime',
        isOvertime: true,
        expiresAt: currentTime + OVERTIME_DURATION_MS,
      };
    } else {
      // Si persiste el empate en overtime y todos votaron, se rechaza por falta de mayoría
      return { ...state, status: 'rejected' };
    }
  }

  // 3. Evaluación de Timeout
  const hasExpired = currentTime >= state.expiresAt;
  if (hasExpired) {
    // Si vencieron los 3 minutos y nadie votó (cero votos) -> Rechazo automático por inactividad
    if (totalVotesCast === 0) {
      return { ...state, status: 'expired_rejected' };
    }

    if (approveCount > rejectCount) {
      return { ...state, status: 'approved' };
    }
    if (rejectCount > approveCount) {
      return { ...state, status: 'rejected' };
    }

    // Empate al cumplirse el tiempo límite
    if (!state.isOvertime) {
      return {
        ...state,
        status: 'overtime',
        isOvertime: true,
        expiresAt: state.expiresAt + OVERTIME_DURATION_MS,
      };
    } else {
      // Empate persistente al agotar la prórroga de 1 minuto -> Rechazo
      return { ...state, status: 'rejected' };
    }
  }

  // La votación continúa activa (o en prórroga)
  return state;
}

