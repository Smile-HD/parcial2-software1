/**
 * Hook para procesar y proyectar deltas fantasma (ghostDelta) en el lienzo de React Flow.
 * Renderiza clases, miembros y relaciones propuestas con estilo traslúcido/animado.
 */
import { useMemo } from 'react';
import type { Edge } from '@xyflow/react';
import type { Delta, Diagram } from '@app/core';
import type { ClassNodeData } from '../ClassNode';
import { getOptimalHandles } from '../operations/index.js';

export function useGhostDeltas(ghostDelta: Delta | null | undefined, diagram: Diagram) {
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

      if (diagram.classes.some((c) => c.id === str)) return str;
      if (ghostNodes.some((gn) => gn.id === `ghost-${str}`)) return `ghost-${str}`;
      if (ghostNodes.some((gn) => gn.id === str)) return str;

      const byName = diagram.classes.find((c) => c.name.toLowerCase() === lower);
      if (byName) return byName.id;

      const byGhostName = ghostNodes.find((gn) => {
        const cleanName = String((gn.data as any)?.name ?? '')
          .replace(/\s*\(Propuesta\)$/i, '')
          .trim()
          .toLowerCase();
        return cleanName === lower;
      });
      if (byGhostName) return byGhostName.id;

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

  return {
    ghostMembers,
    ghostNodes,
    ghostEdges,
  };
}

