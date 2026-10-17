# Tareas: Presencia en Tiempo Real y Conciencia Visual (Estilo Excalidraw / Google Docs)

Refs: `realtime:R5` = Identidad de usuario y colores de presencia; `realtime:R6` = Cursores colaborativos en vivo y halos de selección; `realtime:R7` = Presencia virtual del Asistente IA.
Límite de revisión: PRs encadenados <= 400 líneas modificadas por unidad.

## Unidades de Trabajo Sugeridas

| Unidad | Objetivo | PR | Comando de prueba enfocado | Límite de rollback |
|--------|----------|----|----------------------------|--------------------|
| 20 | Identidad de usuario, modal de bienvenida y paleta de colores | 20 | `pnpm --filter @app/web test src/presence` | eliminar `UserNameModal.tsx`, revertir `App.tsx` |
| 21 | Cursores remotos fluidos en el lienzo y halos de selección | 21 | `pnpm --filter @app/web test src/canvas/RemoteCursors` | eliminar `RemoteCursors.tsx`, revertir hooks del lienzo |
| 22 | Presencia virtual del Bot IA y retroalimentación reactiva | 22 | `pnpm --filter @app/web test src/canvas/PresenceBar` | revertir inyección de presencia del bot en `App.tsx` |

---

## Fase 1: Unidad 20 — Identidad de Usuario y Paleta (PR 1)

- [x] 20.1 TDD RED `apps/web/src/presence/palette.test.ts`: Probar generación determinista de color de usuario a partir del hash del nombre sobre una paleta curada (Cielo, Esmeralda, Púrpura, Coral, Rosa, Ámbar).
- [x] 20.2 TDD GREEN `apps/web/src/presence/palette.ts`: Implementar `pickUserColor(name: string): string` y exportar la definición de la paleta.
- [x] 20.3 TDD RED `apps/web/src/presence/UserNameModal.test.tsx`: Probar que el modal se muestre cuando no hay nombre en `localStorage`, valide texto no vacío, y al presionar Enter o clic en Guardar persista en `localStorage` y cierre el diálogo.
- [x] 20.4 TDD GREEN `apps/web/src/presence/UserNameModal.tsx`: Implementar el modal con estilos `.modal-backdrop` y `.modal-dialog`, autofocus y soporte i18n.
- [x] 20.5 TDD RED `apps/web/src/presence.integration.test.tsx`: Probar que el awareness de Yjs reciba `{ name, color }` y `PresenceBar` renderice chips coloreados con avatares de iniciales y punto verde de actividad.
- [x] 20.6 TDD GREEN `apps/web/src/App.tsx` y `apps/web/src/canvas/PresenceBar.tsx`: Enlazar identidad a awareness y permitir cambiar nombre haciendo clic en la barra de presencia.

---

## Fase 2: Unidad 21 — Cursores Remotos en Vivo y Halos de Selección (PR 2)

- [ ] 21.1 TDD RED `apps/web/src/canvas/RemoteCursors.test.tsx`: Probar renderizado de cursores remotos desde el awareness: puntero SVG, etiqueta flotante con nombre, color correspondiente y ocultar cuando cursor es null o es el usuario local.
- [ ] 21.2 TDD GREEN `apps/web/src/canvas/RemoteCursors.tsx`: Implementar overlay SVG de cursores con `pointer-events: none`, etiqueta flotante con sombra suave y transiciones CSS fluidas.
- [ ] 21.3 TDD RED `apps/web/src/canvas/useRemoteCursors.test.ts`: Probar conversión de coordenadas con `screenToFlowPosition`, limitación de tasa con `requestAnimationFrame` y evento `onMouseLeave` enviando cursor null.
- [ ] 21.4 TDD GREEN `apps/web/src/canvas/DiagramCanvas.tsx`: Integrar despachador de coordenadas en awareness y montar `RemoteCursors` dentro del contenedor del viewport de React Flow.
- [ ] 21.5 TDD RED `apps/web/src/canvas/selectionHalos.test.ts`: Probar difusión de IDs de nodos seleccionados en awareness y aplicación de anillos/halos con el color del usuario en las clases remotas.
- [ ] 21.6 TDD GREEN `apps/web/src/canvas/DiagramCanvas.tsx` y CSS: Aplicar contornos/sombras dinámicas (`box-shadow` / `outline`) con el color del usuario remoto seleccionado.

---

## Fase 3: Unidad 22 — Presencia Virtual del Bot IA y Retroalimentación Reactiva (PR 3)

- [ ] 22.1 TDD RED `apps/web/src/canvas/PresenceBar.bot.test.tsx`: Probar que `PresenceBar` muestre `🤖 Bot IA` con chip dedicado, badge violeta/índigo y tooltip de estado.
- [ ] 22.2 TDD GREEN `apps/web/src/canvas/PresenceBar.tsx`: Renderizar chip del bot virtual con estilo diferencial y estado conectado.
- [ ] 22.3 TDD RED `apps/web/src/App.bot-presence.test.tsx`: Probar que el estado del bot cambie a "Pensando..." o "Aplicando cambios..." cuando el intérprete está ocupado (`interpreting` o `pending`), mostrando indicador pulsante.
- [ ] 22.4 TDD GREEN `apps/web/src/App.tsx` y CSS: Conectar estado del intérprete con la presencia del bot.

---

## Verificación y Lista Manual

- [ ] Ejecutar suite completa: `pnpm -r test`
- [ ] Prueba manual con dos navegadores:
  1. Abrir Navegador 1, ingresar nombre "Ana", verificar chip verde.
  2. Abrir Navegador 2 en incógnito, ingresar nombre "Carlos", verificar chip púrpura.
  3. Mover el mouse en Navegador 1: observar cursor suave con la etiqueta "Ana" moviéndose en Navegador 2 en tiempo real sin tapar ni bloquear clics.
  4. Seleccionar un nodo Clase en Navegador 1: observar halo coloreado alrededor de la clase en Navegador 2.
  5. Verificar barra de presencia: ambos usuarios y el `🤖 Bot IA` están visibles.
