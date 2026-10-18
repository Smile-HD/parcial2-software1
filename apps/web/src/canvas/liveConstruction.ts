import type * as Y from 'yjs';
import type { Delta, Diagram } from '@app/core';
import { projectYDocToDiagram } from '@app/core';
import { applyDeltaToYDoc } from './applyDeltaToYDoc';
import type { RemoteCursorPeer } from './RemoteCursors';

export interface LiveConstructionContext {
  doc: Y.Doc;
  delta: Delta;
  setVirtualPeer: (peer: RemoteCursorPeer | null) => void;
  stepDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeLiveAmongusBuild(
  contextOrDoc: LiveConstructionContext | Y.Doc,
  deltaArg?: Delta,
  setVirtualPeerArg?: (peer: RemoteCursorPeer | null) => void,
  stepDelayMsArg?: number,
): Promise<void> {
  const isPositional = typeof (contextOrDoc as any)?.transact === 'function';
  const doc = isPositional ? (contextOrDoc as Y.Doc) : (contextOrDoc as LiveConstructionContext).doc;
  const delta = isPositional ? deltaArg! : (contextOrDoc as LiveConstructionContext).delta;
  const setVirtualPeer = isPositional ? setVirtualPeerArg! : (contextOrDoc as LiveConstructionContext).setVirtualPeer;
  const stepDelayMs = (isPositional ? stepDelayMsArg : (contextOrDoc as LiveConstructionContext).stepDelayMs) ?? 60;

  const amongusBase: Omit<RemoteCursorPeer, 'cursor'> = {
    clientId: 'amongus-agent',
    name: 'Amongus (IA)',
    color: '#06b6d4',
  };

  try {
    if (delta.kind === 'batch') {
      for (const sub of delta.deltas) {
        if (sub.kind === 'class' && sub.op === 'create') {
          const pos = sub.position ?? { x: 200, y: 150 };
          setVirtualPeer({
            ...amongusBase,
            cursor: { x: pos.x + 80, y: pos.y + 30 },
          });
          await sleep(stepDelayMs);
          applyDeltaToYDoc(doc, sub);
        } else if (sub.kind === 'member') {
          // Buscar posición de la clase afectada
          const current = projectYDocToDiagram(doc);
          const cls = current.classes.find((c) => c.id === sub.classId);
          const pos = cls?.position ?? { x: 200, y: 150 };
          setVirtualPeer({
            ...amongusBase,
            cursor: { x: pos.x + 80, y: pos.y + 60 },
          });
          await sleep(stepDelayMs);
          applyDeltaToYDoc(doc, sub);
        } else if (sub.kind === 'association') {
          const current = projectYDocToDiagram(doc);
          const src = current.classes.find((c) => c.id === sub.sourceClassId);
          const tgt = current.classes.find((c) => c.id === sub.targetClassId);
          const midX = src && tgt ? (src.position.x + tgt.position.x) / 2 : 250;
          const midY = src && tgt ? (src.position.y + tgt.position.y) / 2 : 200;
          setVirtualPeer({
            ...amongusBase,
            cursor: { x: midX, y: midY },
          });
          await sleep(stepDelayMs);
          applyDeltaToYDoc(doc, sub);
        } else {
          await sleep(stepDelayMs / 2);
          applyDeltaToYDoc(doc, sub);
        }
      }
    } else {
      // Delta atómico
      if (delta.kind === 'class' && delta.op === 'create') {
        const pos = delta.position ?? { x: 200, y: 150 };
        setVirtualPeer({
          ...amongusBase,
          cursor: { x: pos.x + 80, y: pos.y + 30 },
        });
        await sleep(stepDelayMs);
      }
      applyDeltaToYDoc(doc, delta);
      await sleep(stepDelayMs);
    }
  } finally {
    await sleep(200);
    setVirtualPeer(null);
  }
}
