# Diseño: Presencia en Tiempo Real y Conciencia Visual (Estilo Excalidraw / Google Docs)

## Visión General de la Arquitectura

El protocolo `awareness` de Yjs es una capa CRDT ligera que corre sobre el proveedor de WebSocket (`y-websocket`). Cada cliente conectado posee un diccionario de estado local que se replica automáticamente entre todos los pares conectados a la sala:

```
Cliente A (Navegador)          collab-server (Yjs WS)          Cliente B (Navegador)
       │                              │                              │
       │─── awareness.setLocal ──────>│─── awareness broadcast ────>│
       │    { name, color, cursor,    │                              │
       │      selectedNodeIds }       │                              │
       │                              │<── awareness.setLocal ───────│
       │<── awareness broadcast ──────│    { name, color, cursor }   │
```

## Modelo de Datos de Awareness

```typescript
export interface AwarenessUserState {
  name: string;
  color: string;
  cursor?: { x: number; y: number } | null;
  selectedNodeIds?: string[];
}

export interface AwarenessPeer {
  clientId: number;
  user: AwarenessUserState;
}
```

## Invariantes Clave de Diseño

1. **Invarianza de Zoom y Paneo en el Lienzo**: Las coordenadas de cursor `(x, y)` emitidas a los pares DEBEN expresarse en el sistema de coordenadas nativo de React Flow (usando `screenToFlowPosition`), no en píxeles absolutos de pantalla. Al renderizarse dentro del contenedor del viewport de React Flow, los cursores remotos acompañan automáticamente el paneo y zoom del diagrama.
2. **Cero Obstrucción de Interacción**: El contenedor de cursores y todos sus elementos internos DEBEN tener `pointer-events: none` y `user-select: none`. Las etiquetas flotantes nunca deben interceptar clics sobre nodos, conectores o herramientas.
3. **Limitación de Frecuencia y Rendimiento (60 FPS)**: La captura de movimiento local del mouse se agrupa mediante `requestAnimationFrame` con un intervalo mínimo de ~30ms, evitando la saturación del canal WebSocket.
4. **Limpieza al Salir o Inactividad**: Cuando el puntero abandona el área del lienzo o la pestaña pierde foco, se emite `cursor: null` para ocultar limpiamente el cursor en las pantallas remotas sin desconectar la presencia del usuario.
5. **Mapeo Determinista de Color**: El color de cada usuario se deriva de forma determinista mediante un hash de su nombre sobre una paleta curada (Sky, Emerald, Purple, Coral, Rose, Amber), asegurando consistencia visual entre sesiones.
6. **Representación Virtual del Bot IA**:
   - El bot se renderiza permanentemente como un colaborador activo en `PresenceBar` (`🤖 Bot IA`).
   - Cuando el estado del intérprete pasa a `interpreting` o `pending`, el bot transiciona visualmente a estado "pensando" o "aplicando", con un indicador pulsante.

## Especificaciones Estéticas y de Componentes

- **Modal de Nombre / Bienvenida**: Reutiliza las clases `.modal-backdrop` y `.modal-dialog` de `canvas.css`. Tipografía clara, autofocus, tecla Enter para confirmar y botón accesible en el encabezado para modificar el nombre.
- **Componente de Cursores Remotos**:
  - Flecha SVG a 45 grados, rellena con el color del usuario y contorno blanco nítido de 1px para contraste sobre cualquier fondo.
  - Etiqueta tipo píldora fijada junto a la punta del cursor (`font-size: 11px; font-weight: 500; border-radius: 4px; padding: 2px 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.15)`).
- **Halos de Selección**:
  - Inyección de contorno (`outline: 2px solid <color>; outline-offset: 2px;`) sobre los nodos de React Flow seleccionados por usuarios remotos.
