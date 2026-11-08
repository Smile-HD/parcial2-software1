/**
 * DiagramCanvas — lienzo React Flow renderizado exclusivamente desde un Y.Doc.
 *
 * editor:R1 — el Y.Doc ES la IR canónica; el estado de React es una proyección
 * derivada que activa el re-renderizado cuando cambia el Y.Doc.
 * Ninguna mutación evade applyDelta (ver applyDeltaToYDoc).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ReactFlow, Background, BackgroundVariant, ViewportPortal, applyNodeChanges, type Connection, type Edge, type NodeChange, type ReactFlowInstance, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type * as Y from 'yjs';

import { MultiplicitySchema, projectYDocToDiagram, type ApplyError, type ApplyResult, type Association, type AssociationDelta, type ClassDelta, type Delta, type DependencyDelta, type Diagram, type Generalization, type GeneralizationDelta, type MemberDelta, type NaryAssociationDelta, type NaryMemberEnd, type Parameter, type Realization, type RealizationDelta } from '@app/core';

import './canvas.css';
import { ClassNode, type ClassNodeData, type ClassFlowNode, type MemberAdornments } from './ClassNode';
import { NaryDiamondNode, type NaryDiamondFlowNode } from './NaryDiamondNode';
import { applyDeltaToYDoc } from './applyDeltaToYDoc';
import { AssociationEdge } from './AssociationEdge';
import { GeneralizationEdge } from './GeneralizationEdge';
import { RealizationEdge } from './RealizationEdge';
import { DependencyEdge } from './DependencyEdge';
import { NaryEndEdge } from './NaryEndEdge';
import { Palette, PALETTE_DND_MIME, type PaletteEdgeTool, type PaletteNodeKind } from './Palette';
import { QuickLinkerMenu } from './QuickLinkerMenu';
import type { WebsocketProvider } from 'y-websocket';
import { useRemoteCursors } from './useRemoteCursors';
import { RemoteCursors, type RemoteCursorPeer } from './RemoteCursors';
import { getRemoteNodeSelections } from './selectionHalos';
import { EdgeCrossingProvider } from './EdgeCrossingContext';
import {
  elementMenuOptions,
  quickLinkerTarget,
  validConnectorsFor,
  type QuickConnectorType,
  type QuickLinkerKind,
} from './quickLinker';
import { t, useT, type TKey } from '../i18n';
import { useCanvasZoom } from './hooks/useCanvasZoom.js';
import { useQuickLinker, type QuickLinkerMenuState } from './hooks/useQuickLinker.js';
import { usePaletteDnD } from './hooks/usePaletteDnD.js';
import { EdgeEditorPanel } from './components/EdgeEditorPanel.js';
import { NaryEditorPanel } from './components/NaryEditorPanel.js';
import { ClassDetailsPanel } from './components/ClassDetailsPanel.js';

const nodeTypes = { class: ClassNode, naryDiamond: NaryDiamondNode };
const edgeTypes = { association: AssociationEdge, generalization: GeneralizationEdge, realization: RealizationEdge, dependency: DependencyEdge, naryEnd: NaryEndEdge };

/**
 * unidad 13c — los tipos de arista que comprende el editor unificado. Las aristas
 * de miembros n-arios (`naryEnd`) quedan deliberadamente excluidas: se editan a través
 * del flujo propio de contexto/selección del diamante n-ario, no del panel individual de aristas.
 */
type EditorEdgeType = 'association' | 'generalization' | 'realization' | 'dependency';

/**
 * unidad 13e.10 — las etiquetas visuales de tipos de aristas provienen del diccionario i18n (el
 * antiguo mapa cableado EDGE_TYPE_LABELS → claves `tool.*`; los valores en EN son
 * idénticos byte a byte, por lo que cada contrato existente de aria-label/testid sobrevive).
 */
const EDGE_TYPE_KEYS: Record<EditorEdgeType, TKey> = {
  association: 'tool.association',
  generalization: 'tool.generalization',
  realization: 'tool.realization',
  dependency: 'tool.dependency',
};

/** unidad 13e.10 — las etiquetas del menú de Quick Linker se asignan a las mismas claves `tool.*`
 * (quickLinker.ts se mantiene puro — el mapeo reside en el sitio de renderizado). */
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
  handleNodeDragStop,
  nextFreeClassName,
  handleSetAbstract,
  handlePaletteDrop,
  type AssociationLink,
  handleCreateAssociation,
  handleUpdateMultiplicity,
  handleUpdateAssociationMeta,
  handleDeleteAssociation,
  handleCreateGeneralization,
  handleDeleteGeneralization,
  handleCreateRealization,
  handleDeleteRealization,
  handleCreateDependency,
  handleDeleteDependency,
  handleUpdateGeneralizationLabel,
  handleUpdateRealizationLabel,
  handleUpdateDependencyLabel,
  type ConnectGuardResult,
  describeApplyError,
  engineGuardResult,
  handleConnectWithTool,
  getOptimalHandles,
  type EditorEdgeType,
  isEditorEdgeType,
  computeNaryCentroid,
  type NaryMemberEndInput,
  handleCreateNaryAssociation,
  handleUpdateNaryAssociation,
  handleDeleteNaryAssociation,
  computeNextZoom,
} from './operations/index.js';

