# Propuesta: Sistema Inteligente de Votación y Quórum para Propuestas de IA en Chat Grupal

## Intención

Actualmente, cuando la IA (*Amongus*) genera una propuesta de diseño UML (`ProposalCard`) en el canal de equipo, cualquier usuario conectado puede pulsar el botón "Aplicar propuesta", ejecutando la mutación en el lienzo sin consultar a sus compañeros. En un entorno colaborativo real con múltiples desarrolladores, los cambios arquitectónicos deben someterse a **gobernanza colectiva**.

Esta propuesta formaliza el diseño de un **Sistema de Votación y Quórum Inteligente** para las propuestas emitidas en el chat grupal:
1. **Deliberación democrática temporizada**: Ventana de votación de **3 minutos** (180 segundos).
2. **Rechazo por inactividad total**: Si vencen los 3 minutos sin ningún voto (cero participación), la propuesta se **rechaza automáticamente**.
3. **Mecanismo de desempate**: Si el tiempo expira en empate, se otorga un **tiempo extra de 1 minuto** (60 segundos).
4. **Flexibilidad de voto**: Los miembros pueden cambiar su voto (Aceptar ⇄ Rechazar) durante la ventana activa.
5. **Cierre anticipado inteligente (Early Resolution)**:
   - Si todos los miembros conectados votan, se resuelve inmediatamente.
   - Si falta solo un miembro por votar, el sistema analiza si su voto es **matemáticamente decisivo**; si no puede alterar el resultado, se resuelve sin esperar el fin del temporizador; si es decisivo, el sistema espera su voto o el timeout.
6. **Quórum dinámico en tiempo real**: Los votantes válidos se calculan a partir del `awareness` de Yjs (excluyendo a la IA). Si un usuario se desconecta, el quórum se recalcula automáticamente.

## Alcance

### Dentro del Alcance
- **Especificación Formal OpenSpec**: Definición rigurosa de la máquina de estados, lógica de quórum y resolución anticipada.
- **Frontend (`apps/web`)**:
  - Evolución de `ProposalCard.tsx` para mostrar barra de votación, conteo de votos de aceptación/rechazo, avatares de votantes y cuenta regresiva regresiva (3 min / 1 min).
  - Integración del estado de votación con Yjs Awareness / Y.Map compartido para sincronización en tiempo real con latencia cero.
- **Backend / Protocolo (`apps/api` / `apps/collab-server`)**:
  - Registro del resultado final de la votación (Aprobada, Rechazada por Votación, Rechazada por Timeout).

### Fuera del Alcance
- Canal directo (`direct_bot`): Las propuestas en chat privado entre un usuario y la IA siguen siendo individuales y de aplicación inmediata (quórum 1/1).

## Plan de Rollback (Mitigación de Riesgos)
- Si la votación sincrónica introduce fricción o bloqueos, existe una opción de degradación elegante donde un único usuario en sala o el creador del diagrama puede aplicar el cambio si no hay otros pares activos.
- El código se implementará bajo la rama de refactorización con tests unitarios y de componentes cubriendo todos los casos de quórum y timeout.

