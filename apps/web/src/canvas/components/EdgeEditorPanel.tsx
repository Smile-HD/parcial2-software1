import React from 'react';
import type * as Y from 'yjs';
import type { Diagram } from '@app/core';
import type { EditorEdgeType } from '../operations/index.js';
import {
  handleUpdateAssociationMeta,
  handleUpdateMultiplicity,
} from '../operations/index.js';
import type { TKey } from '../../i18n.js';

export interface EdgeEditorPanelProps {
  doc: Y.Doc;
  diagram: Diagram;
  selectedEdgeData: { edge: any; type: EditorEdgeType } | null;
  commitEdgeLabel: (label: string) => void;
  deleteSelectedEdge: () => void;
  setSelectedEdge: (val: { id: string; type: EditorEdgeType } | null) => void;
  tr: (key: TKey, params?: Record<string, string | number>) => string;
  edgeTypeKeys: Record<EditorEdgeType, TKey>;
}

export function EdgeEditorPanel({
  doc,
  diagram,
  selectedEdgeData,
  commitEdgeLabel,
  deleteSelectedEdge,
  setSelectedEdge,
  tr,
  edgeTypeKeys,
}: EdgeEditorPanelProps) {
  if (!selectedEdgeData) return null;

  return (
    <div className="diagram-canvas__edge-editor" data-testid="edge-editor" key={selectedEdgeData.edge.id}>
      <span className="diagram-canvas__edge-editor-title">
        {tr(edgeTypeKeys[selectedEdgeData.type])}
      </span>
      <label>
        {selectedEdgeData.type === 'association' ? tr('editor.associationName') : tr('editor.label')}
        <input
          aria-label={
            selectedEdgeData.type === 'association'
              ? tr('editor.associationName')
              : tr('editor.labelAria', { type: tr(edgeTypeKeys[selectedEdgeData.type]) })
          }
          defaultValue={selectedEdgeData.edge.name ?? ''}
          onBlur={(event) => commitEdgeLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitEdgeLabel((event.target as HTMLInputElement).value);
            }
          }}
        />
      </label>
      {selectedEdgeData.type === 'association' && (
        <>
          <label>
            {tr('editor.sourceRole')}
            <input
              aria-label={tr('editor.sourceRole')}
              defaultValue={selectedEdgeData.edge.sourceRole ?? ''}
              onBlur={(event) =>
                handleUpdateAssociationMeta(doc, diagram.id, selectedEdgeData.edge.id, {
                  sourceRole: event.target.value.trim() || undefined,
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleUpdateAssociationMeta(doc, diagram.id, selectedEdgeData.edge.id, {
                    sourceRole: (event.target as HTMLInputElement).value.trim() || undefined,
                  });
                }
              }}
            />
          </label>
          <label>
            {tr('editor.targetRole')}
            <input
              aria-label={tr('editor.targetRole')}
              defaultValue={selectedEdgeData.edge.targetRole ?? ''}
              onBlur={(event) =>
                handleUpdateAssociationMeta(doc, diagram.id, selectedEdgeData.edge.id, {
                  targetRole: event.target.value.trim() || undefined,
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleUpdateAssociationMeta(doc, diagram.id, selectedEdgeData.edge.id, {
                    targetRole: (event.target as HTMLInputElement).value.trim() || undefined,
                  });
                }
              }}
            />
          </label>
          <label>
            {tr('editor.sourceMultiplicity')}
            <input
              aria-label={tr('editor.sourceMultiplicity')}
              defaultValue={selectedEdgeData.edge.sourceMultiplicity ?? ''}
              onBlur={(event) =>
                handleUpdateMultiplicity(doc, diagram.id, selectedEdgeData.edge.id, 'source', event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleUpdateMultiplicity(
                    doc,
                    diagram.id,
                    selectedEdgeData.edge.id,
                    'source',
                    (event.target as HTMLInputElement).value,
                  );
                }
              }}
            />
          </label>
          <label>
            {tr('editor.targetMultiplicity')}
            <input
              aria-label={tr('editor.targetMultiplicity')}
              defaultValue={selectedEdgeData.edge.targetMultiplicity}
              onBlur={(event) =>
                handleUpdateMultiplicity(doc, diagram.id, selectedEdgeData.edge.id, 'target', event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleUpdateMultiplicity(
                    doc,
                    diagram.id,
                    selectedEdgeData.edge.id,
                    'target',
                    (event.target as HTMLInputElement).value,
                  );
                }
              }}
            />
          </label>
          {selectedEdgeData.edge.aggregation !== 'none' && selectedEdgeData.edge.aggregationEnd !== undefined && (
            <div className="diagram-canvas__flip-diamond">
              <span>
                {tr('editor.diamondEnd', {
                  end:
                    selectedEdgeData.edge.aggregationEnd === 'source'
                      ? tr('editor.endSource')
                      : tr('editor.endTarget'),
                })}
              </span>
              <button
                type="button"
                aria-label={tr('editor.flipDiamondEndAria', {
                  end:
                    selectedEdgeData.edge.aggregationEnd === 'source'
                      ? tr('editor.endTarget')
                      : tr('editor.endSource'),
                })}
                onClick={() =>
                  handleUpdateAssociationMeta(doc, diagram.id, selectedEdgeData.edge.id, {
                    aggregationEnd: selectedEdgeData.edge.aggregationEnd === 'source' ? 'target' : 'source',
                  })
                }
              >
                {tr('editor.flipDiamondEnd')}
              </button>
            </div>
          )}
          <div className="diagram-canvas__field">
            <label htmlFor="edge-assoc-class">{tr('editor.associationClass')}</label>
            <select
              id="edge-assoc-class"
              data-testid="edge-assoc-class-select"
              aria-label={tr('editor.associationClass')}
              value={selectedEdgeData.edge.associationClassId ?? ''}
              onChange={(event) =>
                handleUpdateAssociationMeta(doc, diagram.id, selectedEdgeData.edge.id, {
                  associationClassId: event.target.value || null,
                })
              }
            >
              <option value="">{tr('editor.noAssociationClass')}</option>
              {diagram.classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      <button
        type="button"
        className="diagram-canvas__delete-edge"
        aria-label={tr('editor.deleteAria', { type: selectedEdgeData.type, id: selectedEdgeData.edge.id })}
        onClick={deleteSelectedEdge}
      >
        {tr('editor.delete', { type: selectedEdgeData.type })}
      </button>
      <button
        type="button"
        className="diagram-canvas__close-edge-editor"
        aria-label={tr('editor.closeAria')}
        onClick={() => setSelectedEdge(null)}
      >
        {tr('editor.close')}
      </button>
    </div>
  );
}
