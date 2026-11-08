/**
 * Controles de zoom sobre el lienzo: Zoom In, Zoom Out, Indicador de Nivel y Reset.
 */
import React from 'react';
import { useT } from '../../i18n';

export interface CanvasZoomControlsProps {
  currentZoom: number;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
}

export function CanvasZoomControls({
  currentZoom,
  handleZoomIn,
  handleZoomOut,
  handleZoomReset,
}: CanvasZoomControlsProps) {
  const { t: tr } = useT();

  return (
    <div
      className="diagram-zoom-controls"
      data-testid="diagram-zoom-controls"
      role="toolbar"
      aria-label={tr('canvas.zoomControls')}
    >
      <button
        type="button"
        className="diagram-zoom-controls__button diagram-zoom-controls__button--in"
        data-testid="zoom-in-button"
        aria-label={tr('canvas.zoomIn')}
        title={tr('canvas.zoomIn')}
        onClick={handleZoomIn}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <button
        type="button"
        className="diagram-zoom-controls__button diagram-zoom-controls__button--out"
        data-testid="zoom-out-button"
        aria-label={tr('canvas.zoomOut')}
        title={tr('canvas.zoomOut')}
        onClick={handleZoomOut}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <span
        className="diagram-zoom-controls__level"
        data-testid="zoom-level-indicator"
        title={tr('canvas.zoomLevel')}
      >
        {Math.round(currentZoom * 100)}%
      </span>
      <button
        type="button"
        className="diagram-zoom-controls__button diagram-zoom-controls__button--reset"
        data-testid="zoom-reset-button"
        aria-label={tr('canvas.zoomReset')}
        title={tr('canvas.zoomReset')}
        onClick={handleZoomReset}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>
    </div>
  );
}

