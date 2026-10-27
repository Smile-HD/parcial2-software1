import React from 'react';
import type { Delta, BatchDelta } from '@app/core';
import { describeDelta } from '../interpreter/DeltaPreviewModal';
import { AmongusAvatar } from './AmongusAvatar';
import { useT } from '../i18n';

export interface ProposalCardProps {
  deltaId: string;
  delta: Delta;
  onConfirm: (deltaId: string, delta: Delta) => void;
  onReject: (deltaId: string) => void;
  isApplied?: boolean;
  isRejected?: boolean;
  isBuilding?: boolean;
}

export function ProposalCard({
  deltaId,
  delta,
  onConfirm,
  onReject,
  isApplied = false,
  isRejected = false,
  isBuilding = false,
}: ProposalCardProps) {
  const { lang } = useT();
  const isEn = lang === 'en';

  const summary = describeDelta(delta);

  // Agrupamiento estructurado cuando es un batchDelta
  const parsedBatch = delta.kind === 'batch' ? parseBatchDelta(delta, isEn) : null;
  const items: string[] = delta.kind === 'batch'
    ? delta.deltas.map((d) => describeDelta(d))
    : [summary];

  return (
    <div
      className={`proposal-card ${isApplied ? 'proposal-card--applied' : ''} ${isRejected ? 'proposal-card--rejected' : ''}`}
      data-testid={`proposal-card-${deltaId}`}
    >
      <div className="proposal-card__header">
        <div className="proposal-card__header-title">
          <AmongusAvatar size={18} isAnimated={isBuilding} />
          <span>{isEn ? 'AI Modeling Proposal' : 'Propuesta de Modelado UML'}</span>
        </div>
        <span className="proposal-card__badge">
          {isApplied
            ? (isEn ? 'Applied' : 'Aplicado')
            : isRejected
              ? (isEn ? 'Discarded' : 'Descartado')
              : isBuilding
                ? (isEn ? 'Building...' : 'Construyendo...')
                : (isEn ? 'Ghost Preview' : 'Vista Previa')}
        </span>
      </div>

      <div className="proposal-card__body">
        {!isApplied && !isRejected && (
          <>
            <p className="proposal-card__summary-main">{summary}</p>

            {parsedBatch && (parsedBatch.classes.length > 0 || parsedBatch.relations.length > 0) ? (
              <div className="proposal-card__structured-content">
                {/* 1. Clases con sus atributos */}
                {parsedBatch.classes.length > 0 && (
                  <div className="proposal-card__classes-group">
                    {parsedBatch.classes.map((cls) => (
                      <div key={cls.id} className="proposal-card__class-item">
                        <div className="proposal-card__class-header">
                          <span className="proposal-card__class-badge">{isEn ? 'Class' : 'Clase'}</span>
                          <span className="proposal-card__class-name">{cls.name}</span>
                        </div>
                        {cls.attributes.length > 0 && (
                          <div className="proposal-card__attrs-row">
                            <span className="proposal-card__section-label">{isEn ? 'Attributes:' : 'Atributos:'}</span>
                            <div className="proposal-card__attr-pills">
                              {cls.attributes.map((attr, aIdx) => (
                                <span key={aIdx} className="proposal-card__attr-pill">
                                  {attr}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {cls.methods.length > 0 && (
                          <div className="proposal-card__methods-row">
                            <span className="proposal-card__section-label">{isEn ? 'Methods:' : 'Métodos:'}</span>
                            <div className="proposal-card__attr-pills">
                              {cls.methods.map((m, mIdx) => (
                                <span key={mIdx} className="proposal-card__method-pill">
                                  {m}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. Relaciones al final */}
                {parsedBatch.relations.length > 0 && (
                  <div className="proposal-card__relations-group">
                    <span className="proposal-card__section-label">{isEn ? 'Relationships:' : 'Relaciones:'}</span>
                    <ul className="proposal-card__relations-list">
                      {parsedBatch.relations.map((rel, rIdx) => (
                        <li key={rIdx} className="proposal-card__rel-item">
                          <span className="proposal-card__rel-icon">🔗</span>
                          <span>{rel}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 3. Otras operaciones si existen */}
                {parsedBatch.others.length > 0 && (
                  <ul className="proposal-card__items-list">
                    {parsedBatch.others.map((item, idx) => (
                      <li key={idx} className="proposal-card__item">
                        <span className="proposal-card__item-bullet">+</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              items.length > 1 && (
                <ul className="proposal-card__items-list">
                  {items.map((item, idx) => (
                    <li key={idx} className="proposal-card__item">
                      <span className="proposal-card__item-bullet">+</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )
            )}

            <p className="proposal-card__hint">
              {isEn
                ? 'Preview ghost elements are projected on the canvas. Type /apply or click Confirm to build.'
                : 'Los elementos fantasma están proyectados en el lienzo. Escribí /apply o hacé clic en Aprobar.'}
            </p>
          </>
        )}
      </div>

      {!isApplied && !isRejected && (
        <div className="proposal-card__actions">
          <button
            type="button"
            className="proposal-card__btn-reject"
            onClick={() => onReject(deltaId)}
            disabled={isBuilding}
            data-testid="proposal-reject"
            aria-label={isEn ? 'Reject' : 'Descartar'}
          >
            {isEn ? 'Reject' : 'Descartar'}
          </button>
          <button
            type="button"
            className="proposal-card__btn-confirm"
            onClick={() => onConfirm(deltaId, delta)}
            disabled={isBuilding}
            data-testid="proposal-confirm"
            aria-label={isEn ? 'Confirm' : 'Aprobar'}
          >
            {isBuilding ? (
              <span>{isEn ? 'Building...' : 'Construyendo...'}</span>
            ) : (
              <span>{isEn ? 'Confirm' : 'Aprobar'}</span>
            )}
          </button>
        </div>
      )}

      {isApplied && (
        <div className="proposal-card__status-applied">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{isEn ? 'Changes applied to canvas' : 'Cambios aplicados al lienzo'}</span>
        </div>
      )}

      {isRejected && (
        <div className="proposal-card__status-rejected">
          <span>{isEn ? 'Proposal discarded' : 'Propuesta descartada'}</span>
        </div>
      )}
    </div>
  );
}

interface ParsedClass {
  id: string;
  name: string;
  attributes: string[];
  methods: string[];
}

interface ParsedProposalBatch {
  classes: ParsedClass[];
  relations: string[];
  others: string[];
}

function parseBatchDelta(batch: BatchDelta, isEn: boolean): ParsedProposalBatch {
  const classNameMap = new Map<string, string>();
  const classMap = new Map<string, ParsedClass>();
  const relations: string[] = [];
  const others: string[] = [];

  // Paso 1: Registrar clases creadas o modificadas
  for (const d of batch.deltas) {
    if (d.kind === 'class') {
      if (d.op === 'create') {
        const name = d.name ?? (isEn ? 'Class' : 'Clase');
        classNameMap.set(d.classId, name);
        if (!classMap.has(d.classId)) {
          classMap.set(d.classId, { id: d.classId, name, attributes: [], methods: [] });
        }
      } else if (d.op === 'rename') {
        const name = d.newName ?? (isEn ? 'Class' : 'Clase');
        classNameMap.set(d.classId, name);
        const existing = classMap.get(d.classId);
        if (existing) existing.name = name;
      }
    }
  }

  // Paso 2: Atributos agrupados bajo su clase correspondiente y Relaciones al final
  for (const d of batch.deltas) {
    if (d.kind === 'member') {
      const cls = classMap.get(d.classId);
      if (d.op === 'addAttribute') {
        const attrStr = `${d.name ?? 'attr'}: ${d.type ?? 'string'}`;
        if (cls) {
          cls.attributes.push(attrStr);
        } else {
          others.push(`+ Atributo "${attrStr}"`);
        }
      } else if (d.op === 'addMethod') {
        const methodStr = `${d.name ?? 'method'}(): ${d.returnType ?? 'void'}`;
        if (cls) {
          cls.methods.push(methodStr);
        } else {
          others.push(`+ Método "${methodStr}"`);
        }
      } else {
        others.push(describeDelta(d));
      }
    } else if (d.kind === 'association') {
      if (d.op === 'create') {
        const src = (d.sourceClassId ? classNameMap.get(d.sourceClassId) : undefined) ?? (isEn ? 'Source' : 'Origen');
        const tgt = (d.targetClassId ? classNameMap.get(d.targetClassId) : undefined) ?? (isEn ? 'Target' : 'Destino');
        const srcM = d.sourceMultiplicity ? `(${d.sourceMultiplicity}) ` : '';
        const tgtM = d.targetMultiplicity ? ` (${d.targetMultiplicity})` : '';

        let kindLabel = isEn ? 'Association' : 'Asociación';
        if (d.aggregation === 'composite') {
          kindLabel = isEn ? 'Composition' : 'Composición';
        } else if (d.aggregation === 'shared') {
          kindLabel = isEn ? 'Aggregation' : 'Agregación';
        }

        relations.push(`${kindLabel}: ${src} ${srcM}↔${tgtM} ${tgt}`);
      } else {
        relations.push(describeDelta(d));
      }
    } else if (d.kind === 'generalization') {
      if (d.op === 'create') {
        const sub = (d.subClassId ? classNameMap.get(d.subClassId) : undefined) ?? (isEn ? 'Subclass' : 'Subclase');
        const sup = (d.superClassId ? classNameMap.get(d.superClassId) : undefined) ?? (isEn ? 'Superclass' : 'Superclase');
        relations.push(isEn ? `Inheritance: ${sub} inherits from ${sup}` : `Herencia: ${sub} hereda de ${sup}`);
      } else {
        relations.push(describeDelta(d));
      }
    } else if (d.kind === 'realization') {
      if (d.op === 'create') {
        const cl = (d.clientClassId ? classNameMap.get(d.clientClassId) : undefined) ?? (isEn ? 'Class' : 'Clase');
        const iface = (d.supplierInterfaceId ? classNameMap.get(d.supplierInterfaceId) : undefined) ?? (isEn ? 'Interface' : 'Interfaz');
        relations.push(isEn ? `Realization: ${cl} implements ${iface}` : `Realización: ${cl} implementa ${iface}`);
      } else {
        relations.push(describeDelta(d));
      }
    } else if (d.kind === 'dependency') {
      if (d.op === 'create') {
        const cl = (d.clientClassId ? classNameMap.get(d.clientClassId) : undefined) ?? (isEn ? 'Class' : 'Clase');
        const dep = (d.supplierClassId ? classNameMap.get(d.supplierClassId) : undefined) ?? (isEn ? 'Dependency' : 'Dependencia');
        relations.push(isEn ? `Dependency: ${cl} -> ${dep}` : `Dependencia: ${cl} -> ${dep}`);
      } else {
        relations.push(describeDelta(d));
      }
    } else if (d.kind !== 'class') {
      others.push(describeDelta(d));
    }
  }

  return {
    classes: Array.from(classMap.values()),
    relations,
    others,
  };
}

