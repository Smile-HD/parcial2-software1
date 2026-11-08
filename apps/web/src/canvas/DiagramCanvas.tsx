/**
 * DiagramCanvas — lienzo React Flow renderizado exclusivamente desde un Y.Doc.
 *
 * editor:R1 — el Y.Doc ES la IR canónica; el estado de React es una proyección
 * derivada que activa el re-renderizado cuando cambia el Y.Doc.
 * Ninguna mutación evade applyDelta (ver applyDeltaToYDoc).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ViewportPortal,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type * as Y from 'yjs';

import {
  projectYDocToDiagram,
  type ClassDelta,
  type Delta,
  type Diagram,
  type MemberDelta,
  type Parameter,
} from '@app/core';

import './canvas.css';
import { ClassNode, type MemberAdornments } from './ClassNode';
import { NaryDiamondNode } from './NaryDiamondNode';
import { applyDeltaToYDoc } from './applyDeltaToYDoc';
import { AssociationEdge } from './AssociationEdge';
import { GeneralizationEdge } from './GeneralizationEdge';
import { RealizationEdge } from './RealizationEdge';
import { DependencyEdge } from './DependencyEdge';
import { NaryEndEdge } from './NaryEndEdge';
import { Palette, type PaletteEdgeTool, type PaletteNodeKind } from './Palette';
import { QuickLinkerMenu } from './QuickLinkerMenu';
import type { WebsocketProvider } from 'y-websocket';
import { useRemoteCursors } from './useRemoteCursors';
import { RemoteCursors, type RemoteCursorPeer } from './RemoteCursors';
import { getRemoteNodeSelections } from './selectionHalos';
import { EdgeCrossingProvider } from './EdgeCrossingContext';
import {
  elementMenuOptions,
  validConnectorsFor,
  type QuickConnectorType,
} from './quickLinker';
import { useT, type TKey } from '../i18n';
import { useCanvasZoom } from './hooks/useCanvasZoom.js';
import { useQuickLinker } from './hooks/useQuickLinker.js';
import { usePaletteDnD } from './hooks/usePaletteDnD.js';
import { useGhostDeltas } from './hooks/useGhostDeltas.js';
import { useCanvasProjection } from './hooks/useCanvasProjection.js';
import { useCanvasKeyboard } from './hooks/useCanvasKeyboard.js';
import { CanvasZoomControls } from './components/CanvasZoomControls.js';
import { EdgeEditorPanel } from './components/EdgeEditorPanel.js';
import { NaryEditorPanel } from './components/NaryEditorPanel.js';
import { ClassDetailsPanel } from './components/ClassDetailsPanel.js';

const nodeTypes = { class: ClassNode, naryDiamond: NaryDiamondNode };
const edgeTypes = {
  association: AssociationEdge,
  generalization: GeneralizationEdge,
  realization: RealizationEdge,
  dependency: DependencyEdge,
  naryEnd: NaryEndEdge,
};

type EditorEdgeType = 'association' | 'generalization' | 'realization' | 'dependency';

const EDGE_TYPE_KEYS: Record<EditorEdgeType, TKey> = {
  association: 'tool.association',
  generalization: 'tool.generalization',
  realization: 'tool.realization',
  dependency: 'tool.dependency',
};

const CONNECTOR_TOOL_KEYS: Record<QuickConnectorType, TKey> = {
  association: 'tool.association',
  associationClass: 'tool.associationClass',
  aggregation: 'tool.aggregation',
  composition: 'tool.composition',
  generalization: 'tool.generalization',
  realization: 'tool.realization',
  dependency: 'tool.dependency',
};

const ELEMENT_TOOL_KEYS: Record<PaletteNodeKind, TKey> = {
  class: 'tool.class',
  interface: 'tool.interface',
};

export * from './operations/index.js';
import {
  handleUpdateAssociationMeta,
  handleDeleteAssociation,
  handleDeleteGeneralization,
  handleDeleteRealization,
  handleDeleteDependency,
  handleUpdateGeneralizationLabel,
  handleUpdateRealizationLabel,
  handleUpdateDependencyLabel,
  isEditorEdgeType,
  type NaryMemberEndInput,
  handleCreateNaryAssociation,
  handleUpdateNaryAssociation,
} from './operations/index.js';

export interface DiagramCanvasProps {
  doc: Y.Doc;
  provider?: WebsocketProvider | null;
  ghostDelta?: Delta | null;
  virtualPeer?: RemoteCursorPeer | null;
}

export function DiagramCanvas({ doc, provider, ghostDelta, virtualPeer }: DiagramCanvasProps) {
  const { t: tr } = useT();
  const [diagram, setDiagram] = useState<Diagram>(() => projectYDocToDiagram(doc));

  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<{ id: string; type: EditorEdgeType } | null>(null);
  const [edgeHandles, setEdgeHandles] = useState<
    Record<string, { sourceHandle?: string; targetHandle?: string }>
  >({});
  const [selectedNaryId, setSelectedNaryId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [naryMode, setNaryMode] = useState(false);
  const [narySelection, setNarySelection] = useState<string[]>([]);
  const [naryEnds, setNaryEnds] = useState<Record<string, string>>({});
  const [naryName, setNaryName] = useState('');
  const [edgeTool, setEdgeTool] = useState<PaletteEdgeTool | null>(null);
  const [edgeMessage, setEdgeMessage] = useState<string | null>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  const { remotePeers, updateCursor, clearCursor, broadcastSelection } = useRemoteCursors({
    provider,
    screenToFlowPosition: (pos) => rfRef.current?.screenToFlowPosition(pos) ?? pos,
  });
  const [remoteSelections, setRemoteSelections] = useState<Map<string, import('./selectionHalos').RemoteSelectionInfo>>(() => new Map());
  useEffect(() => {
    const next = getRemoteNodeSelections(remotePeers);
    setRemoteSelections((prev) => {
      if (prev.size !== next.size) return next;
      for (const [k, v] of next.entries()) {
        const p = prev.get(k);
        if (!p || p.color !== v.color || p.name !== v.name) return next;
      }
      return prev;
    });
  }, [remotePeers]);

  useEffect(() => {
    broadcastSelection(selectedClassId ? [selectedClassId] : []);
  }, [selectedClassId, broadcastSelection]);

  const {
    currentZoom,
    recordClickPoint,
    handleCanvasClickCapture,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
  } = useCanvasZoom({ rfRef, classes: diagram.classes });

  useEffect(() => {
    const sync = (_update: Uint8Array, origin: unknown): void => {
      if (origin === 'local-drag') return;
      setDiagram(projectYDocToDiagram(doc));
    };
    doc.on('update', sync);
    return () => {
      doc.off('update', sync);
    };
  }, [doc]);

  const canvasBoundary = useMemo(() => {
    let minX = 0;
    let minY = 0;
    let maxX = 3200;
    let maxY = 2200;

    for (const cls of diagram.classes) {
      if (cls.position.x - 100 < minX) minX = Math.floor((cls.position.x - 100) / 20) * 20;
      if (cls.position.y - 100 < minY) minY = Math.floor((cls.position.y - 100) / 20) * 20;
      if (cls.position.x + 360 > maxX) maxX = Math.ceil((cls.position.x + 360) / 20) * 20;
      if (cls.position.y + 260 > maxY) maxY = Math.ceil((cls.position.y + 260) / 20) * 20;
    }

    return {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, [diagram.classes]);

  const {
    quickLinkDrag,
    quickLinkMenu,
    setQuickLinkMenu,
    startQuickLink,
    pickQuickConnector,
    pickQuickElement,
  } = useQuickLinker({ doc, rfRef, setEdgeMessage });

  const {
    onDragOver,
    onDrop,
    handlePaletteQuickAdd,
    onConnect,
    isValidConnection,
    onReconnect,
  } = usePaletteDnD({
    doc,
    diagram,
    rfRef,
    edgeTool,
    setEdgeTool,
    setEdgeMessage,
    setSelectedClassId,
    setEdgeHandles,
  });

  const handleRename = (classId: string, newName: string): void => {
    const delta: ClassDelta = {
      kind: 'class',
      op: 'rename',
      id: crypto.randomUUID(),
      diagramId: diagram.id,
      timestamp: new Date().toISOString(),
      classId,
      newName,
    };
    applyDeltaToYDoc(doc, delta);
  };

  const handleDeleteClass = (classId: string): void => {
    const delta: ClassDelta = {
      kind: 'class',
      op: 'delete',
      id: crypto.randomUUID(),
      diagramId: diagram.id,
      timestamp: new Date().toISOString(),
      classId,
    };
    applyDeltaToYDoc(doc, delta);
  };

  const handleNodeClick = (node: { id: string; type?: string }): void => {
    if (naryMode) {
      if (node.type !== 'class') return;
      setNarySelection((prev) =>
        prev.includes(node.id) ? prev.filter((id) => id !== node.id) : [...prev, node.id],
      );
      return;
    }
    if (node.type === 'naryDiamond') {
      setSelectedNaryId(node.id);
      setSelectedEdge(null);
      return;
    }
    setSelectedNaryId(null);
  };

  const handleCreateNaryFromPanel = (): void => {
    const memberEnds: NaryMemberEndInput[] = narySelection
      .filter((classId) => diagram.classes.some((cls) => cls.id === classId))
      .map((classId) => ({
        classId,
        multiplicity: naryEnds[classId] ?? '1',
      }));
    handleCreateNaryAssociation(doc, diagram.id, {
      memberEnds,
      ...(naryName.trim() !== '' ? { name: naryName.trim() } : {}),
    });
    setNaryMode(false);
    setNarySelection([]);
    setNaryEnds({});
    setNaryName('');
  };

  const handleAddAttribute = (classId: string, name: string, type: string, adornments?: MemberAdornments): void => {
    const delta: MemberDelta = {
      kind: 'member',
      op: 'addAttribute',
      id: crypto.randomUUID(),
      diagramId: diagram.id,
      timestamp: new Date().toISOString(),
      classId,
      memberId: crypto.randomUUID(),
      name,
      type,
      ...adornments,
    };
    applyDeltaToYDoc(doc, delta);
  };

  const handleEditAttribute = (classId: string, memberId: string, name: string, type: string, adornments?: MemberAdornments): void => {
    const delta: MemberDelta = {
      kind: 'member',
      op: 'editAttribute',
      id: crypto.randomUUID(),
      diagramId: diagram.id,
      timestamp: new Date().toISOString(),
      classId,
      memberId,
      name,
      type,
      ...adornments,
    };
    applyDeltaToYDoc(doc, delta);
  };

  const handleRemoveAttribute = (classId: string, memberId: string): void => {
    const delta: MemberDelta = {
      kind: 'member',
      op: 'deleteAttribute',
      id: crypto.randomUUID(),
      diagramId: diagram.id,
      timestamp: new Date().toISOString(),
      classId,
      memberId,
    };
    applyDeltaToYDoc(doc, delta);
  };

  const handleAddMethod = (
    classId: string,
    name: string,
    returnType: string,
    parameters: Parameter[],
    adornments?: MemberAdornments,
  ): void => {
    const delta: MemberDelta = {
      kind: 'member',
      op: 'addMethod',
      id: crypto.randomUUID(),
      diagramId: diagram.id,
      timestamp: new Date().toISOString(),
      classId,
      memberId: crypto.randomUUID(),
      name,
      returnType,
      parameters,
      ...adornments,
    };
    applyDeltaToYDoc(doc, delta);
  };

  const handleEditMethod = (
    classId: string,
    memberId: string,
    name: string,
    returnType: string,
    parameters: Parameter[],
    adornments?: MemberAdornments,
  ): void => {
    const delta: MemberDelta = {
      kind: 'member',
      op: 'editMethod',
      id: crypto.randomUUID(),
      diagramId: diagram.id,
      timestamp: new Date().toISOString(),
      classId,
      memberId,
      name,
      returnType,
      parameters,
      ...adornments,
    };
    applyDeltaToYDoc(doc, delta);
  };

  const handleRemoveMethod = (classId: string, memberId: string): void => {
    const delta: MemberDelta = {
      kind: 'member',
      op: 'deleteMethod',
      id: crypto.randomUUID(),
      diagramId: diagram.id,
      timestamp: new Date().toISOString(),
      classId,
      memberId,
    };
    applyDeltaToYDoc(doc, delta);
  };

  const { ghostMembers, ghostNodes, ghostEdges } = useGhostDeltas(ghostDelta, diagram);

  const {
    displayNodes,
    edges,
    onNodeDrag,
    onNodeDragStop,
    onNodesChange,
  } = useCanvasProjection({
    doc,
    diagram,
    edgeTool,
    selectedClassId,
    setSelectedClassId,
    edgeHandles,
    remoteSelections,
    ghostNodes,
    ghostEdges,
    ghostMembers,
    startQuickLink,
    handleRename,
    handleDeleteClass,
    handleAddAttribute,
    handleEditAttribute,
    handleRemoveAttribute,
    handleAddMethod,
    handleEditMethod,
    handleRemoveMethod,
  });

  const selectedEdgeData = useMemo(() => {
    if (selectedEdge === null) return null;
    switch (selectedEdge.type) {
      case 'association': {
        const assoc = diagram.associations.find((a) => a.id === selectedEdge.id);
        return assoc ? { type: 'association' as const, edge: assoc } : null;
      }
      case 'generalization': {
        const gen = diagram.generalizations.find((g) => g.id === selectedEdge.id);
        return gen ? { type: 'generalization' as const, edge: gen } : null;
      }
      case 'realization': {
        const real = (diagram.realizations ?? []).find((r) => r.id === selectedEdge.id);
        return real ? { type: 'realization' as const, edge: real } : null;
      }
      case 'dependency': {
        const dep = (diagram.dependencies ?? []).find((d) => d.id === selectedEdge.id);
        return dep ? { type: 'dependency' as const, edge: dep } : null;
      }
    }
  }, [diagram, selectedEdge]);

  const selectedNary = useMemo(
    () => (diagram.naryAssociations ?? []).find((n) => n.id === selectedNaryId) ?? null,
    [diagram, selectedNaryId],
  );

  const commitNaryName = (value: string): void => {
    if (selectedNary === null) return;
    handleUpdateNaryAssociation(doc, diagram.id, selectedNary.id, { name: value.trim() });
  };

  const commitNaryEndMultiplicity = (classId: string, value: string): void => {
    if (selectedNary === null) return;
    const memberEnds: NaryMemberEndInput[] = selectedNary.memberEnds.map((end) => ({
      classId: end.classId,
      multiplicity: end.classId === classId ? value.trim() : end.multiplicity,
      ...(end.role !== undefined ? { role: end.role } : {}),
    }));
    handleUpdateNaryAssociation(doc, diagram.id, selectedNary.id, { memberEnds });
  };

  const selectedClass = useMemo(
    () => diagram.classes.find((cls) => cls.id === selectedClassId) ?? null,
    [diagram, selectedClassId],
  );
  const classNameById = (id: string): string =>
    diagram.classes.find((cls) => cls.id === id)?.name ?? '?';

  const selectedClassGeneralizations = useMemo(
    () =>
      selectedClass === null
        ? []
        : diagram.generalizations.filter(
            (gen) => gen.subClassId === selectedClass.id || gen.superClassId === selectedClass.id,
          ),
    [diagram, selectedClass],
  );

  const selectedClassRealizations = useMemo(
    () =>
      selectedClass === null
        ? []
        : (diagram.realizations ?? []).filter(
            (real) => real.clientClassId === selectedClass.id || real.supplierInterfaceId === selectedClass.id,
          ),
    [diagram, selectedClass],
  );

  const selectedClassDependencies = useMemo(
    () =>
      selectedClass === null
        ? []
        : (diagram.dependencies ?? []).filter(
            (dep) => dep.clientClassId === selectedClass.id || dep.supplierClassId === selectedClass.id,
          ),
    [diagram, selectedClass],
  );

  const toggleNaryMode = (): void => {
    setNaryMode((prev) => !prev);
    setNarySelection([]);
    setNaryEnds({});
    setNaryName('');
    setEdgeTool(null);
    setEdgeMessage(null);
  };

  const changeEdgeTool = (tool: PaletteEdgeTool | null): void => {
    setEdgeTool(tool);
    setEdgeMessage(null);
    if (tool !== null) {
      setNaryMode(false);
      setNarySelection([]);
      setNaryEnds({});
      setNaryName('');
    }
  };

  const commitEdgeLabel = (value: string): void => {
    if (selectedEdgeData === null) return;
    const trimmed = value.trim();
    switch (selectedEdgeData.type) {
      case 'association':
        handleUpdateAssociationMeta(doc, diagram.id, selectedEdgeData.edge.id, { name: trimmed || undefined });
        break;
      case 'generalization':
        handleUpdateGeneralizationLabel(doc, diagram.id, selectedEdgeData.edge.id, trimmed);
        break;
      case 'realization':
        handleUpdateRealizationLabel(doc, diagram.id, selectedEdgeData.edge.id, trimmed);
        break;
      case 'dependency':
        handleUpdateDependencyLabel(doc, diagram.id, selectedEdgeData.edge.id, trimmed);
        break;
    }
  };

  const deleteSelectedEdge = (): void => {
    if (selectedEdgeData === null) return;
    switch (selectedEdgeData.type) {
      case 'association':
        handleDeleteAssociation(doc, diagram.id, selectedEdgeData.edge.id);
        break;
      case 'generalization':
        handleDeleteGeneralization(doc, diagram.id, selectedEdgeData.edge.id);
        break;
      case 'realization':
        handleDeleteRealization(doc, diagram.id, selectedEdgeData.edge.id);
        break;
      case 'dependency':
        handleDeleteDependency(doc, diagram.id, selectedEdgeData.edge.id);
        break;
    }
    setSelectedEdge(null);
  };

  useCanvasKeyboard({
    doc,
    diagram,
    selectedClassId,
    setSelectedClassId,
    selectedEdge,
    setSelectedEdge,
    selectedNaryId,
    setSelectedNaryId,
    setEdgeTool,
    setEdgeMessage,
    handleDeleteClass,
    deleteSelectedEdge,
  });

  return (
    <div
      className="diagram-canvas"
      style={{ width: '100%', height: '100%' }}
      onClickCapture={handleCanvasClickCapture}
    >
      <Palette
        activeEdgeTool={edgeTool}
        naryMode={naryMode}
        onEdgeToolChange={changeEdgeTool}
        onNaryModeToggle={toggleNaryMode}
        collapsed={paletteCollapsed}
        onToggleCollapsed={() => setPaletteCollapsed((prev) => !prev)}
        onNodeClick={handlePaletteQuickAdd}
      />

      {edgeTool !== null && (
        <div className="diagram-canvas__hint" data-testid="edge-tool-hint" role="status">
          {tr('canvas.edgeToolHint', { tool: tr(CONNECTOR_TOOL_KEYS[edgeTool]) })}
        </div>
      )}
      {edgeMessage !== null && (
        <div className="diagram-canvas__palette-message" role="alert" data-testid="palette-validation">
          {edgeMessage}
        </div>
      )}
      {naryMode && narySelection.length > 0 && (
        <div className="diagram-canvas__nary" data-testid="nary-panel">
          <span className="diagram-canvas__nary-title">
            {tr('nary.panelTitle', { n: narySelection.length })}
          </span>
          {narySelection.map((classId) => {
            const cls = diagram.classes.find((candidate) => candidate.id === classId);
            if (cls === undefined) return null;
            return (
              <label key={classId} className="diagram-canvas__nary-end">
                {cls.name}
                <input
                  aria-label={tr('nary.multiplicityFor', { name: cls.name })}
                  value={naryEnds[classId] ?? '1'}
                  onChange={(event) =>
                    setNaryEnds((prev) => ({ ...prev, [classId]: event.target.value }))
                  }
                />
              </label>
            );
          })}
          <label>
            {tr('nary.name')}
            <input
              aria-label={tr('nary.nameAria')}
              placeholder={tr('nary.optional')}
              value={naryName}
              onChange={(event) => setNaryName(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="diagram-canvas__create-nary"
            aria-label={tr('nary.createAria')}
            disabled={narySelection.length < 3}
            onClick={handleCreateNaryFromPanel}
          >
            {tr('nary.create')}
          </button>
        </div>
      )}
      <EdgeEditorPanel
        doc={doc}
        diagram={diagram}
        selectedEdgeData={selectedEdgeData}
        commitEdgeLabel={commitEdgeLabel}
        deleteSelectedEdge={deleteSelectedEdge}
        setSelectedEdge={setSelectedEdge}
        tr={tr}
        edgeTypeKeys={EDGE_TYPE_KEYS}
      />

      <NaryEditorPanel
        doc={doc}
        diagram={diagram}
        selectedNary={selectedNary}
        commitNaryName={commitNaryName}
        commitNaryEndMultiplicity={commitNaryEndMultiplicity}
        setSelectedNaryId={setSelectedNaryId}
        tr={tr}
      />

      <ClassDetailsPanel
        doc={doc}
        diagramId={diagram.id}
        selectedClass={selectedClass}
        selectedClassGeneralizations={selectedClassGeneralizations}
        selectedClassRealizations={selectedClassRealizations}
        selectedClassDependencies={selectedClassDependencies}
        classNameById={classNameById}
        tr={tr}
      />

      <EdgeCrossingProvider>
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesConnectable={true}
          edgesReconnectable={true}
          reconnectRadius={20}
          connectionMode="loose"
          connectionRadius={40}
          isValidConnection={isValidConnection}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onEdgesChange={() => {}}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onInit={(instance) => {
            rfRef.current = instance;
          }}
          onMoveEnd={(_event, viewport) => {
            // onMoveEnd zoom tracking
          }}
          onNodesChange={onNodesChange}
          onNodeClick={(_event, node) => {
            recordClickPoint(_event.clientX, _event.clientY);
            handleNodeClick(node);
          }}
          onEdgeClick={(_event, edge) => {
            recordClickPoint(_event.clientX, _event.clientY);
            if (isEditorEdgeType(edge.type)) {
              setSelectedEdge({ id: edge.id, type: edge.type });
              setSelectedNaryId(null);
            }
          }}
          onPaneClick={(event) => {
            if (event) recordClickPoint(event.clientX, event.clientY);
            setSelectedClassId(null);
            setSelectedEdge(null);
            setSelectedNaryId(null);
            setEdgeTool(null);
            setEdgeMessage(null);
          }}
          onPaneMouseMove={(event) => updateCursor(event.clientX, event.clientY)}
          onPaneMouseLeave={clearCursor}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          snapToGrid={true}
          snapGrid={[20, 20]}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#94a3b8" />
          <ViewportPortal>
            <RemoteCursors peers={virtualPeer ? [...remotePeers, virtualPeer] : remotePeers} />
            <div
              className="diagram-canvas-boundary"
              data-testid="diagram-canvas-boundary"
              style={{
                transform: `translate(${canvasBoundary.left}px, ${canvasBoundary.top}px)`,
                width: `${canvasBoundary.width}px`,
                height: `${canvasBoundary.height}px`,
              }}
            >
              <div className="diagram-canvas-boundary__header">
                <span className="diagram-canvas-boundary__title">
                  {diagram.name || tr('canvas.pageBoundary')}
                </span>
                <span className="diagram-canvas-boundary__dimensions">
                  {canvasBoundary.width} × {canvasBoundary.height} px
                </span>
              </div>
            </div>
          </ViewportPortal>
        </ReactFlow>
      </EdgeCrossingProvider>

      <CanvasZoomControls
        currentZoom={currentZoom}
        handleZoomIn={handleZoomIn}
        handleZoomOut={handleZoomOut}
        handleZoomReset={handleZoomReset}
      />

      {quickLinkDrag !== null && (
        <svg className="quicklinker-rubberband" data-testid="quicklinker-rubberband" aria-hidden="true">
          <line
            x1={quickLinkDrag.start.x}
            y1={quickLinkDrag.start.y}
            x2={quickLinkDrag.cursor.x}
            y2={quickLinkDrag.cursor.y}
          />
        </svg>
      )}

      {quickLinkMenu !== null &&
        (quickLinkMenu.mode === 'connector' ? (
          <QuickLinkerMenu
            position={quickLinkMenu.anchor}
            items={validConnectorsFor(
              quickLinkMenu.sourceKind,
              quickLinkMenu.targetKind,
              quickLinkMenu.sourceId === quickLinkMenu.targetId,
            ).map((connector) => ({ id: connector, label: tr(CONNECTOR_TOOL_KEYS[connector]) }))}
            onSelect={(id) => pickQuickConnector(id as QuickConnectorType)}
            onClose={() => setQuickLinkMenu(null)}
          />
        ) : (
          <QuickLinkerMenu
            position={quickLinkMenu.anchor}
            items={elementMenuOptions().map((kind) => ({ id: kind, label: tr(ELEMENT_TOOL_KEYS[kind]) }))}
            onSelect={pickQuickElement}
            onClose={() => setQuickLinkMenu(null)}
          />
        ))}
    </div>
  );
}
