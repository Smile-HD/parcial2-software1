# Propuesta de Cambio: Chat Colaborativo, Asistente Amongus y Tutorial Interactivo

## Contexto y Motivación
Con la finalización exitosa de la presencia espacial colaborativa (Unidades 20, 21 y 22), los usuarios ahora comparten identidad, cursores en vivo a 60 FPS, halos de selección de nodos y la presencia del asistente virtual reactivo **Amongus**.

Para elevar la colaboración y la adopción de usuarios novatos y experimentados, se requiere:
1. **Chat Colaborativo Bicanal**:
   - **Canal de Equipo (Grupal)**: Para que los integrantes conectados a una misma sesión de modelado UML intercambien ideas, coordinen diseño y mencionen a Amongus.
   - **Canal Directo con Amongus (Privado)**: Un diálogo directo 1 a 1 entre el usuario y Amongus para formular preguntas, solicitar refactorizaciones o interactuar sin interrumpir el flujo del equipo.
2. **Aislamiento Estricto por Tríada `(diagram_id, device_id, user_name)`**:
   - Los mensajes de un lienzo jamás se mezclan con otros diagramas.
   - Si otro usuario en otra máquina usa el mismo alias visual (ej. "Pepe"), no tiene acceso al chat privado de otro dispositivo.
   - Si el usuario cambia su nombre (ej. "Pepe" a "Pepe1"), se inicia un hilo limpio para "Pepe1", y si vuelve a "Pepe", recupera su conversación anterior.
3. **Optimización y Limpieza Automática (TTL de 7 días)**:
   - Para evitar saturación de la base de datos, los mensajes con más de 7 días de inactividad se depuran automáticamente.
4. **Tutorial Interactivo Guiado por Amongus**:
   - Un sistema de onboarding interactivo y accesible donde Amongus actúa como guía visual, enseñando paso a paso:
     1. Creación de clases e interfaces desde la Toolbox.
     2. Edición ágil de atributos, métodos y visibilidades.
     3. Creación de relaciones (asociaciones, herencia, dependencias, n-arias).
     4. Comandos de voz y lenguaje natural con Amongus.
     5. Exportación a Enterprise Architect XMI 2.1, Spring Boot e imágenes.

---

## Metas del Cambio
1. Persistencia relacional en PostgreSQL mediante migración `0002_chat_messages.sql`.
2. Endpoints Fastify de mensajería con validación Zod y tiempo real.
3. Panel de chat ergonómico, colapsable, no obstructivo y con modo oscuro/claro armónico con el tema Enterprise Architect.
4. Experiencia interactiva de onboarding paso a paso con el asistente Amongus.
5. Desarrollo modular estructurado en PRs encadenados (< 400 líneas authored por unidad) con estricto TDD.
