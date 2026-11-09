import { randomUUID } from 'crypto';
import type { Diagram } from '@app/core';
import {
  esc,
  eaScope,
  toDuid,
  type ResolvedTypeInfo,
  resolveDataType,
} from './exporter-types.js';

export function buildEaExtensionXml(
  diagram: Diagram,
  packageId: string,
  diagramId: string,
  assocClassToAssocMap: Map<string, Diagram['associations'][number]>,
  primitiveTypesMap: Map<string, ResolvedTypeInfo>,
  lines: string[]
): void {
  // ── Extensión nativa de Enterprise Architect ──
  lines.push(`  <xmi:Extension extender="Enterprise Architect" extenderID="6.5">`);
  lines.push(`    <elements>`);
  lines.push(`      <element xmi:idref="${packageId}" xmi:type="uml:Package" name="${esc(diagram.name)}" scope="public">`);
  lines.push(`        <model package2="${diagramId}" tpos="0" ea_localid="1" ea_eleType="package"/>`);
  lines.push(`        <properties isSpecification="false" sType="Package" nType="0" scope="public"/>`);
  lines.push(`        <project author="UMLDesignTool" version="1.0"/>`);
  lines.push(`      </element>`);
  for (let i = 0; i < diagram.classes.length; i++) {
    const cls = diagram.classes[i];
    const isAssocClass = assocClassToAssocMap.has(cls.id);
    const assoc = isAssocClass ? assocClassToAssocMap.get(cls.id) : undefined;
    const nType = isAssocClass ? '17' : '0';
    const sType = cls.kind === 'interface' ? 'Interface' : 'Class';
    const xmiType = cls.kind === 'interface' ? 'uml:Interface' : 'uml:Class';
    lines.push(`      <element xmi:idref="${cls.id}" xmi:type="${xmiType}" name="${esc(cls.name)}" scope="public">`);
    lines.push(`        <model package="${packageId}" tpos="0" ea_localid="${i + 2}" ea_eleType="element"/>`);
    lines.push(`        <properties isSpecification="false" sType="${sType}" nType="${nType}" scope="public"/>`);
    lines.push(`        <project author="UMLDesignTool" version="1.0"/>`);
    if (isAssocClass && assoc) {
      lines.push(`        <extendedProperties tagged="0" package_name="${esc(diagram.name)}" conID="${assoc.id}"/>`);
      lines.push(`        <links>`);
      lines.push(`          <Association xmi:id="${assoc.id}" start="${assoc.sourceClassId}" end="${assoc.targetClassId}"/>`);
      lines.push(`        </links>`);
    }

    if (cls.attributes.length > 0) {
      lines.push(`        <attributes>`);
      for (const attr of cls.attributes) {
        const resolved = resolveDataType(attr.type, diagram.classes, true);
        const typeStr = resolved ? esc(resolved.name) : '';
        const scope = eaScope(attr.visibility);
        const staticFlag = attr.isStatic ? '1' : '0';
        lines.push(`          <attribute xmi:idref="${attr.id}" name="${esc(attr.name)}" scope="${scope}">`);
        lines.push(`            <properties type="${typeStr}" collection="false" static="${staticFlag}" duplicates="0" changeability="changeable"/>`);
        lines.push(`          </attribute>`);
      }
      lines.push(`        </attributes>`);
    }

    if (cls.methods.length > 0) {
      lines.push(`        <operations>`);
      for (const method of cls.methods) {
        const resolvedRet = resolveDataType(method.returnType, diagram.classes, false);
        const returnTypeStr = resolvedRet ? esc(resolvedRet.name) : '';
        const scope = eaScope(method.visibility);
        const staticStr = method.isStatic ? 'true' : 'false';
        const isAbstractStr = cls.kind === 'interface' || cls.isAbstract ? 'true' : 'false';
        lines.push(`          <operation xmi:idref="${method.id}" name="${esc(method.name)}" scope="${scope}">`);
        lines.push(`            <type type="${returnTypeStr}" static="${staticStr}" isAbstract="${isAbstractStr}"/>`);
        if (method.parameters.length > 0) {
          lines.push(`            <parameters>`);
          for (let pIdx = 0; pIdx < method.parameters.length; pIdx++) {
            const param = method.parameters[pIdx];
            const resolvedParam = resolveDataType(param.type, diagram.classes, true);
            const paramTypeStr = resolvedParam ? esc(resolvedParam.name) : '';
            lines.push(`              <parameter xmi:idref="${randomUUID()}" name="${esc(param.name)}" visibility="public">`);
            lines.push(`                <properties pos="${pIdx}" type="${paramTypeStr}"/>`);
            lines.push(`              </parameter>`);
          }
          lines.push(`            </parameters>`);
        }
        lines.push(`          </operation>`);
      }
      lines.push(`        </operations>`);
    }

    lines.push(`      </element>`);
  }
  for (let i = 0; i < diagram.naryAssociations.length; i++) {
    const nary = diagram.naryAssociations[i];
    lines.push(`      <element xmi:idref="${nary.id}" xmi:type="uml:Association" name="${esc(nary.name ?? 'NaryAssociation')}" scope="public">`);
    lines.push(`        <model package="${packageId}" tpos="0" ea_localid="${diagram.classes.length + i + 2}" ea_eleType="element"/>`);
    lines.push(`        <properties isSpecification="false" sType="Association" nType="0" scope="public"/>`);
    lines.push(`        <project author="UMLDesignTool" version="1.0"/>`);
    if (nary.memberEnds.length > 0) {
      lines.push(`        <links>`);
      for (let j = 0; j < nary.memberEnds.length; j++) {
        const end = nary.memberEnds[j];
        lines.push(`          <Association xmi:id="${nary.id}_end${j}" start="${nary.id}" end="${end.classId}"/>`);
      }
      lines.push(`        </links>`);
    }
    lines.push(`      </element>`);
  }
  lines.push(`    </elements>`);

  // Conectores con nombres, roles y etiquetas en estilo Enterprise Architect
  lines.push(`    <connectors>`);
  for (const assoc of diagram.associations) {
    const srcRole = assoc.sourceRole ? ` lt="${esc(assoc.sourceRole)}"` : '';
    const tgtRole = assoc.targetRole ? ` rt="${esc(assoc.targetRole)}"` : '';
    const srcMult = assoc.sourceMultiplicity ? ` lb="${esc(assoc.sourceMultiplicity)}"` : '';
    const tgtMult = assoc.targetMultiplicity ? ` rb="${esc(assoc.targetMultiplicity)}"` : '';
    const assocName = assoc.name ? ` mt="${esc(assoc.name)}"` : '';

    const sourceIsWhole = assoc.aggregationEnd === 'source';
    let eaType = 'Association';
    let subtypeAttr = assoc.associationClassId ? ' subtype="Class"' : '';
    let direction = 'Unspecified';
    let srcAgg = 'none';
    let tgtAgg = 'none';

    if (assoc.aggregation === 'composite') {
      eaType = 'Aggregation';
      subtypeAttr = ' subtype="Strong"';
      direction = sourceIsWhole ? 'Source -> Destination' : 'Destination -> Source';
      if (sourceIsWhole) {
        srcAgg = 'composite';
        tgtAgg = 'none';
      } else {
        srcAgg = 'none';
        tgtAgg = 'composite';
      }
    } else if (assoc.aggregation === 'shared') {
      eaType = 'Aggregation';
      direction = sourceIsWhole ? 'Source -> Destination' : 'Destination -> Source';
      if (sourceIsWhole) {
        srcAgg = 'shared';
        tgtAgg = 'none';
      } else {
        srcAgg = 'none';
        tgtAgg = 'shared';
      }
    }

    const assocClassExt = assoc.associationClassId
      ? `\n        <extendedProperties virtualInheritance="0" associationclass="${esc(assoc.associationClassId)}"/>`
      : '';

    lines.push(`      <connector xmi:idref="${assoc.id}">`);
    lines.push(`        <source xmi:idref="${assoc.sourceClassId}">`);
    if (assoc.sourceRole) lines.push(`          <role name="${esc(assoc.sourceRole)}"/>`);
    const srcMultAttr = assoc.sourceMultiplicity ? ` multiplicity="${esc(assoc.sourceMultiplicity)}"` : '';
    lines.push(`          <type${srcMultAttr} aggregation="${srcAgg}"/>`);
    lines.push(`        </source>`);
    lines.push(`        <target xmi:idref="${assoc.targetClassId}">`);
    if (assoc.targetRole) lines.push(`          <role name="${esc(assoc.targetRole)}"/>`);
    const tgtMultAttr = assoc.targetMultiplicity ? ` multiplicity="${esc(assoc.targetMultiplicity)}"` : '';
    lines.push(`          <type${tgtMultAttr} aggregation="${tgtAgg}"/>`);
    lines.push(`        </target>`);
    lines.push(`        <properties ea_type="${eaType}"${subtypeAttr} direction="${direction}"${assoc.name ? ` name="${esc(assoc.name)}"` : ''}/>`);
    lines.push(`        <labels${assocName}${srcRole}${tgtRole}${srcMult}${tgtMult}/>${assocClassExt}`);
    lines.push(`      </connector>`);
  }
  for (const gen of diagram.generalizations) {
    lines.push(`      <connector xmi:idref="${gen.id}">`);
    lines.push(`        <source xmi:idref="${gen.subClassId}"/>`);
    lines.push(`        <target xmi:idref="${gen.superClassId}"/>`);
    lines.push(`        <properties ea_type="Generalization"${gen.name ? ` name="${esc(gen.name)}"` : ''}/>`);
    lines.push(`        <labels${gen.name ? ` mt="${esc(gen.name)}"` : ''}/>`);
    lines.push(`      </connector>`);
  }
  for (const real of diagram.realizations) {
    lines.push(`      <connector xmi:idref="${real.id}">`);
    lines.push(`        <source xmi:idref="${real.clientClassId}"/>`);
    lines.push(`        <target xmi:idref="${real.supplierInterfaceId}"/>`);
    lines.push(`        <properties ea_type="Realization"${real.name ? ` name="${esc(real.name)}"` : ''}/>`);
    lines.push(`        <labels${real.name ? ` mt="${esc(real.name)}"` : ''}/>`);
    lines.push(`      </connector>`);
  }
  for (const dep of diagram.dependencies) {
    lines.push(`      <connector xmi:idref="${dep.id}">`);
    lines.push(`        <source xmi:idref="${dep.clientClassId}"/>`);
    lines.push(`        <target xmi:idref="${dep.supplierClassId}"/>`);
    lines.push(`        <properties ea_type="Dependency"${dep.name ? ` name="${esc(dep.name)}"` : ''}/>`);
    lines.push(`        <labels${dep.name ? ` mt="${esc(dep.name)}"` : ''}/>`);
    lines.push(`      </connector>`);
  }
  for (const nary of diagram.naryAssociations) {
    for (let j = 0; j < nary.memberEnds.length; j++) {
      const end = nary.memberEnds[j];
      const endId = `${nary.id}_end${j}`;
      const roleAttr = end.role ? ` name="${esc(end.role)}"` : '';
      const multAttr = end.multiplicity ? ` multiplicity="${esc(end.multiplicity)}"` : '';
      const roleLabel = end.role ? ` lt="${esc(end.role)}"` : '';
      const multLabel = end.multiplicity ? ` lb="${esc(end.multiplicity)}"` : '';
      lines.push(`      <connector xmi:idref="${endId}">`);
      lines.push(`        <source xmi:idref="${nary.id}">`);
      lines.push(`          <model type="Association"/>`);
      lines.push(`          <role visibility="Public" targetScope="instance"/>`);
      lines.push(`          <type aggregation="none" containment="Unspecified"/>`);
      lines.push(`          <modifiers isOrdered="false" changeable="none" isNavigable="false"/>`);
      lines.push(`          <style value="Union=0;Derived=0;AllowDuplicates=0;Owned=0;Navigable=Unspecified;"/>`);
      lines.push(`        </source>`);
      lines.push(`        <target xmi:idref="${end.classId}">`);
      lines.push(`          <model type="Class"/>`);
      lines.push(`          <role${roleAttr} visibility="Public" targetScope="instance"/>`);
      lines.push(`          <type${multAttr} aggregation="none" containment="Unspecified"/>`);
      lines.push(`          <modifiers isOrdered="false" changeable="none" isNavigable="false"/>`);
      lines.push(`          <style value="Union=0;Derived=0;AllowDuplicates=0;Owned=0;Navigable=Unspecified;"/>`);
      lines.push(`        </target>`);
      lines.push(`        <properties ea_type="Association" direction="Unspecified"/>`);
      lines.push(`        <labels${roleLabel}${multLabel}/>`);
      lines.push(`      </connector>`);
    }
  }
  lines.push(`    </connectors>`);

  if (primitiveTypesMap.size > 0) {
    lines.push(`    <primitivetypes>`);
    lines.push(`      <packagedElement xmi:type="uml:Package" xmi:id="EAPrimitiveTypesPackage" name="EA_PrimitiveTypes_Package" visibility="public">`);
    lines.push(`        <packagedElement xmi:type="uml:Package" xmi:id="EAJavaTypesPackage" name="EA_Java_Types_Package" visibility="public">`);
    for (const prim of primitiveTypesMap.values()) {
      lines.push(`          <packagedElement xmi:type="uml:PrimitiveType" xmi:id="${prim.id}" name="${esc(prim.name)}" visibility="public"/>`);
    }
    lines.push(`        </packagedElement>`);
    lines.push(`      </packagedElement>`);
    lines.push(`    </primitivetypes>`);
  }

  lines.push(`    <diagrams>`);
  lines.push(`      <diagram xmi:id="${diagramId}">`);
  lines.push(`        <model package="${packageId}" localID="1" owner="${packageId}"/>`);
  lines.push(`        <properties name="${esc(diagram.name)}" type="Logical"/>`);
  lines.push(`        <project author="UMLDesignTool" version="1.0"/>`);
  lines.push(`        <elements>`);
  for (let i = 0; i < diagram.classes.length; i++) {
    const cls = diagram.classes[i];
    const left = Math.round(cls.position.x);
    const top = Math.round(cls.position.y);
    const right = left + 140;
    const bottom = top + 90;
    const duid = toDuid(cls.id);
    lines.push(`          <element geometry="Left=${left};Top=${top};Right=${right};Bottom=${bottom};" subject="${cls.id}" seqno="${i + 1}" style="DUID=${duid};"/>`);
  }
  const classPosMap = new Map(diagram.classes.map(c => [c.id, c.position]));
  for (let i = 0; i < diagram.naryAssociations.length; i++) {
    const nary = diagram.naryAssociations[i];
    const memberPositions = nary.memberEnds.map(e => classPosMap.get(e.classId)).filter((p): p is { x: number; y: number } => Boolean(p));
    const cx = memberPositions.length > 0 ? memberPositions.reduce((s, p) => s + p.x, 0) / memberPositions.length : 200;
    const cy = memberPositions.length > 0 ? memberPositions.reduce((s, p) => s + p.y, 0) / memberPositions.length : 200;
    const left = Math.round(cx - 20);
    const top = Math.round(cy - 20);
    const right = left + 40;
    const bottom = top + 40;
    const duid = toDuid(nary.id);
    lines.push(`          <element geometry="Left=${left};Top=${top};Right=${right};Bottom=${bottom};" subject="${nary.id}" seqno="${diagram.classes.length + i + 1}" style="DUID=${duid};"/>`);
  }
  for (const assoc of diagram.associations) {
    const sDuid = toDuid(assoc.sourceClassId);
    const tDuid = toDuid(assoc.targetClassId);
    lines.push(`          <element geometry="EDGE=2;$LLB=;LLT=;LMT=;LMB=;LRT=;LRB=;IRHS=;ILHS=;Path=;" subject="${assoc.id}" style="Mode=3;EOID=${tDuid};SOID=${sDuid};Color=-1;LWidth=0;Hidden=0;"/>`);
  }
  for (const gen of diagram.generalizations) {
    const sDuid = toDuid(gen.subClassId);
    const tDuid = toDuid(gen.superClassId);
    lines.push(`          <element geometry="EDGE=2;$LLB=;LLT=;LMT=;LMB=;LRT=;LRB=;IRHS=;ILHS=;Path=;" subject="${gen.id}" style="Mode=3;EOID=${tDuid};SOID=${sDuid};Color=-1;LWidth=0;Hidden=0;"/>`);
  }
  for (const real of diagram.realizations) {
    const sDuid = toDuid(real.clientClassId);
    const tDuid = toDuid(real.supplierInterfaceId);
    lines.push(`          <element geometry="EDGE=2;$LLB=;LLT=;LMT=;LMB=;LRT=;LRB=;IRHS=;ILHS=;Path=;" subject="${real.id}" style="Mode=3;EOID=${tDuid};SOID=${sDuid};Color=-1;LWidth=0;Hidden=0;"/>`);
  }
  for (const dep of diagram.dependencies) {
    const sDuid = toDuid(dep.clientClassId);
    const tDuid = toDuid(dep.supplierClassId);
    lines.push(`          <element geometry="EDGE=2;$LLB=;LLT=;LMT=;LMB=;LRT=;LRB=;IRHS=;ILHS=;Path=;" subject="${dep.id}" style="Mode=3;EOID=${tDuid};SOID=${sDuid};Color=-1;LWidth=0;Hidden=0;"/>`);
  }
  for (const nary of diagram.naryAssociations) {
    const naryDuid = toDuid(nary.id);
    for (let j = 0; j < nary.memberEnds.length; j++) {
      const end = nary.memberEnds[j];
      const classDuid = toDuid(end.classId);
      const endId = `${nary.id}_end${j}`;
      lines.push(`          <element geometry="SX=0;SY=0;EX=0;EY=0;EDGE=2;$LLB=;LLT=;LMT=;LMB=;LRT=;LRB=;IRHS=;ILHS=;Path=;" subject="${endId}" style="Mode=3;EOID=${classDuid};SOID=${naryDuid};Color=-1;LWidth=0;Hidden=0;"/>`);
    }
  }
  lines.push(`        </elements>`);
  lines.push(`      </diagram>`);
  lines.push(`    </diagrams>`);
  lines.push(`  </xmi:Extension>`);
}
