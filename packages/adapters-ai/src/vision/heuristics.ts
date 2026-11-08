export function collapseTernaryHubs(
  normalizedClassDeltas: Record<string, unknown>[],
  memberDeltas: Record<string, unknown>[],
  associationDeltas: Record<string, unknown>[],
  naryAssociationDeltas: Record<string, unknown>[],
  diagramId: string,
  timestamp: string,
  cleanMultiplicity: (val: unknown) => string | undefined,
): void {
  const classesWithMembers = new Set(memberDeltas.map((m) => m.classId as string));
  const candidateHubIndices: number[] = [];

  for (let i = 0; i < normalizedClassDeltas.length; i++) {
    const clsDelta = normalizedClassDeltas[i];
    const cid = clsDelta.classId as string;
    const name = String(clsDelta.name ?? '').toLowerCase();
    const hasMembers = classesWithMembers.has(cid);
    if (hasMembers) continue;

    const isExplicitDiamond =
      name.includes('diamond') ||
      name.includes('rombo') ||
      name.includes('ternari') ||
      name.includes('nary') ||
      name.startsWith('hub') ||
      name === '';

    if (!isExplicitDiamond) continue;

    const connectedAssocs = associationDeltas.filter(
      (a) => a.sourceClassId === cid || a.targetClassId === cid,
    );

    if (connectedAssocs.length >= 2) {
      candidateHubIndices.push(i);
    }
  }

  for (const hubIdx of candidateHubIndices.reverse()) {
    const hub = normalizedClassDeltas[hubIdx];
    const hubId = hub.classId as string;
    const hubAssocs = associationDeltas.filter(
      (a) => a.sourceClassId === hubId || a.targetClassId === hubId,
    );

    const seenClasses = new Set<string>();
    const memberEnds: { classId: string; multiplicity: string; role?: string }[] = [];

    for (const a of hubAssocs) {
      const isHubSource = a.sourceClassId === hubId;
      const targetCid = (isHubSource ? a.targetClassId : a.sourceClassId) as string;
      if (!targetCid || seenClasses.has(targetCid)) continue;
      seenClasses.add(targetCid);

      const mult = (isHubSource ? a.targetMultiplicity : a.sourceMultiplicity) as string | undefined;
      const role = (isHubSource ? a.targetRole : a.sourceRole) as string | undefined;
      const cleanMult = cleanMultiplicity(mult) ?? '1';

      memberEnds.push({
        classId: targetCid,
        multiplicity: cleanMult,
        ...(typeof role === 'string' && role.trim() ? { role: role.trim() } : {}),
      });
    }

    if (memberEnds.length >= 3) {
      normalizedClassDeltas.splice(hubIdx, 1);
      for (let j = associationDeltas.length - 1; j >= 0; j--) {
        if (associationDeltas[j].sourceClassId === hubId || associationDeltas[j].targetClassId === hubId) {
          associationDeltas.splice(j, 1);
        }
      }
      naryAssociationDeltas.push({
        kind: 'naryAssociation',
        op: 'create',
        id: crypto.randomUUID(),
        diagramId,
        timestamp,
        naryAssociationId: crypto.randomUUID(),
        name: String(hub.name ?? '').replace(/diamond/gi, '').trim() || undefined,
        memberEnds,
      });
    }
  }
}

export function linkAssociationClasses(
  normalizedClassDeltas: Record<string, unknown>[],
  associationDeltas: Record<string, unknown>[],
  dependencyDeltas: Record<string, unknown>[],
  generalizationDeltas: Record<string, unknown>[],
  realizationDeltas: Record<string, unknown>[],
  naryAssociationDeltas: Record<string, unknown>[],
): void {
  // Caso 1: Dependencias hacia extremos de asociación
  for (let i = dependencyDeltas.length - 1; i >= 0; i--) {
    const dep = dependencyDeltas[i];
    const client = dep.clientClassId as string;
    const supplier = dep.supplierClassId as string;
    for (const assoc of associationDeltas) {
      if (assoc.associationClassId) continue;
      const src = assoc.sourceClassId as string;
      const tgt = assoc.targetClassId as string;
      if (client !== src && client !== tgt && (supplier === src || supplier === tgt)) {
        assoc.associationClassId = client;
        dependencyDeltas.splice(i, 1);
        break;
      } else if (supplier !== src && supplier !== tgt && (client === src || client === tgt)) {
        assoc.associationClassId = supplier;
        dependencyDeltas.splice(i, 1);
        break;
      }
    }
  }

  // Caso 2: Clases huérfanas con nombres sugestivos
  const connectedClasses = new Set<string>();
  for (const a of associationDeltas) {
    if (a.sourceClassId) connectedClasses.add(a.sourceClassId as string);
    if (a.targetClassId) connectedClasses.add(a.targetClassId as string);
    if (a.associationClassId) connectedClasses.add(a.associationClassId as string);
  }
  for (const g of generalizationDeltas) {
    if (g.subClassId) connectedClasses.add(g.subClassId as string);
    if (g.superClassId) connectedClasses.add(g.superClassId as string);
  }
  for (const r of realizationDeltas) {
    if (r.clientClassId) connectedClasses.add(r.clientClassId as string);
    if (r.supplierInterfaceId) connectedClasses.add(r.supplierInterfaceId as string);
  }
  for (const n of naryAssociationDeltas) {
    for (const end of (n.memberEnds as { classId: string }[] || [])) {
      connectedClasses.add(end.classId);
    }
  }

  const assocClassRegex = /^(?:detalle|item|linea|inscrip|matricul|asignaci|asociaci)/i;
  for (const cls of normalizedClassDeltas) {
    const cid = cls.classId as string;
    if (connectedClasses.has(cid)) continue;
    const name = String(cls.name ?? '').trim();
    if (assocClassRegex.test(name)) {
      const targetAssoc = associationDeltas.find((a) => !a.associationClassId);
      if (targetAssoc) {
        targetAssoc.associationClassId = cid;
        connectedClasses.add(cid);
      }
    }
  }
}
