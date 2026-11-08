import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { randomUUID } from 'crypto';
import type { XmiModel } from './types.js';
import { VERSION_PATTERN } from './types.js';
import { parseRealXmi21, disambiguateClassifierNames } from './parser-real.js';

export function parseXmiDocument(xml: string): XmiModel {
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (validation !== true) {
    throw new Error(`XMI parse error: ${(validation as { err: { msg: string } }).err.msg}`);
  }
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let parsed: any;
  try {
    parsed = parser.parse(xml);
  } catch (e) {
    throw new Error('XMI parse error: malformed XML');
  }

  const model: XmiModel = {
    classes: [],
    associations: [],
    generalizations: [],
    realizations: [],
    dependencies: [],
    naryAssociations: [],
  };

  // Detección de diseño: XMI 2.1 real envuelve todo en <xmi:XMI> o <XMI> y almacena el contenido
  // del modelo como <uml:Model>, <uml:Package> o <packagedElement>; el fixture manual estilo EA
  // utiliza <UML:Model> con hijos UML:Class directos. Se soportan AMBOS.
  const xmiRoot = parsed?.['xmi:XMI'] || parsed?.['XMI'];
  const legacyRoot = xmiRoot ? undefined : (parsed?.['UML:Model'] || parsed?.Model || parsed);
  if (!xmiRoot && !legacyRoot) throw new Error('XMI parse error: no UML:Model root');

  const versionSource = xmiRoot ?? legacyRoot;
  const version = versionSource['@_xmi:version'] || versionSource['@_version'] || '2.1';
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Unsupported XMI version: ${version || 'unknown'}; supported: 2.1`);
  }

  if (xmiRoot) {
    parseRealXmi21(xmiRoot, model);
    return model;
  }

  const root = legacyRoot;
  const elements = root['UML:Class'] || [];
  const assocs = root['UML:Association'] || [];
  const gens = root['UML:Generalization'] || [];
  const reals = root['UML:Realization'] || [];
  const deps = root['UML:Dependency'] || [];

  // Clases
  (Array.isArray(elements) ? elements : [elements]).forEach((el: any) => {
    const name = el['@_name'] || 'Unnamed';
    const id = el['@_id'] || randomUUID();
    const kind = el['@_kind'] === 'interface' ? 'interface' : 'class';
    const isAbstract = el['@_isAbstract'] === 'true';
    const classAttrs: any[] = [];
    const classMethods: any[] = [];

    (Array.isArray(el['UML:Attribute']) ? el['UML:Attribute'] : el['UML:Attribute'] ? [el['UML:Attribute']] : []).forEach((a: any) => {
      const visibility = a['@_visibility'] || '+';
      const isStatic = a['@_isStatic'] === 'true';
      const isDerived = a['@_isDerived'] === 'true';
      const mult = a['@_multiplicity'] || undefined;
      classAttrs.push({
        name: a['@_name'] || '',
        type: a['@_type'] || 'String',
        visibility,
        isStatic,
        isDerived,
        multiplicity: mult,
      });
    });

    (Array.isArray(el['UML:Operation']) ? el['UML:Operation'] : el['UML:Operation'] ? [el['UML:Operation']] : []).forEach((m: any) => {
      const visibility = m['@_visibility'] || '+';
      const isStatic = m['@_isStatic'] === 'true';
      const params = (Array.isArray(m['UML:Parameter']) ? m['UML:Parameter'] : m['UML:Parameter'] ? [m['UML:Parameter']] : []).map((p: any) => ({
        name: p['@_name'] || '',
        type: p['@_type'] || 'String',
      }));
      classMethods.push({
        name: m['@_name'] || '',
        returnType: m['@_type'] || 'void',
        visibility,
        isStatic,
        parameters: params,
      });
    });

    model.classes.push({ id, name, kind, isAbstract, attributes: classAttrs, methods: classMethods });
  });

  // Asociaciones
  (Array.isArray(assocs) ? assocs : [assocs]).forEach((a: any) => {
    const id = a['@_id'] || randomUUID();
    const name = a['@_name'] || undefined;
    const ends = a['UML:AssociationEnd'] || [];
    const endList = Array.isArray(ends) ? ends : [ends];
    if (endList.length < 2) return;
    const source = endList[0]['@_class'] || '';
    const target = endList[1]['@_class'] || '';
    const agg = endList[0]['@_aggregation'] || endList[1]['@_aggregation'] || 'none';
    const aggregation = agg === 'composite' ? 'composite' : agg === 'shared' ? 'shared' : 'none';
    const aggregationEnd = endList[0]['@_aggregation'] ? 'source' : 'target';
    const sourceMultiplicity = endList[0]['@_multiplicity'] || undefined;
    const targetMultiplicity = endList[1]['@_multiplicity'] || undefined;
    const sourceRole = endList[0]['@_role'] || undefined;
    const targetRole = endList[1]['@_role'] || undefined;
    model.associations.push({
      id,
      source,
      target,
      aggregation,
      aggregationEnd,
      name,
      sourceRole,
      targetRole,
      sourceMultiplicity,
      targetMultiplicity,
    });
  });

  // Generalizaciones
  (Array.isArray(gens) ? gens : [gens]).forEach((g: any) => {
    const id = g['@_id'] || randomUUID();
    const sub = g['@_child'] || '';
    const sup = g['@_parent'] || '';
    const name = g['@_name'] || undefined;
    if (sub && sup) model.generalizations.push({ id, subClassId: sub, superClassId: sup, ...(name ? { name } : {}) });
  });

  // Realizaciones
  (Array.isArray(reals) ? reals : [reals]).forEach((r: any) => {
    const id = r['@_id'] || randomUUID();
    const client = r['@_client'] || '';
    const supplier = r['@_supplier'] || '';
    const name = r['@_name'] || undefined;
    if (client && supplier) model.realizations.push({ id, clientId: client, supplierId: supplier, ...(name ? { name } : {}) });
  });

  // Dependencias
  (Array.isArray(deps) ? deps : [deps]).forEach((d: any) => {
    const id = d['@_id'] || randomUUID();
    const client = d['@_client'] || '';
    const supplier = d['@_supplier'] || '';
    const name = d['@_name'] || undefined;
    if (client && supplier) model.dependencies.push({ id, clientId: client, supplierId: supplier, ...(name ? { name } : {}) });
  });

  // N-arias (si están presentes)
  const naries = root['UML:NaryAssociation'] || [];
  (Array.isArray(naries) ? naries : [naries]).forEach((n: any) => {
    const id = n['@_id'] || randomUUID();
    const name = n['@_name'] || undefined;
    const ends = n['UML:AssociationEnd'] || [];
    const endList = Array.isArray(ends) ? ends : [ends];
    if (endList.length < 3) return;
    const memberEnds = endList.map((e: any) => ({
      classId: e['@_class'] || '',
      multiplicity: e['@_multiplicity'] || undefined,
      role: e['@_role'] || undefined,
    }));
    if (memberEnds.every(m => m.classId)) {
      model.naryAssociations.push({ id, memberEnds, name });
    }
  });

  // Misma política de nunca rechazar para el diseño manual
  disambiguateClassifierNames(model, model.classes.map(() => []));

  return model;
}
