import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RemoteCursors, type RemoteCursorPeer } from './RemoteCursors';

describe('Capa de Cursores Remotos (realtime:R6)', () => {
  it('no renderiza nada si la lista de pares está vacía', () => {
    const { container } = render(<RemoteCursors peers={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('no renderiza cursor para pares con cursor nulo o indefinido', () => {
    const peers: RemoteCursorPeer[] = [
      { clientId: 1, name: 'Ana', color: '#0284c7', cursor: null },
      { clientId: 2, name: 'Carlos', color: '#059669', cursor: undefined },
    ];
    render(<RemoteCursors peers={peers} />);
    expect(screen.queryByTestId('remote-cursor-1')).toBeNull();
    expect(screen.queryByTestId('remote-cursor-2')).toBeNull();
  });

  it('renderiza cursores para pares con coordenadas activas', () => {
    const peers: RemoteCursorPeer[] = [
      { clientId: 1, name: 'Ana', color: '#0284c7', cursor: { x: 120, y: 240 } },
      { clientId: 2, name: 'Carlos', color: '#7c3aed', cursor: { x: 350, y: 480 } },
    ];
    render(<RemoteCursors peers={peers} />);

    const cursorAna = screen.getByTestId('remote-cursor-1');
    const cursorCarlos = screen.getByTestId('remote-cursor-2');

    expect(cursorAna).toBeDefined();
    expect(cursorCarlos).toBeDefined();

    // Comprobar etiquetas con nombre
    expect(screen.getByText('Ana')).toBeDefined();
    expect(screen.getByText('Carlos')).toBeDefined();

    // Comprobar coordenadas en estilos inline o transform
    expect(cursorAna.style.transform).toContain('translate(120px, 240px)');
    expect(cursorCarlos.style.transform).toContain('translate(350px, 480px)');
  });

  it('asigna el color correspondiente al puntero y a la etiqueta', () => {
    const peers: RemoteCursorPeer[] = [
      { clientId: 42, name: 'Beatriz', color: '#e11d48', cursor: { x: 50, y: 75 } },
    ];
    render(<RemoteCursors peers={peers} />);

    const cursor = screen.getByTestId('remote-cursor-42');
    const label = screen.getByText('Beatriz');

    // La etiqueta flotante debe tener el color de fondo asignado
    expect(label.style.backgroundColor).toBe('rgb(225, 29, 72)'); // #e11d48
  });

  it('posee pointer-events none para no interceptar clics sobre el lienzo', () => {
    const peers: RemoteCursorPeer[] = [
      { clientId: 99, name: 'David', color: '#d97706', cursor: { x: 10, y: 20 } },
    ];
    const { container } = render(<RemoteCursors peers={peers} />);
    const overlay = container.querySelector('.remote-cursors-overlay') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.pointerEvents).toBe('none');
  });
});
