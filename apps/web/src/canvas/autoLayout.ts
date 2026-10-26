import type { Diagram, Class } from '@app/core';

export interface LayoutOptions {
  horizontalGap?: number; // Espacio libre horizontal entre clases en px (default: 240)
  verticalGap?: number;   // Espacio libre vertical entre niveles en px (default: 180)
  startX?: number;        // Coordenada X inicial (default: 120)
  startY?: number;        // Coordenada Y inicial (default: 120)
}

export interface NodeSize {
  width: number;
  height: number;
}

/**
 * Estima las dimensiones reales de renderizado de la tarjeta UML en ReactFlow
 * basándose en su nombre, atributos y métodos, incluyendo los formularios inline.
 */
export function estimateClassDimensions(cls: Class): NodeSize {
  const attrCount = cls.attributes?.length ?? 0;
  const methodCount = cls.methods?.length ?? 0;

  const maxTextLen = Math.max(
    cls.name.length,
    ...((cls.attributes ?? []).map((a) => `${a.name}: ${a.type ?? 'string'}`.length)),
    ...((cls.methods ?? []).map((m) => `${m.name}(): ${m.returnType ?? 'void'}`.length)),
    12
  );

  // Ancho estimado: min 280px, max 420px
  const width = Math.max(280, Math.min(420, 220 + maxTextLen * 7));

  // Alto estimado con encabezado, compartimentos y formularios inline (+ / add):
  // Header (~50px) + atributos (~26px c/u + 85px formulario) + métodos (~26px c/u + 85px formulario)
  const height = Math.max(
    240,
    80 +
    (attrCount * 26 + (attrCount > 0 ? 80 : 70)) +
    (methodCount * 26 + (methodCount > 0 ? 80 : 70))
  );

  return { width, height };
}

/**
 * Organiza las clases de un diagrama UML usando un ordenamiento topológico por niveles
 * (Sugiyama-inspired), ordenamiento baricéntrico de reducción de cruces y resolución
 * elástica de colisiones para que las aristas y cardinalidades se lean con total claridad.
 */
