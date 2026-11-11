# Propuesta: Puerta de Enlace Cognitiva de Entrada con Qwen 27B (Kaggle) y Diálogo de Ambigüedades

## Intención

Actualmente el sistema cuenta con un pipeline en dos etapas rígidas:
1. Un preprocesador Ingress rápido con Groq que traduce lenguaje coloquial a comandos imperativos DSL separados por punto y coma (`;`).
2. Una degradación local a un modelo pequeño (SLM 1.5B en CPU) o reglas deterministas por regex (`FakeLlm`) cuando Groq no resuelve.

Este enfoque se diseñó para sortear las limitaciones de hardware modesto en CPU. Sin embargo, al incorporar el entorno de GPU remota en Kaggle (2x Nvidia Tesla T4 con 30 GB de VRAM) ejecutando **Qwen 3.8 / Qwen 2.5 27B**, el sistema adquiere suficiente capacidad de razonamiento para unificar la comprensión semántica, la gestión de ambigüedades y la generación de propuestas de diseño UML sin depender de validadores sintácticos rígidos.

Esta propuesta introduce una **Capa Extra No Intrusiva (Puerta de Enlace Cognitiva de Entrada)**:
- Toda solicitud al asistente Amongus pasa prioritariamente por el modelo 27B alojado en Kaggle.
- El modelo cuenta con un **System Prompt de Arquitecto Copiloto** que le otorga autonomía:
  - **Manejo de ambigüedades sin rechazo estricto**: Si una instrucción de mutación no es clara o tiene múltiples interpretaciones, el modelo no falla ni inventa a ciegas; le hace saber la duda al usuario en lenguaje natural y pide aclaración.
  - **Comprensión contextual de comandos slash**: Reconoce e interpreta `/model`, `/suggest`, `/audit`, `/help` y consultas directas sobre el lienzo.
  - **Emisión bimodal**: Explica conceptualmente su razonamiento en lenguaje humano y, cuando corresponde modificar el diagrama, anexa el bloque JSON del metamodelo UML.
- **Tolerancia a fallos y fallback transparente**: Si el endpoint de Kaggle está inactivo, da timeout o pierde conectividad con el túnel, la solicitud cae limpiamente en el pipeline existente (Groq Ingress o motor local determinista) sin romper la experiencia del usuario.

## Alcance

### Dentro del Alcance
- **Configuración de Endpoints Remotos**: Soporte parametrizado para `KAGGLE_BASE_URL` / `OPENAI_BASE_URL` en `@app/adapters-ai` y `apps/api`.
- **System Prompt de Arquitecto Unificado**: Definición del prompt para Qwen 27B con soporte de ambigüedad, pautas conversacionales, catálogo de comandos slash y formato de mutación JSON.
- **Ruta Prioritaria con Fallback Transparente**: Integración en `apps/api/src/routes/ai-routes.ts` que intenta primero la inferencia con Kaggle y, ante error o timeout, deriva al flujo tradicional.
- **Parser de Respuesta Bimodal**: Extracción y separación limpia del texto explicativo para el chat y del bloque JSON para la generación de deltas inmutables (`BatchDelta`).

### Fuera del Alcance
- Modificación de la base de datos PostgreSQL.
- Alteración de los componentes de renderizado de React Flow en el frontend.
- Eliminación o deprecación del motor determinista local (`FakeLlm`), el cual se preserva como capa de contingencia offline.

## Capacidades

### Nuevas Capacidades
- `kaggle-cognitive-gateway`: Capacidad de procesar consultas y órdenes de modelado mediante un modelo 27B remoto con GPU, resolviendo ambigüedades mediante diálogo y emitiendo propuestas visuales en JSON con fallback de alta disponibilidad.

