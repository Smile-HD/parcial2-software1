import { useState, type RefObject } from 'react';
import type * as Y from 'yjs';
import type { ReactFlowInstance } from '@xyflow/react';
import { projectYDocToDiagram } from '@app/core';
import { quickLinkerTarget, type QuickConnectorType, type QuickLinkerKind } from '../quickLinker.js';
import { handlePaletteDrop, handleConnectWithTool } from '../operations/index.js';
import type { PaletteNodeKind } from '../Palette.js';

export type QuickLinkerMenuState =
  | {
      mode: 'connector';
      anchor: { x: number; y: number };
      sourceId: string;
      sourceKind: QuickLinkerKind;
      targetId: string;
      targetKind: QuickLinkerKind;
    }
  | {
      mode: 'element';
      anchor: { x: number; y: number };
      sourceId: string;
      sourceKind: QuickLinkerKind;
      dropPosition: { x: number; y: number };
    };

export interface UseQuickLinkerOptions {
  doc: Y.Doc;
  rfRef: RefObject<ReactFlowInstance | null>;
  setEdgeMessage: (msg: string | null) => void;
}

export function useQuickLinker({ doc, rfRef, setEdgeMessage }: UseQuickLinkerOptions) {
  const [quickLinkDrag, setQuickLinkDrag] = useState<{
    start: { x: number; y: number };
    cursor: { x: number; y: number };
  } | null>(null);
  const [quickLinkMenu, setQuickLinkMenu] = useState<QuickLinkerMenuState | null>(null);

  const finishQuickLink = (sourceId: string, cursor: { x: number; y: number }): void => {
    const live = projectYDocToDiagram(doc);
    let dropPoint = cursor;
    if (rfRef.current !== null) {
      const flow = rfRef.current.screenToFlowPosition(cursor);
      if (Number.isFinite(flow.x) && Number.isFinite(flow.y)) {
        dropPoint = flow;
      }
    }
    const measuredById = new Map((rfRef.current?.getNodes() ?? []).map((n) => [n.id, n.measured]));
    const hitNodes = live.classes.map((cls) => ({
      id: cls.id,
      position: cls.position,
      width: measuredById.get(cls.id)?.width,
      height: measuredById.get(cls.id)?.height,
    }));
    const sourceKind = (live.classes.find((cls) => cls.id === sourceId)?.kind ?? 'class') as QuickLinkerKind;
    const targetId = quickLinkerTarget(dropPoint, hitNodes);
    if (targetId === null) {
      setQuickLinkMenu({ mode: 'element', anchor: cursor, sourceId, sourceKind, dropPosition: dropPoint });
      return;
    }
    if (targetId === sourceId) {
      const targetKind = sourceKind;
      setQuickLinkMenu({ mode: 'connector', anchor: cursor, sourceId, sourceKind, targetId, targetKind });
      return;
    }
    const targetKind = (live.classes.find((cls) => cls.id === targetId)?.kind ?? 'class') as QuickLinkerKind;
    setQuickLinkMenu({ mode: 'connector', anchor: cursor, sourceId, sourceKind, targetId, targetKind });
  };

  const startQuickLink = (sourceId: string, clientX: number, clientY: number): void => {
    const start = { x: clientX, y: clientY };
    setQuickLinkDrag({ start, cursor: start });
    setQuickLinkMenu(null);
    const onMove = (event: MouseEvent): void => {
      setQuickLinkDrag((prev) =>
        prev === null ? prev : { ...prev, cursor: { x: event.clientX, y: event.clientY } },
      );
    };
    const onUp = (event: MouseEvent): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setQuickLinkDrag(null);
      finishQuickLink(sourceId, { x: event.clientX, y: event.clientY });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const pickQuickConnector = (tool: QuickConnectorType): void => {
    if (quickLinkMenu === null || quickLinkMenu.mode !== 'connector') {
      return;
    }
    const live = projectYDocToDiagram(doc);
    const result = handleConnectWithTool(
      doc,
      live.id,
      tool,
      { source: quickLinkMenu.sourceId, target: quickLinkMenu.targetId },
      live.classes.map((cls) => ({ id: cls.id, kind: cls.kind ?? ('class' as const) })),
    );
    setEdgeMessage(result.ok ? null : (result.message ?? null));
    setQuickLinkMenu(null);
  };

  const pickQuickElement = (kind: string): void => {
    if (quickLinkMenu === null || quickLinkMenu.mode !== 'element') {
      return;
    }
    const nodeKind: PaletteNodeKind = kind === 'interface' ? 'interface' : 'class';
    const live = projectYDocToDiagram(doc);
    const newId = handlePaletteDrop(doc, live.id, {
      kind: nodeKind,
      position: quickLinkMenu.dropPosition,
      existingNames: live.classes.map((cls) => cls.name),
    });
    setQuickLinkMenu({
      mode: 'connector',
      anchor: quickLinkMenu.anchor,
      sourceId: quickLinkMenu.sourceId,
      sourceKind: quickLinkMenu.sourceKind,
      targetId: newId,
      targetKind: nodeKind,
    });
  };

  return {
    quickLinkDrag,
    quickLinkMenu,
    setQuickLinkMenu,
    startQuickLink,
    pickQuickConnector,
    pickQuickElement,
  };
}
