# Especificación: Notación Estricta UML 2.5 (Geometría de Cajas y Conectores de Asociación)

## Requisitos de Notación Visual

### REQ-UML-01: Cajas de Clasificador Cuadradas (Sharp Corners)
Los clasificadores en el diagrama de clases (clases normales, clases abstractas e interfaces) **MUST** renderizarse como rectángulos con esquinas en ángulo recto de 90° (`border-radius: 0`).
No **SHALL** aplicarse ningún radio de curvatura en los contenedores exteriores de las clases UML en el lienzo interactivo.

#### Escenario: Renderizado ortogonal de caja de clase
- **Given** un diagrama con una clase "Cliente"
- **When** se monta el nodo de clase en el lienzo React Flow
- **Then** el elemento contenedor `.uml-class` **MUST** tener `border-radius: 0`
- **And** su aspecto visual debe ajustarse a la geometría rectangular de Enterprise Architect.

---

### REQ-UML-02: Asociación Simple Bidireccional sin Marcadores
Una asociación ordinaria entre clasificadores donde no se ha especificado navegabilidad unidireccional (`directed: false`) **MUST** renderizarse como una línea continua pura sin marcadores en ninguno de sus extremos (a menos que posea diamante de agregación o composición).

#### Escenario: Dibujo de asociación no dirigida
- **Given** una asociación con `directed: false` y `aggregation: 'none'`
- **When** se evalúa el componente `AssociationEdge`
- **Then** `markerStart` **MUST** ser `undefined`
- **And** `markerEnd` **MUST** ser `undefined`
- **And** no **SHALL** mostrarse ninguna flecha en la arista.

---

### REQ-UML-03: Asociación Dirigida con Flecha Abierta (Open Stick Arrow)
Cuando una asociación declara navegabilidad unidireccional (`directed: true`), el extremo destino **MUST** renderizarse con una flecha abierta formada por dos trazos no rellenos (`fill="none"`, trazo en V abierta), de acuerdo con la Sección 11.5.4 de la especificación OMG UML 2.5.1.
El conector **MUST NOT** utilizar triángulos cerrados ni rellenos de color sólido para asociaciones dirigidas.

#### Escenario: Renderizado de navegabilidad en asociación dirigida
- **Given** una asociación con `directed: true`
- **When** se genera el `<defs>` SVG del conector `AssociationEdge`
- **Then** el marcador de flecha **MUST** contener una ruta con `fill="none"` y trazo visible (`stroke`)
- **And** no **SHALL** contener comandos de cierre de polígono relleno (`Z` con `fill` sólido).

---

### REQ-UML-04: Default No Dirigido en Extracción de Visión / IA
El pipeline de visión e ingesta de imágenes **MUST** normalizar las relaciones de asociación detectadas sin navegabilidad explícita como `directed: false`.
El prompt de extracción multimodal **MUST** instruir al modelo a asignar `directed: false` a las líneas de asociación continuas ordinarias.

#### Escenario: Extracción de foto con líneas de asociación simples
- **Given** una foto de un diagrama de clases con una línea continua sin puntas de flecha entre dos clases
- **When** el módulo de visión extrae las aristas y las normaliza
- **Then** el delta generado para la asociación **MUST** establecer `directed: false`
- **And** el lienzo debe renderizar la asociación como una línea simple.

