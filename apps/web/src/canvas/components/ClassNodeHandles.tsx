/**
 * Handles de conexión de React Flow y puntos de acoplamiento Enterprise Architect para ClassNode.
 */
import { Handle, Position } from '@xyflow/react';

export interface ClassNodeHandlesProps {
  connectArmed?: boolean;
}

export function ClassNodeHandles({ connectArmed }: ClassNodeHandlesProps) {
  return (
    <>
      {/* Default handles */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Top} id="target-top" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" />

      {/* Enterprise Architect multi-point docking handles */}
      {/* Left border docking points */}
      <Handle type="source" position={Position.Left} id="left-source" style={{ top: '50%' }} />
      <Handle type="target" position={Position.Left} id="left-top-target" style={{ top: '25%' }} />
      <Handle type="source" position={Position.Left} id="left-top-source" style={{ top: '25%' }} />
      <Handle type="target" position={Position.Left} id="left-bottom-target" style={{ top: '75%' }} />
      <Handle type="source" position={Position.Left} id="left-bottom-source" style={{ top: '75%' }} />

      {/* Right border docking points */}
      <Handle type="target" position={Position.Right} id="right-target" style={{ top: '50%' }} />
      <Handle type="source" position={Position.Right} id="right-top-source" style={{ top: '25%' }} />
      <Handle type="target" position={Position.Right} id="right-top-target" style={{ top: '25%' }} />
      <Handle type="source" position={Position.Right} id="right-bottom-source" style={{ top: '75%' }} />
      <Handle type="target" position={Position.Right} id="right-bottom-target" style={{ top: '75%' }} />

      {/* Top border docking points */}
      <Handle type="source" position={Position.Top} id="top-source" style={{ left: '50%' }} />
      <Handle type="target" position={Position.Top} id="top-left-target" style={{ left: '25%' }} />
      <Handle type="source" position={Position.Top} id="top-left-source" style={{ left: '25%' }} />
      <Handle type="target" position={Position.Top} id="top-right-target" style={{ left: '75%' }} />
      <Handle type="source" position={Position.Top} id="top-right-source" style={{ left: '75%' }} />

      {/* Bottom border docking points */}
      <Handle type="target" position={Position.Bottom} id="bottom-target" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Bottom} id="bottom-left-source" style={{ left: '25%' }} />
      <Handle type="target" position={Position.Bottom} id="bottom-left-target" style={{ left: '25%' }} />
      <Handle type="source" position={Position.Bottom} id="bottom-right-source" style={{ left: '75%' }} />
      <Handle type="target" position={Position.Bottom} id="bottom-right-target" style={{ left: '75%' }} />

      {/* Arrastre para conectar en todo el nodo cuando una herramienta de borde está armada */}
      {connectArmed === true && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="connect-body"
            data-testid="node-connect-overlay"
            className="uml-class__connect-overlay"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              minWidth: 0,
              minHeight: 0,
              transform: 'none',
              borderRadius: 0,
              border: 'none',
              background: 'transparent',
              boxShadow: 'none',
              zIndex: 5,
            }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="connect-body-target"
            data-testid="node-connect-target-overlay"
            className="uml-class__connect-target-overlay"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              minWidth: 0,
              minHeight: 0,
              transform: 'none',
              borderRadius: 0,
              border: 'none',
              background: 'transparent',
              boxShadow: 'none',
              zIndex: 4,
            }}
          />
        </>
      )}
    </>
  );
}

