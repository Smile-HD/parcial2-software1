import type { BatchDelta, LlmPort } from '@app/core';

export interface SemanticAttribute {
  name: string;
  type?: string;
  visibility?: '+' | '-' | '#' | '~';
  isStatic?: boolean;
  isDerived?: boolean;
}

export interface SemanticMethod {
  name: string;
  returnType?: string;
  parameters?: Array<{ name: string; type: string }>;
  visibility?: '+' | '-' | '#' | '~';
  isStatic?: boolean;
}

export interface SemanticClass {
  name: string;
  isInterface?: boolean;
  isAbstract?: boolean;
  attributes?: SemanticAttribute[];
  methods?: SemanticMethod[];
}

export interface SemanticAssociation {
  source: string;
  target: string;
  name?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  aggregation?: 'none' | 'shared' | 'composite';
  aggregationEnd?: 'source' | 'target';
  associationClass?: string;
  directed?: boolean;
  sourceRole?: string;
  targetRole?: string;
}

export interface SemanticGeneralization {
  subclass: string;
  superclass: string;
  name?: string;
}

export interface SemanticRealization {
  clientClass: string;
  supplierInterface: string;
  name?: string;
}

export interface SemanticDependency {
  client: string;
  supplier: string;
  name?: string;
}

export interface SemanticNaryAssociation {
  name?: string;
  members: Array<{
    class: string;
    multiplicity?: string;
    role?: string;
  }>;
}

export interface SemanticDeletions {
  classes?: string[];
  attributes?: Array<{ class: string; attribute: string }>;
  methods?: Array<{ class: string; method: string }>;
  associations?: Array<{ source: string; target: string }>;
}

export interface SemanticDomainModel {
  action?: 'create' | 'modify' | 'delete';
  classes?: SemanticClass[];
  associations?: SemanticAssociation[];
  generalizations?: SemanticGeneralization[];
  realizations?: SemanticRealization[];
  dependencies?: SemanticDependency[];
  naryAssociations?: SemanticNaryAssociation[];
  deletions?: SemanticDeletions;
}

export function isDomainModelRequest(text: string): boolean {
  return /(crea|crear|dise[ñn]|model|arma|armar|implement|aplica|agrega|inserta|pone|pon\b|hace|haz|constru|reserva|base de datos|sistema|diagrama|quiero un|necesito un|hazme|haceme|hacer|make|build|generate|design|model|add|apply)\b/i.test(text);
}

/**
 * Convierte un modelo de dominio semántico abstracto (generado dinámicamente por el LLM)
 * en un BatchDelta de metamodelo UML canónico y validado con coordenadas espaciales.
 */
