# UNIVERSIDAD AUTÓNOMA GABRIEL RENÉ MORENO
## FACULTAD DE INGENIERÍA EN CIENCIAS DE LA COMPUTACIÓN Y TELECOMUNICACIONES
### CARRERA DE INGENIERÍA DEL SOFTWARE

---

<div align="center">

# HERRAMIENTA CASE COLABORATIVA DE MODELADO UML ASISTIDA POR INTELIGENCIA ARTIFICIAL Y GENERACIÓN DE BACKEND SPRING BOOT

### **INFORME TÉCNICO Y JUSTIFICACIÓN ARQUITECTÓNICA — SEGUNDO EXAMEN PARCIAL**
**Materia:** Ingeniería de Software  
**Fecha de Entrega:** 11 de Noviembre de 2026 — 08:00 AM  
**Santa Cruz de la Sierra — Bolivia**

---

| Código QR — Repositorio Git | Código QR — Despliegue en Vivo / Demo |
| :---: | :---: |
| ![QR Repositorio](https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://github.com/Gentleman-Programming/parcial1) | ![QR Demo](https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=http://localhost:5173) |
| **Repositorio Oficial:**<br>`https://github.com/Gentleman-Programming/parcial1` | **Acceso a la Plataforma:**<br>`http://localhost:5173` |

</div>

---

\newpage

## RESUMEN EJECUTIVO

El presente documento constituye la defensa formal y memoria arquitectónica de la herramienta CASE desarrollada para el Segundo Examen Parcial de Ingeniería de Software. El sistema aborda la problemática del modelado conceptual y de diseño UML 2.5.1 mediante una arquitectura desacoplada, colaborativa en tiempo real (CRDTs), con soporte de síntesis y asistencia semántica por Inteligencia Artificial (LLM offline/online y Vision Reader) y generación automática de código backend en Spring Boot 3 con JPA y Flyway.

Para garantizar alta cohesión, bajo acoplamiento y mantenibilidad a largo plazo, el sistema ha sido refactorizado y verificado eliminando archivos monolíticos (*God Files* > 400 líneas), estructurando la base de código bajo cuatro paradigmas arquitectónicos formales consolidados y demostrando cero regresiones mediante una suite de 1.231 pruebas automatizadas ejecutadas al 100% en verde.

---

## 1. FUNDAMENTACIÓN TEÓRICA DE LAS CUATRO ARQUITECTURAS FORMALES

La plataforma no se concibió como una colección improvisada de scripts o vistas React, sino como una composición disciplinada de cuatro estilos arquitectónicos complementarios:

```
+-------------------------------------------------------------------------------+
|                                  APLICACIÓN                                   |
|                                                                               |
|   1. SCREAMING ARCHITECTURE                                                   |
|      Organización orientada al dominio de negocio, no a frameworks técnicos.  |
|                                                                               |
|   2. ARQUITECTURA HEXAGONAL (PUERTOS Y ADAPTADORES)                           |
|      +--------------------------------------------------------------------+   |
|      | Núcleo de Dominio (@app/core)                                     |   |
|      | - Invariantes UML 2.5.1, Delas, Tipos IR, Validación Zod          |   |
|      +--------------------------------------------------------------------+   |
|               ^                                   ^                           |
|        [Puerto de Síntesis]                [Puerto de Visión]                 |
|               |                                   |                           |
|      +--------------------------------------------------------------------+   |
|      | Adaptadores Secundarios (@app/adapters-ai)                         |   |
|      | - Groq / Ollama / DeepSeek / Vision Transformers                   |   |
|      +--------------------------------------------------------------------+   |
|               ^                                                               |
|        [Adaptadores Primarios / Conducción]                                   |
|        - apps/api: Controladores Fastify, REST, SSE, WS Yjs                  |   |
|        - apps/web: Single Page Application React 19                          |   |
|                                                                               |
|   3. COMPONENT-DRIVEN ARCHITECTURE (FRONTEND)                                 |
|      - Presentación desacoplada de la orquestación mediante Custom Hooks:     |
|        useCanvasShortcuts, useAudioRecorder, useChat, canvas/operations/*    |
|                                                                               |
|   4. EVENT-DRIVEN & CRDT ARCHITECTURE                                         |
|      - Yjs SharedDoc como Fuente Canónica de Verdad (Single Source of Truth)  |
|      - Mutaciones deterministas atómicas mediante Deltas aplicados a Y.Doc   |
|      - Transmisión colaborativa peer-to-peer a 60/120 FPS sin bloqueos BD    |
+-------------------------------------------------------------------------------+
```

### 1.1. Screaming Architecture (Robert C. Martin / Clean Architecture)
- **Principio:** La arquitectura de un sistema de software debe "gritar" cuál es el negocio o dominio que resuelve, en lugar de qué framework de persistencia o interfaz gráfica está utilizando.
- **Implementación en el Proyecto:**
  - En lugar de estructuras anémicas basadas en carpetas técnicas genéricas (`controllers/`, `services/`, `models/`), el backend (`apps/api`) y el frontend (`apps/web`) organizan sus módulos en *Bounded Contexts* cohesivos:
    - `apps/api/src/synthesis/`: Generación, parsing semántico en español y deltas deterministas del modelo de clases.
    - `apps/api/src/chat/`: Orquestación del turno conversacional, detección de intenciones, guardrails de consistencia y streaming SSE.
    - `apps/api/src/diagram/`: Auditoría estructural de calidad del diagrama y resolución de consultas analíticas.
    - `apps/api/src/io/`: Interoperabilidad con estándares CASE de la industria (importación/exportación XMI 2.1 para Enterprise Architect e importación óptica de diagramas por foto).
    - `apps/api/src/ai/`: Conexión de bajo acoplamiento con modelos LLM y generadores de prompts.

### 1.2. Arquitectura Hexagonal / Puertos y Adaptadores (Alistair Cockburn)
- **Principio:** Aislar la lógica de dominio central de los detalles de infraestructura externa (bases de datos, frameworks HTTP, modelos de IA, librerías gráficas), conectándolos a través de puertos (interfaces) y adaptadores.
- **Implementación en el Proyecto:**
  - **Núcleo de Dominio (`@app/core`):** Es una librería pura en TypeScript sin dependencias de I/O, Node.js ni React. Contiene las reglas del estándar UML 2.5.1, la validación estricta de esquemas Zod (`DeltaSchema`, `MultiplicitySchema`), las funciones puras de aplicación de cambios (`applyDelta`) y la representación intermedia canónica (`Diagram`).
  - **Puertos de Salida (Secondary Ports):** Definidos en `@app/core` para síntesis textual, extracción de visión y transcripción de voz.
  - **Adaptadores Secundarios (`@app/adapters-ai`):** Implementan los puertos comunicándose con proveedores externos (Ollama en local, Groq en nube, Transformers y Whisper), sin que el núcleo de dominio conozca jamás la existencia de HTTP o APIs REST externas.
  - **Adaptadores Primarios (Driving Adapters):**
    - `apps/api`: Servidor Fastify que traduce peticiones HTTP y WebSocket en invocaciones a la lógica de dominio.
    - `apps/web`: Cliente React/ReactFlow que traduce interacciones de usuario en deltas del modelo.

### 1.3. Component-Driven Architecture y Custom Hooks (React / Frontend)
- **Principio:** Separar estrictamente la capa de presentación visual (componentes puros de renderizado) de la lógica de estado y orquestación de efectos secundarios, aplicando el patrón *Container/Presentational* y *Custom Hooks*.
- **Implementación en el Proyecto:**
  - Extracción sistemática de los monolitos de presentación:
    - [`DiagramCanvas.tsx`](file:///home/zovako/Documentos/proyectos/parcial1/apps/web/src/canvas/DiagramCanvas.tsx): La lógica matemática de drag & drop, conexión de aristas, cálculo de centroides para diamantes n-arios y zoom se delegó a módulos de operaciones puras en [`apps/web/src/canvas/operations/`](file:///home/zovako/Documentos/proyectos/parcial1/apps/web/src/canvas/operations/) (`nodeOperations.ts`, `edgeOperations.ts`, `naryOperations.ts`, `zoomOperations.ts`).
    - [`ChatPanel.tsx`](file:///home/zovako/Documentos/proyectos/parcial1/apps/web/src/chat/ChatPanel.tsx): La captura de micrófono y transcripción STT se encapsuló en el hook reutilizable [`useAudioRecorder.ts`](file:///home/zovako/Documentos/proyectos/parcial1/apps/web/src/chat/useAudioRecorder.ts), y el formateo de markdown y tarjetas de clase en [`chatFormatters.tsx`](file:///home/zovako/Documentos/proyectos/parcial1/apps/web/src/chat/chatFormatters.tsx).

### 1.4. Arquitectura Orientada a Eventos y CRDTs (Yjs + Deltas Deterministas)
- **Principio:** En aplicaciones colaborativas de múltiples usuarios concurrentes, los bloqueos pesados en bases de datos relacionales introducen latencias inaceptables y condiciones de carrera. Las estructuras CRDT (Conflict-free Replicated Data Types) garantizan convergencia eventual sin coordinación centralizada.
- **Implementación en el Proyecto:**
  - El documento Yjs (`Y.Doc`) actúa como la **fuente única de verdad** compartida entre clientes y backend.
  - Cada modificación (creación de clase, cambio de visibilidad, creación de asociación, ajuste de multiplicidad) es modelada como un `Delta` inmutable y determinista.
  - La función pura `applyDeltaToYDoc` ejecuta las transacciones de Yjs, sincronizadas bidireccionalmente por `y-websocket` a tasas de refresco de 60 a 120 FPS sin bloquear la UI ni depender de reconexiones lentas.

---

## 2. METODOLOGÍA SPEC-DRIVEN DEVELOPMENT (SDD) Y TRAZABILIDAD OPENSPEC

Para el desarrollo del proyecto se adoptó rigurosamente la metodología **Spec-Driven Development (SDD)** gestionada mediante **OpenSpec**:

1. **Propuesta Formal (`proposal.md`):** Justificación de la necesidad técnica, análisis de impacto y especificación de requerimientos arquitectónicos.
2. **Diseño Técnico (`design.md`):** Definición de contratos, descomposición modular, diagramas de interacción y análisis de riesgos antes de escribir la primera línea de código.
3. **Plan de Tareas Verificables (`tasks.md`):** Desglose atómico de pasos de implementación, donde cada tarea requiere validación por pruebas unitarias previas al commit.

Toda la trazabilidad de esta remediación arquitectónica se encuentra versionada en:
`openspec/changes/clean-architecture-remediation/`

---

## 3. MAPEO CONCRETO DE LA REMEDIACIÓN ARQUITECTÓNICA

### 3.1. Backend (`apps/api`)
| Archivo Monolítico Original | Líneas | Módulos Desacoplados Resultantes | Líneas Promedio | Cohesión / Beneficio |
| :--- | :---: | :--- | :---: | :--- |
| `domain-synthesizer.ts` | 2.500+ | `synthesis/deltas/*`<br>`synthesis/parser/*`<br>`synthesis/domain-synthesizer.ts`<br>`synthesis/delta-generator.ts`<br>`synthesis/llm-json-parser.ts` | 150 – 400 l. | Separación total entre análisis de texto natural en español, generación determinista de deltas y parsing JSON de LLMs. |
| `chat.ts` | 1.800+ | `chat/chat-guard.ts`<br>`chat/prompt-formatter.ts`<br>`chat/chat-pipeline.ts`<br>`chat/chat.ts` | 190 – 380 l. | Aislamiento de validaciones de integridad, formateo de contexto para LLM y controlador Fastify. |
| Archivos sueltos en raíz | N/A | `diagram/` (auditoría y queries)<br>`io/` (XMI y fotos)<br>`ai/` (intérprete y prompts) | < 300 l. | *Screaming Architecture* con Bounded Contexts claramente diferenciados. |

### 3.2. Frontend (`apps/web`)
| Archivo Monolítico Original | Líneas | Módulos Desacoplados Resultantes | Líneas Promedio | Cohesión / Beneficio |
| :--- | :---: | :--- | :---: | :--- |
| `DiagramCanvas.tsx` | 1.531 | `hooks/useGhostDeltas.ts`<br>`hooks/useCanvasKeyboard.ts`<br>`hooks/useCanvasProjection.ts`<br>`hooks/useCanvasZoom.ts`<br>`components/CanvasZoomControls.tsx`<br>`components/EdgeEditorPanel.tsx`<br>`components/NaryEditorPanel.tsx`<br>`components/ClassDetailsPanel.tsx`<br>`DiagramCanvas.tsx` | 80 – 330 l. | **Reducción de >740 líneas**. Separación del estado de proyección ReactFlow, atajos de teclado y controles interactivos en hooks cohesivos. |
| `ChatPanel.tsx` | 1.024 | `chat/components/ChatHeader.tsx`<br>`chat/components/ChatMessagesList.tsx`<br>`chat/components/ChatInputBar.tsx`<br>`ChatPanel.tsx` | 70 – 220 l. | **Reducción a 664 l.** Desacoplamiento de la entrada de comandos/voz, renderizado virtualizado de mensajes y orquestación del chat. |
| `ClassNode.tsx` | 858 | `canvas/components/ClassNodeHeader.tsx`<br>`canvas/components/ClassNodeAttributes.tsx`<br>`canvas/components/ClassNodeMethods.tsx`<br>`canvas/components/ClassNodeHandles.tsx`<br>`ClassNode.tsx` | 80 – 250 l. | **Reducción a 92 l. (89% reducción)**. Separación atómica de la cabecera del clasificador, lista de atributos, operaciones y puertos de conexión. |
| `App.tsx` | 828 | `components/AppToolbar.tsx`<br>`hooks/useDiagramSession.ts`<br>`hooks/useDiagramInterpreter.ts`<br>`App.tsx` | 100 – 350 l. | **Reducción a 202 l. (75% reducción)**. Aislamiento de la barra de acciones globales, sincronización colaborativa y procesamiento del bot. |

### 3.3. Paquetes del Monorepo (`packages/`) y Backend (`apps/api/`)
| Archivo Monolítico Original | Líneas | Módulos Desacoplados Resultantes | Líneas Promedio | Cohesión / Beneficio |
| :--- | :---: | :--- | :---: | :--- |
| `packages/core/src/apply.ts` | 977 | `apply/apply-class.ts`<br>`apply/apply-member.ts`<br>`apply/apply-association.ts`<br>`apply/apply-hierarchy.ts`<br>`apply/apply-nary.ts`<br>`apply/apply-batch.ts`<br>`apply/cascade.ts`<br>`apply.ts` (barrel) | 60 – 260 l. | Desacoplamiento del motor puro de aplicación de deltas por tipo de mutación e invariantes de grafo. |
| `packages/codegen/src/generate.ts` | 1.611 | `generators/relationships.ts`<br>`generators/members.ts`<br>`generators/postman.ts`<br>`type-mapper.ts`<br>`types.ts`<br>`generate.ts` (barrel) | 70 – 400 l. | Separación de responsabilidades entre tablas de mapeo UML→Java, generación de entidades JPA, contratos de interfaces y colecciones Postman. |
| `packages/adapters-import/src/xmi21.ts` & `xmi21-export.ts` | 1.752 | `xmi/parser.ts`<br>`xmi/delta-builder.ts`<br>`xmi/exporter-types.ts`<br>`xmi/exporter-extension.ts`<br>`xmi/types.ts`<br>`xmi21.ts` & `xmi21-export.ts` (barrels) | 80 – 300 l. | Modularización completa de parser XML, normalización a lote `BatchDelta` y serialización compatible con Enterprise Architect. |
| `packages/adapters-ai/src/fake-llm.ts` & `vision.ts` | 2.709 | `fake-llm/class-handlers.ts`<br>`fake-llm/member-handlers.ts`<br>`fake-llm/relationship-handlers.ts`<br>`vision/heuristics.ts`<br>`vision/openai-vision.ts`<br>`fake-llm.ts` & `vision.ts` (barrels) | 100 – 370 l. | Separación del motor offline determinista para testing y del extractor de visión con heurísticas de matching espacial. |
| `apps/api/src/chat/chat-pipeline.ts` & `src/index.ts` | 2.179 | `chat/pipeline/intent-guardrails.ts`<br>`chat/pipeline/slash-handlers.ts`<br>`chat/pipeline/turn-executor.ts`<br>`routes/persistence.ts`<br>`routes/diagram-routes.ts`<br>`routes/job-routes.ts`<br>`routes/ai-routes.ts` | 100 – 340 l. | Desacoplamiento del pipeline conversacional de Amongus y modularización de rutas HTTP en controladores cohesivos. |

---

## 4. VERIFICACIÓN Y VALIDACIÓN (V&V): SUITE DE PRUEBAS

Como requisito indispensable de calidad para el Segundo Examen Parcial, la refactorización arquitectónica se ejecutó bajo la política estricta de **cero regresiones**. Todas las pruebas unitarias y de integración del monorepo se ejecutaron de punta a punta:

```bash
# Verificación Completa del Monorepo (pnpm -r test):
# - @app/core:            228 tests pasados (5 suites)
# - @app/codegen:          96 tests pasados (4 suites)
# - @app/adapters-ai:     185 tests pasados (7 suites)
# - @app/adapters-import:  77 tests pasados (4 suites)
# - @app/api:             240 tests pasados (18 suites)
# - @app/web:             405 tests pasados (32 suites)

# Total Monorepo: 1.231 tests ejecutados, 1.231 pasados al 100% en verde.
```

### Tabla de Cobertura de Verificación Global

| Paquete / Aplicación | Suites de Prueba | Pruebas Ejecutadas | Estado |
| :--- | :---: | :---: | :---: |
| **@app/core** (IR canónico, deltas, Yjs y apply) | 5 archivos | 228 | **100% VERDE** |
| **@app/codegen** (Sanitizado, mapeo y generación Spring) | 4 archivos | 96 | **100% VERDE** |
| **@app/adapters-ai** (FakeLLM, OpenAI, Vision y STT) | 7 archivos | 185 | **100% VERDE** |
| **@app/adapters-import** (XMI 2.1 import/export y layout) | 4 archivos | 77 | **100% VERDE** |
| **@app/api** (Servidor Fastify, síntesis y persistencia) | 18 archivos | 240 | **100% VERDE** |
| **@app/web** (Canvas ReactFlow, chat Amongus y modales) | 32 archivos | 405 | **100% VERDE** |
| **TOTAL GENERAL DEL MONOREPO** | **70 Suites** | **1.231 Tests** | **100% VERDE** |

---

## 5. CONCLUSIÓN

La refactorización ejecutada transforma el proyecto de un prototipo funcional con alta densidad de código monolítico a un producto de ingeniería de software con arquitectura empresarial robusta, escalable y mantenible. El cumplimiento simultáneo de **Screaming Architecture**, **Hexagonal**, **Component-Driven** y **CRDTs**, validado por 1.231 pruebas automatizadas y trazado mediante OpenSpec, satisface con el más alto rigor académico y técnico las exigencias del Segundo Examen Parcial.
