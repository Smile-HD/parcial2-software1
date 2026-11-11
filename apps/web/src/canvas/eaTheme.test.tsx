/**
 * unit 13e — EA-style visual theme: STRUCTURAL readback (not pixel tests).
 *
 * The theme is presentation-only, so it is verified by asserting the DOM
 * structure the CSS hooks into: the three UML compartments, the EA corner
 * tab, the selected modifier, the stereotype-above-name order, the docked
 * toolbox header and the dotted canvas background. Behavior tests stay in
 * DiagramCanvas.test.tsx / Palette.test.tsx — none of them change here.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildYDocFromDiagram, type Diagram } from '@app/core';

import { DiagramCanvas } from './DiagramCanvas';

function themedFixture(): Diagram {
  return {
    id: crypto.randomUUID(),
    name: 'Theme',
    classes: [
      {
        id: crypto.randomUUID(),
        name: 'Customer',
        position: { x: 0, y: 0 },
        attributes: [{ id: crypto.randomUUID(), name: 'name', type: 'string', visibility: '-' }],
        methods: [{ id: crypto.randomUUID(), name: 'save', returnType: 'void', parameters: [] }],
      },
      {
        id: crypto.randomUUID(),
        name: 'Repository',
        position: { x: 300, y: 0 },
        kind: 'interface',
        attributes: [],
        methods: [],
      },
    ],
    associations: [],
    generalizations: [],
    realizations: [],
    dependencies: [],
    naryAssociations: [],
  };
}

describe('unit 13e — EA-style class box (structural)', () => {
  it('renders the three UML compartments: name, attributes, operations', () => {
    const doc = buildYDocFromDiagram(themedFixture());
    const { container } = render(<DiagramCanvas doc={doc} />);

    const node = container.querySelector('.react-flow__node')!.querySelector('.uml-class')!;
    expect(node.querySelector('.uml-class__compartment--name')).not.toBeNull();
    expect(node.querySelector('.uml-class__compartment--attributes')).not.toBeNull();
    expect(node.querySelector('.uml-class__compartment--operations')).not.toBeNull();
  });

  it('empty compartments stay present as thin bands (consistent three-box look)', () => {
    const doc = buildYDocFromDiagram(themedFixture());
    const { container } = render(<DiagramCanvas doc={doc} />);

    // The interface node has zero attributes and zero methods.
    const iface = container.querySelectorAll('.react-flow__node')[1]!.querySelector('.uml-class')!;
    expect(iface.querySelector('.uml-class__compartment--attributes')).not.toBeNull();
    expect(iface.querySelector('.uml-class__compartment--operations')).not.toBeNull();
  });

  it('renders the EA signature folded-corner tab on every class box', () => {
    const doc = buildYDocFromDiagram(themedFixture());
    const { container } = render(<DiagramCanvas doc={doc} />);

    expect(container.querySelectorAll('.uml-class__corner-tab')).toHaveLength(2);
  });

  it('stereotype renders ABOVE the name inside the name compartment', () => {
    const doc = buildYDocFromDiagram(themedFixture());
    const { container } = render(<DiagramCanvas doc={doc} />);

    const iface = container.querySelectorAll('.react-flow__node')[1]!.querySelector('.uml-class')!;
    const nameCompartment = iface.querySelector('.uml-class__compartment--name')!;
    const stereotype = nameCompartment.querySelector('.uml-class__stereotype');
    const name = nameCompartment.querySelector('.uml-class__name');
    expect(stereotype).not.toBeNull();
    expect(name).not.toBeNull();
    // DOM order = visual order: stereotype first, then the name.
    const all = Array.from(nameCompartment.querySelectorAll('*'));
    expect(all.indexOf(stereotype!)).toBeLessThan(all.indexOf(name!));
  });

  it('clicking a class adds the selected modifier (EA blue 2px border hook)', () => {
    const doc = buildYDocFromDiagram(themedFixture());
    const { container } = render(<DiagramCanvas doc={doc} />);

    const node = container.querySelector('.react-flow__node')!.querySelector('.uml-class')!;
    expect(node.classList.contains('uml-class--selected')).toBe(false);
    fireEvent.click(node);
    expect(node.classList.contains('uml-class--selected')).toBe(true);
  });

  it('members keep the UML visibility prefix in the compartments', () => {
    const doc = buildYDocFromDiagram(themedFixture());
    const { container } = render(<DiagramCanvas doc={doc} />);

    const node = container.querySelector('.react-flow__node')!.querySelector('.uml-class')!;
    const attr = node.querySelector('[data-testid="attr-name"]')!;
    expect(attr.textContent).toContain('-name');
    expect(node.querySelector('.uml-class__compartment--attributes')!.contains(attr)).toBe(true);
  });
});

describe('UML 2.5 — geometría de clasificadores con esquinas rectangulares a 90°', () => {
  it('la caja de clase NO DEBE contener border-radius redondeado en el CSS (UML 2.5.1)', () => {
    // Verificación estructural: el CSS de `.uml-class` no debe declarar border-radius
    // distinto de 0. jsdom no aplica hojas de estilo externas, por lo que leemos
    // directamente el archivo CSS para asegurar la regla de geometría ortogonal.
    const fs = require('node:fs');
    const path = require('node:path');
    const cssPath = path.resolve(__dirname, 'canvas.css');
    const css = fs.readFileSync(cssPath, 'utf-8') as string;

    // Extraer el bloque del selector .uml-class { ... } (primera ocurrencia)
    const umlClassMatch = css.match(/\.uml-class\s*\{([^}]+)\}/);
    expect(umlClassMatch).not.toBeNull();
    const block = umlClassMatch![1]!;

    // Verificar que border-radius sea 0 o no exista
    const radiusMatch = block.match(/border-radius\s*:\s*([^;]+)/);
    if (radiusMatch) {
      const value = radiusMatch[1]!.trim();
      expect(value, 'UML 2.5.1: los clasificadores deben ser rectángulos con esquinas a 90°').toBe('0');
    }
    // Si no hay border-radius declarado, es 0 por defecto (correcto)
  });
});

describe('unit 13e — docked toolbox + canvas background (structural)', () => {
  it('the palette is a docked toolbox with a header', () => {
    const doc = buildYDocFromDiagram(themedFixture());
    const { container } = render(<DiagramCanvas doc={doc} />);

    const header = container.querySelector('.palette__header');
    expect(header).not.toBeNull();
    expect(header!.textContent).toContain('Toolbox');
    // The 13c groups survive the restyle.
    expect(container.querySelector('.palette__group[aria-label="Objects"]')).not.toBeNull();
    expect(container.querySelector('.palette__group[aria-label="Relations"]')).not.toBeNull();
  });

  it('the canvas paints an EA-like dotted background', async () => {
    const doc = buildYDocFromDiagram(themedFixture());
    const { container } = render(<DiagramCanvas doc={doc} />);

    await waitFor(() => {
      expect(container.querySelector('.react-flow__background')).not.toBeNull();
    });
  });
});
