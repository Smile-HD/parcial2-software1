# Tareas: Sanitización de Notación Estricta UML 2.5

## Fase 1: Geometría de Clasificadores Cuadrados en Canvas (`apps/web`)
- [x] 1.1 **Pruebas (TDD)**:
  - [x] 1.1.1 Escribir prueba unitaria en `apps/web/src/canvas/eaTheme.test.tsx` que verifique que el contenedor `.uml-class` tiene `border-radius: 0` o no utiliza curvaturas redondeadas.
- [x] 1.2 **Implementación**:
  - [x] 1.2.1 Modificar `apps/web/src/canvas/canvas.css` cambiando `border-radius: 4px` a `border-radius: 0` en `.uml-class`.
  - [x] 1.2.2 Asegurar que el encabezado `.uml-class__title` y compartimentos mantengan alineación rectangular sin sangrías ni redondeos.
- [x] 1.3 **Verificación**:
  - [x] 1.3.1 Ejecutar `pnpm --filter @app/web test eaTheme` y verificar verde.

## Fase 2: Corrección de Marcador SVG de Asociación Dirigida (`apps/web`)
- [x] 2.1 **Pruebas (TDD)**:
  - [x] 2.1.1 En `apps/web/src/canvas/DiagramCanvas.test.tsx`, actualizar la prueba que valida el marcador de flecha de asociación dirigida para exigir una flecha abierta (`fill="none"`, trazo abierto) en lugar de un triángulo relleno.
- [x] 2.2 **Implementación**:
  - [x] 2.2.1 Modificar `apps/web/src/canvas/edges/AssociationEdge.tsx` reemplazando el marcador `arrowId`:
    - Cambiar `<path d="M 0 0 L 12 6 L 0 12 Z" fill="#1a1a2e" />` por `<path d="M 0 0 L 11 6 L 0 12" fill="none" stroke="#1a1a2e" strokeWidth="1.5" />`.
- [x] 2.3 **Verificación**:
  - [x] 2.3.1 Ejecutar `pnpm --filter @app/web test DiagramCanvas` y verificar verde.

## Fase 3: Default No Dirigido en Visión y Normalizador (`packages/adapters-ai`)
- [x] 3.1 **Pruebas (TDD)**:
  - [x] 3.1.1 En `packages/adapters-ai/src/vision.test.ts`, escribir/actualizar caso de prueba donde una asociación con `directed` omitido deba normalizarse como `directed: false`.
- [x] 3.2 **Implementación**:
  - [x] 3.2.1 Modificar `packages/adapters-ai/src/vision/payload-normalizer.ts` para que el fallback de `d.directed` sea `false` en lugar de `true`.
  - [x] 3.2.2 Ajustar el ejemplo de schema en `packages/adapters-ai/src/vision/prompts.ts` con `"directed": false`.
- [x] 3.3 **Verificación**:
  - [x] 3.3.1 Ejecutar `pnpm --filter @app/adapters-ai test vision` y verificar verde.

## Fase 4: Verificación Integral del Monorepo
- [ ] 4.1 Ejecutar suite completa `pnpm -r test` asegurando cero regresiones en los 1231+ tests del proyecto.
- [ ] 4.2 Ejecutar `pnpm -r build` / `tsc --noEmit` para comprobar que no existan errores de tipos.

