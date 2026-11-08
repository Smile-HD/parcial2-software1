# Propuesta: Remediación Arquitectónica y Desacoplamiento Modular del Monorepo

## Intención

El proyecto ha experimentado un crecimiento acelerado a través de múltiples iteraciones sucesivas, acumulando complejidad accidental y concentrando responsabilidades en componentes y módulos monolíticos (*God Files*):
1. **Backend (`domain-synthesizer.ts` y `chat.ts`)**: Archivos de más de 4.300 y 1.600 líneas que combinaban transporte HTTP, lógica de persistencia, NLP artesanal con regexes y generación determinista de grafos UML.
2. **Frontend (`DiagramCanvas.tsx` y `ChatPanel.tsx`)**: Componentes de React de casi 3.000 líneas que mezclaban renderizado de lienzo, atajos de teclado, menús contextuales, arrastre de herramientas (DnD) y sincronización colaborativa Yjs.
3. **Falta de Screaming Architecture**: Más de 30 archivos ubicados de forma plana en la raíz de `apps/api/src`.

Esta propuesta formaliza la **remediación arquitectónica integral del monorepo**, dividiendo los monolitos en submódulos especializados donde **ningún archivo supere las 300–400 líneas**, estructurados por dominios de negocio y asegurando **cero regresiones** a través de la red de 285 pruebas automatizadas.

## Alcance

### Dentro del Alcance
- **Backend (`apps/api`)**:
  - Reestructuración bajo *Screaming Architecture*: creación de carpetas temáticas (`synthesis/`, `chat/`, `diagram/`, `io/`, `ai/`).
  - Despiece de `domain-synthesizer.ts` en `deltas/` (generación matemática pura de `BatchDelta`) y `parser/` (heurísticas e intenciones de lenguaje natural).
  - Despiece de `chat.ts` en `chat.ts` (controlador Fastify), `chat-pipeline.ts` (orquestador del turno Amongus) y `chat-guards.ts` (guardrails tempranos y anti-jailbreak).
  - Mantenimiento de barrel exports (`index.ts`) para preservar compatibilidad con código existente.
- **Frontend (`apps/web`)**:
  - Descomposición de `DiagramCanvas.tsx` en Custom Hooks reutilizables (`useCanvasShortcuts`, `usePaletteDnD`, `useQuickLinker`, `useCollabCursors`).
  - Descomposición de `ChatPanel.tsx` extrayendo `ProposalCard.tsx` y `useAudioRecorder.ts`.
- **Garantía y Calidad (V&V)**:
  - Ejecución continua de la suite de pruebas unitarias y de integración (285 tests en verde en cada fase).

### Fuera del Alcance
- Modificación del metamodelo central (`@app/core/src/ir.ts` y delta schema).
- Alteración del protocolo de comunicación WebSocket o de la base de datos PostgreSQL.

## Plan de Rollback (Mitigación de Riesgos)
- Todo el trabajo se ejecuta en la rama aislada `refactor/clean-architecture-and-docs`.
- En caso de regresión o fallo no mitigable, se ejecuta un rollback atómico vía Git (`git checkout main`).
- Cada etapa se consolida mediante commits convencionales independientes solo tras verificar el 100% de tests en verde.

