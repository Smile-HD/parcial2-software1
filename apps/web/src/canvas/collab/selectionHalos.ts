export interface RemoteSelectionPeer {
  clientId: number | string;
  name: string;
  color: string;
  selectedNodeIds?: readonly string[];
}

export interface RemoteNodeSelection {
  name: string;
  color: string;
}

/**
 * Agrupa los nodos seleccionados por usuarios remotos en un mapa nodeId -> info de usuario.
 */
export function getRemoteNodeSelections(
  peers: readonly RemoteSelectionPeer[],
): Map<string, RemoteNodeSelection> {
  const map = new Map<string, RemoteNodeSelection>();

  for (const peer of peers) {
    if (!peer.selectedNodeIds || !Array.isArray(peer.selectedNodeIds)) {
      continue;
    }
    for (const nodeId of peer.selectedNodeIds) {
      if (!map.has(nodeId)) {
        map.set(nodeId, {
          name: peer.name,
          color: peer.color,
        });
      }
    }
  }

  return map;
}
