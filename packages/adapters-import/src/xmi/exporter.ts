import { randomUUID } from 'crypto';
import type { Diagram } from '@app/core';
import {
  esc,
  visAttr,
  boolAttr,
  type ResolvedTypeInfo,
  resolveDataType,
  multiplicityXml,
} from './exporter-types.js';
import { buildEaExtensionXml } from './exporter-extension.js';

/**
 * Exporta un IR Diagram a un documento estándar UML 2.x XMI 2.1 que
 * Enterprise Architect puede importar.
 */
export function exportDiagramToXmi(diagram: Diagram): string {
  const lines: string[] = [];
  const cleanId = diagram.id.replace(/-/g, '_');
  const packageId = `EAPK_${cleanId}`;
  const diagramId = `EAID_${cleanId}`;
  const primitiveTypesMap = new Map<string, ResolvedTypeInfo>();

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`);
  lines.push(`  <xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5"/>`);
  lines.push(`  <uml:Model xmi:type="uml:Model" xmi:id="${diagram.id}" name="EA_Model" visibility="public">`);
  lines.push(`    <packagedElement xmi:type="uml:Package" xmi:id="${packageId}" name="${esc(diagram.name)}" visibility="public">`);

  // ── Construir mapas de id para referencias cruzadas ─────────────────────────
  const assocClassToAssocMap = new Map<string, Diagram['associations'][number]>();
  for (const assoc of diagram.associations) {
    if (assoc.associationClassId && diagram.classes.some(c => c.id === assoc.associationClassId)) {
      assocClassToAssocMap.set(assoc.associationClassId, assoc);
    }
  }
  const assocWithAssocClassIds = new Set([...assocClassToAssocMap.values()].map(a => a.id));

  // ── Clases e Interfaces ──────────────────────────────────────────────────
  for (const cls of diagram.classes) {
    const isAssocClass = assocClassToAssocMap.has(cls.id);
    const assocClassAssoc = isAssocClass ? assocClassToAssocMap.get(cls.id) : undefined;
    const xmiType = isAssocClass
      ? 'uml:AssociationClass'
      : (cls.kind === 'interface' ? 'uml:Interface' : 'uml:Class');
    lines.push(`      <packagedElement xmi:type="${xmiType}" xmi:id="${cls.id}" name="${esc(cls.name)}"${boolAttr('isAbstract', cls.isAbstract)}>`);

    // Si es AssociationClass, incluye sus extremos de asociación dentro de la definición
    if (assocClassAssoc) {
      lines.push(`      <memberEnd xmi:idref="${assocClassAssoc.id}_dst"/>`);
      lines.push(`      <memberEnd xmi:idref="${assocClassAssoc.id}_src"/>`);

      const sourceIsWhole = assocClassAssoc.aggregationEnd === 'source';
      const srcAgg = (assocClassAssoc.aggregation !== 'none' && sourceIsWhole) ? ` aggregation="${esc(assocClassAssoc.aggregation)}"` : '';
      lines.push(`      <ownedEnd xmi:type="uml:Property" xmi:id="${assocClassAssoc.id}_src"${srcAgg}${assocClassAssoc.sourceRole ? ` name="${esc(assocClassAssoc.sourceRole)}"` : ''} association="${cls.id}" isStatic="false" isReadOnly="false" isDerived="false" isOrdered="false" isUnique="true" isDerivedUnion="false">`);
      lines.push(`        <type xmi:idref="${assocClassAssoc.sourceClassId}"/>`);
      if (assocClassAssoc.sourceMultiplicity) {
        lines.push(`        ${multiplicityXml(assocClassAssoc.sourceMultiplicity)}`);
      }
      lines.push(`      </ownedEnd>`);

      const tgtAgg = (assocClassAssoc.aggregation !== 'none' && !sourceIsWhole) ? ` aggregation="${esc(assocClassAssoc.aggregation)}"` : '';
      lines.push(`      <ownedEnd xmi:type="uml:Property" xmi:id="${assocClassAssoc.id}_dst"${tgtAgg}${assocClassAssoc.targetRole ? ` name="${esc(assocClassAssoc.targetRole)}"` : ''} association="${cls.id}" isStatic="false" isReadOnly="false" isDerived="false" isOrdered="false" isUnique="true" isDerivedUnion="false">`);
      lines.push(`        <type xmi:idref="${assocClassAssoc.targetClassId}"/>`);
      if (assocClassAssoc.targetMultiplicity) {
        lines.push(`        ${multiplicityXml(assocClassAssoc.targetMultiplicity)}`);
      }
      lines.push(`      </ownedEnd>`);
    }

    // ownedAttribute (características de la clase — NO extremos de asociación)
    for (const attr of cls.attributes) {
      const attrId = attr.id;
      const isStatic = attr.isStatic ? 'true' : 'false';
      const isDerived = attr.isDerived ? 'true' : 'false';
      let cleanAttrName = (attr.name || '').trim();
      let cleanAttrType = (attr.type || '').trim();
      if (cleanAttrName.includes(':')) {
        const colonParts = cleanAttrName.split(':').map((p) => p.trim()).filter(Boolean);
        if (colonParts.length > 0) {
          cleanAttrName = colonParts[0]!;
          const embeddedType = colonParts[colonParts.length - 1];
          if (embeddedType && (!cleanAttrType || cleanAttrType.toLowerCase() === 'string' || cleanAttrType === '')) {
            cleanAttrType = embeddedType;
          }
        }
      }
      cleanAttrName = cleanAttrName.replace(/^[-+#~]\s*/, '').trim();

      lines.push(`      <ownedAttribute xmi:type="uml:Property" xmi:id="${attrId}" name="${esc(cleanAttrName)}"${visAttr(attr.visibility)} isStatic="${isStatic}" isReadOnly="false" isDerived="${isDerived}" isOrdered="false" isUnique="true" isDerivedUnion="false">`);
      if (attr.multiplicity) {
        lines.push(`        ${multiplicityXml(attr.multiplicity)}`);
      } else {
        lines.push(`        <lowerValue xmi:type="uml:LiteralInteger" xmi:id="${randomUUID()}" value="1"/>`);
        lines.push(`        <upperValue xmi:type="uml:LiteralInteger" xmi:id="${randomUUID()}" value="1"/>`);
      }
      const resolved = resolveDataType(cleanAttrType || attr.type, diagram.classes, true);
      if (resolved) {
        if (!resolved.isClass) primitiveTypesMap.set(resolved.id, resolved);
        lines.push(`        <type xmi:idref="${esc(resolved.id)}"/>`);
      }
      lines.push(`      </ownedAttribute>`);
    }

    // ownedOperation (métodos)
    for (const method of cls.methods) {
      const methodId = method.id;
      lines.push(`      <ownedOperation xmi:type="uml:Operation" xmi:id="${methodId}" name="${esc(method.name)}"${visAttr(method.visibility)}${boolAttr('isStatic', method.isStatic)}>`);

      // Parámetros de entrada
      for (const param of method.parameters) {
        const resolvedParam = resolveDataType(param.type, diagram.classes, true);
        if (resolvedParam && !resolvedParam.isClass) primitiveTypesMap.set(resolvedParam.id, resolvedParam);
        const typeAttr = resolvedParam ? ` type="${esc(resolvedParam.name)}"` : '';
        lines.push(`        <ownedParameter xmi:type="uml:Parameter" xmi:id="${randomUUID()}" name="${esc(param.name)}" direction="in"${typeAttr}/>`);
      }

      // Parámetro de retorno (direction="return")
      const resolvedRet = resolveDataType(method.returnType, diagram.classes, false);
      if (resolvedRet) {
        if (!resolvedRet.isClass) primitiveTypesMap.set(resolvedRet.id, resolvedRet);
        lines.push(`        <ownedParameter xmi:type="uml:Parameter" xmi:id="${randomUUID()}" name="return" direction="return" type="${esc(resolvedRet.name)}"/>`);
      }

      lines.push(`      </ownedOperation>`);
    }

    // Generalización como hijo de la subclase
    const subGens = diagram.generalizations.filter(g => g.subClassId === cls.id);
    for (const gen of subGens) {
      lines.push(`      <generalization xmi:type="uml:Generalization" xmi:id="${gen.id}" general="${gen.superClassId}"${gen.name ? ` name="${esc(gen.name)}"` : ''}/>`);
    }

    lines.push(`    </packagedElement>`);
  }

  // ── Asociaciones (binarias) ───────────────────────────────────────────────
  for (const assoc of diagram.associations) {
    if (assocWithAssocClassIds.has(assoc.id)) {
      continue;
    }
    const sourceIsWhole = assoc.aggregationEnd === 'source';

    lines.push(`    <packagedElement xmi:type="uml:Association" xmi:id="${assoc.id}" name="${assoc.name ? esc(assoc.name) : ''}">`);
    lines.push(`      <memberEnd xmi:idref="${assoc.id}_dst"/>`);
    lines.push(`      <memberEnd xmi:idref="${assoc.id}_src"/>`);

    // Extremo origen (ownedEnd)
    const srcAgg = (assoc.aggregation !== 'none' && sourceIsWhole) ? ` aggregation="${esc(assoc.aggregation)}"` : '';
    lines.push(`      <ownedEnd xmi:type="uml:Property" xmi:id="${assoc.id}_src"${srcAgg}${assoc.sourceRole ? ` name="${esc(assoc.sourceRole)}"` : ''} isStatic="false" isReadOnly="false" isDerived="false" isOrdered="false" isUnique="true" isDerivedUnion="false">`);
    lines.push(`        <type xmi:idref="${assoc.sourceClassId}"/>`);
    if (assoc.sourceMultiplicity) {
      lines.push(`        ${multiplicityXml(assoc.sourceMultiplicity)}`);
    }
    lines.push(`      </ownedEnd>`);

    // Extremo destino (ownedEnd)
    const tgtAgg = (assoc.aggregation !== 'none' && !sourceIsWhole) ? ` aggregation="${esc(assoc.aggregation)}"` : '';
    lines.push(`      <ownedEnd xmi:type="uml:Property" xmi:id="${assoc.id}_dst"${tgtAgg}${assoc.targetRole ? ` name="${esc(assoc.targetRole)}"` : ''} isStatic="false" isReadOnly="false" isDerived="false" isOrdered="false" isUnique="true" isDerivedUnion="false">`);
    lines.push(`        <type xmi:idref="${assoc.targetClassId}"/>`);
    if (assoc.targetMultiplicity) {
      lines.push(`        ${multiplicityXml(assoc.targetMultiplicity)}`);
    }
    lines.push(`      </ownedEnd>`);

    lines.push(`    </packagedElement>`);
  }

  // ── Realizaciones ────────────────────────────────────────────────────────
  for (const real of diagram.realizations) {
    lines.push(`    <packagedElement xmi:type="uml:Realization" xmi:id="${real.id}" client="${real.clientClassId}" supplier="${real.supplierInterfaceId}"${real.name ? ` name="${esc(real.name)}"` : ''}/>`);
  }

  // ── Dependencias ─────────────────────────────────────────────────────────
  for (const dep of diagram.dependencies) {
    lines.push(`    <packagedElement xmi:type="uml:Dependency" xmi:id="${dep.id}" client="${dep.clientClassId}" supplier="${dep.supplierClassId}"${dep.name ? ` name="${esc(dep.name)}"` : ''}/>`);
  }

  // ── Asociaciones N-arias ──────────────────────────────────────────────────
  for (const nary of diagram.naryAssociations) {
    lines.push(`    <packagedElement xmi:type="uml:Association" xmi:id="${nary.id}" name="${nary.name ? esc(nary.name) : ''}">`);
    for (let i = 0; i < nary.memberEnds.length; i++) {
      const endId = `${nary.id}_end${i}`;
      lines.push(`      <memberEnd xmi:idref="${endId}"/>`);
    }
    for (let i = 0; i < nary.memberEnds.length; i++) {
      const end = nary.memberEnds[i];
      const endId = `${nary.id}_end${i}`;
      lines.push(`      <ownedEnd xmi:type="uml:Property" xmi:id="${endId}"${end.role ? ` name="${esc(end.role)}"` : ''} isStatic="false" isReadOnly="false" isDerived="false" isOrdered="false" isUnique="true" isDerivedUnion="false">`);
      lines.push(`        <type xmi:idref="${end.classId}"/>`);
      if (end.multiplicity) {
        lines.push(`        ${multiplicityXml(end.multiplicity)}`);
      }
      lines.push(`      </ownedEnd>`);
    }
    lines.push(`    </packagedElement>`);
  }

  lines.push(`    </packagedElement>`);
  lines.push(`  </uml:Model>`);

  // Extensión nativa de Enterprise Architect (elementos, conectores, diagramas, tipos)
  buildEaExtensionXml(diagram, packageId, diagramId, assocClassToAssocMap, primitiveTypesMap, lines);

  // ── Extensión de diseño (posiciones en el lienzo) ──
  lines.push(`  <xmi:Extension extender="UMLDesignTool">`);
  lines.push(`    <layout diagramId="${diagram.id}">`);
  for (const cls of diagram.classes) {
    lines.push(`      <element xmiIdref="${cls.id}" x="${Math.round(cls.position.x)}" y="${Math.round(cls.position.y)}"/>`);
  }
  const classPosMap = new Map(diagram.classes.map(c => [c.id, c.position]));
  for (const nary of diagram.naryAssociations) {
    const memberPositions = nary.memberEnds.map(e => classPosMap.get(e.classId)).filter((p): p is { x: number; y: number } => Boolean(p));
    const cx = memberPositions.length > 0 ? memberPositions.reduce((s, p) => s + p.x, 0) / memberPositions.length : 200;
    const cy = memberPositions.length > 0 ? memberPositions.reduce((s, p) => s + p.y, 0) / memberPositions.length : 200;
    lines.push(`      <element xmiIdref="${nary.id}" x="${Math.round(cx)}" y="${Math.round(cy)}"/>`);
  }
  lines.push(`    </layout>`);
  lines.push(`  </xmi:Extension>`);

  lines.push(`</xmi:XMI>`);

  return lines.join('\n');
}
