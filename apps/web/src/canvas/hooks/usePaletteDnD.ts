import { useCallback, type DragEvent, type RefObject } from 'react';
import type * as Y from 'yjs';
import { projectYDocToDiagram, type Diagram } from '@app/core';
import type { Connection, Edge, ReactFlowInstance } from '@xyflow/react';
import { PALETTE_DND_MIME, type PaletteEdgeTool, type PaletteNodeKind } from '../Palette.js';
import {
  handlePaletteDrop,
  handleConnectWithTool,
  handleDeleteAssociation,
  handleCreateAssociation,
} from '../operations/index.js';

export interface UsePaletteDnDOptions {
  doc: Y.Doc;
  diagram: Diagram;
  rfRef: RefObject<ReactFlowInstance | null>;
  edgeTool: PaletteEdgeTool | null;
  setEdgeTool: (t: PaletteEdgeTool | null) => void;
  setEdgeMessage: (msg: string | null) => void;
  setSelectedClassId: (id: string | null) => void;
  setEdgeHandles: React.Dispatch<
    React.SetStateAction<Record<string, { sourceHandle?: string; targetHandle?: string }>>
  >;
}

export function usePaletteDnD({
  doc,
  diagram,
  rfRef,
  edgeTool,
  setEdgeTool,
  setEdgeMessage,
  setSelectedClassId,
  setEdgeHandles,
}: UsePaletteDnDOptions) {
  const onDragOver = useCallback((event: DragEvent): void => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(
    (event: DragEvent): void => {
      event.preventDefault();
      if (event.dataTransfer === undefined || event.dataTransfer === null) {
        return;
      }
      const kind = event.dataTransfer.getData(PALETTE_DND_MIME);
      if (kind !== 'class' && kind !== 'interface') {
        return;
      }
      const screenPos = { x: event.clientX, y: event.clientY };
      let position = screenPos;
      if (rfRef.current !== null) {
        const flow = rfRef.current.screenToFlowPosition(screenPos);
        if (Number.isFinite(flow.x) && Number.isFinite(flow.y)) {
          position = {
            x: Math.round(flow.x / 20) * 20,
            y: Math.round(flow.y / 20) * 20,
          };
        }
      }
      handlePaletteDrop(doc, diagram.id, {
        kind,
        position,
        existingNames: diagram.classes.map((cls) => cls.name),
      });
    },
    [doc, diagram, rfRef],
  );

  const handlePaletteQuickAdd = useCallback(
    (kind: PaletteNodeKind): void => {
      const live = projectYDocToDiagram(doc);
      let position = { x: 200, y: 160 };
      if (rfRef.current !== null) {
        const container = document.querySelector('.diagram-canvas .react-flow');
        if (container !== null) {
          const rect = container.getBoundingClientRect();
          const centerScreen = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          const flowPos = rfRef.current.screenToFlowPosition(centerScreen);
          if (Number.isFinite(flowPos.x) && Number.isFinite(flowPos.y)) {
            position = {
              x: Math.round(flowPos.x / 20) * 20,
              y: Math.round(flowPos.y / 20) * 20,
            };
          }
        }
      }
      while (
        live.classes.some(
          (c) => Math.abs(c.position.x - position.x) < 20 && Math.abs(c.position.y - position.y) < 20,
        )
      ) {
        position.x += 40;
        position.y += 40;
      }
      const newId = handlePaletteDrop(doc, live.id, {
        kind,
        position,
        existingNames: live.classes.map((cls) => cls.name),
      });
      setSelectedClassId(newId);
    },
    [doc, rfRef, setSelectedClassId],
  );

  const onConnect = useCallback(
    (connection: Connection): void => {
      const activeTool = edgeTool ?? 'association';
      const result = handleConnectWithTool(
        doc,
        diagram.id,
        activeTool,
        { source: connection.source ?? null, target: connection.target ?? null },
        diagram.classes.map((cls) => ({ id: cls.id, kind: cls.kind ?? ('class' as const) })),
      );
      setEdgeMessage(result.ok ? null : (result.message ?? null));
      if (result.ok && edgeTool !== null) {
        setEdgeTool(null);
      }
    },
    [doc, diagram, edgeTool, setEdgeMessage, setEdgeTool],
  );

  const isValidConnection = useCallback((connection: Edge | Connection): boolean => {
    return Boolean(connection.source && connection.target);
  }, []);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection): void => {
      if (!newConnection.source || !newConnection.target) return;
      const assoc = diagram.associations.find((a) => a.id === oldEdge.id);
      if (assoc) {
        if (newConnection.source !== assoc.sourceClassId || newConnection.target !== assoc.targetClassId) {
          handleDeleteAssociation(doc, diagram.id, assoc.id);
          handleCreateAssociation(doc, diagram.id, {
            sourceClassId: newConnection.source,
            targetClassId: newConnection.target,
            directed: assoc.directed,
            aggregation: assoc.aggregation,
            aggregationEnd: assoc.aggregationEnd,
            sourceMultiplicity: assoc.sourceMultiplicity,
            targetMultiplicity: assoc.targetMultiplicity,
            name: assoc.name,
            sourceRole: assoc.sourceRole,
            targetRole: assoc.targetRole,
            associationClassId: assoc.associationClassId,
          });
        }
      }
      setEdgeHandles((prev) => ({
        ...prev,
        [oldEdge.id]: {
          sourceHandle: newConnection.sourceHandle ?? prev[oldEdge.id]?.sourceHandle,
          targetHandle: newConnection.targetHandle ?? prev[oldEdge.id]?.targetHandle,
        },
      }));
    },
    [doc, diagram, setEdgeHandles],
  );

  return {
    onDragOver,
    onDrop,
    handlePaletteQuickAdd,
    onConnect,
    isValidConnection,
    onReconnect,
  };
}
