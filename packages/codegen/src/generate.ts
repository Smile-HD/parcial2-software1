import type { Diagram } from '@app/core';

import {
  NameSanitizerError,
  assertInsideOutputRoot,
  isReservedJavaName,
  normalizeJavaIdentifier,
  sanitizeJavaName,
} from './sanitize.js';

import type {
  ClassInfo,
  CodegenWarning,
  EntityModel,
  GeneratedFile,
  GeneratedFileKind,
  GenerateOptions,
  GenerationResult,
  InterfaceModel,
  Renderer,
} from './types.js';

import { toSnakeCase } from './type-mapper.js';
import {
  mapFieldsForClass,
  mapInterfaceMethod,
  mapEntityMethod,
} from './generators/members.js';
import {
  attachRelationship,
  applyGeneralizations,
  applyRealizations,
  buildNaryJoinEntities,
  isAccessorAlreadyGenerated,
} from './generators/relationships.js';
import { buildPostmanCollection, toRoute } from './generators/postman.js';

// Re-exportar tipos para mantener 100% de retrocompatibilidad
export type {
  GeneratedFileKind,
  GeneratedFile,
  CodegenWarning,
  Renderer,
  GenerateOptions,
  GenerationResult,
  EntityFieldModel,
  RelationshipKind,
  EntityRelationshipModel,
  EntityModel,
  EntityMethodModel,
  InterfaceMethodModel,
  InterfaceModel,
} from './types.js';

export {
  TYPE_MAPPING,
  defaultReturnValue,
  mapAttributeType,
  type Cardinality,
  classifyMultiplicity,
  MULTIPLICITY_MAPPING,
} from './type-mapper.js';

const DEFAULT_PACKAGE = 'com.example.generated';

/** Marcador de posición determinista y sin plantillas para completar el mapa 14a. */
export const planStubRenderer: Renderer = (template, model) =>
  `// codegen plan stub (14a) — template: ${template}\n// model: ${JSON.stringify(model)}\n`;

/**
 * Genera el mapa en memoria IR→archivos para un diagrama.
 *
 * @throws {NameSanitizerError} si algún nombre de clase/atributo o segmento del
 *   paquete base no es un identificador Java seguro, o una ruta planificada escapa
 *   de la raíz de salida (amenaza de codegen fila 1).
 */
