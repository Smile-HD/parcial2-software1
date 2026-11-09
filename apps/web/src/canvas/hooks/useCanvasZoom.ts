import { useCallback, useRef, useState, type RefObject } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import { computeNextZoom } from '../operations/zoomOperations.js';

export interface UseCanvasZoomOptions {
  rfRef: RefObject<ReactFlowInstance | null>;
  classes: readonly { position: { x: number; y: number } }[];
}

export function useCanvasZoom({ rfRef, classes }: UseCanvasZoomOptions) {
  const lastClickedPointRef = useRef<{ x: number; y: number } | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(1);

  const recordClickPoint = useCallback((clientX: number, clientY: number) => {
    if (!rfRef.current) return;
    try {
      const flowPos = rfRef.current.screenToFlowPosition({ x: clientX, y: clientY });
      if (Number.isFinite(flowPos.x) && Number.isFinite(flowPos.y)) {
        lastClickedPointRef.current = flowPos;
      }
    } catch {
      // Ignorar si el viewport aún no está listo
    }
  }, [rfRef]);

  const handleCanvasClickCapture = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('.diagram-zoom-controls') ||
        target?.closest('.palette') ||
        target?.closest('.diagram-canvas__edge-editor') ||
        target?.closest('.diagram-canvas__nary-editor') ||
        target?.closest('.staruml-mult-picker')
      ) {
        return;
      }
      recordClickPoint(e.clientX, e.clientY);
    },
    [recordClickPoint],
  );

  const getZoomTarget = useCallback((): { x: number; y: number } => {
    if (lastClickedPointRef.current) {
      return lastClickedPointRef.current;
    }
    if (rfRef.current) {
      try {
        const flowCenter = rfRef.current.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        if (Number.isFinite(flowCenter.x) && Number.isFinite(flowCenter.y)) {
          return flowCenter;
        }
      } catch {
        // Fallback
      }
    }
    if (classes.length > 0) {
      return { x: classes[0].position.x + 80, y: classes[0].position.y + 60 };
    }
    return { x: 400, y: 300 };
  }, [classes, rfRef]);

  const handleZoomIn = useCallback(() => {
    const target = getZoomTarget();
    const current = rfRef.current?.getZoom?.() ?? currentZoom;
    const nextZoom = computeNextZoom(current, 'in');
    rfRef.current?.setCenter?.(target.x, target.y, { zoom: nextZoom, duration: 250 });
    setCurrentZoom(nextZoom);
  }, [getZoomTarget, currentZoom, rfRef]);

  const handleZoomOut = useCallback(() => {
    const target = getZoomTarget();
    const current = rfRef.current?.getZoom?.() ?? currentZoom;
    const nextZoom = computeNextZoom(current, 'out');
    rfRef.current?.setCenter?.(target.x, target.y, { zoom: nextZoom, duration: 250 });
    setCurrentZoom(nextZoom);
  }, [getZoomTarget, currentZoom, rfRef]);

  const handleZoomReset = useCallback(() => {
    rfRef.current?.fitView?.({ duration: 250, padding: 0.2 });
    setCurrentZoom(1);
  }, [rfRef]);

  return {
    currentZoom,
    recordClickPoint,
    handleCanvasClickCapture,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
  };
}