export function expandSemanticDomainToDelta(
  model: SemanticDomainModel,
  diagramId: string,
  currentDiagram?: any
): BatchDelta | null {
  const hasClasses = Array.isArray(model.classes) && model.classes.length > 0;
  const hasAssociations = Array.isArray(model.associations) && model.associations.length > 0;
  const hasGeneralizations = Array.isArray(model.generalizations) && model.generalizations.length > 0;
  const hasRealizations = Array.isArray(model.realizations) && model.realizations.length > 0;
  const hasDependencies = Array.isArray(model.dependencies) && model.dependencies.length > 0;
  const hasNary = Array.isArray(model.naryAssociations) && model.naryAssociations.length > 0;
  const hasDeletions = !!model.deletions && (
    (Array.isArray(model.deletions.classes) && model.deletions.classes.length > 0) ||
    (Array.isArray(model.deletions.attributes) && model.deletions.attributes.length > 0) ||
    (Array.isArray(model.deletions.methods) && model.deletions.methods.length > 0) ||
    (Array.isArray(model.deletions.associations) && model.deletions.associations.length > 0)
  );

  if (!hasClasses && !hasAssociations && !hasGeneralizations && !hasRealizations && !hasDependencies && !hasNary && !hasDeletions) {
    return null;
  }

  const timestamp = new Date().toISOString();
  const classIdMap = new Map<string, string>();
  const deltas: any[] = [];

  // Registrar clases existentes para resolver asociaciones mixtas y actualizar atributos existentes
  const existingClassesMap = new Map<string, any>();
  if (currentDiagram?.classes && Array.isArray(currentDiagram.classes)) {
    for (const ec of currentDiagram.classes) {
      if (ec.id && ec.name) {
        const lower = ec.name.toLowerCase().trim();
        classIdMap.set(lower, ec.id);
        existingClassesMap.set(lower, ec);
      }
    }
  }

  const resolveClassId = (rawName?: string): string | undefined => {
    if (!rawName) return undefined;
    const lower = rawName.toLowerCase().trim().replace(/\s+/g, '');
    if (classIdMap.has(lower)) return classIdMap.get(lower);
    if (lower.endsWith('es') && classIdMap.has(lower.slice(0, -2))) return classIdMap.get(lower.slice(0, -2));
    if (lower.endsWith('s') && classIdMap.has(lower.slice(0, -1))) return classIdMap.get(lower.slice(0, -1));
    if (classIdMap.has(lower + 's')) return classIdMap.get(lower + 's');
    if (classIdMap.has(lower + 'es')) return classIdMap.get(lower + 'es');
    return undefined;
  };

  // 1. Crear clases nuevas o modificar existentes
  const cols = 2;
  const existingCount = currentDiagram?.classes?.length ?? 0;
  if (hasClasses) {
    model.classes!.forEach((cls, idx) => {
      const cleanName = cls.name.trim().replace(/\s+/g, '');
      const lower = cleanName.toLowerCase();
      const existingClass = existingClassesMap.get(lower);

      let classId: string;
      if (existingClass) {
        classId = existingClass.id;
        // Si pide marcar abstracta o cambiar a interfaz
        if (cls.isAbstract !== undefined || cls.isInterface !== undefined) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'class',
            op: 'update',
            classId,
            isAbstract: cls.isAbstract ?? existingClass.isAbstract ?? false,
            classKind: cls.isInterface ? 'interface' : (existingClass.classKind ?? 'class'),
          });
        }
      } else {
        classId = crypto.randomUUID();
        classIdMap.set(lower, classId);

        let x: number;
        let y: number;
        if (currentDiagram?.classes && currentDiagram.classes.length > 0) {
          let relatedExistingClass: any = null;
          if (Array.isArray(model.associations)) {
            const relatedAssoc = model.associations.find((a: any) => {
              const src = (typeof a.source === 'object' ? a.source?.name : a.source)?.toLowerCase().trim();
              const tgt = (typeof a.target === 'object' ? a.target?.name : a.target)?.toLowerCase().trim();
              return src === lower || tgt === lower;
            });
            if (relatedAssoc) {
              const src = (typeof relatedAssoc.source === 'object' ? relatedAssoc.source?.name : relatedAssoc.source)?.toLowerCase().trim();
              const otherName = src === lower
                ? (typeof relatedAssoc.target === 'object' ? relatedAssoc.target?.name : relatedAssoc.target)?.toLowerCase().trim()
                : src;
              relatedExistingClass = existingClassesMap.get(otherName);
            }
          }

          if (relatedExistingClass?.position) {
            x = (relatedExistingClass.position.x ?? 200) + 320;
            y = (relatedExistingClass.position.y ?? 150) + idx * 80;
          } else {
            const maxX = Math.max(...currentDiagram.classes.map((c: any) => c.position?.x ?? 100));
            const minY = Math.min(...currentDiagram.classes.map((c: any) => c.position?.y ?? 100));
            x = maxX + 320;
            y = minY + idx * 240;
          }
        } else {
          const posIdx = idx;
          x = 120 + (posIdx % cols) * 360;
          y = 120 + Math.floor(posIdx / cols) * 260;
        }

        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'class',
          op: 'create',
          classId,
          name: cleanName,
          classKind: cls.isInterface ? 'interface' : 'class',
          isAbstract: !!cls.isAbstract,
          position: { x, y },
        });
      }

      // Atributos de la clase (soporta formato compacto "nombre:tipo" y formato objeto {name, type})
      if (Array.isArray(cls.attributes)) {
        cls.attributes.forEach((attr: any) => {
          let name = '';
          let type = 'string';
          let visibility: '+' | '-' | '#' | '~' = '+';
          let isStatic = false;
          let isDerived = false;

          if (typeof attr === 'string') {
            const parts = attr.split(':');
            name = parts[0]?.trim() ?? '';
            type = parts[1]?.trim() ?? 'string';
          } else if (attr && typeof attr === 'object') {
            name = attr.name ?? '';
            type = attr.type ?? 'string';
            if (attr.visibility) visibility = attr.visibility;
            if (attr.isStatic !== undefined) isStatic = !!attr.isStatic;
            if (attr.isDerived !== undefined) isDerived = !!attr.isDerived;
          }
          name = name.replace(/\s+/g, '');
          if (!name) return;
          // Ignorar nombres de atributos que son placeholders literales del esquema como "name", "type", "string", "int", "attribute"
          if (/^(name|nombre|type|tipo|string|int|float|boolean|attribute|attr)$/i.test(name)) return;

          // Si la clase ya existía, evitar agregar atributos duplicados
          if (existingClass && Array.isArray(existingClass.attributes)) {
            const alreadyHasAttr = existingClass.attributes.some(
              (ea: any) => ea.name && ea.name.toLowerCase().trim() === name.toLowerCase()
            );
            if (alreadyHasAttr) return;
          }

          const rawType = type.toLowerCase().trim().replace(/\[\]$/, '');
          const cleanType = ['int', 'float', 'string', 'boolean', 'date'].includes(rawType)
            ? rawType
            : 'string';

          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'member',
            op: 'addAttribute',
            classId,
            memberId: crypto.randomUUID(),
            name,
            type: cleanType,
            visibility,
            isStatic,
            isDerived,
          });
        });
      }

      // Métodos de la clase
      if (Array.isArray(cls.methods)) {
        cls.methods.forEach((m: any) => {
          let mName = '';
          let returnType = 'void';
          let visibility: '+' | '-' | '#' | '~' = '+';
          let isStatic = false;
          let parameters: Array<{ name: string; type: string }> = [];

          if (typeof m === 'string') {
            mName = m.replace(/\(\)$/, '').trim();
          } else if (m && typeof m === 'object') {
            mName = m.name ?? '';
            returnType = m.returnType ?? 'void';
            if (m.visibility) visibility = m.visibility;
            if (m.isStatic !== undefined) isStatic = !!m.isStatic;
            if (Array.isArray(m.parameters)) parameters = m.parameters;
          }
          mName = mName.trim().replace(/\s+/g, '');
          if (!mName) return;

          // Si ya existía el método en la clase, evitar duplicar
          if (existingClass && Array.isArray(existingClass.methods)) {
            const alreadyHasMethod = existingClass.methods.some(
              (em: any) => em.name && em.name.toLowerCase().trim() === mName.toLowerCase()
            );
            if (alreadyHasMethod) return;
          }

          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'member',
            op: 'addMethod',
            classId,
            memberId: crypto.randomUUID(),
            name: mName,
            returnType,
            parameters,
            visibility,
            isStatic,
          });
        });
      }
    });
  }

  // Helper para verificar si dos clases ya tienen cualquier relación directa entre sí
  const areClassesConnected = (idA: string, idB: string): boolean => {
    if (!idA || !idB || idA === idB) return true;
    // Diagram associations
    if (currentDiagram?.associations?.some(
      (a: any) =>
        (a.sourceClassId === idA && a.targetClassId === idB) ||
        (a.sourceClassId === idB && a.targetClassId === idA)
    )) return true;
    // Diagram generalizations
    if (currentDiagram?.generalizations?.some(
      (g: any) =>
        (g.subClassId === idA && g.superClassId === idB) ||
        (g.subClassId === idB && g.superClassId === idA)
    )) return true;
    // Diagram realizations
    if (currentDiagram?.realizations?.some(
      (r: any) =>
        (r.clientClassId === idA && r.supplierInterfaceId === idB) ||
        (r.clientClassId === idB && r.supplierInterfaceId === idA)
    )) return true;
    // Diagram dependencies
    if (currentDiagram?.dependencies?.some(
      (d: any) =>
        (d.clientClassId === idA && d.supplierClassId === idB) ||
        (d.clientClassId === idB && d.supplierClassId === idA)
    )) return true;
    // Deltas in this batch
    if (deltas.some((d: any) => {
      if (d.kind === 'association') {
        return (d.sourceClassId === idA && d.targetClassId === idB) ||
               (d.sourceClassId === idB && d.targetClassId === idA);
      }
      if (d.kind === 'generalization') {
        return (d.subClassId === idA && d.superClassId === idB) ||
               (d.subClassId === idB && d.superClassId === idA);
      }
      if (d.kind === 'realization') {
        return (d.clientClassId === idA && d.supplierInterfaceId === idB) ||
               (d.clientClassId === idB && d.supplierInterfaceId === idA);
      }
      if (d.kind === 'dependency') {
        return (d.clientClassId === idA && d.supplierClassId === idB) ||
               (d.clientClassId === idB && d.supplierClassId === idA);
      }
      return false;
    })) return true;
    return false;
  };

  // 2. Asociaciones, composiciones y agregaciones
  if (Array.isArray(model.associations)) {
    model.associations.forEach((assoc) => {
      const sourceId = resolveClassId(assoc.source);
      const targetId = resolveClassId(assoc.target);

      if (!sourceId || !targetId || sourceId === targetId) return;
      if (areClassesConnected(sourceId, targetId)) return;

      // Si el nombre o tipo indica herencia/generalización
      const isGeneralization = assoc.name && /^(generaliz|hered|herencia|is_a|subclass)/i.test(assoc.name);
      if (isGeneralization) {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'generalization',
          op: 'create',
          generalizationId: crypto.randomUUID(),
          subClassId: sourceId,
          superClassId: targetId,
        });
        return;
      }

      // Si el nombre o tipo indica realización/implementación
      const isRealization = assoc.name && /^(implement|realiz)/i.test(assoc.name);
      if (isRealization) {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'realization',
          op: 'create',
          realizationId: crypto.randomUUID(),
          clientClassId: sourceId,
          supplierInterfaceId: targetId,
        });
        return;
      }

      // Si el nombre o tipo indica dependencia
      const isDependency = assoc.name && /^(depend|usa|uses)/i.test(assoc.name);
      if (isDependency) {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'dependency',
          op: 'create',
          dependencyId: crypto.randomUUID(),
          clientClassId: sourceId,
          supplierClassId: targetId,
        });
        return;
      }

      const assocClassId = assoc.associationClass
        ? resolveClassId(assoc.associationClass)
        : undefined;

      const isComposite = assoc.aggregation === 'composite';
      const isShared = assoc.aggregation === 'shared';

      const assocDelta: any = {
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'association',
        op: 'create',
        associationId: crypto.randomUUID(),
        sourceClassId: sourceId,
        targetClassId: targetId,
        sourceMultiplicity: assoc.sourceMultiplicity ?? '1',
        targetMultiplicity: assoc.targetMultiplicity ?? '0..*',
        directed: assoc.directed ?? false,
        aggregation: isComposite ? 'composite' : (isShared ? 'shared' : 'none'),
        aggregationEnd: (isComposite || isShared) ? (assoc.aggregationEnd ?? 'source') : 'source',
      };

      if (assoc.name) assocDelta.name = assoc.name;
      if (assoc.sourceRole) assocDelta.sourceRole = assoc.sourceRole;
      if (assoc.targetRole) assocDelta.targetRole = assoc.targetRole;
      if (assocClassId) assocDelta.associationClassId = assocClassId;

      deltas.push(assocDelta);
    });
  }

  // 3. Generalizaciones explícitas
  if (Array.isArray(model.generalizations)) {
    model.generalizations.forEach((gen) => {
      const subId = resolveClassId(gen.subclass);
      const superId = resolveClassId(gen.superclass);
      if (!subId || !superId || subId === superId || areClassesConnected(subId, superId)) return;

      deltas.push({
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'generalization',
        op: 'create',
        generalizationId: crypto.randomUUID(),
        subClassId: subId,
        superClassId: superId,
        name: gen.name,
      });
    });
  }

  // 4. Realizaciones explícitas (implementación de interfaz)
  if (Array.isArray(model.realizations)) {
    model.realizations.forEach((r) => {
      const client = resolveClassId(r.clientClass);
      const supplier = resolveClassId(r.supplierInterface);
      if (!client || !supplier || client === supplier || areClassesConnected(client, supplier)) return;

      deltas.push({
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'realization',
        op: 'create',
        realizationId: crypto.randomUUID(),
        clientClassId: client,
        supplierInterfaceId: supplier,
        name: r.name,
      });
    });
  }

  // 5. Dependencias explícitas
  if (Array.isArray(model.dependencies)) {
    model.dependencies.forEach((d) => {
      const client = resolveClassId(d.client);
      const supplier = resolveClassId(d.supplier);
      if (!client || !supplier || client === supplier || areClassesConnected(client, supplier)) return;

      deltas.push({
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        kind: 'dependency',
        op: 'create',
        dependencyId: crypto.randomUUID(),
        clientClassId: client,
        supplierClassId: supplier,
        name: d.name,
      });
    });
  }

  // 6. Asociaciones N-arias (3 o más extremos con rombo central)
  if (Array.isArray(model.naryAssociations)) {
    model.naryAssociations.forEach((n) => {
      if (!Array.isArray(n.members) || n.members.length < 3) return;
      const memberEnds: any[] = [];
      for (const m of n.members) {
        const cid = classIdMap.get(m.class.toLowerCase().trim());
        if (cid && !memberEnds.some((e) => e.classId === cid)) {
          memberEnds.push({
            classId: cid,
            multiplicity: m.multiplicity || '1',
            role: m.role,
          });
        }
      }
      if (memberEnds.length >= 3) {
        deltas.push({
          id: crypto.randomUUID(),
          diagramId,
          timestamp,
          kind: 'naryAssociation',
          op: 'create',
          naryAssociationId: crypto.randomUUID(),
          memberEnds,
          name: n.name,
        });
      }
    });
  }

  // 7. Eliminaciones puntuales (clases, atributos, métodos, relaciones)
  if (model.deletions) {
    // Borrado de clases
    if (Array.isArray(model.deletions.classes)) {
      model.deletions.classes.forEach((cname) => {
        const cid = classIdMap.get(cname.toLowerCase().trim());
        if (cid) {
          deltas.push({
            id: crypto.randomUUID(),
            diagramId,
            timestamp,
            kind: 'class',
            op: 'delete',
            classId: cid,
          });
        }
      });
    }

    // Borrado de atributos
    if (Array.isArray(model.deletions.attributes)) {
      model.deletions.attributes.forEach((item) => {
        const lower = item.class.toLowerCase().trim();
        const cid = classIdMap.get(lower);
        const ec = existingClassesMap.get(lower);
        if (cid && ec && Array.isArray(ec.attributes)) {
          const attr = ec.attributes.find((a: any) => a.name && a.name.toLowerCase().trim() === item.attribute.toLowerCase().trim());
          if (attr) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'member',
              op: 'deleteAttribute',
              classId: cid,
              memberId: attr.id,
            });
          }
        }
      });
    }

    // Borrado de métodos
    if (Array.isArray(model.deletions.methods)) {
      model.deletions.methods.forEach((item) => {
        const lower = item.class.toLowerCase().trim();
        const cid = classIdMap.get(lower);
        const ec = existingClassesMap.get(lower);
        if (cid && ec && Array.isArray(ec.methods)) {
          const m = ec.methods.find((em: any) => em.name && em.name.toLowerCase().trim() === item.method.toLowerCase().trim());
          if (m) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'member',
              op: 'deleteMethod',
              classId: cid,
              memberId: m.id,
            });
          }
        }
      });
    }

    // Borrado de asociaciones
    if (Array.isArray(model.deletions.associations) && currentDiagram?.associations) {
      model.deletions.associations.forEach((item) => {
        const srcId = classIdMap.get(item.source.toLowerCase().trim());
        const tgtId = classIdMap.get(item.target.toLowerCase().trim());
        if (srcId && tgtId) {
          const assoc = currentDiagram.associations.find(
            (a: any) =>
              (a.sourceClassId === srcId && a.targetClassId === tgtId) ||
              (a.sourceClassId === tgtId && a.targetClassId === srcId)
          );
          if (assoc) {
            deltas.push({
              id: crypto.randomUUID(),
              diagramId,
              timestamp,
              kind: 'association',
              op: 'delete',
              associationId: assoc.id,
            });
          }
        }
      });
    }
  }

  return {
    id: crypto.randomUUID(),
    diagramId,
    timestamp,
    kind: 'batch',
    deltas,
  };
}

