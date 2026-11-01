# Diseño: Paridad Total de Operaciones Core en la Capa de IA

## Contexto y Decisiones Arquitectónicas

### 1. Extensión de Tipos Semánticos (`SemanticDomainModel`)
El esquema de entrada y salida entre el LLM y la herramienta debe ser una representación declarativa limpia que utilice nombres de dominio en lenguaje natural en lugar de UUIDs internos (los UUIDs son generados y mapeados deterministamente por el adaptador).

```typescript
export interface SemanticRenames {
  classes?: Array<{ from: string; to: string }>;
  attributes?: Array<{ class: string; from: string; to: string }>;
  methods?: Array<{ class: string; from: string; to: string }>;
}

export interface SemanticClassUpdate {
  name: string;
  classKind?: 'class' | 'interface';
  isAbstract?: boolean;
}

export interface SemanticAttributeUpdate {
  class: string;
  name: string;
  newName?: string;
  type?: string;
  visibility?: '+' | '-' | '#' | '~';
  isStatic?: boolean;
  isDerived?: boolean;
  multiplicity?: string;
}

export interface SemanticMethodUpdate {
  class: string;
  name: string;
  newName?: string;
  returnType?: string;
  parameters?: Array<{ name: string; type: string }>;
  visibility?: '+' | '-' | '#' | '~';
  isStatic?: boolean;
}

export interface SemanticAssociationUpdate {
  source: string;
  target: string;
  name?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  aggregation?: 'none' | 'shared' | 'composite';
  aggregationEnd?: 'source' | 'target';
  sourceRole?: string;
  targetRole?: string;
  associationClass?: string;
}

export interface SemanticReposition {
  class: string;
  x: number;
  y: number;
}

export interface SemanticUpdates {
  classes?: SemanticClassUpdate[];
  attributes?: SemanticAttributeUpdate[];
  methods?: SemanticMethodUpdate[];
  associations?: SemanticAssociationUpdate[];
  generalizations?: Array<{ subclass: string; superclass: string; name?: string }>;
  realizations?: Array<{ clientClass: string; supplierInterface: string; name?: string }>;
  dependencies?: Array<{ client: string; supplier: string; name?: string }>;
  naryAssociations?: Array<{ name: string; members?: Array<{ class: string; multiplicity?: string; role?: string }> }>;
  positions?: SemanticReposition[];
}

export interface SemanticDeletions {
  classes?: string[];
  attributes?: Array<{ class: string; attribute: string }>;
  methods?: Array<{ class: string; method: string }>;
  associations?: Array<{ source: string; target: string }>;
  generalizations?: Array<{ subclass: string; superclass: string }>;
  realizations?: Array<{ clientClass: string; supplierInterface: string }>;
  dependencies?: Array<{ client: string; supplier: string }>;
  naryAssociations?: string[];
}
```

### 2. Conversión Determinista a Deltas (`convertDomainModelToDeltas`)
El proceso en `convertDomainModelToDeltas` sigue las siguientes etapas garantizando orden de causalidad:
1. **Renombrados y Actualizaciones de Clases**:
   - Para cada entrada en `renames.classes`, busca la clase por nombre en `existingClassesByName`. Si existe, emite un `ClassDelta` con `op: 'rename'` y `newName: to`. Actualiza la tabla de símbolos en memoria para que los pasos subsiguientes utilicen el nuevo nombre.
   - Para cada entrada en `updates.classes`, emite un `ClassDelta` con `op: 'update'`.
   - Para cada entrada en `updates.positions`, emite un `ClassDelta` con `op: 'reposition'`.
2. **Creación de Nuevas Clases**:
   - Asigna UUIDs y posiciones de diseño sin solapamiento para clases nuevas.
3. **Miembros (Atributos y Métodos)**:
   - Para `updates.attributes` y `updates.methods`, busca el `memberId` correspondiente en la clase y emite `MemberDelta` con `op: 'editAttribute'` o `'editMethod'`.
4. **Relaciones (Asociaciones, Herencias, Realizaciones, Dependencias, N-arias)**:
   - Para `updates.associations`, busca la asociación existente entre `source` y `target` y emite `AssociationDelta` con `op: 'updateMultiplicity'`.
5. **Eliminaciones**:
   - Ejecuta eliminaciones en orden: atributos, métodos, relaciones y finalmente clases (`op: 'delete'`).

### 3. Prompting y Formato de Salida en Amongus Chat
En `apps/api/src/chat.ts`, se expone la estructura en los prompts de sistema, permitiendo que ante pedidos compuestos como:
*"creá una clase Factura con numero, total y fecha; renombrá la clase Estudiante a Alumno; y borrá la clase Usuario"*
El LLM devuelva:
```json
{
  "classes": [
    { "name": "Factura", "attributes": [{ "name": "numero", "type": "string" }, { "name": "total", "type": "float" }, { "name": "fecha", "type": "date" }] }
  ],
  "renames": {
    "classes": [{ "from": "Estudiante", "to": "Alumno" }]
  },
  "deletions": {
    "classes": ["Usuario"]
  }
}
```
Esto elimina por completo las creaciones accidentales de `Alumno` y evita que se pierdan eliminaciones.

### 4. Corrección de Detección de Intenciones en Salas Multiusuario
En `apps/api/src/index.ts`, se reemplaza el patrón de límites `\b` incompatible con caracteres latinos tildados por:
```typescript
const hasModelingIntent =
  /(?:^|[\s,;.:¡!¿?])(?:cre[aá]|agreg[aá]|a[ñn]ad[eé]|dise[ñn][aá]|model[aá]|constru[yí]|arm[aá]|borr[aá]|elimin[aá]|quit[aá]|renombr[aá]|modific[aá]|cambi[aá]|conect[aá]|vincul[aá]|relacion[aá]|add|create|make|build|delete|remove|connect|rename|update)\b/iu.test(
    parsed.data.content
  );
```
Esto garantiza que `creá`, `borrá`, `renombrá`, etc. siempre activen la participación de Amongus en salas colaborativas.
