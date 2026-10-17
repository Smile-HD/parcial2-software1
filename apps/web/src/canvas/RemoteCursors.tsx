import React from 'react';

export interface RemoteCursorPeer {
  clientId: number | string;
  name: string;
  color: string;
  cursor?: { x: number; y: number } | null;
}

export interface RemoteCursorsProps {
  peers: readonly RemoteCursorPeer[];
}

export function RemoteCursors({ peers }: RemoteCursorsProps) {
  const activePeers = peers.filter(
    (peer): peer is RemoteCursorPeer & { cursor: { x: number; y: number } } =>
      peer.cursor !== null &&
      peer.cursor !== undefined &&
      typeof peer.cursor.x === 'number' &&
      typeof peer.cursor.y === 'number',
  );

  if (activePeers.length === 0) {
    return null;
  }

  return (
    <div
      className="remote-cursors-overlay"
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1000,
        overflow: 'visible',
      }}
    >
      {activePeers.map((peer) => {
        const { x, y } = peer.cursor;
        return (
          <div
            key={peer.clientId}
            data-testid={`remote-cursor-${peer.clientId}`}
            className="remote-cursor"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translate(${x}px, ${y}px)`,
              transition: 'transform 0.05s linear',
              pointerEvents: 'none',
              willChange: 'transform',
            }}
          >
            {/* Puntero SVG estilo Figma / Excalidraw */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
                display: 'block',
              }}
            >
              <path
                d="M0 0L7 19L10 12L17 9L0 0Z"
                fill={peer.color}
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>

            {/* Etiqueta flotante con el nombre del usuario */}
            <span
              className="remote-cursor__label"
              style={{
                position: 'absolute',
                top: '14px',
                left: '12px',
                backgroundColor: peer.color,
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '4px',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                lineHeight: '1.2',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            >
              {peer.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
