# Propuesta: Presencia en Tiempo Real y Conciencia Visual (Estilo Excalidraw / Google Docs)

## Intención

Actualmente, cuando los usuarios colaboran en un diagrama UML, su identidad se asigna con un identificador aleatorio opaco (`User-xxxx`) y el lienzo carece de conciencia espacial visual. Los colaboradores no pueden ver dónde está apuntando otro usuario, qué nodos tienen seleccionados, ni si el Asistente IA está conectado y disponible en la sala.

Para llevar la experiencia colaborativa a los estándares modernos de la industria (como Excalidraw, Figma o Google Docs):
1. **Identidad de usuario y color**: Al unirse a una sala de diagrama, se solicita el nombre al usuario (recordado en `localStorage`), asignándole un color distintivo de una paleta curada de alto contraste.
2. **Cursores fluidos en vivo y halos de foco**: Las posiciones de cursor de los colaboradores deben renderizarse con total fluidez sobre el lienzo con etiquetas flotantes con su nombre (`pointer-events: none` para no obstruir los clics en el diagrama). Las selecciones activas de nodos deben resaltarse con un halo del color del colaborador.
3. **Bot IA como par virtual de primera clase**: El Asistente IA debe figurar en la barra de presencia como un participante conectado (`🤖 Bot IA`), con indicadores visuales reactivos cuando esté procesando comandos o modificando el modelo.

## Alcance

### Dentro del Alcance
- **Modal de identidad de usuario**: Diálogo limpio y ligero al entrar al diagrama si no hay un nombre guardado, más un botón de edición en la barra de presencia.
- **Sistema de paleta de colores**: Asignación determinista de colores (tonos tipo Figma con contraste garantizado sobre fondo blanco/claro).
- **Esquema de awareness en Yjs**: Extensión del estado local con `{ user: { name, color }, cursor: { x, y }?, selectedNodeIds: string[]? }`.
- **Capa de cursores remotos en el lienzo**: Renderizado fluido a 60 FPS usando puntero SVG + etiqueta flotante con nombre, adaptado a las transformaciones de zoom y paneo del lienzo.
- **Halos de selección**: Resaltado no bloqueante con bordes coloreados alrededor de los nodos seleccionados por otros usuarios.
- **Bot IA virtual**: Entrada permanente en `PresenceBar` con badge dedicado y estados visuales (inactivo, pensando, aplicando cambios).

### Fuera del Alcance
- Procesos headless de Node en el servidor (la presencia del bot se gestiona en el cliente mediante el estado de awareness, garantizando cero sobrecarga en el servidor).
- Canales de audio/video o salas de chat de texto.

## Capacidades

### Nuevas Capacidades
- `realtime-presence-awareness`: Identificación interactiva de usuarios, cursores colaborativos en vivo, halos de selección remota y representación de la presencia del bot IA en el lienzo de diagramas.