export interface DiagramCanvasProps {
  doc: Y.Doc;
  provider?: WebsocketProvider | null;
  ghostDelta?: Delta | null;
  virtualPeer?: RemoteCursorPeer | null;
}

export function DiagramCanvas({ doc, provider, ghostDelta, virtualPeer }: DiagramCanvasProps) {
  // unidad 13e.10 — accesor reactivo: cada cadena JSX a continuación se re-renderiza en vivo
  // cuando cambia el alternador de idioma (`t` a nivel de módulo atiende los controladores).
  const { t: tr } = useT();
  // Derivar estado a partir del Y.Doc — el Y.Doc es la fuente de verdad.
  const [diagram, setDiagram] = useState<Diagram>(() => projectYDocToDiagram(doc));

  // unidad 13e.11 — el lienzo posee el estado de colapso de la caja de herramientas (el botón
  // alternador solo se renderiza cuando se pasa onToggleCollapsed).
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  // unidad 13c — UN solo editor para cada tipo de arista: el id + tipo de la arista seleccionada.
  const [selectedEdge, setSelectedEdge] = useState<{ id: string; type: EditorEdgeType } | null>(null);
  // Posiciones de conexión personalizadas por arista (permite mover libremente los extremos por la tabla)
  const [edgeHandles, setEdgeHandles] = useState<
    Record<string, { sourceHandle?: string; targetHandle?: string }>
  >({});
  // unidad 13d corrección A — el propio editor del diamante n-ario: el id n-ario seleccionado.
  // Resuelto a partir de la proyección en vivo, de modo que eliminar el n-ario cierra el panel.
  const [selectedNaryId, setSelectedNaryId] = useState<string | null>(null);
  // Unidad 11.4 — la clase cuya lista de generalización se muestra en el panel.
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  // Unidad 13.3 — modo de asociación n-aria: seleccionar >=3 clases, multiplicidad por extremo.
  const [naryMode, setNaryMode] = useState(false);
  const [narySelection, setNarySelection] = useState<string[]>([]);
  const [naryEnds, setNaryEnds] = useState<Record<string, string>>({});
  const [naryName, setNaryName] = useState('');
  // Unidad 13b — herramienta de arista armada desde la paleta; null significa que las conexiones están
  // deshabilitadas completamente (sin aristas accidentales). edgeMessage expone rechazos
  // de guardia/motor de la ruta de arrastrar para conectar.
  const [edgeTool, setEdgeTool] = useState<PaletteEdgeTool | null>(null);
  const [edgeMessage, setEdgeMessage] = useState<string | null>(null);
  // Instancia de React Flow (vía onInit) — provee screenToFlowPosition para soltados.
  const rfRef = useRef<ReactFlowInstance | null>(null);

  // Unidad 21: sincronización de cursores remotos y halos de selección en tiempo real
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
      // El usuario local ya arrastra suavemente a 60/120 FPS mediante displayNodes y onNodesChange de React Flow.
      // Ignorar el evento local para evitar re-renders en bucle, conflicto con gestos y sobrecarga de estado.
      // Los pares remotos conectados por WebSocket sí procesan la actualización (su origin es el WebsocketProvider).
      if (origin === 'local-drag') {
        return;
      }
      setDiagram(projectYDocToDiagram(doc));
    };
    doc.on('update', sync);
    return () => {
      doc.off('update', sync);
    };
  }, [doc]);

  // Límite visual de página/lienzo estilo Enterprise Architect (área de trabajo delimitada):
  // Garantiza al menos una hoja estándar (3200 x 2200 px), expandiéndose suavemente si existen
  // elementos situados más allá de estos márgenes.
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

  /**
   * unidad 13e.7 — el antiguo modo de clic para enlazar DESAPARECIÓ (las herramientas
   * de arista de la paleta + Quick Linker lo reemplazaron). El clic en nodo ahora solo
   * controla el modo de selección n-ario y la selección exclusiva del editor.
   */
  const handleNodeClick = (node: { id: string; type?: string }): void => {
    // Unidad 13.3 — modo n-ario: hacer clic en clases acumula la selección
    // de miembros (hacer clic nuevamente para retirarlo). El diamante en sí no es
    // un miembro seleccionable; solo participan los nodos de clase.
    if (naryMode) {
      if (node.type !== 'class') return;
      setNarySelection((prev) =>
        prev.includes(node.id) ? prev.filter((id) => id !== node.id) : [...prev, node.id],
      );
      return;
    }
    // unidad 13d corrección A — hacer clic en el diamante n-ario lo selecciona y abre su
    // editor (nombre + multiplicidades por extremo + eliminar), al igual que cualquier otro
    // elemento. El editor de arista es exclusivo: solo un editor a la vez.
    if (node.type === 'naryDiamond') {
      setSelectedNaryId(node.id);
      setSelectedEdge(null);
      return;
    }
    // Un clic en clase cierra el editor n-ario (la selección es exclusiva).
    setSelectedNaryId(null);
  };

  /** Unidad 13.3 — confirma la asociación n-aria desde el panel del editor. */
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

  /** editor:R3 — edición in situ de atributo emitida como un delta `editAttribute`. */
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

  /** editor:R3 — edición in situ de método emitida como un delta `editMethod`. */
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

  const ghostMembers = useMemo(() => {
    const attrsByClassId = new Map<string, any[]>();
    const deletedClassIds = new Set<string>();

    if (!ghostDelta) return { attrsByClassId, deletedClassIds };

    const processDelta = (d: any) => {
      if ((d.kind === 'member' && (d.op === 'addAttribute' || d.op === 'create')) ||
          (d.kind === 'attribute' && d.op === 'create')) {
        if (!attrsByClassId.has(d.classId)) {
          attrsByClassId.set(d.classId, []);
        }
        attrsByClassId.get(d.classId)!.push({
          id: d.memberId || crypto.randomUUID(),
          name: d.name,
          type: d.type || d.attributeType || 'string',
          visibility: d.adornments?.visibility ?? d.visibility ?? '+',
          isStatic: d.adornments?.isStatic ?? d.isStatic ?? false,
          isDerived: d.adornments?.isDerived ?? d.isDerived ?? false,
          multiplicity: d.adornments?.multiplicity ?? d.multiplicity,
          isGhost: true,
        });
      } else if (d.kind === 'class' && d.op === 'delete') {
        deletedClassIds.add(d.classId);
      }
    };

    if (ghostDelta.kind === 'batch') {
      for (const d of ghostDelta.deltas) {
        processDelta(d);
      }
    } else {
      processDelta(ghostDelta);
    }

    return { attrsByClassId, deletedClassIds };
  }, [ghostDelta]);

  const ghostNodes = useMemo(() => {
    if (!ghostDelta) return [];
    const createdClasses: { id: string; name: string; position: { x: number; y: number }; attributes: any[] }[] = [];

    const processClass = (d: any) => {
      if (d.kind === 'class' && d.op === 'create') {
        createdClasses.push({
          id: `ghost-${d.classId}`,
          name: d.name,
          position: d.position ?? { x: 250, y: 150 },
          attributes: ghostMembers.attrsByClassId.get(d.classId) ?? [],
        });
      }
    };

    if (ghostDelta.kind === 'batch') {
      for (const d of ghostDelta.deltas) {
        processClass(d);
      }
    } else {
      processClass(ghostDelta);
    }

    return createdClasses.map((gc) => ({
      id: gc.id,
      type: 'class' as const,
      position: gc.position,
      className: 'class-node--ghost',
      data: {
        name: `${gc.name} (Propuesta)`,
        attributes: gc.attributes,
        methods: [],
        kind: 'class' as const,
        isAbstract: false,
        otherClasses: [],
        otherInterfaces: [],
        onRename: () => {},
        onDelete: () => {},
        onAddAttribute: () => {},
        onEditAttribute: () => {},
        onRemoveAttribute: () => {},
        onAddMethod: () => {},
        onEditMethod: () => {},
        onRemoveMethod: () => {},
        onMakeSubclass: () => {},
        onToggleAbstract: () => {},
        onRealize: () => {},
        onDependOn: () => {},
        onSelect: () => {},
        connectArmed: false,
        selected: false,
        onQuickLinkStart: () => {},
      } satisfies ClassNodeData,
    }));
  }, [ghostDelta, ghostMembers]);

  const ghostEdges = useMemo<Edge[]>(() => {
    if (!ghostDelta) return [];
    const result: Edge[] = [];

    const resolveNodeId = (rawId: string): string | null => {
      if (!rawId) return null;
      const str = String(rawId).trim();
      const lower = str.toLowerCase();

      // 1. Coincidencia por ID directo o prefijado
      if (diagram.classes.some((c) => c.id === str)) return str;
      if (ghostNodes.some((gn) => gn.id === `ghost-${str}`)) return `ghost-${str}`;
      if (ghostNodes.some((gn) => gn.id === str)) return str;

      // 2. Coincidencia por nombre en clases ya existentes
      const byName = diagram.classes.find((c) => c.name.toLowerCase() === lower);
      if (byName) return byName.id;

      // 3. Coincidencia por nombre en nodos fantasma
      const byGhostName = ghostNodes.find((gn) => {
        const cleanName = String((gn.data as any)?.name ?? '')
          .replace(/\s*\(Propuesta\)$/i, '')
          .trim()
          .toLowerCase();
        return cleanName === lower;
      });
      if (byGhostName) return byGhostName.id;

      // 4. Coincidencia en deltas de creación de clases del lote
      const deltas = ghostDelta.kind === 'batch' ? ghostDelta.deltas : [ghostDelta];
      for (const d of deltas) {
        if (d.kind === 'class' && d.op === 'create' && (d as any).name?.toLowerCase() === lower) {
          return `ghost-${(d as any).classId}`;
        }
      }

      return null;
    };

    const getNodePos = (nodeId: string): { x: number; y: number } | null => {
      const gn = ghostNodes.find((n) => n.id === nodeId);
      if (gn) return gn.position;
      const dc = diagram.classes.find((c) => c.id === nodeId);
      if (dc) return dc.position;
      return null;
    };

    const processEdgeDelta = (d: any) => {
      let sourceId: string | null = null;
      let targetId: string | null = null;
      let label = 'propuesta';
      let strokeColor = '#0891b2';
      let strokeDasharray = '6,4';

      if (d.kind === 'association' && d.op === 'create') {
        sourceId = resolveNodeId(d.sourceClassId);
        targetId = resolveNodeId(d.targetClassId);

        const isComposite = d.aggregation === 'composite' || String(d.name || '').toLowerCase().includes('compo');
        const isShared = d.aggregation === 'shared' || String(d.name || '').toLowerCase().includes('agreg');

        if (isComposite) {
          strokeColor = '#0f766e';
          label = d.name
            ? `${d.name} [composición]`
            : d.targetMultiplicity
              ? `${d.sourceMultiplicity || '1'} ⯁-- ${d.targetMultiplicity}`
              : 'composición (propuesta)';
        } else if (isShared) {
          strokeColor = '#0284c7';
          label = d.name
            ? `${d.name} [agregación]`
            : d.targetMultiplicity
              ? `${d.sourceMultiplicity || '1'} ♢-- ${d.targetMultiplicity}`
              : 'agregación (propuesta)';
        } else {
          strokeColor = '#0891b2';
          label = d.name || (d.targetMultiplicity ? `${d.sourceMultiplicity || '1'} .. ${d.targetMultiplicity}` : 'asociación (propuesta)');
        }

        // Si la asociación tiene clase de asociación intermedia vinculada
        const rawAssocClass = d.associationClassId || d.associationClass;
        if (rawAssocClass) {
          const assocClassNodeId = resolveNodeId(rawAssocClass);
          if (assocClassNodeId && sourceId) {
            const sPos = getNodePos(sourceId);
            const acPos = getNodePos(assocClassNodeId);
            const acHandles = sPos && acPos ? getOptimalHandles(sPos, acPos) : { sourceHandle: undefined, targetHandle: undefined };
            result.push({
              id: `ghost-edge-ac-${d.id || crypto.randomUUID()}`,
              source: sourceId,
              target: assocClassNodeId,
              sourceHandle: acHandles.sourceHandle,
              targetHandle: acHandles.targetHandle,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '4,4' },
              label: 'clase asociación',
              labelStyle: { fill: '#6366f1', fontWeight: 600, fontSize: 10 },
              labelBgPadding: [4, 2],
              labelBgBorderRadius: 4,
              labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, stroke: '#6366f1', strokeWidth: 1 },
            });
          }
        }
      } else if (d.kind === 'generalization' && d.op === 'create') {
        sourceId = resolveNodeId(d.subClassId);
        targetId = resolveNodeId(d.superClassId);
        strokeColor = '#7c3aed';
        label = d.name ? `${d.name} [herencia]` : 'hereda ▷ (propuesta)';
      } else if (d.kind === 'realization' && d.op === 'create') {
        sourceId = resolveNodeId(d.clientClassId);
        targetId = resolveNodeId(d.supplierInterfaceId);
        strokeColor = '#059669';
        strokeDasharray = '4,4';
        label = d.name ? `${d.name} [realiza]` : 'realiza interfaz ▷ (propuesta)';
      } else if (d.kind === 'dependency' && d.op === 'create') {
        sourceId = resolveNodeId(d.clientClassId);
        targetId = resolveNodeId(d.supplierClassId);
        strokeColor = '#d97706';
        strokeDasharray = '4,4';
        label = d.name ? `${d.name} [depende]` : 'depende ⇢ (propuesta)';
      }

      if (!sourceId || !targetId) return;

      const sPos = getNodePos(sourceId);
      const tPos = getNodePos(targetId);
      const handles = sPos && tPos ? getOptimalHandles(sPos, tPos, sourceId === targetId) : { sourceHandle: undefined, targetHandle: undefined };

      result.push({
        id: `ghost-edge-${d.id || crypto.randomUUID()}`,
        source: sourceId,
        target: targetId,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
        type: 'smoothstep',
        animated: true,
        style: {
          stroke: strokeColor,
          strokeWidth: 2.5,
          strokeDasharray,
        },
        label,
        labelStyle: { fill: strokeColor, fontWeight: 700, fontSize: 11 },
        labelBgPadding: [6, 4],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, stroke: strokeColor, strokeWidth: 1 },
      });
    };

    if (ghostDelta.kind === 'batch') {
      for (const d of ghostDelta.deltas) {
        processEdgeDelta(d);
      }
    } else {
      processEdgeDelta(ghostDelta);
    }

    return result;
  }, [ghostDelta, diagram.classes, ghostNodes]);

  const nodes = useMemo<(ClassFlowNode | NaryDiamondFlowNode)[]>(
    () => [
      ...diagram.classes.map((cls) => {
        const ghostAttrs = ghostMembers.attrsByClassId.get(cls.id) ?? [];
        const isDeleted = ghostMembers.deletedClassIds.has(cls.id);
        const nodeClassName = isDeleted
          ? 'class-node--ghost-delete'
          : ghostAttrs.length > 0
            ? 'class-node--ghost-pending'
            : undefined;

        return {
          id: cls.id,
          type: 'class' as const,
          position: cls.position,
          className: nodeClassName,
          data: {
            name: cls.name,
            attributes: [...cls.attributes, ...ghostAttrs],
            methods: cls.methods,
            kind: cls.kind ?? 'class',
            isAbstract: cls.isAbstract ?? false,
            otherClasses: diagram.classes
              .filter((other) => other.id !== cls.id)
              .map((other) => ({ id: other.id, name: other.name })),
            otherInterfaces: diagram.classes
              .filter((other) => other.id !== cls.id && (other.kind ?? 'class') === 'interface')
              .map((other) => ({ id: other.id, name: other.name })),
            onRename: (newName: string) => handleRename(cls.id, newName),
            onDelete: () => handleDeleteClass(cls.id),
            onAddAttribute: (name: string, type: string, adornments?: MemberAdornments) =>
              handleAddAttribute(cls.id, name, type, adornments),
            onEditAttribute: (memberId: string, name: string, type: string, adornments?: MemberAdornments) =>
              handleEditAttribute(cls.id, memberId, name, type, adornments),
            onRemoveAttribute: (memberId: string) => handleRemoveAttribute(cls.id, memberId),
            onAddMethod: (name: string, returnType: string, parameters: Parameter[], adornments?: MemberAdornments) =>
              handleAddMethod(cls.id, name, returnType, parameters, adornments),
            onEditMethod: (memberId: string, name: string, returnType: string, parameters: Parameter[], adornments?: MemberAdornments) =>
              handleEditMethod(cls.id, memberId, name, returnType, parameters, adornments),
            onRemoveMethod: (memberId: string) => handleRemoveMethod(cls.id, memberId),
            onMakeSubclass: (superClassId: string) =>
              handleCreateGeneralization(doc, diagram.id, { subClassId: cls.id, superClassId }),
            onToggleAbstract: (isAbstract: boolean) => handleSetAbstract(doc, diagram.id, cls.id, isAbstract),
            onRealize: (supplierInterfaceId: string) =>
              handleCreateRealization(doc, diagram.id, { clientClassId: cls.id, supplierInterfaceId }),
            onDependOn: (supplierClassId: string) =>
              handleCreateDependency(doc, diagram.id, { clientClassId: cls.id, supplierClassId }),
            onSelect: () => setSelectedClassId(cls.id),
            connectArmed: edgeTool !== null,
            selected: selectedClassId === cls.id,
            onQuickLinkStart: (clientX: number, clientY: number) => startQuickLink(cls.id, clientX, clientY),
            remoteSelection: remoteSelections.get(cls.id),
          } satisfies ClassNodeData,
        };
      }),
      // Unidad 13.2 — un nodo diamante por asociación n-aria, posicionado en el
      // centroide de sus clases miembros y vuelto a derivar en cada proyección
      // (draggable: false — el centroide ES su posición).
      ...(diagram.naryAssociations ?? [])
        .map((nary) => {
          const memberPositions = nary.memberEnds
            .map((end) => diagram.classes.find((cls) => cls.id === end.classId)?.position)
            .filter((pos): pos is { x: number; y: number } => pos !== undefined);
          if (memberPositions.length === 0) return null;
          return {
            id: nary.id,
            type: 'naryDiamond' as const,
            position: computeNaryCentroid(memberPositions),
            draggable: false,
            data: {
              nary,
              onDelete: () => handleDeleteNaryAssociation(doc, diagram.id, nary.id),
            },
          } satisfies NaryDiamondFlowNode;
        })
        .filter((node): node is NaryDiamondFlowNode => node !== null),
      ...ghostNodes,
    ],
    [diagram, edgeTool, selectedClassId, remoteSelections, ghostNodes, ghostMembers],
  );

  // unidad 13e.19 — transmisión colaborativa en vivo de arrastre (60/120 FPS).
  // Sincroniza las coordenadas en tiempo real al Y.Doc mediante requestAnimationFrame
  // para que los demás usuarios conectados al WebSocket vean el desplazamiento en vivo.
  const dragRafRef = useRef<number | null>(null);
  const activeDragNodeRef = useRef<{ id: string; position: { x: number; y: number } } | null>(null);

  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
      }
    };
  }, []);

  const onNodeDrag = useCallback(
    (_event: React.MouseEvent | React.TouchEvent, node: Node) => {
      activeDragNodeRef.current = {
        id: node.id,
        position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
      };

      if (dragRafRef.current === null) {
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = null;
          const current = activeDragNodeRef.current;
          if (current) {
            handleNodeDragStop(doc, diagram.id, current, 'local-drag');
          }
        });
      }
    },
    [doc, diagram.id],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent | React.TouchEvent, node: Node) => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      activeDragNodeRef.current = null;
      setDragOverride(null);
      handleNodeDragStop(doc, diagram.id, node);
    },
    [doc, diagram.id],
  );

  // Estado local sincronizado para arrastre suave y reactivo en tiempo real (60/120 FPS).
  // La posición canónica proviene del Y.Doc, pero durante el arrastre onNodesChange actualiza
  // de inmediato la posición del nodo en pantalla para que acompañe al cursor sin saltos ni doble-render.
  const [dragOverride, setDragOverride] = useState<{ id: string; position: { x: number; y: number } } | null>(null);

  const displayNodes = useMemo(() => {
    if (!dragOverride) return nodes;
    return nodes.map((n) => (n.id === dragOverride.id ? { ...n, position: dragOverride.position } : n));
  }, [nodes, dragOverride]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        setDragOverride({ id: change.id, position: change.position });
      }
    }
  }, []);

  const edges = useMemo<Edge[]>(
    () => [
      ...diagram.associations.map((assoc) => {
        const sNode = displayNodes.find((c) => c.id === assoc.sourceClassId) ?? diagram.classes.find((c) => c.id === assoc.sourceClassId);
        const tNode = displayNodes.find((c) => c.id === assoc.targetClassId) ?? diagram.classes.find((c) => c.id === assoc.targetClassId);
        const custom = edgeHandles[assoc.id];
        const handles =
          custom?.sourceHandle !== undefined || custom?.targetHandle !== undefined
            ? {
                sourceHandle: custom.sourceHandle,
                targetHandle: custom.targetHandle,
              }
            : sNode && tNode
              ? getOptimalHandles(sNode.position, tNode.position, assoc.sourceClassId === assoc.targetClassId)
              : { sourceHandle: undefined, targetHandle: undefined };

        return {
          id: assoc.id,
          source: assoc.sourceClassId,
          target: assoc.targetClassId,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: 'association' as const,
          reconnectable: true,
          data: {
            association: assoc,
            onUpdateMultiplicity: (end: 'source' | 'target', value: string) => {
              handleUpdateMultiplicity(doc, diagram.id, assoc.id, end, value);
            },
          },
        };
      }),
      // Unidad 11.3 — aristas de generalización: origen = subClase, destino = superClase
      // para que el marcador de triángulo hueco se renderice en el extremo de la superclase.
      ...diagram.generalizations.map((gen) => {
        const sNode = displayNodes.find((c) => c.id === gen.subClassId) ?? diagram.classes.find((c) => c.id === gen.subClassId);
        const tNode = displayNodes.find((c) => c.id === gen.superClassId) ?? diagram.classes.find((c) => c.id === gen.superClassId);
        const custom = edgeHandles[gen.id];
        const handles =
          custom?.sourceHandle !== undefined || custom?.targetHandle !== undefined
            ? {
                sourceHandle: custom.sourceHandle,
                targetHandle: custom.targetHandle,
              }
            : sNode && tNode
              ? getOptimalHandles(sNode.position, tNode.position, gen.subClassId === gen.superClassId)
              : { sourceHandle: undefined, targetHandle: undefined };

        return {
          id: gen.id,
          source: gen.subClassId,
          target: gen.superClassId,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: 'generalization' as const,
          reconnectable: true,
          data: { generalization: gen },
        };
      }),
      // Unidad 12.3 — aristas de realización: origen = clase cliente, destino = interfaz
      // proveedora, para que la línea discontinua + triángulo hueco se renderice en el extremo de la interfaz.
      ...(diagram.realizations ?? []).map((real) => {
        const sNode = displayNodes.find((c) => c.id === real.clientClassId) ?? diagram.classes.find((c) => c.id === real.clientClassId);
        const tNode = displayNodes.find((c) => c.id === real.supplierInterfaceId) ?? diagram.classes.find((c) => c.id === real.supplierInterfaceId);
        const custom = edgeHandles[real.id];
        const handles =
          custom?.sourceHandle !== undefined || custom?.targetHandle !== undefined
            ? {
                sourceHandle: custom.sourceHandle,
                targetHandle: custom.targetHandle,
              }
            : sNode && tNode
              ? getOptimalHandles(sNode.position, tNode.position, real.clientClassId === real.supplierInterfaceId)
              : { sourceHandle: undefined, targetHandle: undefined };

        return {
          id: real.id,
          source: real.clientClassId,
          target: real.supplierInterfaceId,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: 'realization' as const,
          reconnectable: true,
          data: { realization: real },
        };
      }),
      // Unidad 12.3 (12b) — aristas de dependencia: origen = clase cliente, destino =
      // proveedor, para que la línea discontinua + flecha abierta se renderice en el extremo del proveedor.
      ...(diagram.dependencies ?? []).map((dep) => {
        const sNode = displayNodes.find((c) => c.id === dep.clientClassId) ?? diagram.classes.find((c) => c.id === dep.clientClassId);
        const tNode = displayNodes.find((c) => c.id === dep.supplierClassId) ?? diagram.classes.find((c) => c.id === dep.supplierClassId);
        const custom = edgeHandles[dep.id];
        const handles =
          custom?.sourceHandle !== undefined || custom?.targetHandle !== undefined
            ? {
                sourceHandle: custom.sourceHandle,
                targetHandle: custom.targetHandle,
              }
            : sNode && tNode
              ? getOptimalHandles(sNode.position, tNode.position, dep.clientClassId === dep.supplierClassId)
              : { sourceHandle: undefined, targetHandle: undefined };

        return {
          id: dep.id,
          source: dep.clientClassId,
          target: dep.supplierClassId,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: 'dependency' as const,
          reconnectable: true,
          data: { dependency: dep },
        };
      }),
      // Unidad 13.2 — una arista simple por extremo miembro n-ario: diamante → clase,
      // etiquetada con la multiplicidad de dicho extremo (y rol cuando esté presente).
      ...(diagram.naryAssociations ?? []).flatMap((nary) =>
        nary.memberEnds.map((end) => ({
          id: `${nary.id}:${end.classId}`,
          source: nary.id,
          target: end.classId,
          type: 'naryEnd' as const,
          data: { end, naryAssociationId: nary.id },
        })),
      ),
      ...ghostEdges,
    ],
    [diagram, displayNodes, doc, edgeHandles, ghostEdges],
  );

  // unidad 13c — la arista seleccionada resuelta a partir de la proyección en vivo. Cuando la
  // arista desaparece (eliminada desde cualquier lugar), esto pasa a null y el editor
  // se cierra automáticamente — sin panel obsoleto.
  const selectedEdgeData = useMemo(
    () => {
      if (selectedEdge === null) {
        return null;
      }
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
    },
    [diagram, selectedEdge],
  );

  // unidad 13d corrección A — el n-ario seleccionado resuelto a partir de la proyección en vivo.
  // Cuando la asociación desaparece (eliminada desde cualquier lugar), esto pasa a
  // null y el editor de diamante se cierra automáticamente — sin panel obsoleto.
  const selectedNary = useMemo(
    () => (diagram.naryAssociations ?? []).find((n) => n.id === selectedNaryId) ?? null,
    [diagram, selectedNaryId],
  );

  /**
   * unidad 13d corrección A — confirma el campo Name del editor de diamante (vacío borra,
   * reflejando la semántica de etiquetas de aristas).
   */
  const commitNaryName = (value: string): void => {
    if (selectedNary === null) {
      return;
    }
    handleUpdateNaryAssociation(doc, diagram.id, selectedNary.id, { name: value.trim() });
  };

  /**
   * unidad 13d corrección A — confirma la multiplicidad de un extremo miembro: reconstruye el arreglo
   * completo memberEnds (semántica de reemplazo del delta update central) cambiando únicamente
   * dicho extremo; los roles y los otros extremos se conservan. La entrada inválida está
   * protegida dentro de handleUpdateNaryAssociation (no se emite delta).
   */
  const commitNaryEndMultiplicity = (classId: string, value: string): void => {
    if (selectedNary === null) {
      return;
    }
    const memberEnds: NaryMemberEndInput[] = selectedNary.memberEnds.map((end) => ({
      classId: end.classId,
      multiplicity: end.classId === classId ? value.trim() : end.multiplicity,
      ...(end.role !== undefined ? { role: end.role } : {}),
    }));
    handleUpdateNaryAssociation(doc, diagram.id, selectedNary.id, { memberEnds });
  };

  // Unit 11.4 — lista de generalización para la clase seleccionada (ambos roles).
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

  // Unit 12.4 — lista de realización para la clase seleccionada (ambos roles).
  const selectedClassRealizations = useMemo(
    () =>
      selectedClass === null
        ? []
        : (diagram.realizations ?? []).filter(
            (real) => real.clientClassId === selectedClass.id || real.supplierInterfaceId === selectedClass.id,
          ),
    [diagram, selectedClass],
  );

  // Unit 12.4 (12b) — lista de dependencias para la clase seleccionada (ambos roles).
  const selectedClassDependencies = useMemo(
    () =>
      selectedClass === null
        ? []
        : (diagram.dependencies ?? []).filter(
            (dep) => dep.clientClassId === selectedClass.id || dep.supplierClassId === selectedClass.id,
          ),
    [diagram, selectedClass],
  );

  /**
   * unidad 13b/13e.7 — el elemento n-ario de la paleta conmuta el modo de selección (el antiguo
   * gemelo de la barra de herramientas desapareció). Ingresar a él desarma cualquier herramienta
   * de arista armada (los modos son exclusivos).
   */
  const toggleNaryMode = (): void => {
    setNaryMode((prev) => !prev);
    setNarySelection([]);
    setNaryEnds({});
    setNaryName('');
    setEdgeTool(null);
    setEdgeMessage(null);
  };

  /** unidad 13b — armar/desarmar una herramienta de arista; armar sale del modo de selección n-ario. */
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

  /**
   * unidad 13c — confirma el campo Label del editor unificado para cualquiera que sea el tipo
   * de arista seleccionado. Las asociaciones conservan la ruta de actualización de metadatos (vacío borra);
   * los tres tipos de etiqueta emiten el delta `update` de nombre de core (vacío borra).
   */
  const commitEdgeLabel = (value: string): void => {
    if (selectedEdgeData === null) {
      return;
    }
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

  /** unidad 13c — elimina la arista seleccionada vía el delta delete de su tipo y cierra. */
  const deleteSelectedEdge = (): void => {
    if (selectedEdgeData === null) {
      return;
    }
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

  // Comodidad estilo EA: atajos de teclado globales para Escape, Delete y flechas de dirección.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setEdgeTool(null);
        setEdgeMessage(null);
        setSelectedClassId(null);
        setSelectedEdge(null);
        setSelectedNaryId(null);
        return;
      }

      // Evitar interceptar teclas mientras se edita texto en inputs, textareas o selects
      const target = event.target as HTMLElement | null;
      const isInput =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) {
        return;
      }

      // Teclas de eliminación: Delete o Backspace para el elemento seleccionado
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedClassId !== null) {
          event.preventDefault();
          handleDeleteClass(selectedClassId);
          setSelectedClassId(null);
          return;
        }
        if (selectedEdge !== null) {
          event.preventDefault();
          deleteSelectedEdge();
          return;
        }
        if (selectedNaryId !== null) {
          event.preventDefault();
          handleDeleteNaryAssociation(doc, diagram.id, selectedNaryId);
          setSelectedNaryId(null);
          return;
        }
      }

      // Flechas de dirección: desplazar la clase seleccionada en pasos de 20px (alineación a cuadrícula)
      if (selectedClassId !== null && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const cls = diagram.classes.find((c) => c.id === selectedClassId);
        if (cls) {
          event.preventDefault();
          let dx = 0;
          let dy = 0;
          if (event.key === 'ArrowUp') dy = -20;
          if (event.key === 'ArrowDown') dy = 20;
          if (event.key === 'ArrowLeft') dx = -20;
          if (event.key === 'ArrowRight') dx = 20;

          handleNodeDragStop(doc, diagram.id, {
            id: cls.id,
            position: {
              x: Math.round((cls.position.x + dx) / 20) * 20,
              y: Math.round((cls.position.y + dy) / 20) * 20,
            },
          });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [doc, diagram, selectedClassId, selectedEdge, selectedNaryId]);

  return (
    <div
      className="diagram-canvas"
      style={{ width: '100%', height: '100%' }}
      onClickCapture={handleCanvasClickCapture}
    >
      {/* unidad 13b — riel de creación izquierdo: arrastrar nodos, armar herramientas de aristas, n-ario.
          unidad 13e.11 — el lienzo posee el estado de colapso (alternador de encabezado). */}
      <Palette
        activeEdgeTool={edgeTool}
        naryMode={naryMode}
        onEdgeToolChange={changeEdgeTool}
        onNaryModeToggle={toggleNaryMode}
        collapsed={paletteCollapsed}
        onToggleCollapsed={() => setPaletteCollapsed((prev) => !prev)}
        onNodeClick={handlePaletteQuickAdd}
      />
      {/* unidad 13e.7 — la barra de herramientas heredada `.diagram-canvas__toolbar` (Add class /
          Add interface / Link classes / N-ary association / Directed) fue
          ELIMINADA: los elementos de la paleta + arrastrar para conectar + Quick Linker la
          reemplazan por completo (solicitud del usuario: "quitar los botones antiguos"). */}
      {/* unidad 13b — ayudas visuales para la herramienta de arista armada + retroalimentación de protección. */}
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
          // unidad 13c — radio de ajuste indulgente alrededor de los conectores; combinado con las
          // superposiciones de conexión en todo el nodo permite arrastrar para conectar desde el cuerpo.
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
            setCurrentZoom(viewport.zoom);
          }}
          onNodesChange={onNodesChange}
          onNodeClick={(_event, node) => {
            recordClickPoint(_event.clientX, _event.clientY);
            handleNodeClick(node);
          }}
          // unidad 13c — hacer clic en cualquier tipo de arista de editor abre el editor
          // ÚNICO unificado; las aristas de miembros n-arios conservan su propio flujo de diamante.
          onEdgeClick={(_event, edge) => {
            recordClickPoint(_event.clientX, _event.clientY);
            if (isEditorEdgeType(edge.type)) {
              setSelectedEdge({ id: edge.id, type: edge.type });
              // Los editores son exclusivos: abrir el editor de aristas cierra el
              // editor de diamante n-ario (unidad 13d corrección A).
              setSelectedNaryId(null);
            }
          }}
          // unidad 13d corrección D — hacer clic en el lienzo vacío deselecciona: limpia la
          // clase seleccionada, cierra los editores de arista/n-ario, y desarma cualquier
          // herramienta de arista armada (el equivalente con clic a Escape).
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
          {/* unidad 13e — lienzo estilo EA: sutil cuadrícula de puntos nítidos detrás de los elementos. */}
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#94a3b8" />
          {/* Límite visual del lienzo: hoja de diagrama con bordes definidos y sombreado exterior */}
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
      {/* Zoom Controls: Botones para hacer zoom y quitar zoom enfocados en el último punto clicado */}
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
      {/* unidad 13d — banda elástica de Quick Linker: una delgada línea discontinua desde la
          flecha de la esquina hasta el cursor en vivo mientras corre el arrastre de enlace rápido. */}
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
      {/* unidad 13d — el menú filtrado por metamodelo: opciones de conector sobre un
          elemento existente, tipos de elementos creables sobre lienzo vacío.
          Escape / clic afuera cierra SIN crear nada. */}
      {quickLinkMenu !== null &&
        (quickLinkMenu.mode === 'connector' ? (
          <QuickLinkerMenu
            position={quickLinkMenu.anchor}
            items={validConnectorsFor(quickLinkMenu.sourceKind, quickLinkMenu.targetKind, quickLinkMenu.sourceId === quickLinkMenu.targetId).map(
              (connector) => ({ id: connector, label: tr(CONNECTOR_TOOL_KEYS[connector]) }),
            )}
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