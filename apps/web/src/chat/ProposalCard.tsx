import React from 'react';
import type { Delta } from '@app/core';
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

  // Desglose de elementos si es un batch
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
            {items.length > 1 && (
              <ul className="proposal-card__items-list">
                {items.map((item, idx) => (
                  <li key={idx} className="proposal-card__item">
                    <span className="proposal-card__item-bullet">+</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="proposal-card__hint">
              {isEn
                ? 'Preview ghost elements are projected on the canvas.'
                : 'Los elementos fantasma están proyectados en el lienzo.'}
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
