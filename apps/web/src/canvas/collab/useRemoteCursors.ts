import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebsocketProvider } from 'y-websocket';
import type { RemoteCursorPeer } from './RemoteCursors';

export interface UseRemoteCursorsOptions {
  provider?: WebsocketProvider | null;
  screenToFlowPosition?: (pos: { x: number; y: number }) => { x: number; y: number };
}

export function useRemoteCursors({
  provider,
  screenToFlowPosition,
}: UseRemoteCursorsOptions) {
  const [remotePeers, setRemotePeers] = useState<RemoteCursorPeer[]>([]);

  useEffect(() => {
    if (!provider) {
      setRemotePeers([]);
      return;
    }

    const syncPeers = () => {
      const states = provider.awareness.getStates();
      const localClientId = provider.awareness.clientID;
      const peers: RemoteCursorPeer[] = [];

      for (const [clientId, state] of states.entries()) {
        if (clientId === localClientId) continue;
        const user = (state as any).user;
        const cursor = (state as any).cursor;
        const selectedNodeIds = (state as any).selectedNodeIds;
        if (user?.name) {
          peers.push({
            clientId,
            name: user.name,
            color: user.color ?? '#0284c7',
            cursor: cursor ?? null,
            selectedNodeIds: Array.isArray(selectedNodeIds) ? selectedNodeIds : [],
          });
        }
      }
      setRemotePeers(peers);
    };

    provider.awareness.on('change', syncPeers);
    syncPeers();

    return () => {
      provider.awareness.off('change', syncPeers);
    };
  }, [provider]);

  const rafId = useRef<number | null>(null);
  const pendingPos = useRef<{ x: number; y: number } | null>(null);

  const updateCursor = useCallback(
    (clientX: number, clientY: number) => {
      if (!provider) return;
      pendingPos.current = { x: clientX, y: clientY };

      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(() => {
          rafId.current = null;
          if (pendingPos.current && screenToFlowPosition) {
            try {
              const flowPos = screenToFlowPosition(pendingPos.current);
              if (Number.isFinite(flowPos.x) && Number.isFinite(flowPos.y)) {
                provider.awareness.setLocalStateField('cursor', flowPos);
              }
            } catch {
              // Ignorar si el viewport no está listo
            }
          }
        });
      }
    },
    [provider, screenToFlowPosition],
  );

  const clearCursor = useCallback(() => {
    if (!provider) return;
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    pendingPos.current = null;
    provider.awareness.setLocalStateField('cursor', null);
  }, [provider]);

  const broadcastSelection = useCallback(
    (selectedNodeIds: string[]) => {
      if (!provider) return;
      provider.awareness.setLocalStateField('selectedNodeIds', selectedNodeIds);
    },
    [provider],
  );

  return { remotePeers, updateCursor, clearCursor, broadcastSelection };
}
