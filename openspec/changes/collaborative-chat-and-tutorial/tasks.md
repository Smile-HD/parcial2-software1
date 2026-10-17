# Tareas: Chat Colaborativo, Asistente Amongus y Tutorial Interactivo

## Fase 1: Unidad 23 — Persistencia de Mensajes con Tríada y Purga TTL (PR 1: Backend)

- [ ] 23.1 Migración `apps/api/migrations/0002_chat_messages.sql`: Crear tabla `chat_messages` con soporte para canal `group` y `direct_bot`, campos `diagram_id`, `device_id`, `target_user`, e índices optimizados.
- [ ] 23.2 TDD RED `apps/api/src/chat.test.ts`: Probar endpoints `GET` y `POST /diagrams/:id/messages`, validando:
  - Aislamiento estricto por `diagram_id`.
  - Aislamiento en `direct_bot` por `device_id` y `target_user`.
  - Purga automática de mensajes con antigüedad superior a 7 días.
- [ ] 23.3 TDD GREEN `apps/api/src/chat.ts`: Implementar repositorio y controladores con Zod y queries parametrizadas.
- [ ] 23.4 Integración en `apps/api/src/index.ts`: Registrar rutas del chat y tarea de purga al arranque.

---

## Fase 2: Unidad 24 — Panel de Chat Colaborativo y Canal Amongus (PR 2: Frontend Web)

- [ ] 24.1 TDD RED `apps/web/src/chat/ChatPanel.test.tsx`: Probar renderizado de pestañas `Equipo` y `Amongus`, lista de mensajes con avatares, input de texto con confirmación por Enter y botón Enviar.
- [ ] 24.2 TDD GREEN `apps/web/src/chat/ChatPanel.tsx`: Implementar componente de chat con scroll automático al último mensaje, burbujas diferenciadas para usuario y Amongus.
- [ ] 24.3 TDD RED `apps/web/src/chat/useChat.test.ts`: Probar obtención de `getDeviceId()`, persistencia de mensajes y filtrado reactivo al cambiar de nombre.
- [ ] 24.4 TDD GREEN `apps/web/src/chat/useChat.ts` y CSS: Estilos pulidos en `canvas.css` y botón de acceso `💬 Chat` con indicador de no leídos en el header de `App.tsx`.

---

## Fase 3: Unidad 25 — Tutorial Interactivo Guiado por Amongus (PR 3: Experiencia de Usuario)

- [ ] 25.1 TDD RED `apps/web/src/tutorial/TutorialModal.test.tsx`: Probar modal de tutorial con 5 pasos interactivos guiados por Amongus, botones Anterior / Siguiente / Omitir y persistencia en `localStorage`.
- [ ] 25.2 TDD GREEN `apps/web/src/tutorial/TutorialModal.tsx`: Implementar modal estilizado con micro-animaciones del tripulante Amongus explicando Toolbox, canvas, comandos y exportación.
- [ ] 25.3 TDD GREEN Integración en `apps/web/src/App.tsx`: Botón `❓ Tutorial` en la barra de herramientas para abrir el tutorial bajo demanda en cualquier momento.
- [ ] 25.4 Verificación E2E con DevTools MCP: Navegación, prueba de chat en vivo con Amongus y recorrido completo del tutorial sin errores de consola.
