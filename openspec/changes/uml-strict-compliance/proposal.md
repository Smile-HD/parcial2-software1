# Propuesta: Sanitización de Notación Estricta UML 2.5 (Cajas Ortogonales y Conectores de Asociación)

## Intención

En la auditoría de conformidad con el estándar **OMG UML 2.5.1** y el estilo nativo de **Enterprise Architect (Sparx Systems)** para diagramas de clases, se identificaron dos desviaciones visuales y semánticas que degradan el rigor formal del modelo:

1. **Cajas de Clase con esquinas redondeadas (`border-radius: 4px`)**:
   En la interfaz web ([`apps/web/src/canvas/canvas.css`](file:///d:/Moondancer/software1/parcial1/apps/web/src/canvas/canvas.css)), la clase `.uml-class` posee bordes redondeados (`border-radius: 4px`). En la notación formal UML 2.5, los clasificadores son **rectángulos estrictos con vértices en ángulo recto de 90°** (`border-radius: 0`).
2. **Asociaciones con flecha indebida y geometría no estándar**:
   - **Sesgo en Visión por Computadora (IA)**: El normalizador de visión ([`payload-normalizer.ts`](file:///d:/Moondancer/software1/parcial1/packages/adapters-ai/src/vision/payload-normalizer.ts)) y los prompts de extracción asignan por defecto `directed: true` a las asociaciones reconocidas en fotos, causando que asociaciones simples (bidireccionales o no dirigidas) se rendericen con flechas de navegabilidad.
   - **Punta de flecha no conforme en SVG**: Cuando una asociación es dirigida (`directed: true`), [`AssociationEdge.tsx`](file:///d:/Moondancer/software1/parcial1/apps/web/src/canvas/edges/AssociationEdge.tsx) renderiza un **triángulo cerrado y relleno de negro** (`fill="#1a1a2e"`), lo cual viola la Sección 11.5.4 de UML 2.5.1, que estipula que una asociación dirigida debe utilizar una **flecha abierta de alambre (open stick arrowhead `>`)**.

Esta propuesta define el plan de trabajo para sanitizar estas desviaciones, asegurando una representación visual y semántica 100% estricta bajo TDD.

## Alcance

### Dentro del Alcance
- **Frontend (`apps/web`)**:
  - Ajuste de estilos CSS en `.uml-class` y elementos derivados a esquinas cuadradas (`border-radius: 0`).
  - Corrección del marcador SVG de asociación dirigida en `AssociationEdge.tsx` para renderizar una punta de flecha abierta (`fill="none"`, `stroke`).
  - Actualización de pruebas de regresión visual y DOM en `DiagramCanvas.test.tsx` y pruebas de tema EA.
- **Adaptadores de IA (`packages/adapters-ai`)**:
  - Corrección del fallback de normalización de Visión para que las asociaciones no dirigidas por defecto tengan `directed: false`.
  - Actualización de prompts de visión para ejemplificar asociaciones simples con `directed: false`.
  - Actualización de pruebas unitarias en `vision.test.ts`.

### Fuera del Alcance
- Modificación del metamodelo central `@app/core` (el tipo booleano `directed` ya existe y es válido en el esquema Zod).
- Modificación de otros conectores (Generalización, Dependencia y Realización ya cumplen con sus símbolos respectivos).

## Plan de Rollback (Mitigación de Riesgos)
- Los cambios se aplican en commits atómicos sobre la rama `refactor/clean-architecture-and-docs`.
- Toda modificación de código se valida contra la suite completa de pruebas (`pnpm -r test`).
- En caso de regresión inesperada en el renderizado del lienzo o en los analizadores de visión, se revierte con `git revert` o checkout del archivo afectado sin impacto en el resto del monorepo.

