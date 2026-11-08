# Tareas: Remediación Arquitectónica y Desacoplamiento

## Fase 1: Modularización y Screaming Architecture en `apps/api`
- [x] 1.1 Extraer el generador de deltas determinista a `delta-generator.ts` (reducción de 2.028 líneas en `domain-synthesizer.ts`).
- [x] 1.2 Extraer el parser de intenciones y regexes de lenguaje natural a `text-intent-parser.ts`.
- [x] 1.3 Extraer el reparador y parser de JSON de LLM a `llm-json-parser.ts`.
- [ ] 1.4 Crear la estructura de carpetas `apps/api/src/synthesis/`:
  - [ ] 1.4.1 Mover `domain-synthesizer.ts`, `delta-generator.ts`, `text-intent-parser.ts`, `llm-json-parser.ts` y `domain-catalog/` a `synthesis/`.
  - [ ] 1.4.2 Crear submódulo `synthesis/deltas/` dividiendo `delta-generator.ts` en `delta-classes.ts`, `delta-relations.ts`, `delta-hierarchy.ts` y `delta-layout.ts`.
  - [ ] 1.4.3 Crear submódulo `synthesis/parser/` dividiendo `text-intent-parser.ts` en `parse-class-commands.ts`, `parse-relation-commands.ts`, `parse-member-commands.ts` y `spanish-synonyms.ts`.
  - [ ] 1.4.4 Establecer barrel export en `apps/api/src/domain-synthesizer.ts` para retrocompatibilidad total.
  - [ ] 1.4.5 Verificar que los 55 tests de `domain-synthesizer.test.ts` pasen en verde.
- [ ] 1.5 Modularizar `apps/api/src/chat/`:
  - [ ] 1.5.1 Crear directorio `apps/api/src/chat/`.
  - [ ] 1.5.2 Extraer `chat-guards.ts` (detección temprana de presencia, borrado inválido, contradicciones) y `prompt-formatter.ts`.
  - [ ] 1.5.3 Extraer `chat-pipeline.ts` para orquestar `processUnifiedAmongusTurn`.
  - [ ] 1.5.4 Reducir `chat.ts` a controlador HTTP Fastify (< 250 líneas).
  - [ ] 1.5.5 Verificar que los tests de chat y guardrails pasen en verde.
- [ ] 1.6 Agrupar los módulos restantes en `diagram/`, `io/` y `ai/`:
  - [ ] 1.6.1 Mover auditor y query resolver a `diagram/`.
  - [ ] 1.6.2 Mover importadores XMI y foto a `io/`.
  - [ ] 1.6.3 Mover intérprete y prompt builder a `ai/`.
  - [ ] 1.6.4 Verificar que los 285 tests unitarios pasen al 100%.

## Fase 2: Descomposición de Monolitos en `apps/web`
- [ ] 2.1 Descomponer `DiagramCanvas.tsx` (2.919 líneas):
  - [ ] 2.1.1 Extraer `useCanvasShortcuts.ts` para eventos globales de teclado y zoom.
  - [ ] 2.1.2 Extraer `usePaletteDnD.ts` para la lógica de arrastre de herramientas UML.
  - [ ] 2.1.3 Extraer `useQuickLinker.ts` para conectores y menús contextuales.
  - [ ] 2.1.4 Extraer `useCollabCursors.ts` para sincronización de cursores remotos Yjs.
  - [ ] 2.1.5 Reducir `DiagramCanvas.tsx` a un contenedor de layout visual (< 400 líneas).
  - [ ] 2.1.6 Ejecutar tests del canvas en verde.
- [ ] 2.2 Descomponer `ChatPanel.tsx` (1.444 líneas):
  - [ ] 2.2.1 Extraer `ProposalCard.tsx` para visualización y confirmación de deltas del bot.
  - [ ] 2.2.2 Extraer `useAudioRecorder.ts` para captura de audio y envío a STT.
  - [ ] 2.2.3 Reducir `ChatPanel.tsx` a menos de 300 líneas.
  - [ ] 2.2.4 Ejecutar tests del chat frontend en verde.

## Fase 3: Verificación, Validación (V&V) y Documentación Académica
- [ ] 3.1 Ejecutar suite completa de tests de punta a punta (`pnpm test`).
- [ ] 3.2 Documentar la trazabilidad SDD y las 4 arquitecturas formales para el informe del 2do Parcial.
- [ ] 3.3 Commit y cierre de la especificación en OpenSpec.

