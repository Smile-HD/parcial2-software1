# Tareas: Remediación Arquitectónica y Desacoplamiento

## Fase 1: Modularización y Screaming Architecture en `apps/api`
- [x] 1.1 Extraer el generador de deltas determinista a `delta-generator.ts` (reducción de 2.028 líneas en `domain-synthesizer.ts`).
- [x] 1.2 Extraer el parser de intenciones y regexes de lenguaje natural a `text-intent-parser.ts`.
- [x] 1.3 Extraer el reparador y parser de JSON de LLM a `llm-json-parser.ts`.
- [x] 1.4 Crear la estructura de carpetas `apps/api/src/synthesis/`:
  - [x] 1.4.1 Mover `domain-synthesizer.ts`, `delta-generator.ts`, `text-intent-parser.ts`, `llm-json-parser.ts` y `domain-catalog/` a `synthesis/`.
  - [x] 1.4.2 Crear submódulo `synthesis/deltas/` dividiendo `delta-generator.ts` en `delta-classes.ts`, `delta-class-updates.ts`, `delta-relations.ts`, `delta-hierarchy.ts` y `delta-deletions.ts`.
  - [x] 1.4.3 Crear submódulo `synthesis/parser/` dividiendo `text-intent-parser.ts` en `class-commands.ts`, `delete-commands.ts`, `member-fast-commands.ts`, `member-full-commands.ts`, `relation-structural-commands.ts`, `relation-mutation-commands.ts` y `spanish-synonyms.ts`.
  - [x] 1.4.4 Establecer barrel export en `apps/api/src/domain-synthesizer.ts` para retrocompatibilidad total.
  - [x] 1.4.5 Verificar que los 55 tests de `domain-synthesizer.test.ts` pasen en verde.
- [x] 1.5 Modularizar `apps/api/src/chat/`:
  - [x] 1.5.1 Crear directorio `apps/api/src/chat/`.
  - [x] 1.5.2 Extraer `chat-guard.ts` (detección temprana de presencia, borrado inválido, contradicciones) y `prompt-formatter.ts`.
  - [x] 1.5.3 Extraer `chat-pipeline.ts` para orquestar `processUnifiedAmongusTurn`.
  - [x] 1.5.4 Reducir `chat.ts` a controlador HTTP Fastify (< 250 líneas).
  - [x] 1.5.5 Verificar que los tests de chat y guardrails pasen en verde.
- [x] 1.6 Agrupar los módulos restantes en `diagram/`, `io/` y `ai/`:
  - [x] 1.6.1 Mover auditor y query resolver a `diagram/`.
  - [x] 1.6.2 Mover importadores XMI y foto a `io/`.
  - [x] 1.6.3 Mover intérprete y prompt builder a `ai/`.
  - [x] 1.6.4 Verificar que los 146 tests unitarios de la API pasen al 100%.

## Fase 2: Descomposición de Monolitos en `apps/web`
- [x] 2.1 Descomponer operaciones de `DiagramCanvas.tsx` en `apps/web/src/canvas/operations/`:
  - [x] 2.1.1 Extraer `nodeOperations.ts` (`handleNodeDragStop`, `handlePaletteDrop`, `handleSetAbstract`, `nextFreeClassName`).
  - [x] 2.1.2 Extraer `edgeOperations.ts` (`handleCreateAssociation`, `handleConnectWithTool`, `getOptimalHandles`, etc.).
  - [x] 2.1.3 Extraer `naryOperations.ts` (`computeNaryCentroid`, `handleCreateNaryAssociation`, `handleUpdateNaryAssociation`, etc.).
  - [x] 2.1.4 Extraer `zoomOperations.ts` (`computeNextZoom`).
  - [x] 2.1.5 Configurar `index.ts` con re-exportaciones de retrocompatibilidad en `DiagramCanvas.tsx` (reducción de 820 líneas).
  - [x] 2.1.6 Ejecutar tests del canvas en verde (158/158 tests unitarios pasados).
- [x] 2.2 Descomponer `ChatPanel.tsx`:
  - [x] 2.2.1 Extraer componentes `ClassDetailsPanel.tsx`, `EdgeEditorPanel.tsx`, `NaryEditorPanel.tsx`.
  - [x] 2.2.2 Extraer `chatFormatters.tsx` (`renderStreamingContent`, `parseInlineMarkdown`, `renderFormattedContent`).
  - [x] 2.2.3 Extraer `useAudioRecorder.ts` para captura de audio por Web Speech API y Groq Whisper STT.
  - [x] 2.2.4 Extraer `useSlashCommands.ts` y `ChatMessageItem.tsx`.
  - [x] 2.2.5 Ejecutar tests del chat frontend en verde (17/17 tests unitarios pasados).

## Fase 3: Modularización de God Files en `packages/`
- [x] 3.1 Modularizar `packages/core/src/apply.ts` (977 l.) en `packages/core/src/apply/`:
  - [x] 3.1.1 Extraer `apply-class.ts`, `apply-member.ts`, `apply-association.ts`, `apply-hierarchy.ts`, `apply-nary.ts`, `apply-batch.ts`, `cascade.ts` y `types.ts`.
  - [x] 3.1.2 Establecer `packages/core/src/apply.ts` como barrel export.
  - [x] 3.1.3 Verificar 228/228 tests de `@app/core` en verde.
- [x] 3.2 Modularizar `packages/codegen/src/generate.ts` (1.611 l.) en `packages/codegen/src/generators/`:
  - [x] 3.2.1 Extraer `generators/members.ts`, `generators/relationships.ts`, `generators/postman.ts`, `type-mapper.ts` y `types.ts`.
  - [x] 3.2.2 Reducir `generate.ts` a orquestador puro.
  - [x] 3.2.3 Verificar 96/96 tests de `@app/codegen` en verde.
- [x] 3.3 Modularizar `packages/adapters-ai/src/index.ts` (1.975 l.):
  - [x] 3.3.1 Extraer `fake-llm.ts` (intérprete offline) y `openai-llm.ts` (cliente productivo).
  - [x] 3.3.2 Reducir `index.ts` a barrel export.
  - [x] 3.3.3 Verificar 185/185 tests de `@app/adapters-ai` en verde.

## Fase 4: Verificación Global (V&V) y Documentación Académica
- [x] 4.1 Ejecutar suite completa de tests de punta a punta en todo el monorepo (1.231 tests en verde en 70 suites).
- [x] 4.2 Documentar la trazabilidad SDD y las 4 arquitecturas formales para el informe del 2do Parcial en `docs/INFORME_PARCIAL_2_ARQUITECTURAS.md` con carátula formal APA 7 y códigos QR.
- [x] 4.3 Commit y cierre de la especificación en OpenSpec.
