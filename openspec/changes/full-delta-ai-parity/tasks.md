# Tareas: Paridad Total de Operaciones Core en la Capa de IA

- [x] 1. Extensión de Tipos e Interfaces Semánticas
  - [x] 1.1 Definir `SemanticRenames` en `apps/api/src/domain-synthesizer.ts` (clases, atributos, métodos).
  - [x] 1.2 Definir `SemanticUpdates` (clases, atributos, métodos, asociaciones, generalizaciones, realizaciones, dependencias, n-arias y posiciones).
  - [x] 1.3 Ampliar `SemanticDeletions` con soporte para generalizaciones, realizaciones, dependencias y asociaciones n-arias.
  - [x] 1.4 Incorporar `renames`, `updates` y `reposition` al tipo `SemanticDomainModel`.

- [x] 2. Transformación Determinista a Deltas Core (`convertDomainModelToDeltas`)
  - [x] 2.1 Mapear `renames.classes` a `ClassDelta` con `op: 'rename'` y actualizar la tabla de símbolos de nombres en vuelo.
  - [x] 2.2 Mapear `updates.classes` a `ClassDelta` con `op: 'update'` (`classKind`, `isAbstract`).
  - [x] 2.3 Mapear `updates.positions` a `ClassDelta` con `op: 'reposition'`.
  - [x] 2.4 Mapear `updates.attributes` a `MemberDelta` con `op: 'editAttribute'`.
  - [x] 2.5 Mapear `updates.methods` a `MemberDelta` con `op: 'editMethod'`.
  - [x] 2.6 Mapear `updates.associations` a `AssociationDelta` con `op: 'updateMultiplicity'` y actualización de agregación y roles.
  - [x] 2.7 Mapear `updates.generalizations`, `realizations`, `dependencies` y `naryAssociations`.
  - [x] 2.8 Mapear eliminaciones extendidas en `deletions`.

- [x] 3. Actualización de Prompts y Catálogo del Asistente
  - [x] 3.1 Actualizar el catálogo de operaciones en `apps/api/src/chat.ts` (inglés y español) documentando `renames`, `updates` y `deletions`.
  - [x] 3.2 Añadir ejemplos de refactorización compuesta (renombrar + crear + borrar) en las instrucciones de modelado.

- [x] 4. Corrección de Detección de Intenciones con Tildes Latinas
  - [x] 4.1 Corregir `hasModelingIntent` en `apps/api/src/index.ts` para que no dependa de `\b` roto sobre vocales acentuadas (`creá`, `borrá`, `agregá`, `renombrá`).
  - [x] 4.2 Incorporar `renombr[aá]`, `modific[aá]`, `cambi[aá]` a la lista de verbos de modelado.

- [x] 5. Validación Automatizada y Verificación en Vivo
  - [x] 5.1 Escribir tests unitarios en `apps/api/src/domain-synthesizer.test.ts` cubriendo cada operación de renombrado y actualización.
  - [x] 5.2 Ejecutar suite de tests del workspace (`pnpm test`) y verificar que pasen en verde.
  - [ ] 5.3 Validar la refactorización compuesta en vivo contra la instancia desplegada.
