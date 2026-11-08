/**
 * Generador de colecciones de prueba Postman v2.1 para la API Spring Boot generada.
 */

export interface PostmanCollectionOptions {
  appName: string;
  entities: Array<{
    name: string;
    route: string;
    fields: Array<{ name: string; javaType: string }>;
  }>;
}

export function camel(name: string): string {
  return name.length === 0 ? name : name[0].toLowerCase() + name.slice(1);
}

export function snake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

export function plural(word: string): string {
  if (word.length === 0) return word;
  if (/(?:s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

export function toRoute(className: string): string {
  return snake(plural(camel(className)));
}

/** Nombre de clase → prefijo camelCase usado para variables de colección Postman. */
export function toVarPrefix(className: string): string {
  return camel(className);
}

export function sampleValueForType(javaType: string, fieldName: string): unknown {
  const lowerName = fieldName.toLowerCase();
  switch (javaType) {
    case 'Integer':
    case 'int':
    case 'Long':
    case 'long':
    case 'Short':
    case 'short':
    case 'Byte':
    case 'byte':
      if (lowerName.includes('edad') || lowerName.includes('age')) return 30;
      if (lowerName.includes('anio') || lowerName.includes('year')) return 2026;
      if (lowerName.includes('cantidad') || lowerName.includes('quantity') || lowerName.includes('stock')) return 10;
      return 1;
    case 'Double':
    case 'double':
    case 'Float':
    case 'float':
    case 'BigDecimal':
      if (lowerName.includes('precio') || lowerName.includes('price') || lowerName.includes('monto') || lowerName.includes('total')) return 99.99;
      return 10.5;
    case 'Boolean':
    case 'boolean':
      return true;
    case 'LocalDate':
      return '2026-09-22';
    case 'LocalDateTime':
      return '2026-09-22T10:00:00';
    case 'LocalTime':
      return '10:00:00';
    default:
      if (lowerName.includes('email') || lowerName.includes('correo')) return `${fieldName.toLowerCase()}@example.com`;
      if (lowerName.includes('telefono') || lowerName.includes('phone')) return '+59170000000';
      if (lowerName.includes('nombre') || lowerName.includes('name')) return `Ejemplo ${fieldName}`;
      return `${fieldName} de prueba`;
  }
}

export function buildPostmanCollection(opts: PostmanCollectionOptions): Record<string, unknown> {
  const items: Array<Record<string, unknown>> = [];

  for (const entity of opts.entities) {
    const route = entity.route;
    const name = entity.name;

    const createBodyObj: Record<string, unknown> = {};
    const updateBodyObj: Record<string, unknown> = {};
    for (const field of entity.fields) {
      if (field.name.toLowerCase() === 'id') continue;
      createBodyObj[field.name] = sampleValueForType(field.javaType, field.name);
      updateBodyObj[field.name] = sampleValueForType(field.javaType, field.name);
    }

    const entityFolder = {
      name: `${name} (CRUD)`,
      item: [
        {
          name: `1. List All ${name}`,
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: `{{baseUrl}}/api/${route}`,
              host: ['{{baseUrl}}'],
              path: ['api', route],
            },
          },
          event: [
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: [
                  'pm.test("Status code is 200", function () {',
                  '    pm.response.to.have.status(200);',
                  '});',
                  'pm.test("Response is an array", function () {',
                  '    var data = pm.response.json();',
                  '    pm.expect(Array.isArray(data)).to.be.true;',
                  '});',
                ],
              },
            },
          ],
        },
        {
          name: `2. Create ${name}`,
          request: {
            method: 'POST',
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify(createBodyObj, null, 2),
            },
            url: {
              raw: `{{baseUrl}}/api/${route}`,
              host: ['{{baseUrl}}'],
              path: ['api', route],
            },
          },
          event: [
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: [
                  'pm.test("Status code is 200 or 201", function () {',
                  '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
                  '});',
                  'pm.test("Entity has generated id", function () {',
                  '    var data = pm.response.json();',
                  '    pm.expect(data).to.have.property("id");',
                  `    pm.collectionVariables.set("${toVarPrefix(name)}_id", data.id);`,
                  '});',
                  `pm.test("Response body contains the declared fields", function () {`,
                  `    var data = pm.response.json();`,
                  `    var fields = ${JSON.stringify(entity.fields.filter((f) => f.name.toLowerCase() !== 'id').map((f) => f.name))};`,
                  `    fields.forEach(function (f) {`,
                  `        pm.expect(data, "missing field " + f).to.have.property(f);`,
                  `    });`,
                  `});`,
                ],
              },
            },
          ],
        },
        {
          name: `3. Get ${name} by ID`,
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: `{{baseUrl}}/api/${route}/{{${toVarPrefix(name)}_id}}`,
              host: ['{{baseUrl}}'],
              path: ['api', route, `{{${toVarPrefix(name)}_id}}`],
            },
          },
          event: [
            {
              listen: 'prerequest',
              script: {
                type: 'text/javascript',
                exec: [
                  `if (!pm.collectionVariables.get("${toVarPrefix(name)}_id")) {`,
                  `    pm.collectionVariables.set("${toVarPrefix(name)}_id", "1");`,
                  `    console.warn("${name}: no id captured from a previous Create — falling back to /1. Run the Create request first.");`,
                  `}`,
                ],
              },
            },
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: [
                  'pm.test("Status code is 200 or 404", function () {',
                  '    pm.expect(pm.response.code).to.be.oneOf([200, 404]);',
                  '});',
                ],
              },
            },
          ],
        },
        {
          name: `4. Update ${name}`,
          request: {
            method: 'PUT',
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify(updateBodyObj, null, 2),
            },
            url: {
              raw: `{{baseUrl}}/api/${route}/{{${toVarPrefix(name)}_id}}`,
              host: ['{{baseUrl}}'],
              path: ['api', route, `{{${toVarPrefix(name)}_id}}`],
            },
          },
          event: [
            {
              listen: 'prerequest',
              script: {
                type: 'text/javascript',
                exec: [
                  `if (!pm.collectionVariables.get("${toVarPrefix(name)}_id")) {`,
                  `    pm.collectionVariables.set("${toVarPrefix(name)}_id", "1");`,
                  `    console.warn("${name}: no id captured from a previous Create — falling back to /1. Run the Create request first.");`,
                  `}`,
                ],
              },
            },
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: [
                  'pm.test("Status code is 200 or 404", function () {',
                  '    pm.expect(pm.response.code).to.be.oneOf([200, 404]);',
                  '});',
                ],
              },
            },
          ],
        },
        {
          name: `5. Delete ${name}`,
          request: {
            method: 'DELETE',
            header: [],
            url: {
              raw: `{{baseUrl}}/api/${route}/{{${toVarPrefix(name)}_id}}`,
              host: ['{{baseUrl}}'],
              path: ['api', route, `{{${toVarPrefix(name)}_id}}`],
            },
          },
          event: [
            {
              listen: 'prerequest',
              script: {
                type: 'text/javascript',
                exec: [
                  `if (!pm.collectionVariables.get("${toVarPrefix(name)}_id")) {`,
                  `    pm.collectionVariables.set("${toVarPrefix(name)}_id", "1");`,
                  `    console.warn("${name}: no id captured from a previous Create — falling back to /1. Run the Create request first.");`,
                  `}`,
                ],
              },
            },
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: [
                  'pm.test("Status code is 200, 204 or 404", function () {',
                  '    pm.expect(pm.response.code).to.be.oneOf([200, 204, 404]);',
                  '});',
                ],
              },
            },
          ],
        },
      ],
    };

    items.push(entityFolder);
  }

  return {
    info: {
      _postman_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: opts.appName,
      description: 'Colección de pruebas automáticas para los endpoints generados (CRUD).',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      {
        key: 'baseUrl',
        value: 'http://localhost:8080',
        type: 'string',
      },
      ...opts.entities.map((entity) => ({
        key: `${toVarPrefix(entity.name)}_id`,
        value: '1',
        type: 'string',
      })),
    ],
    item: items,
  };
}