export function computeAutoLayout(
  diagram: Diagram,
  options: LayoutOptions = {}
): Record<string, { x: number; y: number }> {
  const classes = diagram.classes ?? [];
  if (classes.length === 0) return {};

  const horizontalGap = options.horizontalGap ?? 240;
  const verticalGap = options.verticalGap ?? 180;
  const startX = options.startX ?? 120;
  const startY = options.startY ?? 120;

  const classMap = new Map<string, Class>(classes.map((c) => [c.id, c]));
  const sizeMap = new Map<string, NodeSize>(classes.map((c) => [c.id, estimateClassDimensions(c)]));

  // 1. Grafo de adyacencia y jerarquía dirigida
  const adj = new Map<string, Set<string>>();
  const directedParents = new Map<string, Set<string>>();
  const directedChildren = new Map<string, Set<string>>();

  classes.forEach((c) => {
    adj.set(c.id, new Set());
    directedParents.set(c.id, new Set());
    directedChildren.set(c.id, new Set());
  });

  const addEdge = (u: string, v: string, isHierarchy = false) => {
    if (!adj.has(u) || !adj.has(v) || u === v) return;
    adj.get(u)!.add(v);
    adj.get(v)!.add(u);
    if (isHierarchy) {
      directedChildren.get(u)!.add(v); // u es padre de v
      directedParents.get(v)!.add(u);  // v es hijo de u
    }
  };

  // Generalizaciones: superClass -> subClass
  (diagram.generalizations ?? []).forEach((g) => {
    addEdge(g.superClassId, g.subClassId, true);
  });

  // Realizaciones: supplierInterface -> clientClass
  (diagram.realizations ?? []).forEach((r) => {
    addEdge(r.supplierInterfaceId, r.clientClassId, true);
  });

  // Asociaciones: si es composición o agregación, el contenedor va arriba/padre
  (diagram.associations ?? []).forEach((a) => {
    const isComposite = a.aggregation === 'composite';
    const isShared = a.aggregation === 'shared';
    if (isComposite || isShared) {
      if (a.aggregationEnd === 'target') {
        addEdge(a.targetClassId, a.sourceClassId, true);
      } else {
        addEdge(a.sourceClassId, a.targetClassId, true);
      }
    } else {
      addEdge(a.sourceClassId, a.targetClassId, false);
    }
  });

  // Dependencias
  (diagram.dependencies ?? []).forEach((d) => {
    addEdge(d.supplierClassId, d.clientClassId, true);
  });

  // Asociaciones N-arias
  (diagram.naryAssociations ?? []).forEach((na) => {
    const ends = na.memberEnds ?? [];
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        addEdge(ends[i].classId, ends[j].classId, false);
      }
    }
  });

  // 2. Componentes conexos
  const visited = new Set<string>();
  const components: string[][] = [];

  classes.forEach((c) => {
    if (visited.has(c.id)) return;
    const comp: string[] = [];
    const queue = [c.id];
    visited.add(c.id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      comp.push(curr);
      (adj.get(curr) ?? []).forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }
    components.push(comp);
  });

  // Ordenar componentes por tamaño descendente
  components.sort((a, b) => b.length - a.length);

  const finalPositions: Record<string, { x: number; y: number }> = {};
  let currentComponentOffsetX = startX;

  // 3. Distribución por capas para cada componente
  components.forEach((comp) => {
    // Identificar raíces de la jerarquía en este componente
    const roots = comp.filter((id) => {
      const parents = directedParents.get(id);
      return !parents || parents.size === 0;
    });

    // Si no hay raíces jerárquicas puras, ordenar por mayor grado de conectividad
    if (roots.length === 0) {
      const sortedByDegree = [...comp].sort((a, b) => (adj.get(b)?.size ?? 0) - (adj.get(a)?.size ?? 0));
      roots.push(sortedByDegree[0]);
    }

    // Asignación de capas (Tiers)
    const tierMap = new Map<string, number>();
    const compQueue = [...roots];
    compQueue.forEach((r) => tierMap.set(r, 0));

    // BFS extendido para asignar capas respetando jerarquía
    const queue = [...roots];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currTier = tierMap.get(curr)!;

      // Hijos jerárquicos siempre van en capa inferior (currTier + 1)
      const children = directedChildren.get(curr) ?? new Set();
      children.forEach((ch) => {
        if (comp.includes(ch)) {
          const prev = tierMap.get(ch);
          if (prev === undefined || prev < currTier + 1) {
            tierMap.set(ch, currTier + 1);
            queue.push(ch);
          }
        }
      });

      // Vecinos por asociación simple van en la misma capa o adyacente
      const neighbors = adj.get(curr) ?? new Set();
      neighbors.forEach((nbr) => {
        if (comp.includes(nbr) && !children.has(nbr) && !directedParents.get(curr)?.has(nbr)) {
          if (!tierMap.has(nbr)) {
            tierMap.set(nbr, currTier + 1);
            queue.push(nbr);
          }
        }
      });
    }

    // Asegurar que todas las clases del componente tengan capa asignada
    comp.forEach((id) => {
      if (!tierMap.has(id)) {
        tierMap.set(id, 0);
      }
    });

    // Agrupar clases por capa
    const tiers = new Map<number, string[]>();
    comp.forEach((id) => {
      const t = tierMap.get(id)!;
      if (!tiers.has(t)) tiers.set(t, []);
      tiers.get(t)!.push(id);
    });

    // Limitar el ancho horizontal de cada capa (máximo 3-4 clases por fila) para evitar diagramas infinitamente anchos
    const sortedTierKeys = Array.from(tiers.keys()).sort((a, b) => a - b);
    const normalizedTiers: string[][] = [];

    sortedTierKeys.forEach((k) => {
      const nodes = tiers.get(k)!;
      const maxNodesPerRow = 3;
      for (let i = 0; i < nodes.length; i += maxNodesPerRow) {
        normalizedTiers.push(nodes.slice(i, i + maxNodesPerRow));
      }
    });

    // 4. Ordenamiento Baricéntrico entre capas consecutivas para reducir cruce de aristas
    for (let t = 1; t < normalizedTiers.length; t++) {
      const prevTier = normalizedTiers[t - 1];
      const currTier = normalizedTiers[t];

      const getBarycenter = (id: string): number => {
        const neighbors = adj.get(id) ?? new Set();
        const connectedPrev = prevTier.map((pid, idx) => (neighbors.has(pid) ? idx : -1)).filter((idx) => idx !== -1);
        if (connectedPrev.length === 0) return 0;
        return connectedPrev.reduce((acc, val) => acc + val, 0) / connectedPrev.length;
      };

      currTier.sort((a, b) => getBarycenter(a) - getBarycenter(b));
    }

    // 5. Asignar coordenadas iniciales con espacio holgado
    const tierHeights = normalizedTiers.map((tier) =>
      Math.max(...tier.map((id) => sizeMap.get(id)?.height ?? 260))
    );

    const tierWidths = normalizedTiers.map((tier) => {
      const totalNodesWidth = tier.reduce((acc, id) => acc + (sizeMap.get(id)?.width ?? 300), 0);
      return totalNodesWidth + Math.max(0, tier.length - 1) * horizontalGap;
    });

    const maxComponentWidth = Math.max(...tierWidths);

    let currentTierY = startY;
    const positions: Record<string, { x: number; y: number }> = {};

    normalizedTiers.forEach((tier, tIdx) => {
      const currentTierWidth = tierWidths[tIdx];
      // Centrar horizontalmente la capa con respecto al ancho máximo del componente
      let currentX = currentComponentOffsetX + Math.max(0, (maxComponentWidth - currentTierWidth) / 2);

      tier.forEach((id) => {
        const sz = sizeMap.get(id)!;
        positions[id] = {
          x: Math.round(currentX),
          y: Math.round(currentTierY),
        };
        currentX += sz.width + horizontalGap;
      });

      currentTierY += tierHeights[tIdx] + verticalGap;
    });

    // 6. Relajación física anti-colisiones (25 iteraciones)
    // Garantiza que ninguna clase se toque ni se superponga bajo ninguna circunstancia
    const compNodeIds = comp;
    for (let iter = 0; iter < 25; iter++) {
      for (let i = 0; i < compNodeIds.length; i++) {
        for (let j = i + 1; j < compNodeIds.length; j++) {
          const idA = compNodeIds[i];
          const idB = compNodeIds[j];
          const posA = positions[idA];
          const posB = positions[idB];
          const szA = sizeMap.get(idA)!;
          const szB = sizeMap.get(idB)!;

          const cxA = posA.x + szA.width / 2;
          const cyA = posA.y + szA.height / 2;
          const cxB = posB.x + szB.width / 2;
          const cyB = posB.y + szB.height / 2;

          const dx = cxB - cxA;
          const dy = cyB - cyA;

          const requiredDistX = (szA.width + szB.width) / 2 + 160;
          const requiredDistY = (szA.height + szB.height) / 2 + 120;

          const overlapX = requiredDistX - Math.abs(dx);
          const overlapY = requiredDistY - Math.abs(dy);

          // Si hay superposición o proximidad excesiva, repeler suavemente
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) {
              const push = (overlapX / 2) * (dx >= 0 ? 1 : -1);
              posA.x -= push;
              posB.x += push;
            } else {
              const push = (overlapY / 2) * (dy >= 0 ? 1 : -1);
              posA.y -= push;
              posB.y += push;
            }
          }
        }
      }
    }

    // 7. Alinear a cuadrícula de 20px para nitidez profesional
    comp.forEach((id) => {
      finalPositions[id] = {
        x: Math.round(positions[id].x / 20) * 20,
        y: Math.round(positions[id].y / 20) * 20,
      };
    });

    // Siguiente componente a la derecha con margen generoso
    currentComponentOffsetX += maxComponentWidth + horizontalGap * 1.5;
  });

  return finalPositions;
}
