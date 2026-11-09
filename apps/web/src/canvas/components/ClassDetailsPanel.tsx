import React from 'react';
import type * as Y from 'yjs';
import type { Generalization, Realization, Dependency } from '@app/core';
import {
  handleDeleteGeneralization,
  handleDeleteRealization,
  handleDeleteDependency,
} from '../operations/index.js';
import type { TKey } from '../../i18n.js';

export interface ClassDetailsPanelProps {
  doc: Y.Doc;
  diagramId: string;
  selectedClass: { id: string; name: string } | null;
  selectedClassGeneralizations: Generalization[];
  selectedClassRealizations: Realization[];
  selectedClassDependencies: Dependency[];
  classNameById: (id: string) => string;
  tr: (key: TKey, params?: Record<string, string | number>) => string;
}

export function ClassDetailsPanel({
  doc,
  diagramId,
  selectedClass,
  selectedClassGeneralizations,
  selectedClassRealizations,
  selectedClassDependencies,
  classNameById,
  tr,
}: ClassDetailsPanelProps) {
  if (!selectedClass) return null;

  return (
    <>
      <div className="diagram-canvas__generalizations" data-testid="generalization-panel">
        <span className="diagram-canvas__generalizations-title">
          {tr('panel.generalizationsFor', { name: selectedClass.name })}
        </span>
        {selectedClassGeneralizations.length === 0 && (
          <span className="diagram-canvas__generalizations-empty">{tr('panel.none')}</span>
        )}
        {selectedClassGeneralizations.map((gen) => (
          <div key={gen.id} className="diagram-canvas__generalization-row">
            <span>
              {gen.subClassId === selectedClass.id
                ? tr('panel.inheritsFrom', { name: classNameById(gen.superClassId) })
                : tr('panel.inheritedBy', { name: classNameById(gen.subClassId) })}
            </span>
            <button
              type="button"
              className="diagram-canvas__delete-generalization"
              aria-label={tr('panel.removeInheritanceAria', { id: gen.id })}
              onClick={() => handleDeleteGeneralization(doc, diagramId, gen.id)}
            >
              {tr('panel.removeInheritance')}
            </button>
          </div>
        ))}
      </div>

      <div className="diagram-canvas__realizations" data-testid="realization-panel">
        <span className="diagram-canvas__realizations-title">
          {tr('panel.realizationsFor', { name: selectedClass.name })}
        </span>
        {selectedClassRealizations.length === 0 && (
          <span className="diagram-canvas__realizations-empty">{tr('panel.none')}</span>
        )}
        {selectedClassRealizations.map((real) => (
          <div key={real.id} className="diagram-canvas__realization-row">
            <span>
              {real.clientClassId === selectedClass.id
                ? tr('panel.realizes', { name: classNameById(real.supplierInterfaceId) })
                : tr('panel.realizedBy', { name: classNameById(real.clientClassId) })}
            </span>
            <button
              type="button"
              className="diagram-canvas__delete-realization"
              aria-label={tr('panel.removeRealizationAria', { id: real.id })}
              onClick={() => handleDeleteRealization(doc, diagramId, real.id)}
            >
              {tr('panel.removeRealization')}
            </button>
          </div>
        ))}
      </div>

      <div className="diagram-canvas__dependencies" data-testid="dependency-panel">
        <span className="diagram-canvas__dependencies-title">
          {tr('panel.dependenciesFor', { name: selectedClass.name })}
        </span>
        {selectedClassDependencies.length === 0 && (
          <span className="diagram-canvas__dependencies-empty">{tr('panel.none')}</span>
        )}
        {selectedClassDependencies.map((dep) => (
          <div key={dep.id} className="diagram-canvas__dependency-row">
            <span>
              {dep.clientClassId === selectedClass.id
                ? tr('panel.dependsOn', { name: classNameById(dep.supplierClassId) })
                : tr('panel.dependencyFrom', { name: classNameById(dep.clientClassId) })}
            </span>
            <button
              type="button"
              className="diagram-canvas__delete-dependency"
              aria-label={tr('panel.removeDependencyAria', { id: dep.id })}
              onClick={() => handleDeleteDependency(doc, diagramId, dep.id)}
            >
              {tr('panel.removeDependency')}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