/**
 * Síntesis 100% dinámica con IA de modelos de dominio.
 * Consulta al LLM para razonar la estructura semántica específica del dominio pedido,
 * sin recurrir a plantillas fijas cableadas.
 */
/**
 * Parsea el JSON devuelto por el modelo, tolerando markdown y truncamientos parciales.
 */
export function robustParseDomainJson(raw: string): SemanticDomainModel | null {
  const isDummyName = (str?: string) => !str || /^(NombreClase|ClassName|ClaseA|ClaseB|Origen|Destino|Hijo|Padre)$/i.test(str.trim());

  // 1. Intento de parseo JSON estándar
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      let rawClasses: any[] = [];
      if (Array.isArray(parsed.classes)) {
        rawClasses = parsed.classes;
      } else if (parsed.classes && typeof parsed.classes === 'object') {
        rawClasses = Object.entries(parsed.classes).map(([className, classData]: [string, any]) => {
          let attrs: any[] = [];
          if (Array.isArray(classData?.attributes)) {
            attrs = classData.attributes;
          } else if (classData?.attributes && typeof classData.attributes === 'object') {
            attrs = Object.entries(classData.attributes).map(([attrName, attrType]) => ({
              name: attrName,
              type: typeof attrType === 'string' ? attrType : 'string',
            }));
          }
          return {
            name: classData?.name || className,
            isInterface: classData?.isInterface ?? false,
            isAbstract: classData?.isAbstract ?? false,
            attributes: attrs,
            methods: classData?.methods,
          };
        });
      }

      const rawAssocs = Array.isArray(parsed.associations) ? parsed.associations : [];
      const rawGens = Array.isArray(parsed.generalizations) ? parsed.generalizations : [];
      const rawRealizations = Array.isArray(parsed.realizations) ? parsed.realizations : [];
      const rawDependencies = Array.isArray(parsed.dependencies) ? parsed.dependencies : [];
      const rawNary = Array.isArray(parsed.naryAssociations) ? parsed.naryAssociations : [];

      const classes = rawClasses.filter((c: any) => c.name && !isDummyName(c.name));
      const associations = rawAssocs
        .map((a: any) => ({
          source: typeof a.source === 'object' ? a.source?.name : a.source,
          target: typeof a.target === 'object' ? a.target?.name : a.target,
          name: a.name,
          type: a.type,
          aggregation: a.aggregation,
          aggregationEnd: a.aggregationEnd,
          associationClass: a.associationClass,
          directed: a.directed,
          sourceRole: a.sourceRole,
          targetRole: a.targetRole,
        }))
        .filter((a: any) => a.source && a.target && !isDummyName(a.source) && !isDummyName(a.target));

      const generalizations = rawGens
        .map((g: any) => ({
          subclass: typeof g.subclass === 'object' ? g.subclass?.name : g.subclass,
          superclass: typeof g.superclass === 'object' ? g.superclass?.name : g.superclass,
          name: g.name,
        }))
        .filter((g: any) => g.subclass && g.superclass && !isDummyName(g.subclass) && !isDummyName(g.superclass));

      const realizations = rawRealizations
        .map((r: any) => ({
          clientClass: typeof r.clientClass === 'object' ? r.clientClass?.name : (r.clientClass ?? r.client),
          supplierInterface: typeof r.supplierInterface === 'object' ? r.supplierInterface?.name : (r.supplierInterface ?? r.supplier),
          name: r.name,
        }))
        .filter((r: any) => r.clientClass && r.supplierInterface && !isDummyName(r.clientClass) && !isDummyName(r.supplierInterface));

      const dependencies = rawDependencies
        .map((d: any) => ({
          client: typeof d.client === 'object' ? d.client?.name : d.client,
          supplier: typeof d.supplier === 'object' ? d.supplier?.name : d.supplier,
          name: d.name,
        }))
        .filter((d: any) => d.client && d.supplier && !isDummyName(d.client) && !isDummyName(d.supplier));

      const naryAssociations = rawNary
        .map((n: any) => ({
          name: n.name,
          members: Array.isArray(n.members)
            ? n.members.map((m: any) => ({
                class: typeof m === 'string' ? m : (m.class ?? m.name),
                multiplicity: m.multiplicity,
                role: m.role,
              })).filter((m: any) => m.class && !isDummyName(m.class))
            : [],
        }))
        .filter((n: any) => n.members.length >= 3);

      const deletions = parsed.deletions;

      if (
        classes.length > 0 ||
        associations.length > 0 ||
        generalizations.length > 0 ||
        realizations.length > 0 ||
        dependencies.length > 0 ||
        naryAssociations.length > 0 ||
        deletions
      ) {
        return {
          action: parsed.action,
          classes,
          associations,
          generalizations,
          realizations,
          dependencies,
          naryAssociations,
          deletions,
        };
      }
    } catch {
      // Si el JSON quedó truncado al final, se recuperan las clases completas
    }
  }

  // 2. Extracción resiliente por expresiones regulares si el JSON fue truncado por límite de tokens
  const classes: Array<{ name: string; attributes: string[] }> = [];
  const classRegex = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"attributes"\s*:\s*\[([\s\S]*?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = classRegex.exec(raw)) !== null) {
    const name = m[1]!;
    if (isDummyName(name)) continue;
    const attrsRaw = m[2]!;
    const attrItems: string[] = [];
    const attrRegex = /"([^"]+)"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRegex.exec(attrsRaw)) !== null) {
      attrItems.push(am[1]!);
    }
    classes.push({ name, attributes: attrItems });
  }

  const associations: Array<{ source: string; target: string }> = [];
  const assocRegex = /\{\s*"source"\s*:\s*"([^"]+)"\s*,\s*"target"\s*:\s*"([^"]+)"/g;
  while ((m = assocRegex.exec(raw)) !== null) {
    if (isDummyName(m[1]!) || isDummyName(m[2]!)) continue;
    associations.push({ source: m[1]!, target: m[2]! });
  }

  if (classes.length > 0 || associations.length > 0) {
    if (classes.length >= 2 && associations.length === 0) {
      for (let i = 0; i < classes.length - 1; i++) {
        associations.push({ source: classes[i]!.name, target: classes[i + 1]!.name });
      }
    }
    const mappedClasses: SemanticClass[] = classes.slice(0, 6).map(c => ({
      name: c.name,
      attributes: c.attributes.map(a => ({ name: a, type: 'string' })),
    }));
    return { classes: mappedClasses, associations };
  }

  return null;
}

/**
 * Síntesis 100% dinámica con IA de modelos de dominio.
 * Consulta al LLM para razonar la estructura semántica específica del dominio pedido,
 * sin recurrir a plantillas fijas cableadas.
 */
export async function synthesizeDomainModel(
  text: string,
  diagramId: string,
  llm?: LlmPort,
  currentDiagram?: any,
  force = false
): Promise<BatchDelta | null> {
  if (!force && !isDomainModelRequest(text)) {
    return null;
  }

  // Si no hay LLM o no soporta chat, no falsificamos con plantillas estáticas
  if (!llm || typeof (llm as any).chat !== 'function') {
    return null;
  }

  const existingClassesList = currentDiagram?.classes?.map((c: any) => c.name).filter(Boolean) || [];
  const contextHint = existingClassesList.length > 0
    ? `\nThe current diagram already has these classes: ${existingClassesList.join(', ')}. Reuse these exact names if relating to them, and do not duplicate them unless creating distinct entities.`
    : '';

  const existingAssocsList = currentDiagram?.associations?.map((a: any) => {
    const src = currentDiagram.classes?.find((c: any) => c.id === a.sourceClassId)?.name;
    const tgt = currentDiagram.classes?.find((c: any) => c.id === a.targetClassId)?.name;
    return src && tgt ? `${src} <-> ${tgt}` : null;
  }).filter(Boolean) || [];

  const assocHint = existingAssocsList.length > 0
    ? `\nExisting relationships already in the canvas: ${existingAssocsList.join(', ')}. CRITICAL: DO NOT duplicate or create redundant relationships between classes that already have an association! Only link new entities to existing ones without repeating existing links.`
    : '';

  const systemPrompt = [
    'You are a senior UML software architect.',
    'Design a concise, realistic domain model tailored specifically to the user request (e.g. clothing store: Prenda, Categoria, Talla, Venta; airline: Vuelo, Pasajero, Reserva; cinema: Cine, Pelicula, Sala; workshop/taller: Vehiculo, Cliente, Reparacion, Mecanico).',
    'CRITICAL: If the user prompt is in Spanish, name all classes and attributes in Spanish. If in English, name them in English.',
    'CRITICAL REQUIREMENT: If the user prompt or context mentions candidate classes or entities (for example: "Pasajero", "Reserva", "Factura", etc.), YOU MUST GENERATE ALL OF THEM in the "classes" array. Never omit any requested class. If multiple classes are discussed, every single one must be included.',
    'Provide 2 to 3 realistic attributes each.',
    'Include essential relationships (associations) connecting the classes together, and connecting them to existing classes if present.',
    contextHint,
    assocHint,
    'Output ONLY a valid raw JSON object matching:',
    '{"classes":[{"name":"ClassName","attributes":["attrName:string|int|float"]}],"associations":[{"source":"ClassA","target":"ClassB"}]}',
  ].filter(Boolean).join('\n');

  try {
    const response = await (llm as any).chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      { timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 180000, temperature: 0.1, maxTokens: 2000 }
    );

    if (typeof response !== 'string') {
      return null;
    }

    const parsed = robustParseDomainJson(response);
    if (!parsed) {
      return null;
    }

    const expanded = expandSemanticDomainToDelta(parsed, diagramId, currentDiagram);
    if (expanded && expanded.deltas.length >= 1) {
      return expanded;
    }
  } catch {
    // Si falla la generación del LLM, retorna null en vez de inventar con plantillas
  }

  return null;
}

