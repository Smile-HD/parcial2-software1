# Propuesta: Paridad Total de Operaciones Core en la Capa de IA (Full Delta AI Parity)

## Intención

Actualmente, el motor de bajo nivel (`@app/core`) dispone de un metamodelo completo con 21 operaciones atómicas (`ClassDelta`, `MemberDelta`, `AssociationDelta`, `GeneralizationDelta`, `RealizationDelta`, `DependencyDelta`, `NaryAssociationDelta`, `BatchDelta`). Sin embargo, la capa semántica consumida por los modelos de lenguaje (`SemanticDomainModel` en `apps/api/src/domain-synthesizer.ts` y las instrucciones en `apps/api/src/chat.ts`) está incompleta: solo expone creación de clases/relaciones y eliminación básica.

Esta brecha causa degradaciones severas en producción (verificadas en el Informe de Estrés - Ronda 6 y reproducidas en vivo con Chrome DevTools en EC2):
1. **Degradación de "renombrar" a "crear" (S5)**: Ante el comando *"renombrá la clase Estudiante a Alumno"*, como el esquema semántico carece de la operación `rename`, el modelo se ve forzado a colocar `Alumno` en la lista `classes` como una nueva entidad, inventándole atributos al azar (`nombre`, `edad`) y conservando la clase original intacta.
2. **Imposibilidad de actualizar miembros o relaciones existentes**: La IA no puede modificar multiplicidades, visibilidades, métodos abstractos o interfaces de clases existentes sin destruir y recrear la entidad.
3. **Pérdida silenciosa de comandos con voseo rioplatense**: La compuerta de intención de modelado en `index.ts` utiliza límites de palabra ASCII (`\b`), lo que hace que verbos acentuados como `creá`, `borrá` o `agregá` no coincidan y se descarten silenciosamente si hay más de un participante en la sala.

Este cambio cierra completamente la brecha, otorgando paridad absoluta del 100% entre lo que el motor soporta y lo que la IA puede interpretar, sintetizar y proponer.

## Alcance

### Dentro del Alcance
- **Ampliación de `SemanticDomainModel` en `apps/api/src/domain-synthesizer.ts`**:
  - Incorporar soporte para `renames`: clases, atributos y métodos (`{ classes: [{ from, to }], attributes: [...], methods: [...] }`).
  - Incorporar soporte para `updates`:
    - Clases: modificación de `classKind` ('class' | 'interface') e `isAbstract`.
    - Miembros: edición de nombre, tipo, visibilidad, multiplicidad, métodos estáticos/derivados.
    - Asociaciones: actualización de multiplicidades (`sourceMultiplicity`, `targetMultiplicity`), roles, nombres y tipo de agregación.
    - Generalizaciones, Realizaciones y Dependencias: actualización de etiquetas/nombres.
    - Asociaciones N-arias: actualización de nombres y extremos participantes.
  - Extender `deletions`: soporte explícito para eliminar generalizaciones, realizaciones, dependencias y asociaciones n-arias.
  - Soporte de reposicionamiento explícito (`reposition`) en el esquema semántico.
- **Transformación a Deltas en `convertDomainModelToDeltas()`**:
  - Resolver nombres textuales a UUIDs de clases existentes en el diagrama actual.
  - Producir los deltas exactos correspondientes (`ClassDelta`, `MemberDelta`, `AssociationDelta`, etc.) agrupados en un `BatchDelta` atómico.
- **Actualización de Prompts y Catálogo en `apps/api/src/chat.ts`**:
  - Actualizar el catálogo de operaciones soportadas en los prompts del sistema en inglés y español.
  - Documentar ejemplos explícitos de `renames`, `updates` y `deletions` para que los LLMs conozcan la sintaxis precisa.
- **Corrección de Límite de Palabra Unicode en `apps/api/src/index.ts`**:
  - Reemplazar `\b` por patrones compatibles con caracteres acentuados latinos para que comandos como `creá`, `borrá`, `agregá`, `diseñá` activen la respuesta del bot sin depender de si el usuario está solo o en equipo.
- **Suite de Pruebas Automatizadas (TDD)**:
  - Pruebas unitarias de síntesis para cada operación en `domain-synthesizer.test.ts`.
  - Pruebas de integración de turnos conversacionales en `chat-turn.test.ts`.

### Fuera del Alcance
- Modificaciones en la base de datos PostgreSQL (el esquema de persistencia ya almacena deltas en formato JSONB).
- Cambios en el frontend React (las tarjetas de propuesta ya renderizan deltas mediante `ProposalCard`).

## Capacidades

### Nuevas Capacidades
- `full-delta-ai-parity`: Capacidad del agente Amongus para interpretar y proponer de forma atómica renombres de clases/atributos/métodos, actualizaciones de relaciones existentes y eliminaciones de cualquier elemento del diagrama UML sin degradación ni alucinación de clases sustitutas.
