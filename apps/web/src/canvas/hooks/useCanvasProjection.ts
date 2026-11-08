/**
 * Hook para la proyección y transmisión colaborativa en vivo de nodos y aristas de React Flow.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Node, Edge, NodeChange } from '@xyflow/react';
import type * as Y from 'yjs';
import type { Diagram, Parameter } from '@app/core';
import type { ClassNodeData, ClassFlowNode, MemberAdornments } from '../ClassNode';
import type { NaryDiamondFlowNode } from '../NaryDiamondNode';
import type { PaletteEdgeTool } from '../Palette';
import {
  handleNodeDragStop,
  handleSetAbstract,
  handleCreateGeneralization,
  handleCreateRealization,
  handleCreateDependency,
  handleDeleteNaryAssociation,
  handleUpdateMultiplicity,
  computeNaryCentroid,
  getOptimalHandles,
} from '../operations/index.js';
import { applyDeltaToYDoc } from '../applyDeltaToYDoc';

export interface UseCanvasProjectionOptions {
  doc: Y.Doc;
  diagram: Diagram;
  edgeTool: PaletteEdgeTool | null;
  selectedClassId: string | null;
  setSelectedClassId: (id: string | null) => void;
  edgeHandles: Record<string, { sourceHandle?: string; targetHandle?: string }>;
  remoteSelections: Map<string, any>;
  ghostNodes: any[];
  ghostEdges: Edge[];
  ghostMembers: { attrsByClassId: Map<string, any[]>; deletedClassIds: Set<string> };
  startQuickLink: (classId: string, clientX: number, clientY: number) => void;
  handleRename: (classId: string, newName: string) => void;
  handleDeleteClass: (classId: string) => void;
  handleAddAttribute: (classId: string, name: string, type: string, adornments?: MemberAdornments) => void;
  handleEditAttribute: (classId: string, memberId: string, name: string, type: string, adornments?: MemberAdornments) => void;
  handleRemoveAttribute: (classId: string, memberId: string) => void;
  handleAddMethod: (classId: string, name: string, returnType: string, parameters: Parameter[], adornments?: MemberAdornments) => void;
  handleEditMethod: (classId: string, memberId: string, name: string, returnType: string, parameters: Parameter[], adornments?: MemberAdornments) => void;
  handleRemoveMethod: (classId: string, memberId: string) => void;
}

export function useCanvasProjection({
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
}: UseCanvasProjectionOptions) {
  const measuredMapRef = useRef<Map<string, { width: number; height: number }>>(new Map());

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

        const prevMeasured = measuredMapRef.current.get(cls.id);

        return {
          id: cls.id,
          type: 'class' as const,
          position: cls.position,
          className: nodeClassName,
          initialWidth: 260,
          initialHeight: 180,
          ...(prevMeasured ? { measured: prevMeasured } : {}),
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
            initialWidth: 48,
            initialHeight: 48,
            data: {
              nary,
              onDelete: () => handleDeleteNaryAssociation(doc, diagram.id, nary.id),
            },
          } satisfies NaryDiamondFlowNode;
        })
        .filter((node): node is NaryDiamondFlowNode => node !== null),
      ...ghostNodes,
    ],
    [diagram, edgeTool, selectedClassId, remoteSelections, ghostNodes, ghostMembers, handleRename, handleDeleteClass, handleAddAttribute, handleEditAttribute, handleRemoveAttribute, handleAddMethod, handleEditMethod, handleRemoveMethod, doc, startQuickLink, setSelectedClassId],
  );

  const dragRafRef = useRef<number | null>(null);
  const activeDragNodeRef = useRef<{ id: string; position: { x: number; y: number } } | null>(null);

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

  const [dragOverride, setDragOverride] = useState<{ id: string; position: { x: number; y: number } } | null>(null);

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

  const displayNodes = useMemo(() => {
    if (!dragOverride) return nodes;
    return nodes.map((n) => (n.id === dragOverride.id ? { ...n, position: dragOverride.position } : n));
  }, [nodes, dragOverride]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        setDragOverride({ id: change.id, position: change.position });
      } else if (change.type === 'dimensions' && change.dimensions) {
        measuredMapRef.current.set(change.id, change.dimensions);
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

  return {
    nodes,
    displayNodes,
    edges,
    onNodeDrag,
    onNodeDragStop,
    onNodesChange,
  };
}

