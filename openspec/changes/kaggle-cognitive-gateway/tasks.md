# Tareas de Implementación: Puerta de Enlace Cognitiva Kaggle Qwen 27B

## 1. Configuración y Adaptadores AI
- [ ] 1.1 Extender `CanonicalizerOptions` y variables de entorno para soportar `KAGGLE_BASE_URL` y fallback a `OPENAI_BASE_URL` en `@app/adapters-ai`.
- [ ] 1.2 Configurar variables en `.env` y `.env.example` con el endpoint de Cloudflare Tunnel hacia Kaggle.

## 2. Construcción del System Prompt Bimodal
- [ ] 2.1 Crear `buildKaggleArchitectPrompt()` en `apps/api/src/ai/prompt-builder.ts` integrando el manejo de ambigüedad, pautas conversacionales y catálogo de comandos slash (/model, /suggest, /audit, /help).
- [ ] 2.2 Agregar pruebas unitarias para `buildKaggleArchitectPrompt()` en `apps/api/src/ai/prompt-builder.test.ts`.

## 3. Integración de la Capa Prioritaria y Fallback en API
- [ ] 3.1 Implementar la función `executeKaggleCognitiveTurn()` en el pipeline de chat de `apps/api`.
- [ ] 3.2 Conectar la ruta prioritaria en `apps/api/src/routes/ai-routes.ts` antes del Ingress de Groq, asegurando captura de errores (`try/catch`) y fallback transparente.
- [ ] 3.3 Verificar que el parseo de respuestas bimodal separe correctamente el texto del mensaje del bloque JSON de propuesta visual.

## 4. Pruebas de Verificación y Resiliencia
- [ ] 4.1 Ejecutar suite completa de tests de `apps/api` y `@app/adapters-ai` para garantizar 0 regresiones.
- [ ] 4.2 Probar en vivo consulta ambigua contra Kaggle para comprobar el diálogo explicativo.
- [ ] 4.3 Probar en vivo simulación de caída de Kaggle (desconectando el endpoint) para validar que el fallback a Groq / FakeLlm funcione sin interrupciones.

