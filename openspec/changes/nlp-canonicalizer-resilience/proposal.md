# Propuesta: Arquitectura Híbrida de Canonicalización NLP y Resiliencia Determinista

## Intención

Actualmente, las mutaciones solicitadas por el usuario sobre clases existentes (como agregar atributos o mutar relaciones entre clases del lienzo) dependen del modelo de lenguaje local (SLM en CPU como Qwen-2.5-Coder-1.5B/3B) para generar el JSON completo (`SemanticDomainModel`). En modelos pequeños esto genera:
1. **Fuga y copia ciega de ejemplos Few-Shot**: El LLM copia nombres de atributos de ejemplo del prompt del sistema (como `orderNumber:string` o `totalAmount:float`) e inventa entidades no solicitadas.
2. **Contaminación de historial entre canales**: El historial de mensajes en canales de grupo (`group`) se mezcla con turnos privados (`direct_bot`), arrastrando entidades y relaciones viejas (por ejemplo `Lector` en peticiones dirigidas a `Prestamo`).
3. **Fallas léxicas por tildes y typos**: Diferencias sutiles como `préstamo` vs `Prestamo` o `agrga` vs `agrega` causan que las búsquedas exactas no hagan match y degraden la respuesta.

Esta propuesta implementa una **Arquitectura Híbrida en 2 Etapas**:
- **Etapa 1 (NLP Canonicalizer)**: El modelo pequeño o el normalizador léxico se encarga exclusivamente de sanitizar el texto y extraer una intención canónica mínima (`ACCION: AGREGAR_ATRIBUTO`, `CLASE: Prestamo`, `ATRIBUTO: id:int`).
- **Etapa 2 (Motor Determinista de Grafo con Tolerancia a Fallos)**: El backend valida contra el diagrama en el lienzo usando fuzzy matching (distancia de Levenshtein $\le 2$ y substrings), normalización Unicode NFD sin acentos, y construye el `BatchDelta` exacto sin alucinaciones.

## Alcance

### Dentro del Alcance
- **Normalización e Insensibilidad a Tildes (Unicode NFD)**:
  - Crear e integrar `stripAccents()` en `adapters-ai` y `domain-synthesizer.ts`.
  - Tolerancia de mayúsculas/minúsculas y acentos en clases, atributos y nombres de relaciones.
- **Extractor Determinista de Atributos**:
  - Incorporar en `extractExplicitModelMutations()` la adición y modificación de atributos con mapeo estándar de tipos (`entero`/`int` -> `int`, `texto`/`string` -> `string`, `fecha`/`date` -> `date`, etc.).
- **Fuzzy Matching y Guardia Pedagógica de Clases Inexistentes**:
  - Resolver clases con distancia de edición Levenshtein $\le 2$.
  - Si una clase referenciada no existe y no tiene coincidencia cercana, retornar una advertencia pedagógica listando las clases disponibles y cómo crear la clase nueva.
- **Aislamiento Estricto de Canales de Chat**:
  - Aislar el contexto de turnos previos entre `group` y `direct_bot` en `apps/api/src/index.ts` y filtrar intervenciones no dirigidas al bot.
- **Blindaje del Prompt de Síntesis**:
  - Eliminar nombres de atributos de ejemplo (`orderNumber`, `totalAmount`) para evitar fugas en el SLM.

### Fuera del Alcance
- Modificación del esquema de base de datos PostgreSQL.
- Alteración de los componentes de renderizado de aristas en el canvas.

## Capacidades

### Nuevas Capacidades
- `nlp-canonicalizer-resilience`: Capacidad de interpretar solicitudes de mutación de clases, atributos y relaciones de forma 100% determinista, tolerante a typos, insensible a tildes y sin alucinación de atributos de ejemplo.

