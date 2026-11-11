# Especificación: Sistema Inteligente de Votación y Quórum para Propuestas

## Requisitos de Gobernanza de Propuestas

### REQ-VOTE-01: Censo de Votantes y Quórum Dinámico
El conjunto de votantes con derecho a voto en una propuesta de chat grupal **MUST** ser exclusivamente los usuarios humanos actualmente conectados según el estado de `awareness` de Yjs.
La IA (*Amongus*) **MUST NOT** computarse como votante ni poseer voto.
Si un usuario se desconecta durante una votación, el sistema **MUST** actualizar el total de votantes esperados y reevaluar las condiciones de resolución anticipada de forma reactiva.

---

### REQ-VOTE-02: Ventana Temporal y Rechazo por Inactividad
Al emitirse una propuesta con `batchDelta` en el canal grupal, el sistema **MUST** iniciar un temporizador de **3 minutos (180 segundos)**.
Si transcurren los 3 minutos y el total de votos emitidos es cero (`V_total == 0`), la propuesta **MUST** ser rechazada automáticamente por inactividad y transicionar a estado `expired_rejected`.

#### Escenario: Timeout sin votos emitidos
- **Given** una propuesta en el canal grupal con un temporizador de 180s
- **When** el temporizador llega a 0 y ningún miembro emitió voto
- **Then** la propuesta **MUST** marcarse como "Rechazada por inactividad"
- **And** no **SHALL** aplicarse ninguna mutación al diagrama.

---

### REQ-VOTE-03: Flexibilidad de Decisión (Cambio de Voto)
Todo usuario conectado **MAY** emitir su voto ("Aprobar" o "Rechazar") y **MAY** cambiar su decisión tantas veces como desee mientras el temporizador permanezca en estado `active` o `overtime`.

#### Escenario: Usuario cambia su voto antes del cierre
- **Given** el usuario "Ana" votó "Rechazar" en una propuesta activa
- **When** Ana pulsa el botón "Aprobar" dentro del tiempo límite
- **Then** el voto de Ana **MUST** computarse a favor de "Aprobar"
- **And** el contador de "Rechazar" **MUST** decrementarse en 1
- **And** el sistema **MUST** reevaluar las condiciones de resolución anticipada.

---

### REQ-VOTE-04: Cierre Anticipado por Mayoría Matemática Irreversible
El sistema **MUST** cerrar la votación anticipadamente sin esperar el agotamiento de los 3 minutos en cuanto una opción obtenga una **mayoría matemática irreversible**, independientemente de cuántos miembros falten por votar ($P$ pendientes):

1. **Mayoría Inalcanzable**: Si los votos de una opción superan a la otra por una diferencia estrictamente mayor a todos los votos pendientes combinados:
   $$|V_{aprobar} - V_{rechazar}| > P$$
   o si una opción ya alcanzó la mayoría absoluta del censo humano ($> N / 2$), la propuesta **MUST** resolverse de inmediato (Aprobada o Rechazada).
2. **Votación Completa**: Si el 100% de los usuarios humanos conectados ya emitieron su voto ($P == 0$), se resuelve de inmediato por mayoría simple ($V_{aprobar} > V_{rechazar}$ o viceversa).
3. **Espera Obligatoria**: Mientras los votos pendientes $P$ aún puedan forzar un empate o dar vuelta el ganador, la votación **MUST** permanecer abierta a la espera de más votos o del vencimiento del temporizador.

#### Escenario: Cierre anticipado con mayoría irreversible (faltando múltiples miembros)
- **Given** 6 desarrolladores conectados en la sala ($N = 6$)
- **When** 4 desarrolladores votan "Aprobar" y 2 aún no han votado ($P = 2$)
- **Then** el sistema determina que $4 - 0 > 2$ (mayoría matemática absoluta)
- **And** la propuesta se aprueba y aplica inmediatamente sin esperar a los 2 restantes.

#### Escenario: Espera obligatoria mientras el resultado sea reversible
- **Given** 5 desarrolladores conectados en la sala ($N = 5$)
- **When** 2 votan "Aprobar", 1 vota "Rechazar" y 2 aún no han votado ($P = 2$)
- **Then** el sistema determina que los 2 pendientes aún pueden revertir el resultado (podría terminar 2 a 3 o forzar empate)
- **And** la votación **MUST** continuar abierta esperando los votos o el timeout.

---

### REQ-VOTE-05: Recuento por Timeout y Tiempo Extra de Desempate (Overtime)
Al expirar el tiempo reglamentario de 3 minutos con votos emitidos (`V_total > 0`):
1. Si `V_aprobar > V_rechazar`, la propuesta **MUST** ser aprobada y aplicada al `Y.Doc`.
2. Si `V_rechazar > V_aprobar`, la propuesta **MUST** ser rechazada.
3. Si `V_aprobar == V_rechazar` (empate):
   - Si la votación estaba en tiempo reglamentario, el sistema **MUST** iniciar un **tiempo extra de desempate de 1 minuto (60 segundos)**, notificando al equipo del estado de overtime.
   - Si el empate persiste tras expirar el minuto de tiempo extra, la propuesta **MUST** ser rechazada por falta de mayoría.

#### Escenario: Empate al minuto 3 activa 1 minuto de prórroga
- **Given** una propuesta activa que finaliza sus 3 minutos con 2 votos a favor y 2 en contra
- **When** el temporizador principal llega a 0
- **Then** la propuesta entra en estado `overtime`
- **And** se inicia una cuenta regresiva de 60 segundos para permitir el desempate.

