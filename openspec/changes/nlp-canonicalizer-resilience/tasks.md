# Tareas: NLP Canonicalizer y Resiliencia Determinista

- [x] **1. Normalizador de Tildes y Coincidencia Difusa** <!-- id: 1 -->
  - [x] Implementar `stripAccents` en `packages/adapters-ai/src/normalizer.ts`.
  - [x] Implementar `findClosestClassName(input, existingClasses)` con distancia Levenshtein $\le 2$ en `adapters-ai`.
  - [x] Agregar pruebas unitarias en `normalizer.test.ts`.

- [x] **2. Extractor Determinista de Adición y Edición de Atributos** <!-- id: 2 -->
  - [x] Agregar reconocimiento de expresiones en español/inglés para agregar atributos a clases en `extractExplicitModelMutations()` en `apps/api/src/domain-synthesizer.ts`.
  - [x] Mapear tipos UML estándar (`int`, `string`, `boolean`, `date`, `float`).
  - [x] Retornar `updates.attributes` y generar `MemberDelta` mediante `expandSemanticDomainToDelta()`.

- [x] **3. Blindaje de Prompts y Aislamiento de Canales** <!-- id: 3 -->
  - [x] Eliminar atributos de ejemplo como `orderNumber` y `totalAmount` en el prompt del sistema de `domain-synthesizer.ts`.
  - [x] En `apps/api/src/index.ts`, aislar la consulta de `chatHistory` según el canal (`direct_bot` vs `group`), filtrando charlas de equipo irrelevantes para Amongus.

- [x] **4. Guardia Pedagógica de Entidades Inexistentes** <!-- id: 4 -->
  - [x] Conectar la guardia de clases inexistentes con sugerencia de clases más cercanas si la distancia es mayor a 2.
  - [x] Mensaje explicativo: *"No encontré la clase 'X'. Clases disponibles: ... Si querés crearla escribí: 'creá la clase X'"*.

- [x] **5. Verificación y Pruebas Integradas** <!-- id: 5 -->
  - [x] Test unitario para `"a la clase préstamo agregarle un id de tipo entero"` en `chat-turn.test.ts`.
  - [x] Test de insensibilidad a tildes (`"préstamo"` -> `"Prestamo"`).
  - [x] Test de aislamiento de canales de chat.
  - [x] Suite completa de pruebas pasando (139/139 en `adapters-ai`, 33/33 en `chat-turn.test.ts`, 25/25 en `domain-synthesizer.test.ts`).

