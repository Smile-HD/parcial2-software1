/**
 * Tipos y modelos de datos para el generador de código Spring Boot.
 */

export type GeneratedFileKind = 'source' | 'resource' | 'build';

export interface GeneratedFile {
  /** Ruta POSIX relativa a la raíz de salida del trabajo, sanitizada y con verificación de contención. */
  path: string;
  kind: GeneratedFileKind;
  /** ID de plantilla que resuelve el renderizador (plantilla Handlebars en 14b). */
  template: string;
  /** Resultado del mapeo IR→JPA a partir del cual renderiza la plantilla. */
  model: unknown;
  /** Texto renderizado a través del renderizador inyectado. */
  content: string;
}

export interface CodegenWarning {
  /** Código máquina estable, p. ej. `unmapped-type`, `missing-endpoint`. */
  code: string;
  /** Mensaje legible por humanos indicando el elemento infractor. */
  message: string;
  /** El elemento al que se refiere la advertencia (p. ej. `Product.name` o un id). */
  element: string;
}

export type Renderer = (template: string, model: unknown) => string;

export interface GenerateOptions {
  /** Raíz absoluta de salida del trabajo utilizada para aserciones de contención. */
  outputRoot: string;
  /** Paquete base de Java para los fuentes generados (por defecto `com.example.generated`). */
  basePackage?: string;
  /** Seam del renderizador; por defecto planStubRenderer. 14b inyecta Handlebars. */
  render?: Renderer;
}

export interface GenerationResult {
  files: GeneratedFile[];
  warnings: CodegenWarning[];
}

export interface EntityFieldModel {
  /** Nombre de campo Java sanitizado. */
  name: string;
  /** Tipo Java mapeado, o `String` cuando el tipo UML no está mapeado. */
  javaType: string;
  /** Tipo UML original declarado (conservado para que 14b/plantillas puedan reportarlo). */
  declaredType: string;
  visibility: '+' | '-' | '#' | '~';
  isStatic: boolean;
  isDerived: boolean;
  /** Multiplicidad del atributo, o null cuando no está especificada. */
  multiplicity: string | null;
  /**
   * 14c: Modificador de campo Java a partir de la visibilidad UML:
   * `+`/`-` → `private`, `#` → `protected`, `~` → package-private (cadena vacía).
   */
  fieldModifier: 'private' | 'protected' | '';
  /**
   * 14c: true cuando la multiplicidad del atributo se clasifica como `many` — el
   * campo se renderiza como `List<T>` con `@ElementCollection` (tipo básico).
   */
  isCollection: boolean;
}

export type RelationshipKind = 'OneToMany' | 'ManyToOne' | 'ManyToMany' | 'OneToOne';

export interface EntityRelationshipModel {
  associationId: string;
  /** Nombre Java de la entidad en el otro extremo. */
  targetEntity: string;
  kind: RelationshipKind;
  /** Qué extremo de la asociación posee la FK (documentado según la tabla de mapeo). */
  owningSide: 'source' | 'target';
  /** Flag precomputado: true cuando ESTA entidad es el extremo propietario (owning). */
  thisSideIsOwning: boolean;
  sourceMultiplicity: string | null;
  targetMultiplicity: string | null;
  /** 14c: composición UML → cascade=CascadeType.ALL en el extremo contenedor. */
  cascade: boolean;
  /**
   * 14c: composición UML → orphanRemoval=true en colecciones del lado contenedor
   * (OneToMany y OneToOne únicamente; ManyToMany lo prohíbe en JPA).
   */
  orphanRemoval: boolean;
}

export interface EntityMethodModel {
  name: string;
  returnType: string;
  parameters: { name: string; type: string }[];
  isOverride: boolean;
  defaultReturnValue: string;
}

export interface EntityModel {
  className: string;
  packageName: string;
  fields: EntityFieldModel[];
  relationships: EntityRelationshipModel[];
  isAbstract?: boolean;
  extendsClass?: string | null;
  inheritanceRoot?: boolean;
  implementsInterfaces: string[];
  methods: EntityMethodModel[];
}

export interface InterfaceMethodModel {
  name: string;
  returnType: string;
  parameters: { name: string; type: string }[];
}

export interface InterfaceModel {
  className: string;
  packageName: string;
  methods: InterfaceMethodModel[];
}

export interface ClassInfo {
  javaName: string;
  isEntity: boolean;
  isInterface: boolean;
  isAbstract: boolean;
}
