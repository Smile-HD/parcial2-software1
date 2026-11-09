import React from 'react';
import type * as Y from 'yjs';
import type { Diagram, NaryAssociation } from '@app/core';
import { handleDeleteNaryAssociation } from '../operations/index.js';
import type { TKey } from '../../i18n.js';

export interface NaryEditorPanelProps {
  doc: Y.Doc;
  diagram: Diagram;
  selectedNary: NaryAssociation | null;
  commitNaryName: (val: string) => void;
  commitNaryEndMultiplicity: (classId: string, val: string) => void;
  setSelectedNaryId: (id: string | null) => void;
  tr: (key: TKey, params?: Record<string, string | number>) => string;
}

export function NaryEditorPanel({
  doc,
  diagram,
  selectedNary,
  commitNaryName,
  commitNaryEndMultiplicity,
  setSelectedNaryId,
  tr,
}: NaryEditorPanelProps) {
  if (!selectedNary) return null;

  return (
    <div className="diagram-canvas__edge-editor" data-testid="nary-editor" key={selectedNary.id}>
      <span className="diagram-canvas__edge-editor-title">{tr('naryEditor.title')}</span>
      <label>
        {tr('nary.name')}
        <input
          aria-label={tr('naryEditor.nameAria')}
          defaultValue={selectedNary.name ?? ''}
          onBlur={(event) => commitNaryName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitNaryName((event.target as HTMLInputElement).value);
            }
          }}
        />
      </label>
      {selectedNary.memberEnds.map((end) => {
        const cls = diagram.classes.find((candidate) => candidate.id === end.classId);
        return (
          <label key={end.classId} className="diagram-canvas__nary-end">
            {cls?.name ?? '?'}
            <input
              aria-label={tr('naryEditor.endMultiplicityAria', { name: cls?.name ?? end.classId })}
              defaultValue={end.multiplicity}
              onBlur={(event) => commitNaryEndMultiplicity(end.classId, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitNaryEndMultiplicity(end.classId, (event.target as HTMLInputElement).value);
                }
              }}
            />
          </label>
        );
      })}
      <button
        type="button"
        className="diagram-canvas__delete-edge"
        aria-label={tr('naryEditor.deleteAria', { id: selectedNary.id })}
        onClick={() => {
          handleDeleteNaryAssociation(doc, diagram.id, selectedNary.id);
          setSelectedNaryId(null);
        }}
      >
        {tr('naryEditor.delete')}
      </button>
      <button
        type="button"
        className="diagram-canvas__close-edge-editor"
        aria-label={tr('naryEditor.closeAria')}
        onClick={() => setSelectedNaryId(null)}
      >
        {tr('editor.close')}
      </button>
    </div>
  );
}
