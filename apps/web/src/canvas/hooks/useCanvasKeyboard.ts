/**
 * Hook para atajos de teclado globales en el lienzo:
 * - Escape: cancela herramientas y deselecciona elementos.
 * - Delete/Backspace: elimina clase, arista o diamante n-ario seleccionado.
 * - Flechas: desplaza la clase seleccionada en pasos de 20px (alineación a cuadrícula).
 */
import { useEffect } from 'react';
import type * as Y from 'yjs';
import type { Diagram } from '@app/core';
import type { PaletteEdgeTool } from '../Palette';
import type { EditorEdgeType } from '../operations/index.js';
import { handleNodeDragStop, handleDeleteNaryAssociation } from '../operations/index.js';

export interface UseCanvasKeyboardOptions {
  doc: Y.Doc;
  diagram: Diagram;
  selectedClassId: string | null;
  setSelectedClassId: (id: string | null) => void;
  selectedEdge: { id: string; type: EditorEdgeType } | null;
  setSelectedEdge: (edge: { id: string; type: EditorEdgeType } | null) => void;
  selectedNaryId: string | null;
  setSelectedNaryId: (id: string | null) => void;
  setEdgeTool: (tool: PaletteEdgeTool | null) => void;
  setEdgeMessage: (msg: string | null) => void;
  handleDeleteClass: (classId: string) => void;
  deleteSelectedEdge: () => void;
}

export function useCanvasKeyboard({
  doc,
  diagram,
  selectedClassId,
  setSelectedClassId,
  selectedEdge,
  setSelectedEdge,
  selectedNaryId,
  setSelectedNaryId,
  setEdgeTool,
  setEdgeMessage,
  handleDeleteClass,
  deleteSelectedEdge,
}: UseCanvasKeyboardOptions) {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setEdgeTool(null);
        setEdgeMessage(null);
        setSelectedClassId(null);
        setSelectedEdge(null);
        setSelectedNaryId(null);
        return;
      }

      const target = event.target as HTMLElement | null;
      const isInput =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedClassId !== null) {
          event.preventDefault();
          handleDeleteClass(selectedClassId);
          setSelectedClassId(null);
          return;
        }
        if (selectedEdge !== null) {
          event.preventDefault();
          deleteSelectedEdge();
          return;
        }
        if (selectedNaryId !== null) {
          event.preventDefault();
          handleDeleteNaryAssociation(doc, diagram.id, selectedNaryId);
          setSelectedNaryId(null);
          return;
        }
      }

      if (selectedClassId !== null && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const cls = diagram.classes.find((c) => c.id === selectedClassId);
        if (cls) {
          event.preventDefault();
          let dx = 0;
          let dy = 0;
          if (event.key === 'ArrowUp') dy = -20;
          if (event.key === 'ArrowDown') dy = 20;
          if (event.key === 'ArrowLeft') dx = -20;
          if (event.key === 'ArrowRight') dx = 20;

          handleNodeDragStop(doc, diagram.id, {
            id: cls.id,
            position: {
              x: Math.round((cls.position.x + dx) / 20) * 20,
              y: Math.round((cls.position.y + dy) / 20) * 20,
            },
          });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [doc, diagram, selectedClassId, selectedEdge, selectedNaryId, handleDeleteClass, deleteSelectedEdge, setEdgeTool, setEdgeMessage, setSelectedClassId, setSelectedEdge, setSelectedNaryId]);
}

