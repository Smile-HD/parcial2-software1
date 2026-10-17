# Diseño Arquitectónico: Chat Colaborativo y Tutorial Interactivo

## 1. Esquema de Persistencia y Migración (PostgreSQL)

Archivo: `apps/api/migrations/0002_chat_messages.sql`

```sql
-- Migration 0002: Create chat_messages table with composite isolation and TTL index
CREATE TABLE IF NOT EXISTS chat_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id   uuid NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
  device_id    text NOT NULL,               -- Identificador inmutable de la máquina/navegador
  sender_name  text NOT NULL,               -- Nombre del usuario emisor ('Pepe') o 'Amongus'
  sender_type  text NOT NULL,               -- 'user' | 'bot'
  channel_type text NOT NULL,               -- 'group' | 'direct_bot'
  target_user  text,                        -- Dueño del hilo privado con Amongus ('Pepe')
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_chat_group 
  ON chat_messages (diagram_id, channel_type, created_at ASC)
  WHERE channel_type = 'group';

CREATE INDEX IF NOT EXISTS idx_chat_direct 
  ON chat_messages (diagram_id, channel_type, device_id, target_user, created_at ASC)
  WHERE channel_type = 'direct_bot';

CREATE INDEX IF NOT EXISTS idx_chat_ttl 
  ON chat_messages (created_at ASC);
```

### Política de Limpieza Automática (TTL de 7 días):
En cada arranque de `@app/api` o al consultar mensajes, se ejecuta:
```sql
DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '7 days';
```

---

## 2. Especificación de la API de Backend (`apps/api`)

### `GET /diagrams/:id/messages`
* **Parámetros Query:**
  - `channel`: `'group'` o `'direct_bot'` (requerido).
  - `deviceId`: Requerido si `channel === 'direct_bot'`.
  - `userName`: Requerido si `channel === 'direct_bot'`.
* **Respuesta:** Lista ordenada de mensajes:
  ```json
  [
    {
      "id": "uuid",
      "diagramId": "uuid",
      "senderName": "Pepe",
      "senderType": "user",
      "channelType": "group",
      "content": "Hola equipo, añadí la clase Pedido",
      "createdAt": "2026-10-17T18:50:00.000Z"
    }
  ]
  ```

### `POST /diagrams/:id/messages`
* **Cuerpo:**
  ```json
  {
    "deviceId": "uuid",
    "senderName": "Pepe",
    "channelType": "group | direct_bot",
    "content": "¿Cómo conecto la clase Cliente con Pedido?"
  }
  ```
* **Comportamiento Inteligente con Amongus:**
  - Si el mensaje es en `direct_bot` o incluye `@Amongus` en el canal `group`:
    La API despacha la respuesta contextual de Amongus y la inserta como mensaje `{ senderName: 'Amongus', senderType: 'bot', ... }`.

---

## 3. Arquitectura de Interfaz de Usuario (`apps/web`)

### Panel de Chat Colapsable (`ChatPanel.tsx`):
* **Ubicación:** Panel lateral derecho o ventana flotante en la esquina inferior derecha.
* **Pestañas:**
  1. `👥 Equipo`: Mensajes grupales sincronizados entre todos los integrantes conectados.
  2. `🤖 Amongus`: Hilo privado y directo con Amongus, aislado por `(diagram_id, device_id, user_name)`.
* **Burbujas de Mensaje:**
  - Mensajes propios alineados a la derecha con el color del usuario.
  - Mensajes de compañeros alineados a la izquierda con avatar de iniciales y nombre.
  - Mensajes de Amongus con fondo sutil lavanda/violeta (`#f5f3ff`) y el avatar 2D animado.
* **Acceso Rápido en la Barra Superior:**
  - Botón `💬 Chat` en el header con badge numérico de mensajes no leídos.

---

## 4. Módulo de Tutorial Interactivo con Amongus (`TutorialModal.tsx`)

### Mecánica de Onboarding:
Amongus presenta una tarjeta guiada no invasiva con micro-animaciones:
1. **Paso 1: Bienvenido al Lienzo**: Presentación de la herramienta y la presencia colaborativa en tiempo real.
2. **Paso 2: Caja de Herramientas**: Explicación de cómo arrastrar clases e interfaces al canvas.
3. **Paso 3: Atributos y Métodos**: Demostración de edición en línea de visibilidades (`+`, `-`, `#`, `~`) y tipos.
4. **Paso 4: Relaciones Inteligentes**: Uso de Quick Linkers y herramientas de asociación, herencia y dependencias.
5. **Paso 5: Asistente Amongus y Exportación**: Cómo ordenar cambios en lenguaje natural y exportar a Enterprise Architect XMI o código Spring Boot.

* **Persistencia:** Guarda `localStorage.getItem('ea_tutorial_completed')` para no abrumar al usuario en cada visita, con un botón permanente `❓ Ayuda / Tutorial` en la barra superior para reiniciar el recorrido cuando el usuario lo desee.