export function generate(diagram: Diagram, options: GenerateOptions): GenerationResult {
  const outputRoot = options.outputRoot;
  const render = options.render ?? planStubRenderer;
  const basePackage = options.basePackage ?? DEFAULT_PACKAGE;
  const warnings: CodegenWarning[] = [];

  // El paquete base debe ser una cadena de identificadores seguros.
  const packageSegments = basePackage.split('.');
  for (const segment of packageSegments) {
    sanitizeJavaName(segment);
  }
  const packagePath = packageSegments.join('/');

  // Resuelve cada clase a un nombre Java sanitizado y normalizado (rechaza traversal/reservadas).
  const classInfo = new Map<string, ClassInfo>();
  const usedClassNames = new Set<string>();
  for (const cls of diagram.classes) {
    if (isReservedJavaName(cls.name.trim().toLowerCase())) {
      throw new NameSanitizerError(`Invalid Java name ${JSON.stringify(cls.name)}: reserved word`);
    }
    let javaName = normalizeJavaIdentifier(cls.name, 'pascal');
    if (javaName !== cls.name) {
      warnings.push({
        code: 'normalized-identifier',
        message: `Class name "${cls.name}" was normalized to "${javaName}"`,
        element: cls.name,
      });
    }
    if (usedClassNames.has(javaName)) {
      let suffix = 2;
      while (usedClassNames.has(`${javaName}${suffix}`)) {
        suffix++;
      }
      const originalJavaName = javaName;
      javaName = `${javaName}${suffix}`;
      warnings.push({
        code: 'duplicate-identifier-disambiguated',
        message: `Class name "${cls.name}" normalized to existing Java name "${originalJavaName}", disambiguated to "${javaName}"`,
        element: cls.name,
      });
    }
    usedClassNames.add(javaName);

    classInfo.set(cls.id, {
      javaName,
      isEntity: cls.kind === 'class',
      isInterface: cls.kind === 'interface',
      isAbstract: cls.isAbstract,
    });
  }

  // Construye un modelo de entidad por clase UML y de interfaz por clasificador de interfaz.
  const entities = new Map<string, EntityModel>();
  const interfaces = new Map<string, InterfaceModel>();
  for (const cls of diagram.classes) {
    const info = classInfo.get(cls.id);
    if (!info) continue;
    if (cls.kind === 'interface') {
      interfaces.set(info.javaName, {
        className: info.javaName,
        packageName: basePackage,
        methods: cls.methods.map((m) => mapInterfaceMethod(cls, m, warnings)),
      });
      for (const a of cls.attributes) {
        warnings.push({
          code: 'interface-attribute-skipped',
          message: `Attribute "${a.name}" on interface ${cls.name} has no Java-interface mapping (interfaces carry no state); skipped`,
          element: `${cls.name}.${a.name}`,
        });
      }
      continue;
    }
    entities.set(info.javaName, {
      className: info.javaName,
      packageName: basePackage,
      fields: mapFieldsForClass(cls, warnings),
      relationships: [],
      isAbstract: cls.isAbstract,
      extendsClass: null,
      inheritanceRoot: false,
      implementsInterfaces: [],
      methods: [],
    });
  }

  // Adjunta relaciones a partir de asociaciones
  for (const assoc of diagram.associations) {
    attachRelationship(assoc, classInfo, entities, warnings);
  }

  // Mapea métodos explícitos de la clase UML en la entidad, omitiendo getters/setters ya generados
  for (const cls of diagram.classes) {
    if (cls.kind === 'interface') continue;
    const info = classInfo.get(cls.id);
    if (!info) continue;
    const entity = entities.get(info.javaName);
    if (!entity) continue;
    for (const m of cls.methods) {
      const mapped = mapEntityMethod(cls, m, warnings, false);
      if (isAccessorAlreadyGenerated(entity, mapped.name, mapped.parameters)) {
        continue;
      }
      entity.methods.push(mapped);
    }
  }

  // Aplica semántica de generalizaciones (herencia single-table)
  applyGeneralizations(diagram, classInfo, entities, warnings);

  // Aplica semántica de realizaciones (implements)
  applyRealizations(diagram, classInfo, entities, warnings);

  // Construye entidades join para asociaciones N-arias
  buildNaryJoinEntities(diagram, classInfo, entities, warnings, basePackage);

  // Supresión defensiva de columnas FK duplicadas
  for (const entity of entities.values()) {
    const fkColumns = new Set<string>();
    const relIdentifiers = new Set<string>();
    for (const rel of entity.relationships) {
      if (rel.thisSideIsOwning && rel.kind === 'ManyToOne') {
        const colName = toSnakeCase(rel.targetEntity).toLowerCase() + '_id';
        fkColumns.add(colName);
        relIdentifiers.add(rel.targetEntity.toLowerCase());
        relIdentifiers.add(colName);
      }
    }

    if (fkColumns.size > 0) {
      entity.fields = entity.fields.filter((field) => {
        const col = toSnakeCase(field.name).toLowerCase();
        const fieldNameLower = field.name.toLowerCase();
        if (fkColumns.has(col) || relIdentifiers.has(fieldNameLower) || relIdentifiers.has(col)) {
          warnings.push({
            code: 'duplicate-fk-column-suppressed',
            message: `Attribute "${field.name}" on ${entity.className} maps to physical column or relationship already managed by "${col}"; basic field suppressed to avoid Java compilation collision and Hibernate DuplicateMappingException`,
            element: `${entity.className}.${field.name}`,
          });
          return false;
        }
        return true;
      });
    }
  }

  // Ensambla el mapa de archivos
  const files: GeneratedFile[] = [];
  const push = (path: string, kind: GeneratedFileKind, template: string, model: unknown): void => {
    assertInsideOutputRoot(outputRoot, path);
    files.push({ path, kind, template, model, content: render(template, model) });
  };

  for (const iface of interfaces.values()) {
    push(`src/main/java/${packagePath}/${iface.className}.java`, 'source', 'interface', iface);
  }

  for (const entity of entities.values()) {
    const name = entity.className;
    push(`src/main/java/${packagePath}/${name}.java`, 'source', 'entity', entity);
    if (entity.isAbstract) {
      warnings.push({
        code: 'abstract-class-no-crud',
        message: `Abstract class ${name}: repository/controller/service intentionally not generated (abstract types cannot back a REST CRUD surface); the entity is emitted for inheritance`,
        element: name,
      });
      continue;
    }
    push(
      `src/main/java/${packagePath}/repository/${name}Repository.java`,
      'source',
      'repository',
      { className: name, packageName: basePackage },
    );
    push(
      `src/main/java/${packagePath}/service/${name}Service.java`,
      'source',
      'service',
      { className: name, packageName: basePackage },
    );
    push(
      `src/main/java/${packagePath}/web/${name}Controller.java`,
      'source',
      'controller',
      { className: name, packageName: basePackage },
    );
  }

  push('pom.xml', 'build', 'pom', { basePackage, entities: [...entities.keys()] });
  push('src/main/resources/application.properties', 'resource', 'application-properties', {
    basePackage,
    assistantModel: 'qwen2.5:1.5b',
    assistantOllamaUrl: 'http://127.0.0.1:11434',
  });
  push('src/main/resources/application-prod.properties', 'resource', 'application-prod-properties', {
    basePackage,
  });

  push(`src/main/java/${packagePath}/Application.java`, 'source', 'application', {
    basePackage,
  });
  push('mvnw', 'build', 'maven-wrapper', { asset: 'mvnw' });
  push('mvnw.cmd', 'build', 'maven-wrapper', { asset: 'mvnw.cmd' });
  push('.mvn/wrapper/maven-wrapper.properties', 'build', 'maven-wrapper', {
    asset: 'maven-wrapper.properties',
  });

  push('Dockerfile', 'build', 'dockerfile', {});
  push('docker-compose.yml', 'build', 'docker-compose', {});
  push('README.md', 'resource', 'readme', { basePackage });

  // Asistente offline
  const assistantEntities = [...entities.entries()]
    .filter(([_, e]) => !e.isAbstract)
    .map(([name]) => name);

  const collectAllFields = (entityName: string): Array<{ name: string; javaType: string }> => {
    const visited = new Set<string>();
    const allFields: Array<{ name: string; javaType: string }> = [];
    const fieldNames = new Set<string>();

    let currentName: string | null = entityName;
    while (currentName && !visited.has(currentName)) {
      visited.add(currentName);
      const currentEntity = entities.get(currentName);
      if (!currentEntity) break;

      for (const field of currentEntity.fields) {
        if (!fieldNames.has(field.name)) {
          fieldNames.add(field.name);
          allFields.push({ name: field.name, javaType: field.javaType });
        }
      }
      currentName = currentEntity.extendsClass;
    }
    return allFields;
  };

  const entitySchemas = [...entities.entries()]
    .filter(([_, e]) => !e.isAbstract)
    .map(([name]) => ({
      name,
      fields: collectAllFields(name),
    }));
  const assistantModel = {
    packageName: basePackage,
    entities: assistantEntities,
    entitySchemas,
    assistantModel: 'qwen2.5:1.5b',
    assistantOllamaUrl: 'http://127.0.0.1:11434',
  };
  push(`src/main/java/${packagePath}/assistant/AssistantEngine.java`, 'source', 'assistant-engine', assistantModel);
  push(`src/main/java/${packagePath}/assistant/IntentMatcher.java`, 'source', 'intent-matcher', assistantModel);
  push(`src/main/java/${packagePath}/assistant/OllamaEngine.java`, 'source', 'ollama-engine', assistantModel);
  push(`src/main/java/${packagePath}/assistant/AuditLog.java`, 'source', 'audit-log', assistantModel);
  push(`src/main/java/${packagePath}/assistant/OllamaProvisioner.java`, 'source', 'ollama-provisioner', assistantModel);
  push(`src/main/java/${packagePath}/web/AssistantController.java`, 'source', 'assistant-controller', assistantModel);

  push(`src/main/java/${packagePath}/assistant/VoiceCommand.java`, 'source', 'voice-command', assistantModel);
  push(`src/main/java/${packagePath}/assistant/VoiceCommandRepository.java`, 'source', 'voice-command-repository', assistantModel);
  push(`src/main/java/${packagePath}/web/SyncController.java`, 'source', 'sync-controller', assistantModel);

  // Pruebas de endpoints: Postman Collection v2.1
  const postmanEntities = [...entities.entries()]
    .filter(([_, e]) => !e.isAbstract)
    .map(([name]) => ({
      name,
      route: toRoute(name),
      fields: collectAllFields(name),
    }));
  const postmanCollection = buildPostmanCollection({
    appName: 'Generated Spring Boot API',
    entities: postmanEntities,
  });
  push('postman_collection.json', 'resource', 'postman-collection', {
    collection: postmanCollection,
  });

  return { files, warnings };
}
