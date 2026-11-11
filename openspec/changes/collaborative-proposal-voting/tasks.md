# Tareas: Sistema Inteligente de Votación y Quórum para Propuestas

## Fase 1: Motor Matemático de Votación y Quórum (Puro / TDD)
- [x] 1.1 **Pruebas del Motor de Votos (`apps/web/src/chat/voting/votingEngine.test.ts`)**:
  - [x] 1.1.1 Caso: Cero votos al expirar 180s -> rechazo automático por inactividad.
  - [x] 1.1.2 Caso: Todos votaron -> resolución inmediata según mayoría.
  - [x] 1.1.3 Caso: Mayoría absoluta irreversible (ej. 3 A vs 0 R con N=5) -> resolución anticipada sin esperar al resto.
  - [x] 1.1.4 Caso: Resultado reversible (ej. 1 A vs 1 R con N=3) -> la votación permanece abierta esperando los votos determinantes.
  - [x] 1.1.5 Caso: Empate a los 180s -> transiciona a overtime de 60s.
  - [x] 1.1.6 Caso: Desconexión de usuario -> recalcula quórum y resuelve si la mayoría restante es definitiva.
  - [x] 1.1.7 Caso: Cambio de voto (flip de Rechazar a Aprobar) reevalúa el estado.
- [x] 1.2 **Implementación del Motor de Votos (`apps/web/src/chat/voting/votingEngine.ts`)**:
  - [x] 1.2.1 Implementar función `isPendingVoteDecisive(approveCount, rejectCount, totalUsers)`.
  - [x] 1.2.2 Implementar función `evaluateProposalResolution(voteState, activeUsers, currentTime)`.

## Fase 2: Componente Visual y Temporizador (`apps/web`)
- [x] 2.1 **Pruebas de Componente (`ProposalCard.voting.test.tsx`)**:
  - [x] 2.1.1 Renderizado de dos botones de votación ("Aprobar", "Rechazar") con contadores en tiempo real.
  - [x] 2.1.2 Visualización de la cuenta regresiva (180s / 60s en overtime).
  - [x] 2.1.3 Indicador de estado: "Esperando votos", "Voto decisivo pendiente", "Tiempo extra (Overtime)", "Aprobada por mayoría", "Rechazada".
- [x] 2.2 **Evolución de `ProposalCard.tsx`**:
  - [x] 2.2.1 Integrar `useProposalVoting` con el mapa CRDT compartido de Yjs.
  - [x] 2.2.2 Añadir barra de progreso visual de quórum (ej. 2 de 3 votos).
  - [x] 2.2.3 Aplicar automáticamente el `batchDelta` al lienzo cuando el estado transiciona a `approved`.

## Fase 3: Integración de Presencia y Quórum Dinámico
- [x] 3.1 **Pruebas de Integración con Awareness (`useProposalVoting.test.ts`)**:
  - [x] 3.1.1 Verificar que al desconectarse un par, $N$ disminuye y la propuesta se resuelve si se alcanzó el nuevo quórum.
  - [x] 3.1.2 Verificar que si queda un solo usuario, con su voto basta (1/1).
- [x] 3.2 **Implementación del Hook `useProposalVoting`**:
  - [x] 3.2.1 Suscripción a eventos de awareness de Yjs filtrando a la IA.
  - [x] 3.2.2 Suscripción al `Y.Map('proposal-votes')` para recibir votos remotos instantáneamente.

## Fase 4: Verificación Integral de la Suite
- [ ] 4.1 Ejecutar `pnpm -r test` asegurando cero regresiones en toda la suite.
- [ ] 4.2 Ejecutar `tsc --noEmit` para verificar tipos estrictos.

