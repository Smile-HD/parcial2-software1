# Diseño Técnico: Puerta de Enlace Cognitiva con Qwen 27B y Resiliencia con Fallback

## 1. Contexto Arquitectónico

El sistema actual opera bajo los principios de Arquitectura Hexagonal (Puertos y Adaptadores). El puerto `LlmPort` es consumido por los casos de uso del asistente conversacional Amongus y el pipeline de mutaciones.

```text
                                [ Petición del Usuario ]
                                           │
                                           ▼
                       ┌───────────────────────────────────────┐
                       │   Capa 0: Puerta de Enlace Cognitiva   │
                       │          (Qwen 27B en Kaggle)         │
                       └───────────────────┬───────────────────┘
                                           │
                        ¿Responde con éxito en <= 8s?
                                    ├── SÍ ──► [ Extraer Texto Conversacional ]
                                    │          [ Extraer JSON -> BatchDelta    ]
                                    │          [ Retornar Propuesta al Canvas  ]
                                    │
                                    └── NO (Error / Timeout / Inactivo)
                                           │
                                           ▼ (Fallback Automático)
                       ┌───────────────────────────────────────┐
                       │     Capa 1: Ingress Gateway (Groq)    │
                       └───────────────────┬───────────────────┘
                                           │
                       ┌───────────────────┴───────────────────┐
                       │   Capa 2: Motor Determinista / Fallback │
                       │           (FakeLlm + Guardrails)      │
                       └───────────────────────────────────────┘
```

## 2. Decisiones de Diseño

### 2.1. System Prompt Bimodal de Arquitecto (Qwen 27B)
El prompt se define en `apps/api/src/ai/prompt-builder.ts` bajo la función `buildKaggleArchitectPrompt(options)`.

Principios rectores del prompt:
1. **Identidad**: Amongus, copiloto y arquitecto senior de software UML.
2. **Tratamiento de Ambigüedad**: Si la orden de mutación carece de multiplicidades obvias, nombres de atributos claros o contexto suficiente, el modelo:
   - Explica brevemente qué interpretó.
   - Detalla las dudas o alternativas posibles.
   - Pide al usuario que elija la opción adecuada (o emite una propuesta tentativa advirtiendo la asunción).
3. **Catálogo de Comandos**:
   - `/model <tema>`: Diseña un modelo limpio con 3 a 5 clases núcleo.
   - `/suggest`: Recomienda hasta 3 entidades que pertenezcan estrictamente al mismo dominio del lienzo actual.
   - `/audit`: Evalúa principios OOAD (acoplamiento, clases huérfanas, cohesión) en lenguaje pedagógico sin forzar JSON.
   - `/help`, `/context`, `/reset`: Responde en lenguaje natural aclarando el estado del sistema.
4. **Formato Bimodal de Salida**:
   - Conversación y pedagogía en texto fluido.
   - Bloque final delimitado por ````json ... ```` únicamente cuando existan mutaciones, creaciones o eliminaciones que reflejar en el lienzo.

### 2.2. Manejo de Respuesta y Parseo en `TurnExecutor`
- Se reutiliza la función `robustParseDomainJson(raw)` y `expandSemanticDomainToDelta(model, diagramId, diagram, userContent)`.
- El texto fuera del bloque JSON se extrae con `clean.replace(/```(?:json)?[\s\S]*?```/gi, '').trim()` y se envía como el mensaje del asistente en el chat.
- El bloque JSON genera un `batchDelta` que se registra en `pendingDeltas`, permitiendo previsualizar los elementos fantasma en el canvas y confirmarlos en vivo.

### 2.3. Resiliencia y Fallback Transparente
En `apps/api/src/routes/ai-routes.ts`:
- Si `process.env.KAGGLE_BASE_URL` o `process.env.OPENAI_BASE_URL` está configurado hacia el túnel:
  - Se ejecuta la llamada primaria con un timeout de 8000 ms.
  - En caso de excepción (`AbortError`, `ECONNREFUSED`, status HTTP != 200), se captura el error mediante un bloque `try/catch` con log informativo.
  - El flujo pasa automáticamente a la sección de Groq Ingress / FakeLlm sin arrojar error al cliente.

## 3. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
| :--- | :--- | :--- |
| El túnel Cloudflare o Kaggle se cae durante la sesión | Medio | El `catch` delega automáticamente al motor determinista local y/o Groq. |
| El modelo genera un JSON sintácticamente inválido | Bajo | `robustParseDomainJson` intenta reparaciones comunes; si no puede parsearlo, devuelve solo el texto explicativo sin romper la app. |
| Tiempo de respuesta elevado en Kaggle | Medio | Timeout acotado (8s) y keep-alive activo (`OLLAMA_KEEP_ALIVE=-1`) para mantener los pesos en la VRAM de la Tesla T4. |

